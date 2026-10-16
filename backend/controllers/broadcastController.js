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
  tasks: broadcast.tasks,
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

exports.importBroadcast = async (req, res) => {
  let importRecord;
  let createdTaskIds = [];
  let createdClusterId = null;

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

    const existing = await BroadcastImport.findOne({ broadcastId: broadcast._id, importerId: req.user._id });
    if (existing) {
      if (existing.status !== "completed") {
        return res.status(409).json({ message: "Your import is still processing. Please retry shortly." });
      }
      const existingCluster = existing.importedClusterId
        ? await Cluster.findById(existing.importedClusterId).populate("tasks")
        : null;
      const existingTasks = await Task.find({ _id: { $in: existing.importedTaskIds }, userId: req.user._id });
      return res.json({
        alreadyImported: true,
        mode: existing.mode,
        cluster: existingCluster,
        tasks: existingTasks,
      });
    }

    try {
      importRecord = await BroadcastImport.create({
        broadcastId: broadcast._id,
        importerId: req.user._id,
        mode,
        selectedSourceTaskIds: selectedIds,
        reminderEnabled,
        status: "processing",
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({ message: "This shared cluster is already being imported or was imported before" });
      }
      throw error;
    }

    const selectedTasks = broadcast.tasks.filter((task) => selectedIds.includes(String(task.sourceTaskId)));
    const taskCopies = selectedTasks.map((task) => ({
      _id: new mongoose.Types.ObjectId(),
      title: task.title,
      description: task.description,
      deadline: task.deadline,
      priority: task.priority,
      status: "pending",
      deadlineType: task.deadlineType,
      referenceLink: task.referenceLink,
      reminderEnabled,
      userId: req.user._id,
    }));
    // Pre-record IDs so partial insertMany failures can be rolled back too.
    createdTaskIds = taskCopies.map((task) => task._id);
    const newTasks = await Task.insertMany(taskCopies);

    let importedCluster = null;
    if (mode === "cluster") {
      importedCluster = await Cluster.create({
        name: broadcast.name,
        ownerId: req.user._id,
        tasks: createdTaskIds,
        origin: "imported",
        sourceBroadcastId: broadcast._id,
      });
      createdClusterId = importedCluster._id;
      await importedCluster.populate("tasks");
    }

    importRecord.importedTaskIds = createdTaskIds;
    importRecord.importedClusterId = createdClusterId;
    importRecord.status = "completed";
    await importRecord.save();

    return res.status(201).json({
      alreadyImported: false,
      mode,
      cluster: importedCluster,
      tasks: newTasks,
    });
  } catch (error) {
    // Best-effort rollback if a multi-document import fails partway through.
    if (createdClusterId) await Cluster.deleteOne({ _id: createdClusterId }).catch(() => {});
    if (createdTaskIds.length) await Task.deleteMany({ _id: { $in: createdTaskIds }, userId: req.user._id }).catch(() => {});
    if (importRecord) await BroadcastImport.deleteOne({ _id: importRecord._id }).catch(() => {});
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
