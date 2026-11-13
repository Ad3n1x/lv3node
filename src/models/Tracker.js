const mongoose = require("mongoose");

const activitySchema = new mongoose.Schema({
  type: { type: String, required: true, maxlength: 40 },
  label: { type: String, required: true, maxlength: 120 },
  at: { type: Date, default: Date.now, index: true },
}, { _id: true });

const trackerSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "User", index: true },
  name: { type: String, required: true, trim: true },
  type: { type: String, required: true, trim: true, maxlength: 40 },
  icon: { type: String, maxlength: 60 },
  color: { type: String, maxlength: 32 },
  target: { type: mongoose.Schema.Types.Mixed },
  unit: { type: String, maxlength: 40 },
  entries: { type: mongoose.Schema.Types.Mixed, default: [] },
  archivedAt: { type: Date, default: null, index: true },
  deletedAt: { type: Date, default: null, index: { expireAfterSeconds: 60 * 60 * 24 * 30 } },
  activity: { type: [activitySchema], default: [] },
}, { timestamps: true });

trackerSchema.index({ userId: 1, deletedAt: 1, archivedAt: 1, updatedAt: -1 });

module.exports = mongoose.models.Tracker || mongoose.model("Tracker", trackerSchema);
