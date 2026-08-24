const Tracker = require("../models/Tracker");

const getTrackerEntries = async (req, res) => {
  try {
    const { trackerId } = req.params;

    const tracker = await Tracker.findOne({
      _id: trackerId,
      userId: req.user._id,
    });

    if (!tracker) {
      return res.status(404).json({ message: "Tracker not found." });
    }

    // Returns the tracker details along with its decrypted entries array
    res.status(200).json({
      status: "success",
      data: {
        ...tracker.toObject(), // Includes _id, type, color, etc.
        trackerName: tracker.name,
        unit: tracker.unit,
        target: tracker.target,
        entries: tracker.entries, // Decrypted automatically!
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = { getTrackerEntries };