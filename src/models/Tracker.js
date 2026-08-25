const mongoose = require("mongoose");
const CryptoJS = require("crypto-js");

const SECRET_KEY = process.env.ENCRYPTION_KEY || "your_fallback_super_secret_key_32_bytes";

const encryptData = (data) => {
  if (data === null || data === undefined) return data;
  // If it's an object or array, convert to JSON string first
  const stringValue = typeof data === "object" ? JSON.stringify(data) : String(data);
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
    entries: { type: mongoose.Schema.Types.Mixed, default: [] },
  },
  { timestamps: true }
);

// --- HELPER TO DECRYPT & PARSE DOCUMENTS ---
const decryptDocument = (doc) => {
  if (!doc) return;
  // Convert mongoose doc to plain object if needed
  const d = typeof doc.toObject === "function" ? doc.toObject() : doc;

  if (d.name && typeof d.name === "string" && d.name.startsWith("U2FsdGVkX1")) {
    doc.name = decryptData(d.name);
  }
  if (d.target !== undefined && typeof d.target === "string" && d.target.startsWith("U2FsdGVkX1")) {
    doc.target = decryptData(d.target);
  }
  
  if (d.entries !== undefined) {
    let decrypted = d.entries;
    if (typeof d.entries === "string" && d.entries.startsWith("U2FsdGVkX1")) {
      decrypted = decryptData(d.entries);
    }
    // If it parsed into a JSON string or array, ensure it's a clean array for the frontend
    if (typeof decrypted === "string") {
      try {
        decrypted = JSON.parse(decrypted);
      } catch {
        decrypted = [];
      }
    }
    doc.entries = Array.isArray(decrypted) ? decrypted : [];
  } else {
    doc.entries = [];
  }
};

// --- ENCRYPTION PRE-HOOKS ---
trackerSchema.pre("save", function (next) {
  if (this.isModified("name") && this.name) {
    this.name = encryptData(this.name);
  }
  if (this.isModified("target") && this.target !== undefined) {
    this.target = encryptData(this.target);
  }
  if (this.isModified("entries") && this.entries !== undefined) {
    this.entries = encryptData(this.entries);
  }
  next();
});

trackerSchema.pre("findOneAndUpdate", function (next) {
  const update = this.getUpdate();
  if (!update) return next();

  const targetObj = update.$set || update;

  if (targetObj.name) {
    targetObj.name = encryptData(targetObj.name);
  }
  if (targetObj.target !== undefined) {
    targetObj.target = encryptData(targetObj.target);
  }
  if (targetObj.entries !== undefined) {
    targetObj.entries = encryptData(targetObj.entries);
  }

  next();
});

// --- DECRYPTION POST-HOOKS ---
trackerSchema.post("save", function (doc) { decryptDocument(doc); });
trackerSchema.post("findOne", function (doc) { decryptDocument(doc); });
trackerSchema.post("findOneAndUpdate", function (doc) { decryptDocument(doc); });
trackerSchema.post("find", function (docs) {
  if (Array.isArray(docs)) {
    docs.forEach(decryptDocument);
  }
});

module.exports = mongoose.models.Tracker || mongoose.model("Tracker", trackerSchema);