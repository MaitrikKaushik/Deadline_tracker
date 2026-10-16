
const mongoose = require("mongoose");

const Cluster = require("../models/cluster");
const Task = require("../models/task");

// Validate MongoDB ObjectIds strictly.
const isValidObjectId = (id) => {
  return (
    typeof id === "string" &&
    /^[a-fA-F0-9]{24}$/.test(id)
  );
};

// Validate and normalize cluster names.
const validateClusterName = (name) => {
  if (typeof name !== "string" || !name.trim()) {
    return {
      error: "Cluster name must be a non-empty string",
    };
  }

  const trimmedName = name.trim();

  if (trimmedName.length > 100) {
    return {
      error: "Cluster name cannot exceed 100 characters",
    };
  }

  return { value: trimmedName };
};

// Validate task IDs and remove duplicates.
const validateTaskIds = (taskIds) => {
  if (!Array.isArray(taskIds)) {
    return {
      error: "taskIds must be an array",
    };
  }

  if (
    taskIds.some(
      (id) =>
        typeof id !== "string" || !isValidObjectId(id)
    )
  ) {
    return {
      error: "Invalid task ID",
    };
  }

  return {
    value: [...new Set(taskIds.map((id) => id.toLowerCase()))],
  };
};

// Ensure all referenced tasks belong to the authenticated user.
const verifyTaskOwnership = async (taskIds, userId) => {
  const ownedTasks = await Task.find({
    _id: { $in: taskIds },
    userId,
  }).select("_id");

  return ownedTasks.length === taskIds.length;
};

// CREATE CLUSTER
exports.createCluster = async (req, res) => {
  try {
    const body = req.body || {};
    const { name, taskIds = [] } = body;

    const nameResult = validateClusterName(name);

    if (nameResult.error) {
      return res.status(400).json({
        message: nameResult.error,
      });
    }

    const taskResult = validateTaskIds(taskIds);

    if (taskResult.error) {
      return res.status(400).json({
        message: taskResult.error,
      });
    }

    const uniqueTaskIds = taskResult.value;

    const ownsTasks = await verifyTaskOwnership(
      uniqueTaskIds,
      req.user._id
    );

    if (!ownsTasks) {
      return res.status(403).json({
        message: "One or more tasks do not belong to you",
      });
    }

    const cluster = await Cluster.create({
      name: nameResult.value,
      ownerId: req.user._id,
      tasks: uniqueTaskIds,
      origin: "created",
    });

    return res.status(201).json(cluster);
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({
        message: "Invalid cluster data",
      });
    }

    return res.status(500).json({
      message: "Failed to create cluster",
    });
  }
};

// GET CLUSTERS WITH FILTERING
exports.getClusters = async (req, res) => {
  try {
    const { type = "all" } = req.query;

    if (!["mine", "imported", "all"].includes(type)) {
      return res.status(400).json({
        message: "Invalid cluster type. Use mine, imported, or all.",
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

    return res.json(clusters);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch clusters",
    });
  }
};

// GET SINGLE CLUSTER
exports.getClusterById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        message: "Invalid cluster ID",
      });
    }

    const cluster = await Cluster.findOne({
      _id: id,
      ownerId: req.user._id,
    }).populate("tasks");

    if (!cluster) {
      return res.status(404).json({
        message: "Cluster not found",
      });
    }

    return res.json(cluster);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch cluster",
    });
  }
};

// UPDATE CLUSTER
exports.updateCluster = async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const { name, taskIds } = body;

    if (!isValidObjectId(id)) {
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
      const nameResult = validateClusterName(name);

      if (nameResult.error) {
        return res.status(400).json({
          message: nameResult.error,
        });
      }

      cluster.name = nameResult.value;
    }

    if (taskIds !== undefined) {
      const taskResult = validateTaskIds(taskIds);

      if (taskResult.error) {
        return res.status(400).json({
          message: taskResult.error,
        });
      }

      const uniqueTaskIds = taskResult.value;

      const ownsTasks = await verifyTaskOwnership(
        uniqueTaskIds,
        req.user._id
      );

      if (!ownsTasks) {
        return res.status(403).json({
          message: "One or more tasks do not belong to you",
        });
      }

      cluster.tasks = uniqueTaskIds;
    }

    await cluster.save();
    await cluster.populate("tasks");

    return res.json(cluster);
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({
        message: "Invalid cluster data",
      });
    }

    return res.status(500).json({
      message: "Failed to update cluster",
    });
  }
};

// DELETE CLUSTER
exports.deleteCluster = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
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

    // Deleting a cluster never deletes its associated tasks.
    return res.json({
      message: "Cluster deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to delete cluster",
    });
  }
};
