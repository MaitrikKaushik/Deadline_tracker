const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
    },

    description: {
        type: String,
    },

    deadline: {
        type: Date,
        required: true,
    },

    priority: {
        type: String,
        enum: ["low", "medium", "high"],
        default: "medium",
    },

    status: {
        type: String,
        enum: ["pending", "completed"],
        default: "pending",
    },

    createdAt: {
        type: Date,
        default: Date.now,
    },
    deadlineType: {
        type: String,
        enum: [
          "work",
          "exam",
          "general",
          "assignment",
          "self-study",
        ],
        default: "general",
      },
      
      referenceLink: {
        type: String,
        trim: true,
        default: "",
      },

      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
});

module.exports = mongoose.model("Task", taskSchema);