const mongoose = require("mongoose");

const trackerSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Encrypted string from the client
    name: { type: String, required: true },

    // Clear text for database querying & routing
    type: { type: String, required: true },
    icon: { type: String, default: "Star" },
    color: { type: String, default: "#3b82f6" },

    target: { type: mongoose.Schema.Types.Mixed },
    unit: { type: String },

    // Change from [entrySchema] to String to accept the encrypted string payload
    entries: { type: String, default: "" },
  },
  { timestamps: true },
);

// Prevent OverwriteModelError on Render
module.exports =
  mongoose.models.Tracker || mongoose.model("Tracker", trackerSchema);