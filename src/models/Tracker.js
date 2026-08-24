const mongoose = require("mongoose");
const CryptoJS = require("crypto-js");

// Use a secret key from your environment variables (must be kept secret!)
const SECRET_KEY = process.env.ENCRYPTION_KEY || "your_fallback_super_secret_key_32_bytes";

// Helper encryption functions
const encryptData = (text) => {
  if (text === null || text === undefined) return text;
  // Convert objects/numbers to strings before encrypting if needed
  const stringValue = typeof text === "object" ? JSON.stringify(text) : String(text);
  return CryptoJS.AES.encrypt(stringValue, SECRET_KEY).toString();
};

const decryptData = (ciphertext) => {
  if (!ciphertext) return ciphertext;
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, SECRET_KEY);
    const decryptedString = bytes.toString(CryptoJS.enc.Utf8);
    
    // Try to parse back to original type (JSON/Number/Boolean/String) if possible
    try {
      return JSON.parse(decryptedString);
    } catch {
      return !isNaN(decryptedString) && decryptedString !== "" ? Number(decryptedString) : decryptedString;
    }
  } catch (error) {
    console.error("Decryption error:", error);
    return ciphertext; // Return raw if decryption fails
  }
};

const trackerSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  name: { type: String, required: true }, // Will be stored encrypted
  type: { type: String, required: true }, // Kept clear for schema filtering
  icon: { type: String, default: "Star" },
  color: { type: String, default: "#3b82f6" },
  target: { type: mongoose.Schema.Types.Mixed }, // Can be encrypted if target values are sensitive
  unit: { type: String },
  entries: [
    {
      date: { type: String, required: true }, // "YYYY-MM-DD" (kept clear for sorting/matching)
      value: { type: mongoose.Schema.Types.Mixed }, // Will be stored encrypted
    },
  ],
}, { timestamps: true });

// --- MIDDLEWARE: ENCRYPT BEFORE SAVING TO DATABASE ---
trackerSchema.pre("save", function (next) {
  // Encrypt tracker name
  if (this.isModified("name")) {
    this.name = encryptData(this.name);
  }

  // Encrypt target if present
  if (this.isModified("target") && this.target !== undefined) {
    this.target = encryptData(this.target);
  }

  // Encrypt entry values
  if (this.isModified("entries")) {
    this.entries = this.entries.map((entry) => ({
      ...entry,
      value: encryptData(entry.value),
    }));
    this.markModified("entries"); // Crucial so Mongoose persists the encrypted array changes
  }

  next();
});

// --- MIDDLEWARE: DECRYPT WHEN FETCHING FROM DATABASE ---
// Handles single documents and queries
trackerSchema.post(/^find|save/, function (docs) {
  if (!docs) return;

  const decryptDocument = (doc) => {
    if (!doc) return;
    if (doc.name) doc.name = decryptData(doc.name);
    if (doc.target !== undefined) doc.target = decryptData(doc.target);
    
    if (doc.entries && Array.isArray(doc.entries)) {
      doc.entries = doc.entries.map((entry) => ({
        ...entry,
        value: decryptData(entry.value),
      }));
    }
  };

  if (Array.isArray(docs)) {
    docs.forEach(decryptDocument);
  } else {
    decryptDocument(docs);
  }
});

module.exports = mongoose.model("Tracker", trackerSchema);