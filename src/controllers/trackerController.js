const Tracker = require("../models/Tracker");

// 1. THIS FIXES THE ENCRYPTED TEXT ON THE DETAIL PAGE
const getTrackerEntries = async (req, res) => {
  try {
    const { trackerId } = req.params;
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
// SIMPLIFIED BACKEND FOR TRUE E2EE
const updateTracker = async (req, res) => {
  try {
    const trackerId = req.params.id || req.params.trackerId; 
    const userId = req.user?._id || req.user?.id || req.user?.userId || req.user;

    // The frontend sends an encrypted string: { entries: "u3n2b4i23..." }
    const { entries } = req.body; 

    // Find and update blindly. By passing E2EE strings, we don't need .save() hooks
    const updatedTracker = await Tracker.findOneAndUpdate(
      { _id: trackerId, userId },
      { entries: entries }, // Just replace the string
      { new: true }
    );

    if (!updatedTracker) {
      return res.status(404).json({ message: "Tracker not found" });
    }

    return res.status(200).json({
      status: "success",
      data: updatedTracker
    });
  } catch (error) {
    console.error("Error updating tracker:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = { 
  getTrackerEntries, 
  updateTracker // Ensure this matches what you import in your routes file!
};