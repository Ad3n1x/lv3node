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

const entrySchema = new mongoose.Schema({
  date: { type: String, required: true },
  value: { type: mongoose.Schema.Types.Mixed },
});

const trackerSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  name: { type: String, required: true },
  type: { type: String, required: true },
  icon: { type: String, default: "Star" },
  color: { type: String, default: "#3b82f6" },
  target: { type: mongoose.Schema.Types.Mixed },
  unit: { type: String },
  entries: [entrySchema],
}, { timestamps: true });

trackerSchema.pre("save", function (next) {
  if (this.isModified("name")) {
    this.name = encryptData(this.name);
  }
  if (this.isModified("target") && this.target !== undefined) {
    this.target = encryptData(this.target);
  }
  if (this.isModified("entries")) {
    this.entries.forEach((entry) => {
      entry.value = encryptData(entry.value);
    });
    this.markModified("entries");
  }
  next();
});

trackerSchema.post(/^find|save|findOneAndUpdate/, function (docs) {
  if (!docs) return;
  const decryptDocument = (doc) => {
    if (!doc) return;
    if (doc.name) doc.name = decryptData(doc.name);
    if (doc.target !== undefined) doc.target = decryptData(doc.target);
    if (doc.entries && Array.isArray(doc.entries)) {
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

// FIX: Prevent OverwriteModelError on Render
module.exports = mongoose.models.Tracker || mongoose.model("Tracker", trackerSchema);