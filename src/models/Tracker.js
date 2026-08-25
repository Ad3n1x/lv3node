const mongoose = require("mongoose");
const CryptoJS = require("crypto-js");

// Use a secret key from your environment variables (must be kept secret!)
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
    
    // If decryption fails (e.g., plain text passed in), return the original
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

// Explicitly define the entry schema so Mongoose manages _ids and dates correctly
const entrySchema = new mongoose.Schema({
  date: { type: String, required: true }, // Clear for sorting/matching
  value: { type: mongoose.Schema.Types.Mixed }, // Encrypted
});

const trackerSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  name: { type: String, required: true }, // Encrypted
  type: { type: String, required: true }, // Clear for querying
  icon: { type: String, default: "Star" },
  color: { type: String, default: "#3b82f6" },
  target: { type: mongoose.Schema.Types.Mixed }, // Encrypted
  unit: { type: String },
  entries: [entrySchema], // Use explicit subdocument schema
}, { timestamps: true });

// --- 1. ENCRYPT BEFORE SAVING (Handles new Tracker() & .save()) ---
trackerSchema.pre("save", function (next) {
  if (this.isModified("name")) {
    this.name = encryptData(this.name);
  }
  if (this.isModified("target") && this.target !== undefined) {
    this.target = encryptData(this.target);
  }
  if (this.isModified("entries")) {
    // FIX: Iterate and modify in-place. Do not use `.map` or `...entry`
    this.entries.forEach((entry) => {
      entry.value = encryptData(entry.value);
    });
    this.markModified("entries");
  }
  next();
});

// --- 2. ENCRYPT BEFORE FIND ONE AND UPDATE (Handles findByIdAndUpdate) ---
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
  if (targetObj.entries && Array.isArray(targetObj.entries)) {
    // FIX: Iterate and modify in-place
    targetObj.entries.forEach((entry) => {
      entry.value = encryptData(entry.value);
    });
  }

  next();
});

// --- 3. DECRYPT WHEN FETCHING OR RETURNING DOCUMENTS ---
trackerSchema.post(/^find|save|findOneAndUpdate/, function (docs) {
  if (!docs) return;

  const decryptDocument = (doc) => {
    if (!doc) return;
    if (doc.name) doc.name = decryptData(doc.name);
    if (doc.target !== undefined) doc.target = decryptData(doc.target);
    
    if (doc.entries && Array.isArray(doc.entries)) {
      // FIX: Iterate and modify in-place. Do not use `.map` or `...entry`
      doc.entries.forEach((entry) => {
        if (entry.value !== undefined) {
          entry.value = decryptData(entry.value);
        }
      });
    }
  };

  if (Array.isArray(docs)) {
    docs.forEach(decryptDocument);
  } else {
    decryptDocument(docs);
  }
});

module.exports = mongoose.model("Tracker", trackerSchema);