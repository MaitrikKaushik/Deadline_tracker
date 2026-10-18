const crypto = require("crypto");
const mongoose = require("mongoose");
const Broadcast = require("../models/broadcast");
const BroadcastImport = require("../models/broadcastImport");
const Cluster = require("../models/cluster");
const Task = require("../models/task");

const isObjectIdString = (value) =>
  typeof value === "string" && /^[0-9a-fA-F]{24}$/.test(value);

const publicBroadcast = (broadcast) => ({
  _id: broadcast._id,
  name: broadcast.name,
  description: broadcast.description,
  code: broadcast.code,
  // Reminder preference is stored privately for managed updates but must not be
  // exposed in anonymous share previews.
  tasks: (broadcast.tasks || []).map((task) => {
    const value = task.toObject ? task.toObject() : { ...task };
    delete value.reminderEnabled;
    return value;
  }),
  createdAt: broadcast.createdAt,
  updatedAt: broadcast.updatedAt,
  revokedAt: broadcast.revokedAt || null,
});

const createCode = () => crypto.randomBytes(5).toString("hex").toUpperCase();

exports.createBroadcastFromCluster = async (req, res) => {
  try {
    const { id } = req.params;
    const { taskIds, description = "" } = req.body || {};

    if (!isObjectIdString(id)) {
      return res.status(400).json({ message: "Invalid cluster ID" });
    }
    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({ message: "Select at least one deadline to share" });
    }
    if (typeof description !== "string" || description.length > 500) {
      return res.status(400).json({ message: "Description must be 500 characters or fewer" });
    }
    if (!taskIds.every(isObjectIdString)) {
      return res.status(400).json({ message: "Invalid task ID" });
    }

    const cluster = await Cluster.findOne({ _id: id, ownerId: req.user._id });
    if (!cluster) return res.status(404).json({ message: "Cluster not found" });
    if (cluster.origin !== "created") {
      return res.status(403).json({ message: "Only clusters you created can be shared" });
    }

    const selectedIds = [...new Set(taskIds.map((taskId) => new mongoose.Types.ObjectId(taskId).toString()))];
    const clusterIds = new Set(cluster.tasks.map((taskId) => String(taskId)));
    if (selectedIds.some((taskId) => !clusterIds.has(taskId))) {
      return res.status(400).json({ message: "Selected deadlines must belong to this cluster" });
    }

    const tasks = await Task.find({ _id: { $in: selectedIds }, userId: req.user._id });
    if (tasks.length !== selectedIds.length) {
      return res.status(403).json({ message: "One or more deadlines are no longer available" });
    }

    const taskById = new Map(tasks.map((task) => [String(task._id), task]));
    const snapshot = selectedIds.map((taskId) => taskById.get(taskId)).filter(Boolean).map((task) => ({
      sourceTaskId: task._id,
      title: task.title,
      description: task.description || "",
      deadline: task.deadline,
      priority: task.priority || "medium",
      deadlineType: task.deadlineType || "general",
      referenceLink: task.referenceLink || "",
      reminderEnabled: Boolean(task.reminderEnabled),
    }));

    let broadcast;
    // Retry on the extremely unlikely event that a generated code already exists.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        broadcast = await Broadcast.create({
          ownerId: req.user._id,
          sourceClusterId: cluster._id,
          name: cluster.name,
          description: description.trim(),
          code: createCode(),
          tasks: snapshot,
        });
        break;
      } catch (error) {
        if (error.code !== 11000 || attempt === 2) throw error;
      }
    }

    return res.status(201).json(publicBroadcast(broadcast));
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({ message: "Invalid broadcast data" });
    }
    return res.status(500).json({ message: "Failed to share cluster" });
  }
};

exports.searchBroadcasts = async (req, res) => {
  try {
    const rawQuery = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (rawQuery.length > 100) {
      return res.status(400).json({ message: "Search query must be 100 characters or fewer" });
    }

    const filter = { revokedAt: null };
    if (rawQuery) {
      const escaped = rawQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { name: { $regex: escaped, $options: "i" } },
        { code: rawQuery.toUpperCase() },
      ];
    }

    const broadcasts = await Broadcast.find(filter)
      .sort({ createdAt: -1 })
      .limit(50)
      .select("name description code tasks createdAt updatedAt");
    return res.json(broadcasts.map(publicBroadcast));
  } catch (error) {
    return res.status(500).json({ message: "Failed to search shared clusters" });
  }
};

