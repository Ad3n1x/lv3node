const mongoose = require("mongoose");
const CryptoJS = require("crypto-js");

const SECRET_KEY = process.env.ENCRYPTION_KEY;

if (!SECRET_KEY) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "ENCRYPTION_KEY environment variable is required in production. Refusing to start with an insecure fallback key."
    );
  }
  console.warn(
    "[Tracker model] WARNING: ENCRYPTION_KEY not set. Using an insecure dev-only fallback key. " +
      "Data encrypted now will NOT be safe and should not be used outside local development."
  );
}
const EFFECTIVE_KEY = SECRET_KEY || "dev_only_insecure_fallback_key_do_not_use_in_prod";

const CIPHER_PREFIX = "U2FsdGVkX1";

// --- Plain scalar text (never JSON-coerced back, e.g. "123" must stay "123") ---
const encryptText = (text) => {
  if (text === null || text === undefined) return text;
  return CryptoJS.AES.encrypt(String(text), EFFECTIVE_KEY).toString();
};

const decryptText = (ciphertext) => {
  if (!ciphertext || typeof ciphertext !== "string") return ciphertext;
  if (!ciphertext.startsWith(CIPHER_PREFIX)) return ciphertext;
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, EFFECTIVE_KEY);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    return decrypted || ciphertext;
  } catch {
    return ciphertext;
  }
};

// --- Structured values (target/entries) that may legitimately be objects/arrays/numbers ---
const encryptValue = (value) => {
  if (value === null || value === undefined) return value;
  const stringValue = typeof value === "object" ? JSON.stringify(value) : String(value);
  return CryptoJS.AES.encrypt(stringValue, EFFECTIVE_KEY).toString();
};

const decryptValue = (ciphertext) => {
  if (!ciphertext || typeof ciphertext !== "string") return ciphertext;
  if (!ciphertext.startsWith(CIPHER_PREFIX)) return ciphertext;

  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, EFFECTIVE_KEY);
    const decryptedString = bytes.toString(CryptoJS.enc.Utf8);

    if (!decryptedString) return ciphertext;

    try {
      return JSON.parse(decryptedString);
    } catch {
      return decryptedString;
    }
  } catch {
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
  if (doc.name) doc.name = decryptText(doc.name);
  if (doc.target !== undefined) doc.target = decryptValue(doc.target);

  if (doc.entries !== undefined) {
    let decryptedEntries = decryptValue(doc.entries);
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

// Encrypt a plain object of fields (used by save + all update paths)
const encryptFieldsInPlace = (target) => {
  if (!target) return;

  if (target.name !== undefined && target.name !== null && !String(target.name).startsWith(CIPHER_PREFIX)) {
    target.name = encryptText(target.name);
  }

  if (target.target !== undefined && target.target !== null) {
    const alreadyEncrypted =
      typeof target.target === "string" && target.target.startsWith(CIPHER_PREFIX);
    if (!alreadyEncrypted) {
      target.target = encryptValue(target.target);
    }
  }

  if (target.entries !== undefined && target.entries !== null) {
    const alreadyEncrypted =
      typeof target.entries === "string" && target.entries.startsWith(CIPHER_PREFIX);
    if (!alreadyEncrypted) {
      target.entries = encryptValue(target.entries);
    }
  }
};

// --- 1. ENCRYPTION HOOKS ---
trackerSchema.pre("save", function (next) {
  encryptFieldsInPlace(this);
  this.markModified("entries");
  next();
});

trackerSchema.pre("findOneAndUpdate", async function (next) {
  const update = this.getUpdate();
  if (!update) return next();

  // Pipeline-style updates (array form) aren't safe to auto-encrypt field-by-field.
  if (Array.isArray(update)) {
    console.warn(
      "[Tracker model] Aggregation-pipeline update detected on findOneAndUpdate; " +
        "automatic field encryption is skipped for this update. Encrypt fields manually."
    );
    return next();
  }

  // Handle $push / $addToSet on entries: merge with existing decrypted entries,
  // since entries is stored as a single encrypted blob, not a real array.
  const pushEntry =
    update.$push?.entries !== undefined
      ? update.$push.entries
      : update.$addToSet?.entries !== undefined
      ? update.$addToSet.entries
      : undefined;

  if (pushEntry !== undefined) {
    const existing = await this.model.findOne(this.getQuery()).lean();
    let currentEntries = [];
    if (existing && existing.entries !== undefined) {
      const decrypted = decryptValue(existing.entries);
      currentEntries = Array.isArray(decrypted) ? decrypted : [];
    }
    const toAdd = update.$push?.entries?.$each || [pushEntry];
    currentEntries = currentEntries.concat(toAdd);

    update.$set = update.$set || {};
    update.$set.entries = currentEntries;
    delete update.$push?.entries;
    delete update.$addToSet?.entries;
  }

  encryptFieldsInPlace(update.$set || update);
  encryptFieldsInPlace(update.$setOnInsert);

  next();
});

trackerSchema.pre("updateMany", function (next) {
  const update = this.getUpdate();
  if (update && !Array.isArray(update)) {
    encryptFieldsInPlace(update.$set || update);
    encryptFieldsInPlace(update.$setOnInsert);
  }
  next();
});

trackerSchema.pre("insertMany", function (next, docs) {
  if (Array.isArray(docs)) {
    docs.forEach((doc) => encryptFieldsInPlace(doc));
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