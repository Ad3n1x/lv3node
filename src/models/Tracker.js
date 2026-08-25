const mongoose = require("mongoose");
const CryptoJS = require("crypto-js");

const SECRET_KEY = process.env.ENCRYPTION_KEY || "your_fallback_super_secret_key_32_bytes";

// --- Encryption & Decryption Helpers ---
const encryptData = (text) => {
  if (text === null || text === undefined || text === "") return text;
  // If it's already encrypted (starts with U2FsdGVkX1, which is standard for CryptoJS AES base64), don't re-encrypt
  if (typeof text === "string" && text.startsWith("U2FsdGVkX1")) return text;
  
  const stringValue = typeof text === "object" ? JSON.stringify(text) : String(text);
  return CryptoJS.AES.encrypt(stringValue, SECRET_KEY).toString();
};

const decryptData = (ciphertext) => {
  if (!ciphertext || typeof ciphertext !== "string") return ciphertext;
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, SECRET_KEY);
    const decryptedString = bytes.toString(CryptoJS.enc.Utf8);
    if (!decryptedString) return ciphertext; // Return as-is if it wasn't encrypted
    
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

// --- Sub-schema for Entries ---
const entrySchema = new mongoose.Schema({
  date: { type: String, required: true },
  value: { 
    type: mongoose.Schema.Types.Mixed, 
    set: encryptData, 
    get: decryptData 
  },
}, { _id: true });

// --- Main Tracker Schema ---
const trackerSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true, 
    index: true 
  },
  name: { 
    type: mongoose.Schema.Types.Mixed, 
    required: true, 
    set: encryptData, 
    get: decryptData 
  },
  type: { type: String, required: true },
  icon: { type: String, default: "Star" },
  color: { type: String, default: "#3b82f6" },
  target: { 
    type: mongoose.Schema.Types.Mixed, 
    set: encryptData, 
    get: decryptData 
  },
  unit: { type: String },
  entries: [entrySchema],
}, { 
  timestamps: true,
  toObject: { getters: true, virtuals: true }, 
  toJSON: { getters: true, virtuals: true } 
});

// Prevent OverwriteModelError on Render
module.exports = mongoose.models.Tracker || mongoose.model("Tracker", trackerSchema);