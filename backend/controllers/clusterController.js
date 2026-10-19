const mongoose = require("mongoose");

const Cluster = require("../models/cluster");
const Task = require("../models/task");
const Broadcast = require("../models/broadcast");
const BroadcastImport = require("../models/broadcastImport");
const ManagedUpdate = require("../models/managedUpdate");
const ReminderDelivery = require("../models/reminderDelivery");
const {
  recordClusterNameChange,
  recordClusterMembershipChanges,
} = require("../services/managedUpdateService");

const MAX_NAME_LENGTH = 100;
const VALID_TYPES = ["mine", "imported", "all"];

// Strict 24-character hex check. mongoose.isValidObjectId() also accepts
// any 12-character string and some numbers, which is too lenient for
// user-supplied IDs.
const isObjectIdString = (value) =>
  typeof value === "string" && /^[0-9a-fA-F]{24}$/.test(value);

// Returns { error } or { value } (trimmed name).
const validateName = (name) => {
  if (typeof name !== "string" || !name.trim()) {
    return { error: "Cluster name is required and must be a non-empty string" };
  }

  const trimmed = name.trim();

  if (trimmed.length > MAX_NAME_LENGTH) {
    return {
      error: `Cluster name cannot exceed ${MAX_NAME_LENGTH} characters`,
    };
  }

  return { value: trimmed };
};

// Validates shape, removes duplicates, and verifies ownership.
// Returns { status, error } or { value } (array of unique ID strings).
const validateTaskIds = async (taskIds, userId) => {
  if (!Array.isArray(taskIds)) {
    return { status: 400, error: "taskIds must be an array" };
  }

  if (!taskIds.every(isObjectIdString)) {
    return { status: 400, error: "Invalid task ID" };
  }

  // Normalise to lowercase hex so "ABC..." and "abc..." count as one ID.
  const uniqueTaskIds = [
    ...new Set(
      taskIds.map((id) => new mongoose.Types.ObjectId(id).toString())
    ),
  ];

  if (uniqueTaskIds.length > 0) {
    const ownedCount = await Task.countDocuments({
      _id: { $in: uniqueTaskIds },
      userId,
    });

    if (ownedCount !== uniqueTaskIds.length) {
      return {
        status: 403,
        error: "One or more tasks do not belong to you",
      };
    }
  }

  return { value: uniqueTaskIds };
};

const handleError = (res, error, fallbackMessage) => {
  if (error.name === "ValidationError" || error.name === "CastError") {
    return res.status(400).json({ message: "Invalid cluster data" });
  }

  // Never expose internal error details to the client.
  return res.status(500).json({ message: fallbackMessage });
};

// CREATE CLUSTER
exports.createCluster = async (req, res) => {
  try {
    const { name, taskIds = [] } = req.body || {};

    const nameResult = validateName(name);

    if (nameResult.error) {
      return res.status(400).json({ message: nameResult.error });
    }

    const taskResult = await validateTaskIds(taskIds, req.user._id);

    if (taskResult.error) {
      return res
        .status(taskResult.status)
        .json({ message: taskResult.error });
    }

    const cluster = await Cluster.create({
      name: nameResult.value,
      ownerId: req.user._id,
      tasks: taskResult.value,
      origin: "created",
    });

    res.status(201).json(cluster);
  } catch (error) {
    handleError(res, error, "Failed to create cluster");
  }
};

// GET CLUSTERS (filter: ?type=mine|imported|all, default all)
exports.getClusters = async (req, res) => {
  try {
    const { type = "all" } = req.query;

    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({
        message: "Invalid cluster type. Use mine, imported, or all.",
      });
    }

    const filter = {
      ownerId: req.user._id,
    };

    if (type === "mine") {
      filter.origin = "created";
    } else if (type === "imported") {
      filter.origin = "imported";
    }

    const clusters = await Cluster.find(filter)
      .populate("tasks")
      .sort({ createdAt: -1 });

    res.json(clusters);
  } catch (error) {
    handleError(res, error, "Failed to fetch clusters");
  }
};

// GET SINGLE CLUSTER
exports.getClusterById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isObjectIdString(id)) {
      return res.status(400).json({ message: "Invalid cluster ID" });
    }

    const cluster = await Cluster.findOne({
      _id: id,
      ownerId: req.user._id,
    }).populate("tasks");

    if (!cluster) {
      return res.status(404).json({ message: "Cluster not found" });
    }

    res.json(cluster);
  } catch (error) {
    handleError(res, error, "Failed to fetch cluster");
  }
};

