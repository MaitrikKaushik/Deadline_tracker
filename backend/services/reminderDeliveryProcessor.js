const ReminderDelivery = require("../models/reminderDelivery");

const {
  sendReminderEmail,
} = require("./emailService");

const getRetryAfterSeconds = (error) => {
  const headers =
    error?.response?.headers;

  if (!headers) {
    return null;
  }

  const retryAfter =
    headers.get?.("retry-after") ??
    headers.get?.("Retry-After") ??
    headers["retry-after"] ??
    headers["Retry-After"];

  if (!retryAfter) {
    return null;
  }

  const seconds = Number(retryAfter);

  return Number.isFinite(seconds)
    ? seconds
    : null;
};

const processReminderDelivery = async (
  delivery,
  task,
  recipientEmail
) => {
  // Already successfully sent
  if (delivery.status === "sent") {
    return delivery;
  }

  // Retry is not due yet
  if (
    delivery.nextAttemptAt &&
    new Date(delivery.nextAttemptAt) > new Date()
  ) {
    return delivery;
  }

  /*
   * Atomically claim the delivery.
   *
   * This prevents two Azure Function executions
   * from sending the same reminder simultaneously.
   */
  const claimedDelivery =
    await ReminderDelivery.findOneAndUpdate(
      {
        _id: delivery._id,
        status: "pending",
        $or: [
          {
            nextAttemptAt: null,
          },
          {
            nextAttemptAt: {
              $lte: new Date(),
            },
          },
        ],
      },
      {
        $set: {
          status: "sending",
          lastError: "",
        },
        $inc: {
          attempts: 1,
        },
      },
      {
        new: true,
      }
    );

  // Another process already claimed it
  if (!claimedDelivery) {
    return ReminderDelivery.findById(
      delivery._id
    );
  }

  try {
    await sendReminderEmail(
      recipientEmail,
      task
    );

    claimedDelivery.status = "sent";
    claimedDelivery.sentAt = new Date();
    claimedDelivery.nextAttemptAt = null;
    claimedDelivery.lastError = "";

    await claimedDelivery.save();

    return claimedDelivery;
  } catch (error) {
    claimedDelivery.status = "pending";
    claimedDelivery.lastError =
      error.message;

    const retryAfterSeconds =
      getRetryAfterSeconds(error);

    const nextAttempt = new Date();

    if (retryAfterSeconds !== null) {
      nextAttempt.setSeconds(
        nextAttempt.getSeconds() +
          retryAfterSeconds
      );
    } else {
      // Fallback when Azure does not provide
      // a Retry-After value.
      nextAttempt.setHours(
        nextAttempt.getHours() + 1
      );
    }

    claimedDelivery.nextAttemptAt =
      nextAttempt;

    await claimedDelivery.save();

    return claimedDelivery;
  }
};

module.exports = {
  processReminderDelivery,
};