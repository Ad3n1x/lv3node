const mongoose = require("mongoose");
const trackerSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "User" },
  name: { type: String, required: true, trim: true },
  type: { type: String, required: true },
  icon: { type: String },
  color: { type: String },
  target: { type: mongoose.Schema.Types.Mixed },
  unit: { type: String },
  entries: { type: mongoose.Schema.Types.Mixed, default: [] },
}, { timestamps: true });

module.exports = mongoose.model("Tracker", trackerSchema);