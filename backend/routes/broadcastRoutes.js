const express = require("express");
const protect = require("../middleware/authMiddleware");
const {
  searchBroadcasts,
  getMyBroadcasts,
  getBroadcastByCode,
  importBroadcast,
  revokeBroadcast,
} = require("../controllers/broadcastController");

const router = express.Router();

// Discovery and previews are share-link friendly; importing and revoking require login.
router.get("/", searchBroadcasts);
router.get("/mine", protect, getMyBroadcasts);
router.get("/:code", getBroadcastByCode);
router.post("/:code/import", protect, importBroadcast);
router.post("/:id/revoke", protect, revokeBroadcast);

module.exports = router;
