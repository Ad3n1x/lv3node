const express = require("express");
const mongoose = require("mongoose");
const Tracker = require("../models/Tracker");
const auth = require("../middleware/auth");

const router = express.Router();

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
router.get("/", auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized: Invalid user session." });

    const trackers = await Tracker.find({ userId }).sort({ createdAt: -1 });
    return res.status(200).json(trackers.map((t) => formatTracker(t)));
  } catch (err) {
    return res.status(500).json({ message: "Error retrieving trackers.", error: err.message });
  }
});

// Get a single tracker by ID
router.get("/:id", auth, async (req, res) => {
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

    return res.status(200).json(formatTracker(tracker));
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Create tracker for logged-in user
router.post("/", auth, async (req, res) => {
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
      entries: Array.isArray(entries) ? entries : [],
    });

    const savedTracker = await tracker.save();
    return res.status(201).json(formatTracker(savedTracker));
  } catch (err) {
    console.error("Tracker creation error:", err.message);
    return res.status(400).json({ message: "Failed to create tracker.", error: err.message });
  }
});

// Dedicated Endpoint to Add an Entry Permanently
router.post("/:id/entries", auth, async (req, res) => {
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

    // Direct Mongoose document array manipulation
    if (!Array.isArray(tracker.entries)) {
      tracker.entries = [];
    }
    tracker.entries.push(req.body);
    tracker.markModified("entries");

    const updatedTracker = await tracker.save();
    return res.status(200).json(formatTracker(updatedTracker));
  } catch (err) {
    console.error("Failed to add entry:", err);
    return res.status(400).json({ message: "Failed to add entry.", error: err.message });
  }
});

// Update tracker details
router.put("/:id", auth, async (req, res) => {
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

    const body = req.body || {};

    // Standard field updates
    if (body.name !== undefined) tracker.name = body.name.trim();
    if (body.type !== undefined) tracker.type = body.type;
    if (body.icon !== undefined) tracker.icon = body.icon;
    if (body.color !== undefined) tracker.color = body.color;
    if (body.target !== undefined) tracker.target = body.target;
    if (body.unit !== undefined) tracker.unit = body.unit;

    // Direct entry updates
    if (!Array.isArray(tracker.entries)) {
      tracker.entries = [];
    }

    if (body.entries !== undefined) {
      tracker.entries = Array.isArray(body.entries) ? body.entries : [body.entries];
    } else if (body.entry !== undefined) {
      tracker.entries.push(body.entry);
    } else if (body.newEntry !== undefined) {
      tracker.entries.push(body.newEntry);
    }

    tracker.markModified("entries");

    const updatedTracker = await tracker.save();
    return res.status(200).json(formatTracker(updatedTracker));
  } catch (err) {
    console.error("Failed to update tracker:", err);
    return res.status(500).json({ message: "Failed to update tracker.", error: err.message });
  }
});

// Delete tracker
router.delete("/:id", auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized: Invalid user session." });

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid tracker ID format." });
    }

    const tracker = await Tracker.findOneAndDelete({ _id: id, userId });
    if (!tracker) return res.status(404).json({ message: "Tracker not found or unauthorized." });

    return res.status(200).json({ message: "Tracker deleted successfully.", id });
  } catch (err) {
    console.error("Failed to delete tracker:", err);
    return res.status(500).json({ message: "Failed to delete tracker.", error: err.message });
  }
});

module.exports = router;