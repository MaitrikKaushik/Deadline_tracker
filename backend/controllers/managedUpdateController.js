const mongoose = require("mongoose");
const BroadcastImport = require("../models/broadcastImport");
const Cluster = require("../models/cluster");
const ManagedUpdate = require("../models/managedUpdate");
const ReminderDelivery = require("../models/reminderDelivery");
const Task = require("../models/task");

const ACCEPTABLE_TASK_FIELDS = new Set([
  "title",
  "description",
  "deadline",
  "reminderEnabled",
  "priority",
  "deadlineType",
  "referenceLink",
]);
const isObjectIdString = (value) => typeof value === "string" && /^[0-9a-fA-F]{24}$/.test(value);
const sameValue = (left, right) => {
  const normalize = (value) => value instanceof Date ? value.getTime() : value ?? null;
  return normalize(left) === normalize(right);
};

const labelForField = (field) => ({
  reminderEnabled: "Email reminders",
  deadlineType: "Deadline type",
  referenceLink: "Reference link",
  name: "Cluster name",
}[field] || field.charAt(0).toUpperCase() + field.slice(1));

const renderValue = (field, value) => {
  if (field === "reminderEnabled") return value ? "Enabled" : "Disabled";
  if (field === "deadline" && value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
  }
  if (value === null || value === undefined || value === "") return "(empty)";
  return value;
};

exports.listManagedUpdates = async (req, res) => {
  try {
    const [updates, imports] = await Promise.all([
      ManagedUpdate.find({
        importerId: req.user._id,
        status: "pending",
        "changes.status": "pending",
      })
        .sort({ updatedAt: -1 })
        .populate("broadcastId", "name code")
        .populate("broadcastImportId", "syncEnabled syncDisconnectReason")
        .populate("ownerId", "name")
        .lean(),
      BroadcastImport.find({ importerId: req.user._id, status: "completed" })
        .sort({ updatedAt: -1 })
        .populate("broadcastId", "name code revokedAt")
        .lean(),
    ]);

    const connections = imports
      .filter((record) => record.broadcastId)
      .map((record) => ({
        _id: record._id,
        broadcast: record.broadcastId,
        mode: record.mode,
        importedClusterId: record.importedClusterId || null,
        syncEnabled: record.syncEnabled !== false,
        syncDisconnectedAt: record.syncDisconnectedAt || null,
        syncDisconnectReason: record.syncDisconnectReason || null,
      }));

    const taskIds = updates.map((update) => update.importedTaskId).filter(Boolean);
    const clusterIds = updates.map((update) => update.importedClusterId).filter(Boolean);
    const [tasks, clusters] = await Promise.all([
      Task.find({ _id: { $in: taskIds }, userId: req.user._id }).select("title"),
      Cluster.find({ _id: { $in: clusterIds }, ownerId: req.user._id, origin: "imported" }).select("name"),
    ]);
    const taskNames = new Map(tasks.map((task) => [String(task._id), task.title]));
    const clusterNames = new Map(clusters.map((cluster) => [String(cluster._id), cluster.name]));

    const shaped = updates.map((update) => ({
      ...update,
      itemTitle: update.targetType === "cluster"
        ? clusterNames.get(String(update.importedClusterId)) || "Imported cluster"
        : taskNames.get(String(update.importedTaskId)) || "Imported deadline",
      changes: (update.changes || []).filter((change) => change.status === "pending").map((change) => ({
        ...change,
        label: labelForField(change.field),
        previousDisplay: renderValue(change.field, change.previousValue),
        proposedDisplay: renderValue(change.field, change.proposedValue),
      })),
    }));

    return res.json({ updates: shaped, pendingCount: shaped.length, connections });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load managed updates" });
  }
};

