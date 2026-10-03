const ReminderDelivery = require("../models/reminderDelivery");

const {
  processReminderDelivery,
} = require("./reminderDeliveryProcessor");

const processPendingReminderDeliveries = async () => {
  const now = new Date();

  const deliveries =
    await ReminderDelivery.find({
      status: "pending",
      $or: [
        {
          nextAttemptAt: null,
        },
        {
          nextAttemptAt: {
            $lte: now,
          },
        },
      ],
    })
      .sort({
        scheduledDate: 1,
        createdAt: 1,
      })
      .populate("taskId")
      .populate("userId");

  const results = [];

  for (const delivery of deliveries) {
    const task = delivery.taskId;
    const user = delivery.userId;

    // Task or user was deleted
    if (!task || !user) {
      delivery.status = "failed";
      delivery.lastError =
        "Task or user no longer exists";

      await delivery.save();

      results.push(delivery);
      continue;
    }

    // Reminder is no longer required
    if (
      task.status === "completed" ||
      !task.reminderEnabled
    ) {
      delivery.status = "failed";
      delivery.lastError =
        "Reminder no longer required";

      await delivery.save();

      results.push(delivery);
      continue;
    }

    try {
      const processedDelivery =
        await processReminderDelivery(
          delivery,
          task,
          user.email
        );

      results.push(processedDelivery);
    } catch (error) {
      /*
       * This is only for unexpected errors outside
       * the normal delivery-processing flow.
       *
       * Keep the delivery pending so the next
       * queue cycle can try again.
       */
      delivery.status = "pending";
      delivery.lastError = error.message;

      await delivery.save();

      results.push(delivery);
    }
  }

  return results;
};

module.exports = {
  processPendingReminderDeliveries,
};