const mongoose = require("mongoose");

const Cluster = require("../models/cluster");
const Task = require("../models/task");

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
    await cluster.populate("tasks");

    res.json(cluster);
  } catch (error) {
    handleError(res, error, "Failed to update cluster");
  }
};

// DELETE CLUSTER
exports.deleteCluster = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isObjectIdString(id)) {
      return res.status(400).json({ message: "Invalid cluster ID" });
    }

    const cluster = await Cluster.findOneAndDelete({
      _id: id,
      ownerId: req.user._id,
      origin: "created",
    });

    if (!cluster) {
      return res.status(404).json({
        message:
          "Cluster not found or cannot be deleted through this endpoint",
      });
    }

    // Deleting a cluster does not delete its tasks.
    res.json({
      message: "Cluster deleted successfully",
    });
  } catch (error) {
    handleError(res, error, "Failed to delete cluster");
  }
};
