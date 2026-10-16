
const express = require("express");

const {
  createCluster,
  getClusters,
  getClusterById,
  updateCluster,
  deleteCluster,
} = require("../controllers/clusterController");

const protect = require("../middleware/authMiddleware");

const router = express.Router();

// All cluster routes require authentication.
router.use(protect);

router.post("/", createCluster);
router.get("/", getClusters);
router.get("/:id", getClusterById);
router.put("/:id", updateCluster);
router.delete("/:id", deleteCluster);

module.exports = router;
