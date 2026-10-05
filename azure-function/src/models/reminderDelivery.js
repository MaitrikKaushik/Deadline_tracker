const mongoose = require("mongoose");

const reminderDeliverySchema = new mongoose.Schema(
  {
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      required: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    scheduledDate: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: [
        "pending",
        "sending",
        "sent",
        "failed",
      ],
      default: "pending",
    },

    attempts: {
      type: Number,
      default: 0,
    },

    sentAt: {
      type: Date,
      default: null,
    },

    nextAttemptAt: {
      type: Date,
      default: null,
    },

    lastError: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

reminderDeliverySchema.index(
  {
    taskId: 1,
    scheduledDate: 1,
  },
  {
    unique: true,
  }
);

module.exports = mongoose.model(
  "ReminderDelivery",
  reminderDeliverySchema
);