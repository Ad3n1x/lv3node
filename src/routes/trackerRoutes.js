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

// Get all trackers for logged-in user
router.get("/", auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized: Invalid user session." });

    const trackers = await Tracker.find({ userId }).sort({ createdAt: -1 });
    // res.json automatically invokes .toJSON() on all model instances, decrypting fields safely
    res.json(trackers);
  } catch (err) {
    res.status(500).json({ message: "Error retrieving trackers.", error: err.message });
  }
});

// Get a single tracker by ID
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

    // Convert to JSON first so schema transforms decrypt all properties safely
    const trackerObj = tracker.toJSON();

    res.status(200).json({
      status: "success",
      data: {
        ...trackerObj,
        trackerName: trackerObj.name, // Safely decrypted string
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
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
      entries: entries || [],
    });

    const savedTracker = await tracker.save();
    return res.status(201).json(savedTracker.toJSON());
  } catch (err) {
    console.error("Tracker creation error:", err.message);
    return res.status(400).json({ message: "Failed to create tracker.", error: err.message });
  }
});

// Dedicated Endpoint to Add an Entry Permanently
router.post("/:id/entries", auth, async (req, res) => {
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

    // Use .toJSON() to get the decrypted JS entries array automatically
    const trackerObj = tracker.toJSON();
    let currentEntries = Array.isArray(trackerObj.entries) ? trackerObj.entries : [];

    // Push new entry payload
    currentEntries.push(req.body);

    // Update entries and mark field modified for Mongoose mixed-type tracking
    tracker.entries = currentEntries;
    tracker.markModified("entries");

    const updatedTracker = await tracker.save(); // Pre-save handles encryption automatically
    const updatedObj = updatedTracker.toJSON();

    res.status(200).json({
      status: "success",
      data: {
        ...updatedObj,
        trackerName: updatedObj.name,
      },
    });
  } catch (err) {
    console.error("Failed to add entry:", err);
    res.status(400).json({ message: "Failed to add entry.", error: err.message });
  }
});

// Update tracker details (with smart entries handler)
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

    // --- SMART ENTRIES HANDLER ---
    const trackerObj = tracker.toJSON();
    let currentEntries = Array.isArray(trackerObj.entries) ? trackerObj.entries : [];

    if (req.body.entries !== undefined) {
      currentEntries = Array.isArray(req.body.entries) ? req.body.entries : [req.body.entries];
    } else if (req.body.entry !== undefined) {
      currentEntries.push(req.body.entry);
    } else if (req.body.date || req.body.status || req.body.value !== undefined) {
      currentEntries.push(req.body);
    }

    tracker.entries = currentEntries;
    tracker.markModified("entries");

    const updatedTracker = await tracker.save();
    const updatedObj = updatedTracker.toJSON();

    res.status(200).json({
      status: "success",
      data: {
        ...updatedObj,
        trackerName: updatedObj.name,
      },
    });
  } catch (err) {
    console.error("Failed to update tracker:", err);
    res.status(500).json({ message: "Failed to update tracker.", error: err.message });
  }
});

// Delete tracker
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
    console.error("Failed to delete tracker:", err);
    res.status(500).json({ message: "Failed to delete tracker.", error: err.message });
  }
});

module.exports = router;