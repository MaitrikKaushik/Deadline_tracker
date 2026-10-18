const Broadcast = require("../models/broadcast");
const BroadcastImport = require("../models/broadcastImport");
const Cluster = require("../models/cluster");
const ManagedUpdate = require("../models/managedUpdate");
const Task = require("../models/task");

// Completion status belongs to the recipient, not the source owner.
const SHARED_TASK_FIELDS = [
  "title",
  "description",
  "deadline",
  "reminderEnabled",
  "priority",
  "deadlineType",
  "referenceLink",
];

const currentValue = (document, field) => {
  const value = document ? document[field] : undefined;
  return value === undefined ? null : value;
};


async function upsertPendingProposal({
  broadcast,
  importRecord,
  targetType,
  sourceTaskId = null,
  importedTaskId = null,
  importedClusterId = null,
  changes,
}) {
  if (!changes.length) return null;

  const identity = {
    broadcastImportId: importRecord._id,
    targetType,
    sourceTaskId,
    importedTaskId,
    status: "pending",
  };

  let update = await ManagedUpdate.findOne(identity);

  if (!update) {
    update = await ManagedUpdate.create({
      broadcastId: broadcast._id,
      broadcastImportId: importRecord._id,
      importerId: importRecord.importerId,
      ownerId: broadcast.ownerId,
      sourceClusterId: broadcast.sourceClusterId,
      targetType,
      sourceTaskId,
      importedTaskId,
      importedClusterId,
      changes: changes.map((change) => ({
        field: change.field,
        previousValue: change.previousValue,
        proposedValue: change.proposedValue,
        status: "pending",
        decidedAt: null,
      })),
      status: "pending",
      sourceUpdatedAt: new Date(),
    });
    return update;
  }

  // Coalesce repeated owner edits into the latest proposal rather than piling
  // up duplicate notifications. Keep the recipient's original value while a
  // decision is pending; refresh it only when a prior proposal was resolved.
  for (const incoming of changes) {
    const existing = update.changes.find((change) => change.field === incoming.field);
    if (!existing) {
      update.changes.push({
        field: incoming.field,
        previousValue: incoming.previousValue,
        proposedValue: incoming.proposedValue,
        status: "pending",
        decidedAt: null,
      });
      continue;
    }

    if (existing.status !== "pending") {
      existing.previousValue = incoming.previousValue;
      existing.status = "pending";
      existing.decidedAt = null;
    }
    existing.proposedValue = incoming.proposedValue;
  }

  update.importedClusterId = importedClusterId || update.importedClusterId || null;
  update.sourceUpdatedAt = new Date();
  update.status = "pending";
  await update.save();
  return update;
}

/**
 * Refresh each broadcast's private snapshot and prepare user-controlled
 * proposals for every completed, still-connected import of the source task.
 * The source task itself has already been saved by taskController.
 */
exports.recordTaskChanges = async ({ ownerId, sourceTaskId, currentTask, changedFields }) => {
  const fields = SHARED_TASK_FIELDS.filter((field) => changedFields.includes(field));
  if (!fields.length) return { proposalsCreated: 0 };

  const broadcasts = await Broadcast.find({
    ownerId,
    "tasks.sourceTaskId": sourceTaskId,
  });
  let proposalsCreated = 0;

  for (const broadcast of broadcasts) {
    const snapshot = broadcast.tasks.find(
      (task) => String(task.sourceTaskId) === String(sourceTaskId)
    );
    if (!snapshot) continue;

    for (const field of fields) {
      snapshot[field] = currentTask[field];
    }
    await broadcast.save();

    const imports = await BroadcastImport.find({
      broadcastId: broadcast._id,
      status: "completed",
      syncEnabled: { $ne: false },
    });

    for (const importRecord of imports) {
      const mapping = (importRecord.taskMappings || []).find(
        (item) => String(item.sourceTaskId) === String(sourceTaskId)
      );
      if (!mapping) continue;

      const importedTask = await Task.findOne({
        _id: mapping.importedTaskId,
        userId: importRecord.importerId,
      });
      if (!importedTask) continue;

      // Always show source-side field changes, even when the recipient's value
      // happens to match the proposed value. In particular, owners' reminder
      // setting changes must be visible so recipients can explicitly decide.
      const changes = fields
        .map((field) => ({
          field,
          previousValue: currentValue(importedTask, field),
          proposedValue: currentValue(currentTask, field),
        }));

      const proposal = await upsertPendingProposal({
        broadcast,
        importRecord,
        targetType: "task",
        sourceTaskId,
        importedTaskId: mapping.importedTaskId,
        changes,
      });
      if (proposal) proposalsCreated += 1;
    }
  }

  return { proposalsCreated };
};

/** Prepare proposals for source-cluster renames for recipients with a cluster copy. */
exports.recordClusterNameChange = async ({ ownerId, sourceClusterId, newName }) => {
  const broadcasts = await Broadcast.find({ ownerId, sourceClusterId });
  let proposalsCreated = 0;

  for (const broadcast of broadcasts) {
    const previousBroadcastName = broadcast.name;
    if (previousBroadcastName === newName) continue;
    broadcast.name = newName;
    await broadcast.save();

    const imports = await BroadcastImport.find({
      broadcastId: broadcast._id,
      status: "completed",
      mode: "cluster",
      syncEnabled: { $ne: false },
      importedClusterId: { $ne: null },
    });

    for (const importRecord of imports) {
      const importedCluster = await Cluster.findOne({
        _id: importRecord.importedClusterId,
        ownerId: importRecord.importerId,
        origin: "imported",
      });
      if (!importedCluster) continue;

      const proposal = await upsertPendingProposal({
        broadcast,
        importRecord,
        targetType: "cluster",
        importedClusterId: importedCluster._id,
        changes: [{
          field: "name",
          previousValue: importedCluster.name,
          proposedValue: newName,
        }],
      });
      if (proposal) proposalsCreated += 1;
    }
  }

  return { proposalsCreated };
};

exports.SHARED_TASK_FIELDS = SHARED_TASK_FIELDS;
