const mongoose = require("mongoose");

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
  },
  { timestamps: true }
);

// A user can import a broadcast only once; retries return the original result.
broadcastImportSchema.index({ broadcastId: 1, importerId: 1 }, { unique: true });

module.exports = mongoose.model("BroadcastImport", broadcastImportSchema);
