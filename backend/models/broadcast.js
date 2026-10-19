const mongoose = require("mongoose");

const broadcastTaskSchema = new mongoose.Schema(
  {
    sourceTaskId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    deadline: { type: Date, required: true },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    deadlineType: {
      type: String,
      enum: ["work", "exam", "general", "assignment", "self-study"],
      default: "general",
    },
    referenceLink: { type: String, default: "" },
    // Stored privately for managed update proposals; omitted from public previews.
    reminderEnabled: { type: Boolean, default: false },
  },
  { _id: false }
);

const broadcastSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    sourceClusterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Cluster",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, default: "", trim: true, maxlength: 500 },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    // Existing broadcasts mirror their source cluster and may become empty
    // after the owner removes the last deadline. The create endpoint still
    // enforces a non-empty selection for new broadcasts.
    tasks: { type: [broadcastTaskSchema], default: [] },
    revokedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

broadcastSchema.index({ name: "text", code: "text" });

module.exports = mongoose.model("Broadcast", broadcastSchema);
