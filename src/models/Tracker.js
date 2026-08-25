const mongoose = require("mongoose");
const CryptoJS = require("crypto-js");

const SECRET_KEY = process.env.ENCRYPTION_KEY || "your_fallback_super_secret_key_32_bytes";

const encryptData = (text) => {
  if (text === null || text === undefined) return text;
  const stringValue = typeof text === "object" ? JSON.stringify(text) : String(text);
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
    entries: { type: mongoose.Schema.Types.Mixed, default: [] },
  },
  { timestamps: true }
);

// --- HELPER TO DECRYPT DOCUMENTS ---
const decryptDocument = (doc) => {
  if (!doc) return;
  if (doc.name) doc.name = decryptData(doc.name);
  if (doc.target !== undefined) doc.target = decryptData(doc.target);
  
  if (doc.entries !== undefined) {
    let decryptedEntries = decryptData(doc.entries);
    if (typeof decryptedEntries === "string" && decryptedEntries.trim() !== "") {
      try {
        decryptedEntries = JSON.parse(decryptedEntries);
      } catch {
        decryptedEntries = [];
      }
    }
    doc.entries = Array.isArray(decryptedEntries) ? decryptedEntries : [];
  }
};

// --- 1. ENCRYPTION HOOKS ---
trackerSchema.pre("save", function (next) {
  if (this.name && !String(this.name).startsWith("U2FsdGVkX1")) {
    this.name = encryptData(this.name);
  }
  if (this.target !== undefined && this.target !== null) {
    const targetStr = String(this.target);
    if (!targetStr.startsWith("U2FsdGVkX1")) {
      this.target = encryptData(this.target);
    }
  }
  if (this.entries !== undefined && this.entries !== null) {
    const entriesStr = typeof this.entries === "object" ? JSON.stringify(this.entries) : String(this.entries);
    if (!entriesStr.startsWith("U2FsdGVkX1")) {
      this.entries = encryptData(entriesStr);
      this.markModified("entries");
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
  if (targetObj.entries !== undefined && targetObj.entries !== null) {
    const entriesStr = typeof targetObj.entries === "object" ? JSON.stringify(targetObj.entries) : String(targetObj.entries);
    if (!entriesStr.startsWith("U2FsdGVkX1")) {
      targetObj.entries = encryptData(entriesStr);
    }
  }

  next();
});

// --- 2. DECRYPTION HOOKS ---
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