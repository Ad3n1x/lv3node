const express = require("express");
const mongoose = require("mongoose");
const Tracker = require("../models/Tracker");
const auth = require("../middleware/auth");

const router = express.Router();

// Helper to safely extract user ID regardless of JWT payload format
const getUserId = (req) => req.user?.id || req.user?._id;

// Get all trackers for logged-in user
router.get("/trackers", auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized user session." });

    const trackers = await Tracker.find({ userId }).sort({ createdAt: -1 });
    res.json(trackers);
  } catch (err) {
    res.status(500).json({ message: "Error retrieving trackers.", error: err.message });
  }
});

// Create tracker for logged-in user
router.post("/trackers", auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized user session." });

    const { name, type, icon, color, target, unit, entries } = req.body;

    if (!name || !type) {
      return res.status(400).json({ message: "Name and type are required fields." });
    }

    // Explicit field assignment prevents user malicious override of userId
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

// Update tracker
router.put("/trackers/:id", auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid tracker ID format." });
    }

    // Prevent overwriting internal ownership fields
    const { _id, userId: bodyUserId, ...updateData } = req.body;

    const tracker = await Tracker.findOneAndUpdate(
      { _id: id, userId },
      updateData,
      { new: true, runValidators: true }
    );

    if (!tracker) return res.status(404).json({ message: "Tracker not found or unauthorized." });
    res.json(tracker);
  } catch (err) {
    res.status(400).json({ message: "Failed to update tracker.", error: err.message });
  }
});

// Delete tracker
router.delete("/trackers/:id", auth, async (req, res) => {
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