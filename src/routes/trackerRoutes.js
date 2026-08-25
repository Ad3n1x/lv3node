const express = require("express");
const mongoose = require("mongoose");
const Tracker = require("../models/Tracker");
const auth = require("../middleware/auth");

const router = express.Router();

// 🛡️ Enhanced Helper: Safely extracts user ID from any JWT payload structure (id, _id, or userId)
const getUserId = (req) => {
  if (!req.user) return null;
  return req.user.id || req.user._id || req.user.userId || (typeof req.user === "string" ? req.user : null);
};

// Get all trackers for logged-in user (Matches: GET /api/v1/trackers)
router.get("/", auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized: Invalid user session." });

    const trackers = await Tracker.find({ userId }).sort({ createdAt: -1 });
    res.json(trackers);
  } catch (err) {
    res.status(500).json({ message: "Error retrieving trackers.", error: err.message });
  }
});

// Get a single tracker by ID (Matches: GET /api/v1/trackers/:id)
router.get("/:id", auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid tracker ID format." });
    }

    const tracker = await Tracker.findOne({ _id: id, userId });

    if (!tracker) {
      return res.status(404).json({ message: "Tracker not found or unauthorized." });
    }

    res.status(200).json({
      status: "success",
      data: {
        ...tracker.toObject(),
        trackerName: tracker.name,
        unit: tracker.unit,
        target: tracker.target,
        entries: tracker.entries,
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Create tracker for logged-in user (Matches: POST /api/v1/trackers)
router.post("/", auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ 
        message: "Unauthorized: User ID could not be extracted from token." 
      });
    }

    // Ensure req.body exists to prevent destructuring crashes
    const { name, type, icon, color, target, unit, entries } = req.body || {};

    if (!name || !type) {
      return res.status(400).json({ 
        message: "Validation Error: 'name' and 'type' are required fields in the request body.",
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
      entries: entries || [],
    });

    const savedTracker = await tracker.save();
    return res.status(201).json(savedTracker);
  } catch (err) {
    console.error("Tracker creation error:", err.message);
    return res.status(400).json({ message: "Failed to create tracker.", error: err.message });
  }
});

// Update tracker (Matches: PUT /api/v1/trackers/:id)
router.put("/:id", auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid tracker ID format." });
    }

    const tracker = await Tracker.findOne({ _id: id, userId });

    if (!tracker) {
      return res.status(404).json({ message: "Tracker not found or unauthorized." });
    }

    if (req.body.name !== undefined) tracker.name = req.body.name.trim();
    if (req.body.type !== undefined) tracker.type = req.body.type;
    if (req.body.icon !== undefined) tracker.icon = req.body.icon;
    if (req.body.color !== undefined) tracker.color = req.body.color;
    if (req.body.target !== undefined) tracker.target = req.body.target;
    if (req.body.unit !== undefined) tracker.unit = req.body.unit;
    if (req.body.entries !== undefined) tracker.entries = req.body.entries;

    const updatedTracker = await tracker.save();

    res.status(200).json({
      status: "success",
      data: {
        ...updatedTracker.toObject(),
        trackerName: updatedTracker.name,
      },
    });
  } catch (err) {
    console.error("Failed to update tracker:", err);
    res.status(400).json({ message: "Failed to update tracker.", error: err.message });
  }
});

// Delete tracker (Matches: DELETE /api/v1/trackers/:id)
router.delete("/:id", auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid tracker ID format." });
    }

    const tracker = await Tracker.findOneAndDelete({ _id: id, userId });
    if (!tracker) return res.status(404).json({ message: "Tracker not found or unauthorized." });

    res.json({ message: "Tracker deleted successfully.", id });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete tracker.", error: err.message });
  }
});

module.exports = router;