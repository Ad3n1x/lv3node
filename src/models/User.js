const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  isVerified: { type: Boolean, default: false },
  otp: { type: String },
  otpExpires: { type: Date },
  // 👇 Add this field to store the client's public key (JWK format)
  publicKey: { type: Object, default: null },
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);