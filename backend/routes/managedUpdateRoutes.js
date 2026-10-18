const express = require("express");
const protect = require("../middleware/authMiddleware");
const {
  listManagedUpdates,
  decideManagedUpdate,
  disconnectManagedImport,
} = require("../controllers/managedUpdateController");

const router = express.Router();
router.use(protect);
router.get("/", listManagedUpdates);
router.post("/imports/:importId/disconnect", disconnectManagedImport);
router.post("/:id/decide", decideManagedUpdate);

module.exports = router;
