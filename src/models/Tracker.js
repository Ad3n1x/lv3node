const mongoose = require("mongoose");
const CryptoJS = require("crypto-js");

// Use a secret key from your environment variables
const SECRET_KEY = process.env.ENCRYPTION_KEY || "your_fallback_super_secret_key_32_bytes";

// Helper encryption functions
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

    // Encrypted strings
    name: { type: String, required: true },

    // Clear text for database querying & routing
    type: { type: String, required: true },
    icon: { type: String, default: "Star" },
    color: { type: String, default: "#3b82f6" },

    target: { type: mongoose.Schema.Types.Mixed },
    unit: { type: String },

    // Defined as String to hold the encrypted entries payload/ciphertext string
    entries: { type: String, default: "" },
  },
  { timestamps: true },
);

// --- 1. ENCRYPT BEFORE SAVING ---
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

// --- 2. ENCRYPT BEFORE FIND ONE AND UPDATE ---
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

// --- 3. DECRYPT WHEN FETCHING DOCUMENTS ---
trackerSchema.post(/^find|save|findOneAndUpdate/, function (docs) {
  if (!docs) return;

  const decryptDocument = (doc) => {
    if (!doc) return;
    if (doc.name) doc.name = decryptData(doc.name);
    if (doc.target !== undefined) doc.target = decryptData(doc.target);
    if (doc.entries) doc.entries = decryptData(doc.entries);
  };

  if (Array.isArray(docs)) {
    docs.forEach(decryptDocument);
  } else {
    decryptDocument(docs);
  }
});

// Prevent OverwriteModelError on Render
module.exports =
  mongoose.models.Tracker || mongoose.model("Tracker", trackerSchema);