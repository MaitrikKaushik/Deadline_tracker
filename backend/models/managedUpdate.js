const mongoose = require("mongoose");

const managedUpdateChangeSchema = new mongoose.Schema(
  {
    field: {
      type: String,
      enum: [
        "title",
        "description",
        "deadline",
        "reminderEnabled",
        "priority",
        "deadlineType",
        "referenceLink",
        "name",
        "membership",
      ],
      required: true,
    },
    previousValue: { type: mongoose.Schema.Types.Mixed, default: null },
    proposedValue: { type: mongoose.Schema.Types.Mixed, default: null },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "superseded"],
      default: "pending",
    },
    decidedAt: { type: Date, default: null },
  },
  { _id: false }
);

const managedUpdateSchema = new mongoose.Schema(
  {
    broadcastId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Broadcast",
      required: true,
      index: true,
    },
    broadcastImportId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BroadcastImport",
      required: true,
      index: true,
    },
    importerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    sourceClusterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Cluster",
      required: true,
    },
    targetType: {
      type: String,
      enum: ["task", "cluster", "membership"],
      default: "task",
      required: true,
    },
    sourceTaskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      default: null,
    },
    importedTaskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      default: null,
    },
    importedClusterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Cluster",
      default: null,
    },
    changes: { type: [managedUpdateChangeSchema], default: [] },
    status: {
      type: String,
      enum: ["pending", "resolved"],
      default: "pending",
      index: true,
    },
    sourceUpdatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

managedUpdateSchema.index({ importerId: 1, status: 1, updatedAt: -1 });
managedUpdateSchema.index({ broadcastImportId: 1, targetType: 1, sourceTaskId: 1, status: 1 });

module.exports = mongoose.model("ManagedUpdate", managedUpdateSchema);