exports.getMyBroadcasts = async (req, res) => {
  try {
    const broadcasts = await Broadcast.find({ ownerId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(100)
      .select("name description code tasks createdAt updatedAt revokedAt");
    return res.json(broadcasts.map(publicBroadcast));
  } catch (error) {
    return res.status(500).json({ message: "Failed to load your shared clusters" });
  }
};

exports.getBroadcastByCode = async (req, res) => {
  try {
    const code = String(req.params.code || "").trim().toUpperCase();
    if (!/^[0-9A-F]{10}$/.test(code)) {
      return res.status(400).json({ message: "Invalid share code" });
    }
    const broadcast = await Broadcast.findOne({ code, revokedAt: null }).select(
      "name description code tasks createdAt updatedAt"
    );
    if (!broadcast) return res.status(404).json({ message: "Shared cluster not found or no longer available" });
    return res.json(publicBroadcast(broadcast));
  } catch (error) {
    return res.status(500).json({ message: "Failed to load shared cluster" });
  }
};

// A "processing" import older than this is treated as interrupted (for
// example the server crashed mid-import) and may be taken over by a retry.
// Normal imports finish in well under a second, so 10 minutes is generous.
const STALE_IMPORT_MS = 10 * 60 * 1000;
exports.STALE_IMPORT_MS = STALE_IMPORT_MS;

const isStale = (record) => {
  const startedAt = record.processingStartedAt || record.createdAt;
  return Boolean(startedAt) && Date.now() - new Date(startedAt).getTime() >= STALE_IMPORT_MS;
};

// Builds the response for an import that already completed. The mappings and
// selection let the client explain exactly what was imported earlier.
const existingImportResult = async (record, userId) => {
  const cluster = record.importedClusterId
    ? await Cluster.findOne({ _id: record.importedClusterId, ownerId: userId }).populate("tasks")
    : null;
  const tasks = await Task.find({ _id: { $in: record.importedTaskIds }, userId });

  return {
    alreadyImported: true,
    mode: record.mode,
    cluster,
    tasks,
    mappings: (record.taskMappings || []).map((mapping) => ({
      sourceTaskId: mapping.sourceTaskId,
      importedTaskId: mapping.importedTaskId,
    })),
    selectedSourceTaskIds: record.selectedSourceTaskIds,
    reminderEnabled: record.reminderEnabled,
    importedAt: record.updatedAt,
  };
};

// Re-reads the import record and answers from its current state: the
// completed result, or a conflict for an import that is genuinely in progress.
const respondWithCurrentImport = async (res, broadcast, userId) => {
  const current = await BroadcastImport.findOne({ broadcastId: broadcast._id, importerId: userId });

  if (!current) {
    return res.status(409).json({ message: "Your import changed while it was being processed. Please try again." });
  }
  if (current.status === "completed") {
    return res.json(await existingImportResult(current, userId));
  }
  return res.status(409).json({ message: "Your import is still processing. Please retry shortly." });
};

// Deletes artifacts of one specific import attempt. Scoped to the importer and
// to IDs that attempt planned, so it can never touch unrelated tasks/clusters.
// Safe to run repeatedly.
const cleanupImportArtifacts = async ({ userId, broadcastId, taskIds, clusterId }) => {
  if (taskIds && taskIds.length) {
    await Task.deleteMany({ _id: { $in: taskIds }, userId });
  }
  if (clusterId) {
    await Cluster.deleteOne({ _id: clusterId, ownerId: userId, origin: "imported", sourceBroadcastId: broadcastId });
  }
};

// Decides, by identity, which source deadline becomes which imported task ID.
const buildImportPlan = (broadcast, selectedIds, mode) => {
  const selected = new Set(selectedIds);
  const taskMappings = broadcast.tasks
    .filter((task) => selected.has(String(task.sourceTaskId)))
    .map((task) => ({
      sourceTaskId: task.sourceTaskId,
      importedTaskId: new mongoose.Types.ObjectId(),
    }));

  return {
    taskMappings,
    plannedClusterId: mode === "cluster" ? new mongoose.Types.ObjectId() : null,
  };
};

// Rolls back the artifacts of an import ONLY while the record is still
// "processing" and this request still owns its claim. A completed, superseded
// or missing record is never touched, so a completed import can never lose its
// tasks or cluster, and a replaced request leaves recovery to the new owner
// (who cleans up through the stored plan). If cleanup throws, the record and
// its plan are kept so a later retry can repeat the cleanup.
const rollbackOwnedImport = async (claim, userId) => {
  const record = await BroadcastImport.findOne({
    _id: claim._id,
    claimId: claim.claimId,
    status: "processing",
  });

  if (!record) return;

  await cleanupImportArtifacts({
    userId,
    broadcastId: record.broadcastId,
    taskIds: record.taskMappings.map((mapping) => mapping.importedTaskId),
    clusterId: record.plannedClusterId,
  });

  await BroadcastImport.deleteOne({ _id: claim._id, claimId: claim.claimId, status: "processing" });
};

exports.importBroadcast = async (req, res) => {
  const userId = req.user._id;
  // Set once this request owns the import record (and so owns its artifacts).
  let claim = null;

  try {
    const code = String(req.params.code || "").trim().toUpperCase();
    if (!/^[0-9A-F]{10}$/.test(code)) {
      return res.status(400).json({ message: "Invalid share code" });
    }
    const { taskIds, mode = "cluster", reminderEnabled = false } = req.body || {};
    if (!Array.isArray(taskIds) || taskIds.length === 0 || !taskIds.every(isObjectIdString)) {
      return res.status(400).json({ message: "Select at least one valid deadline to import" });
    }
    if (!["tasks", "cluster"].includes(mode)) {
      return res.status(400).json({ message: "Import mode must be tasks or cluster" });
    }
    if (typeof reminderEnabled !== "boolean") {
      return res.status(400).json({ message: "reminderEnabled must be a boolean" });
    }

    const broadcast = await Broadcast.findOne({ code, revokedAt: null });
    if (!broadcast) return res.status(404).json({ message: "Shared cluster not found or no longer available" });

    const selectedIds = [...new Set(taskIds.map((taskId) => new mongoose.Types.ObjectId(taskId).toString()))];
    const availableIds = new Set(broadcast.tasks.map((task) => String(task.sourceTaskId)));
    if (selectedIds.some((taskId) => !availableIds.has(taskId))) {
      return res.status(400).json({ message: "Selected deadlines must belong to this shared cluster" });
    }

    const plan = buildImportPlan(broadcast, selectedIds, mode);
    const claimId = new mongoose.Types.ObjectId().toString();
    const existing = await BroadcastImport.findOne({ broadcastId: broadcast._id, importerId: userId });

    if (existing) {
      if (existing.status === "completed") {
        return res.json(await existingImportResult(existing, userId));
      }
      if (!isStale(existing)) {
        return res.status(409).json({ message: "Your import is still processing. Please retry shortly." });
      }

      // STEP 1: take ownership with ONE atomic compare-and-swap. The filter
      // pins the previous owner's claimId and re-checks staleness in the
      // database, so of two concurrent retries only the first can match.
      // Only the ownership fields change: the previous attempt's recovery plan
      // (taskMappings, plannedClusterId) stays persisted for now.
      const threshold = new Date(Date.now() - STALE_IMPORT_MS);
      const previous = await BroadcastImport.findOneAndUpdate(
        {
          _id: existing._id,
          status: "processing",
          claimId: existing.claimId || null,
          $or: [
            { processingStartedAt: { $lt: threshold } },
            { processingStartedAt: null, createdAt: { $lt: threshold } },
          ],
        },
        { $set: { claimId, processingStartedAt: new Date() } },
        { returnDocument: "before" }
      );

      if (!previous) {
        // Someone else reclaimed or finished it first. Re-read and answer.
        return respondWithCurrentImport(res, broadcast, userId);
      }

      // STEP 2: remove exactly what the interrupted attempt had planned, using
      // its stored plan. Idempotent, and scoped to this importer.
      try {
        await cleanupImportArtifacts({
          userId,
          broadcastId: broadcast._id,
          taskIds: (previous.taskMappings || []).map((mapping) => mapping.importedTaskId),
          clusterId: previous.plannedClusterId,
        });
      } catch (cleanupError) {
        // Keep the record and its recovery plan untouched. Hand the claim
        // back (best effort) so an immediate retry can repeat the cleanup.
        await BroadcastImport.findOneAndUpdate(
          { _id: previous._id, status: "processing", claimId },
          {
            $set: {
              claimId: previous.claimId || null,
              processingStartedAt: previous.processingStartedAt || null,
            },
          }
        ).catch(() => {});

        return res.status(500).json({ message: "Failed to recover your earlier import attempt. Please try again." });
      }

      // STEP 3: only now install the new plan, verifying we still own the
      // claim. If it was replaced meanwhile, nothing new has been created yet.
      const installed = await BroadcastImport.findOneAndUpdate(
        { _id: previous._id, status: "processing", claimId },
        {
          $set: {
            mode,
            reminderEnabled,
            selectedSourceTaskIds: selectedIds,
            taskMappings: plan.taskMappings,
            plannedClusterId: plan.plannedClusterId,
            importedTaskIds: [],
            importedClusterId: null,
            processingStartedAt: new Date(),
          },
        },
        { returnDocument: "after" }
      );

      if (!installed) {
        return respondWithCurrentImport(res, broadcast, userId);
      }

      claim = { _id: previous._id, claimId };
    } else {
      // Persist the plan BEFORE creating anything, so an interrupted import
      // leaves enough information to identify (and remove) its artifacts.
      try {
        const created = await BroadcastImport.create({
          broadcastId: broadcast._id,
          importerId: userId,
          mode,
          selectedSourceTaskIds: selectedIds,
          reminderEnabled,
          status: "processing",
          taskMappings: plan.taskMappings,
          plannedClusterId: plan.plannedClusterId,
          claimId,
          processingStartedAt: new Date(),
        });
        claim = { _id: created._id, claimId };
      } catch (error) {
        if (error.code === 11000) {
          return respondWithCurrentImport(res, broadcast, userId);
        }
        throw error;
      }
    }

    // Build every copy from the planned mapping (by identity, not position).
    const sourceById = new Map(broadcast.tasks.map((task) => [String(task.sourceTaskId), task]));
    const importedTaskIds = plan.taskMappings.map((mapping) => mapping.importedTaskId);
    const taskCopies = plan.taskMappings.map((mapping) => {
      const source = sourceById.get(String(mapping.sourceTaskId));
      return {
        _id: mapping.importedTaskId,
        title: source.title,
        description: source.description,
        deadline: source.deadline,
        priority: source.priority,
        status: "pending",
        deadlineType: source.deadlineType,
        referenceLink: source.referenceLink,
        reminderEnabled,
        userId,
      };
    });

    const newTasks = await Task.insertMany(taskCopies);

    let importedCluster = null;
    if (plan.plannedClusterId) {
      importedCluster = await Cluster.create({
        _id: plan.plannedClusterId,
        name: broadcast.name,
        ownerId: userId,
        tasks: importedTaskIds,
        origin: "imported",
        sourceBroadcastId: broadcast._id,
      });
      // Failure-prone work happens BEFORE the import is marked completed, so
      // an error here still rolls the whole import back cleanly.
      await importedCluster.populate("tasks");
    }

    const responseBody = {
      alreadyImported: false,
      mode,
      cluster: importedCluster,
      tasks: newTasks,
      mappings: plan.taskMappings.map((mapping) => ({
        sourceTaskId: mapping.sourceTaskId,
        importedTaskId: mapping.importedTaskId,
      })),
    };

    // Completing is conditional on still owning the claim, so a request that
    // was replaced after going stale cannot overwrite its successor.
    const completed = await BroadcastImport.findOneAndUpdate(
      { _id: claim._id, status: "processing", claimId: claim.claimId },
      {
        $set: {
          status: "completed",
          importedTaskIds,
          importedClusterId: plan.plannedClusterId,
        },
      },
      { returnDocument: "after" }
    );

    if (!completed) {
      // Our claim was replaced. The new owner recovers through the stored
      // plan, so we must not delete anything here.
      return res.status(409).json({ message: "Your import was taken over by a newer request. Please retry." });
    }

    return res.status(201).json(responseBody);
  } catch (error) {
    // Roll back only while the record is still processing AND still ours.
    // A completed import (or one taken over by another request) is left alone.
    if (claim) {
      await rollbackOwnedImport(claim, userId).catch(() => {});
    }
    return res.status(500).json({ message: "Failed to import shared cluster. Please try again." });
  }
};

exports.revokeBroadcast = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectIdString(id)) return res.status(400).json({ message: "Invalid broadcast ID" });
    const broadcast = await Broadcast.findOne({ _id: id, ownerId: req.user._id, revokedAt: null });
    if (!broadcast) return res.status(404).json({ message: "Broadcast not found or already revoked" });
    broadcast.revokedAt = new Date();
    await broadcast.save();
    return res.json({ message: "Sharing revoked successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to revoke sharing" });
  }
};
