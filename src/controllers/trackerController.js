const Tracker = require("../models/Tracker");

// 1. THIS FIXES THE ENCRYPTED TEXT ON THE DETAIL PAGE
const getTrackerEntries = async (req, res) => {
  try {
    const trackerId = req.params.id || req.params.trackerId;
    const userId = req.user?._id || req.user?.id || req.user?.userId || req.user;

    if (!userId) {
      return res.status(401).json({ message: "Authentication required." });
    }

    const tracker = await Tracker.findOne({
      _id: trackerId,
      userId: userId,
    });

    if (!tracker) {
      return res.status(404).json({ message: "Tracker not found." });
    }

    // .toJSON() safely runs the decryption we set up in the model
    const trackerObj = tracker.toJSON();

    return res.status(200).json({
      status: "success",
      data: {
        ...trackerObj, 
        trackerName: trackerObj.name,
        unit: trackerObj.unit,
        target: trackerObj.target,
        entries: Array.isArray(trackerObj.entries) ? trackerObj.entries : [], 
      },
    });
  } catch (error) {
    console.error("Error in getTrackerEntries:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// 2. THIS FIXES THE "MARK DONE" BUTTON REVERTING (500 ERROR)
const updateTracker = async (req, res) => {
  try {
    const trackerId = req.params.id || req.params.trackerId; 
    const userId = req.user?._id || req.user?.id || req.user?.userId || req.user;

    if (!userId) {
      return res.status(401).json({ message: "Authentication required." });
    }

    const tracker = await Tracker.findOne({ _id: trackerId, userId });

    if (!tracker) {
      return res.status(404).json({ message: "Tracker not found" });
    }

    // Get the properly decrypted array of current entries
    let currentEntries = tracker.toJSON().entries || [];

    // Push the new entry from the frontend
    if (req.body.entry) {
      currentEntries.push(req.body.entry);
    } else if (req.body.entries) {
      currentEntries = req.body.entries;
    } else {
      // Default fallback if body is empty for a habit
      currentEntries.push({ date: new Date().toISOString(), status: "completed" });
    }

    // Reassign the array to the document
    tracker.entries = currentEntries;

    // Use .save() instead of findOneAndUpdate so encryption works perfectly
    await tracker.save();

    return res.status(200).json({
      status: "success",
      data: tracker.toJSON(),
    });
  } catch (error) {
    console.error("Error updating tracker:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = { 
  getTrackerEntries, 
  updateTracker 
};