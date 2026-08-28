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
    trackerName: trackerObj.name || trackerObj.trackerName || "",
  };
};

// Get all trackers for logged-in user
router.get("/", auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized: Invalid user session." });

    const trackers = await Tracker.find({ userId }).sort({ createdAt: -1 });
    const formattedTrackers = trackers.map((t) => formatTracker(t));

    return res.status(200).json({
      success: true,
      data: formattedTrackers,
      trackers: formattedTrackers, // Compatibility fallback
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Error retrieving trackers.", error: err.message });
  }
});

// Get a single tracker by ID
router.get("/:id", auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized: Invalid user session." });

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid tracker ID format." });
    }

    const tracker = await Tracker.findOne({ _id: id, userId });
    if (!tracker) {
      return res.status(404).json({ success: false, message: "Tracker not found or unauthorized." });
    }

    const formatted = formatTracker(tracker);
    return res.status(200).json({
      success: true,
      data: formatted,
      ...formatted, // Unrolled properties fallback
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
});

// 🛠️ FIX 1: GET /api/v1/trackers/:id/entries (Resolves UNMATCHED ROUTE HIT error)
router.get("/:id/entries", auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized: Invalid user session." });

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid tracker ID format." });
    }

    const tracker = await Tracker.findOne({ _id: id, userId });
    if (!tracker) {
      return res.status(404).json({ success: false, message: "Tracker not found or unauthorized." });
    }

    return res.status(200).json({
      success: true,
      data: tracker.entries || [],
      entries: tracker.entries || [],
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to retrieve entries.", error: err.message });
  }
});

// Create tracker for logged-in user
router.post("/", auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized: User ID missing from token." });
    }

    const { name, type, icon, color, target, unit, entries } = req.body || {};

    if (!name || !type) {
      return res.status(400).json({ 
        success: false,
        message: "Validation Error: 'name' and 'type' are required fields.",
        receivedBody: req.body 
      });
    }

    const tracker = new Tracker({
      userId,
      name: typeof name === "string" ? name.trim() : name,
      type,
      icon,
      color,
      target,
      unit,
      entries: entries !== undefined ? entries : [],
    });

    const savedTracker = await tracker.save();
    const formatted = formatTracker(savedTracker);

    return res.status(201).json({
      success: true,
      data: formatted,
      ...formatted,
    });
  } catch (err) {
    console.error("Tracker creation error:", err.message);
    return res.status(400).json({ success: false, message: "Failed to create tracker.", error: err.message });
  }
});

// Dedicated Endpoint to Add an Entry Permanently
router.post("/:id/entries", auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized: Invalid user session." });

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid tracker ID format." });
    }

    const tracker = await Tracker.findOne({ _id: id, userId });
    if (!tracker) {
      return res.status(404).json({ success: false, message: "Tracker not found or unauthorized." });
    }

    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({ success: false, message: "Entry data cannot be empty." });
    }

    if (Array.isArray(tracker.entries)) {
      tracker.entries.push(req.body);
    } else {
      tracker.entries = [req.body];
    }
    tracker.markModified("entries");

    const updatedTracker = await tracker.save();
    const formatted = formatTracker(updatedTracker);

    return res.status(200).json({
      success: true,
      data: formatted,
      ...formatted,
    });
  } catch (err) {
    console.error("Failed to add entry:", err);
    return res.status(400).json({ success: false, message: "Failed to add entry.", error: err.message });
  }
});

// 🛠️ FIX 2: PUT /api/v1/trackers/:id/entries (Allows full entries array sync)
router.put("/:id/entries", auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized: Invalid user session." });

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid tracker ID format." });
    }

    const tracker = await Tracker.findOne({ _id: id, userId });
    if (!tracker) {
      return res.status(404).json({ success: false, message: "Tracker not found or unauthorized." });
    }

    const payload = req.body.entries !== undefined ? req.body.entries : req.body;
    tracker.set("entries", payload);
    tracker.markModified("entries");

    const updatedTracker = await tracker.save();
    const formatted = formatTracker(updatedTracker);

    return res.status(200).json({
      success: true,
      data: formatted,
      ...formatted,
    });
  } catch (err) {
    console.error("Failed to update entries:", err);
    return res.status(500).json({ success: false, message: "Failed to update entries.", error: err.message });
  }
});

// Update tracker details and entry list
router.put("/:id", auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized: Invalid user session." });

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid tracker ID format." });
    }

    const tracker = await Tracker.findOne({ _id: id, userId });
    if (!tracker) {
      return res.status(404).json({ success: false, message: "Tracker not found or unauthorized." });
    }

    const body = req.body || {};

    // Standard field updates
    if (body.name !== undefined) tracker.name = typeof body.name === "string" ? body.name.trim() : body.name;
    if (body.type !== undefined) tracker.type = body.type;
    if (body.icon !== undefined) tracker.icon = body.icon;
    if (body.color !== undefined) tracker.color = body.color;
    if (body.target !== undefined) tracker.target = body.target;
    if (body.unit !== undefined) tracker.unit = body.unit;

    // Handle encrypted string payloads or traditional array updates safely
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

    const updatedTracker = await tracker.save();
    const formatted = formatTracker(updatedTracker);

    return res.status(200).json({
      success: true,
      data: formatted,
      ...formatted,
    });
  } catch (err) {
    console.error("Failed to update tracker:", err);
    return res.status(500).json({ success: false, message: "Failed to update tracker.", error: err.message });
  }
});

// Delete tracker
router.delete("/:id", auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized: Invalid user session." });

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid tracker ID format." });
    }

    const tracker = await Tracker.findOneAndDelete({ _id: id, userId });
    if (!tracker) return res.status(404).json({ success: false, message: "Tracker not found or unauthorized." });

    return res.status(200).json({ success: true, message: "Tracker deleted successfully.", id });
  } catch (err) {
    console.error("Failed to delete tracker:", err);
    return res.status(500).json({ success: false, message: "Failed to delete tracker.", error: err.message });
  }
});

module.exports = router;