const express = require("express");
const mongoose = require("mongoose");
const Tracker = require("../models/Tracker");
const auth = require("../middleware/auth");

const router = express.Router();

// Helper to safely extract user ID regardless of JWT payload format
const getUserId = (req) => req.user?.id || req.user?._id;

// Get all trackers for logged-in user (Matches: GET /api/v1/trackers)
router.get("/", auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized user session." });

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

    // Returns full tracker details along with decrypted entries
    res.status(200).json({
      status: "success",
      data: {
        ...tracker.toObject(),
        trackerName: tracker.name,
        unit: tracker.unit,
        target: tracker.target,
        entries: tracker.entries, // Decrypted automatically by Mongoose middleware
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
    if (!userId) return res.status(401).json({ message: "Unauthorized user session." });

    const { name, type, icon, color, target, unit, entries } = req.body;

    if (!name || !type) {
      return res.status(400).json({ message: "Name and type are required fields." });
    }

    const tracker = new Tracker({
      userId,
      name,
      type,
      icon,
      color,
      target,
      unit,
      entries: entries || [],
    });

    const savedTracker = await tracker.save();
    res.status(201).json(savedTracker);
  } catch (err) {
    res.status(400).json({ message: "Failed to create tracker.", error: err.message });
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

    // Safely update fields if provided
    if (req.body.name !== undefined) tracker.name = req.body.name;
    if (req.body.type !== undefined) tracker.type = req.body.type;
    if (req.body.icon !== undefined) tracker.icon = req.body.icon;
    if (req.body.color !== undefined) tracker.color = req.body.color;
    if (req.body.target !== undefined) tracker.target = req.body.target;
    if (req.body.unit !== undefined) tracker.unit = req.body.unit;
    if (req.body.entries !== undefined) tracker.entries = req.body.entries;

    // .save() ensures Mongoose schema hooks, validation, and encryption run properly
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