// UPDATE CLUSTER
exports.updateCluster = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, taskIds } = req.body || {};

    if (!isObjectIdString(id)) {
      return res.status(400).json({ message: "Invalid cluster ID" });
    }

    const cluster = await Cluster.findOne({
      _id: id,
      ownerId: req.user._id,
    });

    if (!cluster) {
      return res.status(404).json({ message: "Cluster not found" });
    }

    if (cluster.origin !== "created") {
      return res.status(403).json({
        message:
          "Only user-created clusters can be edited through this endpoint",
      });
    }

    const previousName = cluster.name;
    const previousTaskIds = (cluster.tasks || []).map((taskId) => String(taskId));

    if (name !== undefined) {
      const nameResult = validateName(name);

      if (nameResult.error) {
        return res.status(400).json({ message: nameResult.error });
      }

      cluster.name = nameResult.value;
    }

    if (taskIds !== undefined) {
      const taskResult = await validateTaskIds(taskIds, req.user._id);

      if (taskResult.error) {
        return res
          .status(taskResult.status)
          .json({ message: taskResult.error });
      }

      cluster.tasks = taskResult.value;
    }

    await cluster.save();

    const currentTaskIds = (cluster.tasks || []).map((taskId) => String(taskId));
    const previousTaskSet = new Set(previousTaskIds);
    const currentTaskSet = new Set(currentTaskIds);
    const membershipChanged = previousTaskIds.length !== currentTaskIds.length ||
      [...previousTaskSet].some((taskId) => !currentTaskSet.has(taskId));
    const managedUpdateWarnings = [];
    let managedSyncSummary = null;

    if (previousName !== cluster.name) {
      try {
        await recordClusterNameChange({
          ownerId: req.user._id,
          sourceClusterId: cluster._id,
          newName: cluster.name,
        });
      } catch (syncError) {
        console.error("Managed cluster rename preparation failed:", syncError);
        managedUpdateWarnings.push("The cluster name was saved, but shared rename proposals could not all be prepared.");
      }
    }

    if (membershipChanged) {
      try {
        const syncResult = await recordClusterMembershipChanges({
          ownerId: req.user._id,
          sourceClusterId: cluster._id,
          previousTaskIds,
          currentTaskIds,
        });
        managedSyncSummary = {
          reason: "cluster-membership-change",
          ...syncResult,
        };
      } catch (syncError) {
        console.error("Managed cluster membership synchronization failed:", syncError);
        managedUpdateWarnings.push("The cluster was saved, but shared deadline additions/removals could not all be prepared.");
      }
    }

    await cluster.populate("tasks");
    const result = cluster.toObject();
    if (managedSyncSummary) result.managedSyncSummary = managedSyncSummary;
    if (managedUpdateWarnings.length) result.managedUpdateWarning = managedUpdateWarnings.join(" ");
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to update cluster");
  }
};

// DELETE CLUSTER. Imported copies are preserved by default; deleting them is
// an explicit, authenticated choice made by the source owner.
exports.deleteCluster = async (req, res) => {
  try {
    const { id } = req.params;
    const { removeImportedCopies = false } = req.body || {};

    if (!isObjectIdString(id)) return res.status(400).json({ message: "Invalid cluster ID" });
    if (typeof removeImportedCopies !== "boolean") {
      return res.status(400).json({ message: "removeImportedCopies must be a boolean" });
    }

    const cluster = await Cluster.findOne({
      _id: id,
      ownerId: req.user._id,
      origin: "created",
    });
    if (!cluster) {
      return res.status(404).json({ message: "Cluster not found or cannot be deleted through this endpoint" });
    }

    const broadcasts = await Broadcast.find({
      sourceClusterId: cluster._id,
      ownerId: req.user._id,
    }).select("_id");
    const broadcastIds = broadcasts.map((broadcast) => broadcast._id);

    if (broadcastIds.length) {
      const processingImport = await BroadcastImport.findOne({
        broadcastId: { $in: broadcastIds },
        status: "processing",
      }).select("_id");
      if (processingImport) {
        return res.status(409).json({
          message: "An import from this cluster is currently being processed. Please retry the deletion shortly.",
        });
      }
    }

    // Stop future imports first. Existing imports remain separate copies unless
    // the owner explicitly selected the cascade-removal option.
    if (broadcastIds.length) {
      await Broadcast.updateMany(
        { _id: { $in: broadcastIds }, ownerId: req.user._id, revokedAt: null },
        { $set: { revokedAt: new Date() } }
      );
    }

    let removedImportedClusters = 0;
    let removedImportedTasks = 0;

    const imports = broadcastIds.length
      ? await BroadcastImport.find({ broadcastId: { $in: broadcastIds }, status: "completed" })
      : [];

    if (removeImportedCopies) {
      for (const importRecord of imports) {
        const mappedIds = [...new Set([
          ...(importRecord.taskMappings || []).map((mapping) => String(mapping.importedTaskId)),
          ...(importRecord.importedTaskIds || []).map(String),
        ])];

        if (mappedIds.length) {
          const ids = mappedIds;
          await ReminderDelivery.deleteMany({ taskId: { $in: ids }, status: { $ne: "sent" } });
          // Remove only references to the copied tasks from this recipient's
          // clusters before deleting the task documents.
          await Cluster.updateMany(
            { ownerId: importRecord.importerId, tasks: { $in: ids } },
            { $pull: { tasks: { $in: ids } } }
          );
          const deletedTasks = await Task.deleteMany({
            _id: { $in: ids },
            userId: importRecord.importerId,
          });
          removedImportedTasks += deletedTasks.deletedCount || 0;
        }

        if (importRecord.importedClusterId) {
          const deletedCluster = await Cluster.deleteOne({
            _id: importRecord.importedClusterId,
            ownerId: importRecord.importerId,
            origin: "imported",
            sourceBroadcastId: importRecord.broadcastId,
          });
          removedImportedClusters += deletedCluster.deletedCount || 0;
        }

        await ManagedUpdate.deleteMany({ broadcastImportId: importRecord._id });
        await BroadcastImport.deleteOne({ _id: importRecord._id });
      }
    } else if (imports.length) {
      // Preserve copies but detach them from the deleted source, stopping any
      // future update proposals. Already-created proposals remain available.
      await BroadcastImport.updateMany(
        { _id: { $in: imports.map((item) => item._id) } },
        {
          $set: {
            syncEnabled: false,
            syncDisconnectedAt: new Date(),
            syncDisconnectReason: "source-deleted",
          },
        }
      );
    }

    await Cluster.deleteOne({ _id: cluster._id, ownerId: req.user._id, origin: "created" });

    return res.json({
      message: removeImportedCopies
        ? "Cluster and its imported copies deleted successfully"
        : "Cluster deleted successfully",
      removedImportedCopies: Boolean(removeImportedCopies),
      removedImportedClusters,
      removedImportedTasks,
    });
  } catch (error) {
    handleError(res, error, "Failed to delete cluster and its imported copies");
  }
};
