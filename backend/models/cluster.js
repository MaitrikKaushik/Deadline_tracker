
const mongoose = require("mongoose");

const clusterSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 100,
    },

    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    tasks: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Task",
      },
    ],

    origin: {
      type: String,
      enum: ["created", "imported"],
      default: "created",
      required: true,
    },

    sourceBroadcastId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Broadcast",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "Cluster",
  clusterSchema
);
