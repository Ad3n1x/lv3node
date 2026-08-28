const mongoose = require("mongoose");
const CryptoJS = require("crypto-js");

const CLIENT_SECRET = "your_client_side_encryption_secret";

const TrackerSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },

    name: { type: String, required: true },
    type: { type: String, required: true },
    unit: { type: String, default: "" },
    target: { type: String, default: "" },
    color: { type: String, default: "#3b82f6" },
    isSample: { type: Boolean, default: false },

    // Store encrypted string
    entries: {
      type: String,
      default: CryptoJS.AES.encrypt(JSON.stringify([]), CLIENT_SECRET).toString(),
    },
  },
  { timestamps: true }
);

/* 🔐 Encrypt entries before saving */
TrackerSchema.pre("save", function (next) {
  try {
    // Already encrypted
    if (typeof this.entries === "string" && this.entries.startsWith("U2FsdGVkX1")) {
      return next();
    }

    // Encrypt array
    if (Array.isArray(this.entries)) {
      this.entries = CryptoJS.AES.encrypt(
        JSON.stringify(this.entries),
        CLIENT_SECRET
      ).toString();
    }

    next();
  } catch (err) {
    console.error("Error encrypting entries:", err);
    next(err);
  }
});

/* 🔓 Decrypt entries when converting to JSON */
TrackerSchema.methods.toJSON = function () {
  const obj = this.toObject();

  try {
    if (typeof obj.entries === "string" && obj.entries.startsWith("U2FsdGVkX1")) {
      const bytes = CryptoJS.AES.decrypt(obj.entries, CLIENT_SECRET);
      const decrypted = bytes.toString(CryptoJS.enc.Utf8);
      obj.entries = JSON.parse(decrypted);
    } else {
      obj.entries = [];
    }
  } catch (err) {
    console.error("Error decrypting entries:", err);
    obj.entries = [];
  }

  return obj;
};

module.exports = mongoose.model("Tracker", TrackerSchema);
