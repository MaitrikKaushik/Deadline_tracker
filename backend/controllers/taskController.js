const Task = require("../models/task");
const ReminderDelivery = require("../models/reminderDelivery");

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
    if (req.body.deadline !== undefined) {
      const deadlineError = validateDeadline(
        req.body.deadline
      );

      if (deadlineError) {
        return res.status(400).json({
          message: deadlineError,
        });
      }
    }

    const task = await Task.findOneAndUpdate(
      {
        _id: req.params.id,
        userId: req.user._id,
      },
      req.body,
      {
        new: true,
      }
    );

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

    res.json(task);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
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