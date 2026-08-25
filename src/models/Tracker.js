const mongoose = require("mongoose");
const CryptoJS = require("crypto-js");

const SECRET_KEY = process.env.ENCRYPTION_KEY || "your_fallback_super_secret_key_32_bytes";

const encryptData = (data) => {
  if (data === null || data === undefined) return data;
  const stringValue = typeof data === "object" ? JSON.stringify(data) : String(data);
  return CryptoJS.AES.encrypt(stringValue, SECRET_KEY).toString();
};

const decryptData = (ciphertext) => {
  if (!ciphertext || typeof ciphertext !== "string") return ciphertext;
  if (!ciphertext.startsWith("U2FsdGVkX1")) return ciphertext;

  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, SECRET_KEY);
    const decryptedString = bytes.toString(CryptoJS.enc.Utf8);
    
    if (!decryptedString) return ciphertext;
    
    try {
      return JSON.parse(decryptedString);
    } catch {
      return !isNaN(decryptedString) && decryptedString !== "" ? Number(decryptedString) : decryptedString;
    }
  } catch (error) {
    return ciphertext;
  }
};

const trackerSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: { type: String, required: true },
    type: { type: String, required: true },
    icon: { type: String, default: "Star" },
    color: { type: String, default: "#3b82f6" },
    target: { type: mongoose.Schema.Types.Mixed },
    unit: { type: String },
    entries: { type: mongoose.Schema.Types.Mixed, default: [] },
  },
  { timestamps: true }
);

// --- AUTOMATIC DECRYPTION ON JSON OUTPUT ---
trackerSchema.set("toJSON", {
  transform: function (doc, ret) {
    ret.name = decryptData(ret.name);
    ret.target = decryptData(ret.target);
    
    let decryptedEntries = decryptData(ret.entries);
    if (typeof decryptedEntries === "string") {
      try {
        decryptedEntries = JSON.parse(decryptedEntries);
      } catch {
        decryptedEntries = [];
      }
    }
    ret.entries = Array.isArray(decryptedEntries) ? decryptedEntries : [];
    return ret;
  },
});

trackerSchema.set("toObject", {
  transform: function (doc, ret) {
    ret.name = decryptData(ret.name);
    ret.target = decryptData(ret.target);
    
    let decryptedEntries = decryptData(ret.entries);
    if (typeof decryptedEntries === "string") {
      try {
        decryptedEntries = JSON.parse(decryptedEntries);
      } catch {
        decryptedEntries = [];
      }
    }
    ret.entries = Array.isArray(decryptedEntries) ? decryptedEntries : [];
    return ret;
  },
});

// --- ENCRYPTION BEFORE SAVING ---
trackerSchema.pre("save", function (next) {
  if (this.isModified("name") && this.name && !String(this.name).startsWith("U2FsdGVkX1")) {
    this.name = encryptData(this.name);
  }
  if (this.isModified("target") && this.target !== undefined && !String(this.target).startsWith("U2FsdGVkX1")) {
    this.target = encryptData(this.target);
  }
  if (this.isModified("entries") && this.entries !== undefined) {
    const entriesStr = typeof this.entries === "object" ? JSON.stringify(this.entries) : String(this.entries);
    if (!entriesStr.startsWith("U2FsdGVkX1")) {
      this.entries = encryptData(entriesStr);
    }
  }
  next();
});

// --- ENCRYPTION BEFORE FINDONEANDUPDATE ---
trackerSchema.pre("findOneAndUpdate", function (next) {
  const update = this.getUpdate();
  if (!update) return next();
  
  const targetObj = update.$set || update;

  if (targetObj.name && !String(targetObj.name).startsWith("U2FsdGVkX1")) {
    targetObj.name = encryptData(targetObj.name);
  }
  if (targetObj.target !== undefined && !String(targetObj.target).startsWith("U2FsdGVkX1")) {
    targetObj.target = encryptData(targetObj.target);
  }
  if (targetObj.entries !== undefined) {
    const entriesStr = typeof targetObj.entries === "object" ? JSON.stringify(targetObj.entries) : String(targetObj.entries);
    if (!entriesStr.startsWith("U2FsdGVkX1")) {
      targetObj.entries = encryptData(entriesStr);
    }
  }

  next();
});

module.exports = mongoose.models.Tracker || mongoose.model("Tracker", trackerSchema);