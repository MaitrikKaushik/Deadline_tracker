const ReminderDelivery = require("../models/reminderDelivery");

const createReminderDelivery = async (
  task,
  scheduledDate
) => {
  try {
    const delivery =
      await ReminderDelivery.create({
        taskId: task._id,
        userId: task.userId,
        scheduledDate,
      });

    return delivery;
  } catch (error) {
    // Another process may have already created
    // this delivery because of the unique index.
    if (error.code === 11000) {
      return ReminderDelivery.findOne({
        taskId: task._id,
        scheduledDate,
      });
    }

    throw error;
  }
};

module.exports = {
  createReminderDelivery,
};