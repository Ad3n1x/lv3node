const mongoose = require("mongoose");
const CryptoJS = require("crypto-js");

const SECRET_KEY = process.env.ENCRYPTION_KEY || "your_fallback_super_secret_key_32_bytes";

const encryptData = (text) => {
  if (text === null || text === undefined) return text;
  const stringValue = typeof text === "object" ? JSON.stringify(text) : String(text);
  return CryptoJS.AES.encrypt(stringValue, SECRET_KEY).toString();
};

const decryptData = (ciphertext) => {
  if (!ciphertext) return ciphertext;
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
    console.error("Decryption error:", error);
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
    entries: { type: String, default: "" },
  },
  { timestamps: true }
);

// --- HELPER TO DECRYPT DOCUMENTS ---
const decryptDocument = (doc) => {
  if (!doc) return;
  // If doc is a Mongoose document, use .toObject() or direct assignment if mutable
  if (doc.name) doc.name = decryptData(doc.name);
  if (doc.target !== undefined) doc.target = decryptData(doc.target);
  if (doc.entries) doc.entries = decryptData(doc.entries);
};

// --- 1. ENCRYPTION HOOKS ---
trackerSchema.pre("save", function (next) {
  if (this.isModified("name") && !this.name.startsWith("U2FsdGVkX1")) {
    this.name = encryptData(this.name);
  }
  if (this.isModified("target") && this.target !== undefined) {
    const targetStr = String(this.target);
    if (!targetStr.startsWith("U2FsdGVkX1")) {
      this.target = encryptData(this.target);
    }
  }
  if (this.isModified("entries") && this.entries) {
    if (!this.entries.startsWith("U2FsdGVkX1")) {
      this.entries = encryptData(this.entries);
    }
  }
  next();
});

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
  if (targetObj.entries && !String(targetObj.entries).startsWith("U2FsdGVkX1")) {
    targetObj.entries = encryptData(targetObj.entries);
  }

  next();
});

// --- 2. DECRYPTION HOOKS (Explicitly defined for safety) ---
trackerSchema.post("save", function (doc) {
  decryptDocument(doc);
});

trackerSchema.post("findOne", function (doc) {
  decryptDocument(doc);
});

trackerSchema.post("findOneAndUpdate", function (doc) {
  decryptDocument(doc);
});

trackerSchema.post("find", function (docs) {
  if (Array.isArray(docs)) {
    docs.forEach(decryptDocument);
  }
});

module.exports = mongoose.models.Tracker || mongoose.model("Tracker", trackerSchema);