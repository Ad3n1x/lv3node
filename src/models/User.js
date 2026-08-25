const mongoose = require("mongoose");

const trackerSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  
  // Change from String to Mixed/Object to support E2EE ciphertext objects
  name: { type: mongoose.Schema.Types.Mixed, required: true }, 
  
  type: { type: String, required: true },
  icon: { type: String, default: "Star" },
  color: { type: String, default: "#3b82f6" },
  
  // Change from Number to Mixed/Object
  target: { type: mongoose.Schema.Types.Mixed }, 
  
  unit: { type: String },
  
  // Change from Array to Mixed/Object
  entries: { type: mongoose.Schema.Types.Mixed, default: [] },
}, { timestamps: true });

module.exports = mongoose.model("Tracker", trackerSchema);