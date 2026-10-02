const Task = require("../models/task");

const {
  getReminderDates,
} = require("./reminderService");

const getTasksDueForReminder = async (today) => {
  const tasks = await Task.find({
    reminderEnabled: true,
    status: { $ne: "completed" },
    deadline: {
      $gte: today,
    },
  });

  const tasksDueToday = [];

  for (const task of tasks) {
    const reminderDates = getReminderDates(
      task.deadline,
      today
    );

    const todayString = new Date(today)
      .toISOString()
      .split("T")[0];

    if (reminderDates.includes(todayString)) {
      tasksDueToday.push(task);
    }
  }

  return tasksDueToday;
};

module.exports = {
  getTasksDueForReminder,
};