const mongoose = require("mongoose");

const trackerSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  
  // Encrypted fields from the client
  name: { type: mongoose.Schema.Types.Mixed, required: true },
  
  // Clear text for database querying & routing
  type: { type: String, required: true },
  icon: { type: String, default: "Star" },
  color: { type: String, default: "#3b82f6" },
  
  target: { type: mongoose.Schema.Types.Mixed },
  unit: { type: String },
  
  // CHANGE THIS: Must be Mixed to accept the encrypted string/payload from the client
  entries: { type: mongoose.Schema.Types.Mixed, default: [] },
}, { timestamps: true });

// Prevent OverwriteModelError on Render
module.exports = mongoose.models.Tracker || mongoose.model("Tracker", trackerSchema);