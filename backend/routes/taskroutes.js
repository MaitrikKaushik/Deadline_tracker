const express = require("express");
const router = express.Router();

const {
  createTask,
  getTasks,
  getTaskById,
  updateTask,
  deleteTask,
} = require("../controllers/taskcontroller");

// CREATE
router.post("/", createTask);

// READ ALL
router.get("/", getTasks);

// READ ONE
router.get("/:id", getTaskById);

// UPDATE
router.put("/:id", updateTask);

// DELETE
router.delete("/:id", deleteTask);

module.exports = router;