exports.decideManagedUpdate = async (req, res) => {
  try {
    const { id } = req.params;
    const { decisions } = req.body || {};
    if (!isObjectIdString(id)) return res.status(400).json({ message: "Invalid update ID" });
    if (!Array.isArray(decisions) || decisions.length === 0 || decisions.length > 20) {
      return res.status(400).json({ message: "Choose at least one change to accept or reject" });
    }

    const seenFields = new Set();
    for (const decision of decisions) {
      if (!decision || typeof decision.field !== "string" || !["accept", "reject"].includes(decision.action) || seenFields.has(decision.field)) {
        return res.status(400).json({ message: "Each decision needs a unique field and an accept/reject action" });
      }
      seenFields.add(decision.field);
    }

    const update = await ManagedUpdate.findOne({
      _id: id,
      importerId: req.user._id,
      status: "pending",
    });
    if (!update) return res.status(404).json({ message: "Pending update not found" });

    const importRecord = await BroadcastImport.findOne({
      _id: update.broadcastImportId,
      importerId: req.user._id,
      status: "completed",
    });
    if (!importRecord) return res.status(410).json({ message: "The imported copy is no longer available" });

    const target = update.targetType === "cluster"
      ? await Cluster.findOne({ _id: update.importedClusterId, ownerId: req.user._id, origin: "imported" })
      : await Task.findOne({ _id: update.importedTaskId, userId: req.user._id });

    if (!target) {
      for (const change of update.changes) {
        if (change.status === "pending") {
          change.status = "rejected";
          change.decidedAt = new Date();
        }
      }
      update.status = "resolved";
      await update.save();
      return res.status(410).json({ message: "The copied item was deleted, so this update can no longer be applied" });
    }

    const pendingChanges = update.changes.filter((change) => change.status === "pending");
    const decisionMap = new Map(decisions.map((decision) => [decision.field, decision.action]));
    const applicable = [];

    const staleAcceptedFields = [];
    for (const [field, action] of decisionMap) {
      const change = pendingChanges.find((candidate) => candidate.field === field);
      if (!change) return res.status(400).json({ message: `Field ${field} is not pending on this update` });
      if (action === "accept") {
        if (update.targetType === "task" && !ACCEPTABLE_TASK_FIELDS.has(field)) {
          return res.status(400).json({ message: `Field ${field} cannot be imported` });
        }
        if (update.targetType === "cluster" && field !== "name") {
          return res.status(400).json({ message: `Field ${field} cannot be imported into a cluster` });
        }
        if (!sameValue(target[field], change.previousValue)) {
          // The recipient changed this field after the proposal was created.
          // Refresh the displayed baseline and make them decide again instead
          // of overwriting a newer personal change with a stale approval.
          change.previousValue = target[field];
          staleAcceptedFields.push(field);
        } else {
          applicable.push({ field, value: change.proposedValue });
        }
      }
    }

    if (staleAcceptedFields.length) {
      await update.save();
      return res.status(409).json({
        message: "Your copied item changed after this proposal was created. Review the refreshed current values and decide again.",
        staleFields: staleAcceptedFields,
      });
    }

    for (const item of applicable) {
      target[item.field] = item.value;
    }

    if (applicable.length) {
      await target.save();
      if (update.targetType === "task" && applicable.some((item) => ["deadline", "reminderEnabled"].includes(item.field))) {
        await ReminderDelivery.deleteMany({
          taskId: target._id,
          status: { $ne: "sent" },
        });
      }
    }

    for (const [field, action] of decisionMap) {
      const change = update.changes.find((candidate) => candidate.field === field && candidate.status === "pending");
      if (change) {
        change.status = action === "accept" ? "accepted" : "rejected";
        change.decidedAt = new Date();
      }
    }

    update.status = update.changes.some((change) => change.status === "pending") ? "pending" : "resolved";
    await update.save();

    return res.json({
      message: "Your decisions have been saved",
      updateId: update._id,
      status: update.status,
      remainingChanges: update.changes.filter((change) => change.status === "pending").length,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to save update decisions" });
  }
};

exports.disconnectManagedImport = async (req, res) => {
  try {
    const { importId } = req.params;
    if (!isObjectIdString(importId)) return res.status(400).json({ message: "Invalid import ID" });
    const record = await BroadcastImport.findOne({
      _id: new mongoose.Types.ObjectId(importId),
      importerId: req.user._id,
      status: "completed",
    });
    if (!record) return res.status(404).json({ message: "Managed import not found" });
    if (record.syncEnabled === false) {
      return res.json({ message: "This import is already disconnected", syncEnabled: false });
    }
    record.syncEnabled = false;
    record.syncDisconnectedAt = new Date();
    record.syncDisconnectReason = "user-disconnected";
    await record.save();
    return res.json({ message: "Future updates from this source are now disconnected", syncEnabled: false });
  } catch (error) {
    return res.status(500).json({ message: "Failed to disconnect managed import" });
  }
};
