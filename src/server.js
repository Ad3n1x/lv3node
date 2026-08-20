require("node:dns/promises").setServers(["1.1.1.1", "8.8.8.8"]);
require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const Tracker = require("./Tracker");

const app = express();

app.use(cors());
app.use(express.json());

// Root endpoint
app.get("/", (req, res) => {
  res.json({ status: "Universal Tracker API running" });
});

// ----------------------
// TRACKER ROUTES
// ----------------------

// 1. Get trackers (Supports optional filtering by type: /api/trackers?type=habit)
app.get("/api/trackers", async (req, res) => {
  try {
    const { type } = req.query;
    const filter = type ? { type } : {};
    const trackers = await Tracker.find(filter);
    res.json(trackers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Create a new tracker
app.post("/api/trackers", async (req, res) => {
  try {
    const tracker = new Tracker(req.body);
    await tracker.save();
    res.status(201).json(tracker);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 3. Update tracker properties
app.put("/api/trackers/:id", async (req, res) => {
  try {
    const tracker = await Tracker.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!tracker) return res.status(404).json({ error: "Tracker not found" });
    res.json(tracker);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 4. Add or update an entry on a tracker
app.post("/api/trackers/:id/entries", async (req, res) => {
  try {
    const { date, value } = req.body;
    const tracker = await Tracker.findById(req.params.id);

    if (!tracker) return res.status(404).json({ error: "Tracker not found" });

    // Update existing entry if date already present, otherwise add new
    const existingIndex = tracker.entries.findIndex((e) => e.date === date);
    if (existingIndex > -1) {
      tracker.entries[existingIndex].value = value;
    } else {
      tracker.entries.push({ date, value });
    }

    await tracker.save();
    res.json(tracker);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 5. Delete a tracker
app.delete("/api/trackers/:id", async (req, res) => {
  try {
    const tracker = await Tracker.findByIdAndDelete(req.params.id);
    if (!tracker) return res.status(404).json({ error: "Tracker not found" });
    res.json({ message: "Tracker deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------
// DATABASE + SERVER START
// ----------------------

const PORT = process.env.PORT || 5000;
const MONGO_URI =
  process.env.MONGODB_URI ||
  process.env.MONGO_URI ||
  "mongodb://127.0.0.1:27017/trackers_db";

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("MongoDB connected successfully");
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => console.error("MongoDB connection error:", err));

  require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const Tracker = require("./Tracker");

const app = express();

app.use(cors());
app.use(express.json());

// POST endpoint to handle creation from TrackerForm
app.post("/api/trackers", async (req, res) => {
  try {
    const { name, type, icon, color, target, unit } = req.body;

    const newTracker = new Tracker({
      name,
      type,
      icon,
      color,
      target: target ? Number(target) : null,
      unit: unit ? unit.trim() : "",
      entries: [],
    });

    await newTracker.save();
    res.status(201).json(newTracker);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET all trackers
app.get("/api/trackers", async (req, res) => {
  try {
    const trackers = await Tracker.find();
    res.json(trackers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/trackers_db";

mongoose
  .connect(MONGO_URI)
  .then(() => {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => console.error("MongoDB connection error:", err));