const mongoose = require("mongoose");
const CryptoJS = require("crypto-js");

// Fallback to ENCRYPTION_KEY to match your .env configuration
const SERVER_SECRET = process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_SECRET || "your_client_side_encryption_secret";

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