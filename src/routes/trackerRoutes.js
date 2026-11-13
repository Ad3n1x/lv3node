const express = require("express");
const mongoose = require("mongoose");
const Tracker = require("../models/Tracker");

// SAFELY RESOLVE MIDDLEWARE IMPORTS (Handles both module.exports = fn and module.exports = { fn })
const rawVerifyToken = require("../middleware/auth");
const verifyToken = typeof rawVerifyToken === "function" 
  ? rawVerifyToken 
  : (rawVerifyToken.verifyToken || rawVerifyToken.default);

const rawRequirePro = require("../middleware/requirePro");
const requirePro = typeof rawRequirePro === "function" 
  ? rawRequirePro 
  : (rawRequirePro.requirePro || rawRequirePro.default);

const router = express.Router();

const appendActivity = (tracker, type, label) => {
  tracker.activity = Array.isArray(tracker.activity) ? tracker.activity : [];
  tracker.activity.push({ type, label, at: new Date() });
  if (tracker.activity.length > 100) tracker.activity = tracker.activity.slice(-100);
};
const auth = verifyToken; // Alias for compatibility across all routes

// 🛡️ Helper: Safely extracts user ID from any JWT payload structure
const getUserId = (req) => {
  if (!req.user) return null;
  return req.user.id || req.user._id || req.user.userId || (typeof req.user === "string" ? req.user : null);
};

// 🛡️ Helper: Guarantees consistent tracker payload structure across all routes
const formatTracker = (trackerDoc) => {
  const trackerObj = trackerDoc.toJSON();
  return {
    ...trackerObj,
    trackerName: trackerObj.name || "",
  };
};

// Get all trackers for logged-in user
router.get("/", verifyToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized: Invalid user session." });

    const includeArchived = req.query.includeArchived === "true";
    const includeDeleted = req.query.includeDeleted === "true";
    const filter = { userId, deletedAt: includeDeleted ? { $ne: null } : null };
    if (!includeArchived) filter.archivedAt = null;
    const trackers = await Tracker.find(filter).sort({ updatedAt: -1 }).limit(500);
    return res.status(200).json(trackers.map((t) => formatTracker(t)));
  } catch (err) {
    return res.status(500).json({ message: "Error retrieving trackers.", error: err.message });
  }
});

// Get a single tracker by ID
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized: Invalid user session." });

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid tracker ID format." });
    }

    const tracker = await Tracker.findOne({ _id: id, userId, deletedAt: null });
    if (!tracker) {
      return res.status(404).json({ message: "Tracker not found or unauthorized." });
    }

    return res.status(200).json(formatTracker(tracker));
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Create tracker for logged-in user
router.post("/", verifyToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized: User ID could not be extracted from token." });
    }

    const { name, type, icon, color, target, unit, entries } = req.body || {};

    if (!name || !type) {
      return res.status(400).json({ 
        message: "Validation Error: 'name' and 'type' are required fields.",
        receivedBody: req.body 
      });
    }

    const tracker = new Tracker({
      userId,
      name: name.trim(),
      type,
      icon,
      color,
      target,
      unit,
      entries: entries !== undefined ? entries : [],
      activity: [{ type: "created", label: "Tracker created", at: new Date() }],
    });

    const savedTracker = await tracker.save();
    return res.status(201).json(formatTracker(savedTracker));
  } catch (err) {
    console.error("Tracker creation error:", err.message);
    return res.status(400).json({ message: "Failed to create tracker.", error: err.message });
  }
});

// Dedicated Endpoint to Add an Entry Permanently
router.post("/:id/entries", verifyToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized: Invalid user session." });

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid tracker ID format." });
    }

    const tracker = await Tracker.findOne({ _id: id, userId });
    if (!tracker) {
      return res.status(404).json({ message: "Tracker not found or unauthorized." });
    }

    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({ message: "Entry data cannot be empty." });
    }

    if (Array.isArray(tracker.entries)) {
      tracker.entries.push(req.body);
    } else {
      tracker.entries = req.body;
    }
    tracker.markModified("entries");
    appendActivity(tracker, "entry_added", "A tracking entry was added");

    const updatedTracker = await tracker.save();
    return res.status(200).json(formatTracker(updatedTracker));
  } catch (err) {
    console.error("Failed to add entry:", err);
    return res.status(400).json({ message: "Failed to add entry.", error: err.message });
  }
});

