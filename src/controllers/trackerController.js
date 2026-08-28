const Tracker = require("../models/Tracker");

/* -------------------------------------------------------
   GET TRACKER ENTRIES (detail page)
------------------------------------------------------- */
const getTrackerEntries = async (req, res) => {
  try {
    const { trackerId } = req.params;
    const userId = req.user?._id || req.user?.id || req.user?.userId || req.user;

    if (!userId) {
      return res.status(401).json({ message: "Authentication required." });
    }

    const tracker = await Tracker.findOne({ _id: trackerId, userId });

    if (!tracker) {
      return res.status(404).json({ message: "Tracker not found." });
    }

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

/* -------------------------------------------------------
   UPDATE TRACKER (mark done, add entry)
------------------------------------------------------- */
const updateTracker = async (req, res) => {
  try {
    const trackerId = req.params.id || req.params.trackerId;
    const userId = req.user?._id || req.user?.id || req.user?.userId || req.user;

    const tracker = await Tracker.findOne({ _id: trackerId, userId });

    if (!tracker) {
      return res.status(404).json({ message: "Tracker not found" });
    }

    // Decrypted entries
    let currentEntries = tracker.toJSON().entries || [];

    // Force entries to be an array
    if (!Array.isArray(currentEntries)) {
      currentEntries = [];
    }

    // Add new entry
    if (req.body.entry) {
      currentEntries.push(req.body.entry);
    } else if (req.body.entries) {
      currentEntries = req.body.entries;
    } else {
      currentEntries.push({
        date: new Date().toISOString(),
        status: "completed",
      });
    }

    tracker.entries = currentEntries;

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
  updateTracker,
};
