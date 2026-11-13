const mongoose = require("mongoose");

const sessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  jti: { type: String, required: true, unique: true, index: true },
  userAgent: { type: String, default: "Unknown device", maxlength: 300 },
  ipAddress: { type: String, default: "Unknown", maxlength: 80 },
  createdAt: { type: Date, default: Date.now },
  lastSeenAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  revokedAt: { type: Date, default: null, index: true },
}, { timestamps: false });

sessionSchema.index({ userId: 1, revokedAt: 1, createdAt: -1 });

module.exports = mongoose.models.Session || mongoose.model("Session", sessionSchema);
