const Tracker = require("../models/Tracker");

// 1. GET TRACKER ENTRIES (FIXED FOR E2EE)
const getTrackerEntries = async (req, res) => {
  try {
    // Handle both /:id and /:trackerId route parameters
    const trackerId = req.params.trackerId || req.params.id; 
    const userId = req.user?._id || req.user?.id || req.user?.userId || req.user;

    if (!userId) {
      return res.status(401).json({ message: "Authentication required." });
    }

    // .lean() returns raw data, bypassing any Mongoose model hooks.
    // This ensures the backend doesn't try to decrypt data that the frontend needs to decrypt.
    const tracker = await Tracker.findOne({
      _id: trackerId,
      userId: userId,
    }).lean(); 

    if (!tracker) {
      return res.status(404).json({ message: "Tracker not found." });
    }

    // Send the raw, encrypted data straight back to React.
    // Your frontend's decryptData() will handle turning it back into an array.
    return res.status(200).json({
      status: "success",
      data: tracker
    });
  } catch (error) {
    console.error("Error in getTrackerEntries:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// 2. UPDATE TRACKER (FIXED FOR "MARK DONE" REVERTING)
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
      { new: true, lean: true } // Return raw updated document
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
  updateTracker 
};