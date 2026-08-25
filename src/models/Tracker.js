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
  
  // If it doesn't look like crypto-js ciphertext, return it as-is
  if (!ciphertext.startsWith("U2FsdGVkX1")) {
    return ciphertext;
  }

  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, SECRET_KEY);
    const decryptedString = bytes.toString(CryptoJS.enc.Utf8);
    
    if (!decryptedString) {
      console.warn("⚠️ Decryption resulted in empty UTF-8 string (Possible key mismatch). Returning raw text.");
      return ciphertext; 
    }
    
    try {
      return JSON.parse(decryptedString);
    } catch {
      return !isNaN(decryptedString) && decryptedString !== "" ? Number(decryptedString) : decryptedString;
    }
  } catch (error) {
    console.warn("⚠️ Decryption failed safely (Key mismatch or invalid ciphertext):", error.message);
    return ciphertext; // Fall back to returning raw ciphertext instead of crashing
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

const decryptDocument = (doc) => {
  if (!doc) return;
  const d = typeof doc.toObject === "function" ? doc.toObject() : doc;

  if (d.name) {
    doc.name = decryptData(d.name);
  }
  if (d.target !== undefined) {
    doc.target = decryptData(d.target);
  }
  
  if (d.entries !== undefined) {
    let decrypted = decryptData(d.entries);
    if (typeof decrypted === "string" && decrypted.startsWith("U2FsdGVkX1")) {
      // Secondary safety check if double-encrypted
      decrypted = decryptData(decrypted);
    }
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

trackerSchema.post("save", function (doc) { decryptDocument(doc); });
trackerSchema.post("findOne", function (doc) { decryptDocument(doc); });
trackerSchema.post("findOneAndUpdate", function (doc) { decryptDocument(doc); });
trackerSchema.post("find", function (docs) {
  if (Array.isArray(docs)) {
    docs.forEach(decryptDocument);
  }
});

module.exports = mongoose.models.Tracker || mongoose.model("Tracker", trackerSchema);