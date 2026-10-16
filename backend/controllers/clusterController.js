
const mongoose = require("mongoose");

const Cluster = require("../models/cluster");
const Task = require("../models/task");

// CREATE CLUSTER
exports.createCluster = async (req, res) => {
  try {
    const { name, taskIds = [] } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        message: "Cluster name is required",
      });
    }

    if (!Array.isArray(taskIds)) {
      return res.status(400).json({
        message: "taskIds must be an array",
      });
    }

    if (
      taskIds.some(
        (id) => !mongoose.isValidObjectId(id)
      )
    ) {
      return res.status(400).json({
        message: "Invalid task ID",
      });
    }

    const uniqueTaskIds = [
      ...new Set(taskIds.map(String)),
    ];

    const ownedTasks = await Task.find({
      _id: { $in: uniqueTaskIds },
      userId: req.user._id,
    }).select("_id");

    if (ownedTasks.length !== uniqueTaskIds.length) {
      return res.status(403).json({
        message:
          "One or more tasks do not belong to you",
      });
    }

    const cluster = await Cluster.create({
      name: name.trim(),
      ownerId: req.user._id,
      tasks: uniqueTaskIds,
      origin: "created",
    });

    res.status(201).json(cluster);
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({
        message: error.message,
      });
    }

    res.status(500).json({
      message: "Failed to create cluster",
    });
  }
};

// GET ALL CLUSTERS
exports.getClusters = async (req, res) => {
  try {
    const clusters = await Cluster.find({
      ownerId: req.user._id,
    })
      .populate("tasks")
      .sort({ createdAt: -1 });

    res.json(clusters);
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch clusters",
    });
  }
};

// GET SINGLE CLUSTER

 // GET CLUSTERS WITH FILTERING
exports.getClusters = async (req, res) => {
  try {
    const { type = "all" } = req.query;

    if (!["mine", "imported", "all"].includes(type)) {
      return res.status(400).json({
        message:
          "Invalid cluster type. Use mine, imported, or all.",
      });
    }

    const filter = {
      ownerId: req.user._id,
    };

    if (type === "mine") {
      filter.origin = "created";
    } else if (type === "imported") {
      filter.origin = "imported";
    }

    const clusters = await Cluster.find(filter)
      .populate("tasks")
      .sort({ createdAt: -1 });

    res.json(clusters);
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch clusters",
    });
  }
};


// UPDATE CLUSTER
exports.updateCluster = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, taskIds } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        message: "Invalid cluster ID",
      });
    }

    const cluster = await Cluster.findOne({
      _id: id,
      ownerId: req.user._id,
    });

    if (!cluster) {
      return res.status(404).json({
        message: "Cluster not found",
      });
    }

    if (cluster.origin !== "created") {
      return res.status(403).json({
        message:
          "Only user-created clusters can be edited through this endpoint",
      });
    }

    if (name !== undefined) {
      if (
        typeof name !== "string" ||
        !name.trim()
      ) {
        return res.status(400).json({
          message: "Cluster name cannot be empty",
        });
      }

      if (name.trim().length > 100) {
        return res.status(400).json({
          message:
            "Cluster name cannot exceed 100 characters",
        });
      }

      cluster.name = name.trim();
    }

    if (taskIds !== undefined) {
      if (!Array.isArray(taskIds)) {
        return res.status(400).json({
          message: "taskIds must be an array",
        });
      }

      if (
        taskIds.some(
          (taskId) =>
            !mongoose.isValidObjectId(taskId)
        )
      ) {
        return res.status(400).json({
          message: "Invalid task ID",
        });
      }

      const uniqueTaskIds = [
        ...new Set(taskIds.map(String)),
      ];

      const ownedTasks = await Task.find({
        _id: { $in: uniqueTaskIds },
        userId: req.user._id,
      }).select("_id");

      if (
        ownedTasks.length !== uniqueTaskIds.length
      ) {
        return res.status(403).json({
          message:
            "One or more tasks do not belong to you",
        });
      }

      cluster.tasks = uniqueTaskIds;
    }

    await cluster.save();

    await cluster.populate("tasks");

    res.json(cluster);
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({
        message: error.message,
      });
    }

    res.status(500).json({
      message: "Failed to update cluster",
    });
  }
};

// DELETE CLUSTER
exports.deleteCluster = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        message: "Invalid cluster ID",
      });
    }

    const cluster = await Cluster.findOneAndDelete({
      _id: id,
      ownerId: req.user._id,
      origin: "created",
    });

    if (!cluster) {
      return res.status(404).json({
        message:
          "Cluster not found or cannot be deleted through this endpoint",
      });
    }

    // Deleting a cluster does not delete its tasks.
    res.json({
      message: "Cluster deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to delete cluster",
    });
  }
};
