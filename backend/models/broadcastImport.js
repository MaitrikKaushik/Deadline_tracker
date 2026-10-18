const mongoose = require("mongoose");

// Explicit source -> imported pairing. Never rely on the position of an ID in
// selectedSourceTaskIds / importedTaskIds to work out which copy came from
// which source deadline.
const taskMappingSchema = new mongoose.Schema(
  {
    sourceTaskId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    importedTaskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      required: true,
    },
  },
  { _id: false }
);

const broadcastImportSchema = new mongoose.Schema(
  {
    broadcastId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Broadcast",
      required: true,
    },
    importerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    mode: { type: String, enum: ["tasks", "cluster"], required: true },
    selectedSourceTaskIds: [{ type: mongoose.Schema.Types.ObjectId }],
    importedTaskIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Task" }],
    importedClusterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Cluster",
      default: null,
    },
    reminderEnabled: { type: Boolean, default: false },
    status: { type: String, enum: ["processing", "completed"], default: "processing" },

    // Source -> imported copy pairs, planned before any task is created.
    taskMappings: { type: [taskMappingSchema], default: [] },

    // Recovery bookkeeping for an import that is "processing".
    // plannedClusterId: the ID the imported cluster will be created with.
    // claimId: identifies the request that currently owns the import.
    // processingStartedAt: when that request claimed it (staleness clock).
    plannedClusterId: { type: mongoose.Schema.Types.ObjectId, default: null },
    claimId: { type: String, default: null },
    processingStartedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// A user can import a broadcast only once; retries return the original result.
broadcastImportSchema.index({ broadcastId: 1, importerId: 1 }, { unique: true });

module.exports = mongoose.model("BroadcastImport", broadcastImportSchema);
