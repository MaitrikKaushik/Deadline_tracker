const Task = require("../models/task");
const ReminderDelivery = require("../models/reminderDelivery");
const { recordTaskChanges, SHARED_TASK_FIELDS } = require("../services/managedUpdateService");

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
    const task = await Task.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!task) {
      return res.status(404).json({
        message: "Task not found",
      });
    }

    await ReminderDelivery.deleteMany({
      taskId: task._id,
      status: {
        $ne: "sent",
      },
    });

    res.json({
      message: "Task deleted",
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};