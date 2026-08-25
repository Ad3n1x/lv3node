const Tracker = require("../models/Tracker");

const getTrackerEntries = async (req, res) => {
  try {
    const { trackerId } = req.params;

    // Safely extract the user ID regardless of auth middleware structure
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

    // toJSON() explicitly invokes schema getters and custom JSON transforms
    const trackerObj = tracker.toJSON();

    return res.status(200).json({
      status: "success",
      data: {
        ...trackerObj, 
        name: trackerObj.name,
        trackerName: trackerObj.name, // Maintained for backwards compatibility
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

module.exports = { getTrackerEntries };