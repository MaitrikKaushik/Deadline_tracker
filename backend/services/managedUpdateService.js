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

  // Membership proposals are keyed by source task identity, not by the
  // importedTaskId: an add proposal may not have a mapped copy yet, while a
  // later remove proposal does. Keeping the same identity prevents duplicates.
  const identity = targetType === "membership"
    ? {
        broadcastImportId: importRecord._id,
        targetType,
        sourceTaskId,
        status: "pending",
      }
    : {
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


const toBroadcastTask = (task) => ({
  sourceTaskId: task._id,
  title: task.title,
  description: task.description || "",
  deadline: task.deadline,
  priority: task.priority || "medium",
  deadlineType: task.deadlineType || "general",
  referenceLink: task.referenceLink || "",
  reminderEnabled: Boolean(task.reminderEnabled),
});

async function supersedeMembershipProposal({ importRecord, sourceTaskId }) {
  const pending = await ManagedUpdate.findOne({
    broadcastImportId: importRecord._id,
    targetType: "membership",
    sourceTaskId,
    status: "pending",
  });
  if (!pending) return;

  // The owner's latest membership now matches the recipient's existing copy,
  // so an older, opposite proposal is obsolete and should not remain in inbox.
  for (const change of pending.changes) {
    if (change.field === "membership" && change.status === "pending") {
      change.status = "superseded";
      change.decidedAt = new Date();
    }
  }
  pending.status = pending.changes.some((change) => change.status === "pending")
    ? "pending"
    : "resolved";
  await pending.save();
}

/**
 * Synchronize source-cluster membership changes to active broadcast snapshots
 * and create per-recipient, opt-in proposals. Removing a task from the source
 * cluster removes it from the recipient's imported cluster only after consent;
 * the recipient's Task document is deliberately preserved.
 */
exports.recordClusterMembershipChanges = async ({
  ownerId,
  sourceClusterId,
  previousTaskIds,
  currentTaskIds,
}) => {
  const previousIds = new Set((previousTaskIds || []).map(String));
  const currentIds = new Set((currentTaskIds || []).map(String));
  const addedIds = [...currentIds].filter((id) => !previousIds.has(id));
  const removedIds = [...previousIds].filter((id) => !currentIds.has(id));

  if (!addedIds.length && !removedIds.length) {
    return {
      proposalsCreated: 0,
      broadcastsUpdated: 0,
      broadcastsFound: 0,
      activeImportsFound: 0,
    };
  }

  const addedTasks = addedIds.length
    ? await Task.find({ _id: { $in: addedIds }, userId: ownerId })
    : [];
  const addedTaskById = new Map(addedTasks.map((task) => [String(task._id), task]));
  const broadcasts = await Broadcast.find({ ownerId, sourceClusterId });

  let proposalsCreated = 0;
  let broadcastsUpdated = 0;
  let activeImportsFound = 0;

  for (const broadcast of broadcasts) {
    const tasksBefore = broadcast.tasks || [];
    const existingSnapshotIds = new Set(tasksBefore.map((task) => String(task.sourceTaskId)));

    broadcast.tasks = tasksBefore.filter(
      (task) => !removedIds.includes(String(task.sourceTaskId))
    );

    for (const sourceTaskId of addedIds) {
      const task = addedTaskById.get(sourceTaskId);
      if (!task) continue;
      const alreadyInSnapshot = broadcast.tasks.some(
        (snapshot) => String(snapshot.sourceTaskId) === sourceTaskId
      );
      if (!alreadyInSnapshot) broadcast.tasks.push(toBroadcastTask(task));
    }

    const snapshotChanged = removedIds.some((id) => existingSnapshotIds.has(id)) ||
      addedIds.some((id) => addedTaskById.has(id) && !existingSnapshotIds.has(id));
    if (snapshotChanged) {
      // A broadcast may legitimately become empty when the owner removes its
      // last source deadline. The publishing endpoint still requires at least
      // one task when creating a new broadcast.
      await broadcast.save();
      broadcastsUpdated += 1;
    }

    const relevantChanges = [
      ...removedIds.map((sourceTaskId) => ({ sourceTaskId, action: "remove" })),
      ...addedIds
        .filter((sourceTaskId) => addedTaskById.has(sourceTaskId))
        .map((sourceTaskId) => ({ sourceTaskId, action: "add" })),
    ];
    if (!relevantChanges.length) continue;

    const imports = await BroadcastImport.find({
      broadcastId: broadcast._id,
      status: "completed",
      mode: "cluster",
      syncEnabled: { $ne: false },
      importedClusterId: { $ne: null },
    });
    activeImportsFound += imports.length;

    for (const importRecord of imports) {
      const importedCluster = await Cluster.findOne({
        _id: importRecord.importedClusterId,
        ownerId: importRecord.importerId,
        origin: "imported",
      }).select("_id tasks");
      if (!importedCluster) continue;

      for (const membershipChange of relevantChanges) {
        const sourceTaskId = membershipChange.sourceTaskId;
        const mapping = (importRecord.taskMappings || []).find(
          (item) => String(item.sourceTaskId) === sourceTaskId
        );
        const importedTaskId = mapping ? String(mapping.importedTaskId) : null;
        const currentlyIncluded = Boolean(
          importedTaskId && (importedCluster.tasks || []).some(
            (taskId) => String(taskId) === importedTaskId
          )
        );
        const shouldBeIncluded = membershipChange.action === "add";
        const taskSnapshot = broadcast.tasks.find(
          (item) => String(item.sourceTaskId) === sourceTaskId
        ) || tasksBefore.find((item) => String(item.sourceTaskId) === sourceTaskId);
        const pendingExisting = await ManagedUpdate.findOne({
          broadcastImportId: importRecord._id,
          targetType: "membership",
          sourceTaskId,
          status: "pending",
        });

        if (currentlyIncluded === shouldBeIncluded) {
          if (pendingExisting) {
            await supersedeMembershipProposal({ importRecord, sourceTaskId });
          }
          continue;
        }

        // A source removal is only relevant to this imported cluster if the
        // source task was imported there earlier or an add proposal is pending.
        if (membershipChange.action === "remove" && !mapping && !pendingExisting) {
          continue;
        }

        const title = taskSnapshot?.title || "Shared deadline";
        const proposal = await upsertPendingProposal({
          broadcast,
          importRecord,
          targetType: "membership",
          sourceTaskId,
          importedTaskId: mapping?.importedTaskId || null,
          importedClusterId: importedCluster._id,
          changes: [{
            field: "membership",
            previousValue: currentlyIncluded,
            proposedValue: {
              action: membershipChange.action,
              sourceTaskId,
              title,
            },
          }],
        });
        if (proposal) proposalsCreated += 1;
      }
    }
  }

  return {
    proposalsCreated,
    broadcastsUpdated,
    broadcastsFound: broadcasts.length,
    activeImportsFound,
  };
};
