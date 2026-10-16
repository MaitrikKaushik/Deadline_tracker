
const express = require("express");

const {
  createCluster,
  getClusters,
  getClusterById,
  updateCluster,
  deleteCluster,
} = require("../controllers/clusterController");

const protect = require("../middleware/authMiddleware");
const { createBroadcastFromCluster } = require("../controllers/broadcastController");

const router = express.Router();

// All cluster routes require authentication.
router.use(protect);

router.post("/", createCluster);
router.post("/:id/broadcast", createBroadcastFromCluster);
router.get("/", getClusters);
router.get("/:id", getClusterById);
router.put("/:id", updateCluster);
router.delete("/:id", deleteCluster);

module.exports = router;
