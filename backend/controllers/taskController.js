const Task = require("../models/task");
const Cluster = require("../models/cluster");
const ReminderDelivery = require("../models/reminderDelivery");
const {
  recordTaskChanges,
  recordClusterMembershipChanges,
  SHARED_TASK_FIELDS,
} = require("../services/managedUpdateService");

// Only these fields may be changed through updateTask. Anything else in
// the request body (userId, _id, createdAt, ...) is ignored.
const EDITABLE_TASK_FIELDS = [
  "title",
  "description",
  "deadline",
  "reminderEnabled",
  "priority",
  "status",
  "deadlineType",
  "referenceLink",
];

const validateDeadline = (deadline) => {
  const deadlineDate = new Date(deadline);

  if (Number.isNaN(deadlineDate.getTime())) {
    return "Invalid deadline";
  }

  const today = new Date();

  today.setHours(0, 0, 0, 0);
  deadlineDate.setHours(0, 0, 0, 0);

  const maximumDeadline = new Date(today);

  maximumDeadline.setDate(
    maximumDeadline.getDate() + 366
  );

  if (deadlineDate > maximumDeadline) {
    return "Deadline cannot be more than 366 days from today";
  }

  return null;
};

// CREATE TASK
exports.createTask = async (req, res) => {
  try {
    const deadlineError = validateDeadline(
      req.body.deadline
    );

    if (deadlineError) {
      return res.status(400).json({
        message: deadlineError,
      });
    }

    const task = await Task.create({
      ...req.body,
      userId: req.user._id,
    });

    res.status(201).json(task);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// GET ALL TASKS
exports.getTasks = async (req, res) => {
  try {
    const tasks = await Task.find({
      userId: req.user._id,
    });

    res.json(tasks);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// GET SINGLE TASK
exports.getTaskById = async (req, res) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!task) {
      return res.status(404).json({
        message: "Task not found",
      });
    }

    res.json(task);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// UPDATE TASK
exports.updateTask = async (req, res) => {
  try {
    const body = req.body || {};
    const updates = {};

    for (const field of EDITABLE_TASK_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No valid fields provided to update" });
    }

    if (updates.deadline !== undefined) {
      const deadlineError = validateDeadline(updates.deadline);
      if (deadlineError) return res.status(400).json({ message: deadlineError });
    }

    const task = await Task.findOne({ _id: req.params.id, userId: req.user._id });
    if (!task) return res.status(404).json({ message: "Task not found" });

    const previous = {};
    for (const field of Object.keys(updates)) {
      previous[field] = task[field];
    }

    task.set(updates);
    await task.save();

    const changedSharedFields = SHARED_TASK_FIELDS.filter((field) => {
      if (!Object.prototype.hasOwnProperty.call(updates, field)) return false;
      const before = previous[field] instanceof Date ? previous[field].getTime() : previous[field];
      const after = task[field] instanceof Date ? task[field].getTime() : task[field];
      return before !== after;
    });

    let managedUpdateWarning;
    if (changedSharedFields.length > 0) {
      try {
        await recordTaskChanges({
          ownerId: req.user._id,
          sourceTaskId: task._id,
          currentTask: task,
          changedFields: changedSharedFields,
        });
      } catch (syncError) {
        // The owner task has been saved; do not report it as a failed edit.
        // Surface the propagation issue so it can be investigated/retried.
        console.error("Managed update preparation failed:", syncError);
        managedUpdateWarning = "Your task was saved, but shared update proposals could not all be prepared. Please review your shared clusters.";
      }
    }

    await ReminderDelivery.deleteMany({ taskId: task._id, status: { $ne: "sent" } });
    const result = task.toObject();
    if (managedUpdateWarning) result.managedUpdateWarning = managedUpdateWarning;
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ message: "Failed to update task" });
  }
};

// DELETE TASK
exports.deleteTask = async (req, res) => {
  try {
    const existingTask = await Task.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!existingTask) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Capture owner-created source clusters before deletion so the service can
    // compare old membership with the post-delete cluster membership and
    // propose opt-in removal to connected recipients.
    const referencedClusters = await Cluster.find({
      ownerId: req.user._id,
      tasks: existingTask._id,
    });
    const sourceClusters = referencedClusters.filter((cluster) => cluster.origin === "created");
    const previousTaskIdsByCluster = new Map(sourceClusters.map((cluster) => [
      String(cluster._id), (cluster.tasks || []).map((taskId) => String(taskId)),
    ]));

    const task = await Task.findOneAndDelete({
      _id: existingTask._id,
      userId: req.user._id,
    });

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    await ReminderDelivery.deleteMany({
      taskId: task._id,
      status: { $ne: "sent" },
    });

    // Remove the now-deleted task ID from all of the owner's clusters. Only
    // source-created clusters generate managed synchronization proposals;
    // editing an imported or personal cluster must not broadcast changes.
    await Cluster.updateMany(
      { ownerId: req.user._id, tasks: task._id },
      { $pull: { tasks: task._id } }
    );

    let managedUpdateWarning;
    const managedSyncSummary = {
      sourceClustersFound: sourceClusters.length,
      broadcastsFound: 0,
      broadcastsUpdated: 0,
      activeImportsFound: 0,
      proposalsCreated: 0,
      failedClusters: 0,
    };
    for (const sourceCluster of sourceClusters) {
      try {
        const refreshedCluster = await Cluster.findOne({
          _id: sourceCluster._id,
          ownerId: req.user._id,
          origin: "created",
        }).select("_id tasks");
        const syncResult = await recordClusterMembershipChanges({
          ownerId: req.user._id,
          sourceClusterId: sourceCluster._id,
          previousTaskIds: previousTaskIdsByCluster.get(String(sourceCluster._id)) || [],
          currentTaskIds: (refreshedCluster?.tasks || []).map((taskId) => String(taskId)),
        });
        managedSyncSummary.broadcastsFound += syncResult.broadcastsFound || 0;
        managedSyncSummary.broadcastsUpdated += syncResult.broadcastsUpdated || 0;
        managedSyncSummary.activeImportsFound += syncResult.activeImportsFound || 0;
        managedSyncSummary.proposalsCreated += syncResult.proposalsCreated || 0;
      } catch (syncError) {
        console.error("Managed task-deletion synchronization failed:", syncError);
        managedSyncSummary.failedClusters += 1;
        managedUpdateWarning = "The deadline was deleted, but one or more shared-cluster removal proposals could not be prepared.";
      }
    }

    const result = { message: "Task deleted" };
    if (sourceClusters.length) result.managedSyncSummary = managedSyncSummary;
    if (managedUpdateWarning) result.managedUpdateWarning = managedUpdateWarning;
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete task" });
  }
};