// Update tracker details
router.put("/:id", verifyToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized: Invalid user session." });

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid tracker ID format." });
    }

    const tracker = await Tracker.findOne({ _id: id, userId });
    if (!tracker) {
      return res.status(404).json({ message: "Tracker not found or unauthorized." });
    }

    const expectedVersion = req.get("if-match");
    if (expectedVersion && Number(expectedVersion) !== new Date(tracker.updatedAt).getTime()) {
      return res.status(409).json({
        code: "TRACKER_VERSION_CONFLICT",
        message: "This tracker changed on another device. Refresh before applying your update.",
        currentVersion: tracker.updatedAt,
      });
    }

    const body = req.body || {};

    const changedFields = ["name", "type", "icon", "color", "target", "unit"].filter((key) => body[key] !== undefined);
    if (body.name !== undefined) tracker.name = String(body.name).trim();
    if (body.type !== undefined) tracker.type = body.type;
    if (body.icon !== undefined) tracker.icon = body.icon;
    if (body.color !== undefined) tracker.color = body.color;
    if (body.target !== undefined) tracker.target = body.target;
    if (body.unit !== undefined) tracker.unit = body.unit;

    if (body.entries !== undefined) {
      tracker.set("entries", body.entries);
    } else if (body.entry !== undefined) {
      if (!Array.isArray(tracker.entries)) tracker.entries = [];
      tracker.entries.push(body.entry);
    } else if (body.newEntry !== undefined) {
      if (!Array.isArray(tracker.entries)) tracker.entries = [];
      tracker.entries.push(body.newEntry);
    }

    tracker.markModified("entries");
    if (changedFields.length || body.entries !== undefined || body.entry !== undefined || body.newEntry !== undefined) {
      appendActivity(tracker, "updated", "Tracker details or progress updated");
    }

    const updatedTracker = await tracker.save();
    return res.status(200).json(formatTracker(updatedTracker));
  } catch (err) {
    console.error("Failed to update tracker:", err);
    return res.status(500).json({ message: "Failed to update tracker.", error: err.message });
  }
});

// Delete tracker
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized: Invalid user session." });

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid tracker ID format." });
    }

    const tracker = await Tracker.findOne({ _id: id, userId, deletedAt: null });
    if (!tracker) return res.status(404).json({ message: "Tracker not found or unauthorized." });

    tracker.deletedAt = new Date();
    appendActivity(tracker, "deleted", "Tracker moved to recently deleted");
    await tracker.save();

    return res.status(200).json({ message: "Tracker moved to recently deleted.", id, deletedAt: tracker.deletedAt });
  } catch (err) {
    console.error("Failed to delete tracker:", err);
    return res.status(500).json({ message: "Failed to delete tracker.", error: err.message });
  }
});


/** Archive a tracker without deleting its history. */
router.post("/:id/archive", verifyToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    if (!userId) return res.status(401).json({ message: "Unauthorized." });
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid tracker ID." });
    const tracker = await Tracker.findOne({ _id: id, userId, deletedAt: null });
    if (!tracker) return res.status(404).json({ message: "Tracker not found." });
    if (!tracker.archivedAt) {
      tracker.archivedAt = new Date();
      appendActivity(tracker, "archived", "Tracker archived");
      await tracker.save();
    }
    return res.status(200).json({ message: "Tracker archived.", tracker: formatTracker(tracker) });
  } catch (err) {
    console.error("Archive tracker error:", err);
    return res.status(500).json({ message: "Could not archive tracker." });
  }
});

/** Restore a tracker from archive or recently deleted. */
router.post("/:id/restore", verifyToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    if (!userId) return res.status(401).json({ message: "Unauthorized." });
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid tracker ID." });
    const tracker = await Tracker.findOne({
      _id: id,
      userId,
      $or: [{ archivedAt: { $ne: null }, deletedAt: null }, { deletedAt: { $ne: null } }],
    });
    if (!tracker) return res.status(404).json({ message: "Restorable tracker not found." });
    tracker.deletedAt = null;
    tracker.archivedAt = null;
    appendActivity(tracker, "restored", "Tracker restored");
    await tracker.save();
    return res.status(200).json({ message: "Tracker restored.", tracker: formatTracker(tracker) });
  } catch (err) {
    console.error("Restore tracker error:", err);
    return res.status(500).json({ message: "Could not restore tracker." });
  }
});

/** Read metadata-only activity. Never return tracker content in the audit stream. */
router.get("/activity/recent", verifyToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized." });
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 30, 1), 100);
    const trackers = await Tracker.find({ userId, deletedAt: null })
      .select("_id name activity updatedAt")
      .sort({ updatedAt: -1 })
      .limit(500)
      .lean();
    const activity = trackers.flatMap((tracker) => (tracker.activity || []).map((event) => ({
      trackerId: tracker._id,
      trackerName: tracker.name,
      type: event.type,
      label: event.label,
      at: event.at,
    }))).sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, limit);
    return res.status(200).json({ activity });
  } catch (err) {
    console.error("Recent activity error:", err);
    return res.status(500).json({ message: "Could not load activity." });
  }
});

/** List the signed-in user's archived or recently deleted trackers. */
router.get("/recovery/list", verifyToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized." });
    const trackers = await Tracker.find({
      userId,
      $or: [{ archivedAt: { $ne: null }, deletedAt: null }, { deletedAt: { $ne: null } }],
    }).sort({ updatedAt: -1 }).limit(200);
    return res.status(200).json({ trackers: trackers.map(formatTracker) });
  } catch (err) {
    console.error("Recovery list error:", err);
    return res.status(500).json({ message: "Could not load archived items." });
  }
});

// Protected Premium Backend Route
router.post("/export-data", verifyToken, requirePro, async (req, res) => {
  try {
    res.json({ message: "Data exported successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;