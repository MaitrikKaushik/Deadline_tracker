const Task = require("../models/task");

const {
  getReminderDates,
} = require("./reminderService");

const {
  createReminderDelivery,
} = require("./reminderDeliveryService");

const getTasksDueForReminder = async (today) => {
  const tasks = await Task.find({
    reminderEnabled: true,
    status: { $ne: "completed" },
    deadline: {
      $gte: today,
    },
  });

  const tasksDueToday = [];

  const todayString = new Date(today)
    .toISOString()
    .split("T")[0];

  for (const task of tasks) {
    const reminderDates = getReminderDates(
      task.deadline,
      today
    );

    if (reminderDates.includes(todayString)) {
      const delivery = await createReminderDelivery(
        task,
        todayString
      );

      tasksDueToday.push({
        task,
        delivery,
      });
    }
  }

  return tasksDueToday;
};

module.exports = {
  getTasksDueForReminder,
};