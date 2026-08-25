const Tracker = require("../models/Tracker");

const getTrackerEntries = async (req, res) => {
  try {
    const { trackerId } = req.params;

    // Safely extract the user ID regardless of how auth middleware attaches it
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

    // Convert to plain object and ensure decryption handles safely
    const trackerObj = tracker.toObject();

    // Returns the tracker details along with its decrypted fields
    return res.status(200).json({
      status: "success",
      data: {
        ...trackerObj, 
        trackerName: trackerObj.name,
        unit: trackerObj.unit,
        target: trackerObj.target,
        entries: trackerObj.entries, 
      },
    });
  } catch (error) {
    console.error("Error in getTrackerEntries:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = { getTrackerEntries };