const mongoose = require("mongoose");

const trackerSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  name: { type: String, required: true },
  type: { type: String, required: true },
  icon: { type: String, default: "Star" },
  color: { type: String, default: "#3b82f6" },
  target: { type: Number },
  unit: { type: String },
  entries: [
    {
      date: { type: String, required: true }, // "YYYY-MM-DD"
      value: { type: mongoose.Schema.Types.Mixed },
    },
  ],
}, { timestamps: true });

module.exports = mongoose.model("Tracker", trackerSchema);