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

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true }, // Encrypted at rest
    lastName: { type: String, required: true },  // Encrypted at rest
    email: { type: String, required: true, unique: true, lowercase: true, trim: true }, // Clear for querying/login
    password: { type: String, required: true }, // Hashed via bcrypt (do not double encrypt)
    isVerified: { type: Boolean, default: false },
    otp: { type: String },
    otpExpires: { type: Date },
    publicKey: { type: String },
    // Subscription / Monetization fields
    isPro: { type: Boolean, default: false },
    subscriptionId: { type: String, default: null },
    stripeCustomerId: { type: String, default: null },
  },
  { timestamps: true }
);

// --- 1. ENCRYPT BEFORE SAVING ---
userSchema.pre("save", function (next) {
  if (this.isModified("firstName") && !this.firstName.startsWith("U2FsdGVkX1")) {
    this.firstName = encryptData(this.firstName);
  }
  if (this.isModified("lastName") && !this.lastName.startsWith("U2FsdGVkX1")) {
    this.lastName = encryptData(this.lastName);
  }
  next();
});

// --- 2. ENCRYPT BEFORE FIND ONE AND UPDATE ---
userSchema.pre("findOneAndUpdate", function (next) {
  const update = this.getUpdate();
  if (!update) return next();

  const targetObj = update.$set || update;

  if (targetObj.firstName && !String(targetObj.firstName).startsWith("U2FsdGVkX1")) {
    targetObj.firstName = encryptData(targetObj.firstName);
  }
  if (targetObj.lastName && !String(targetObj.lastName).startsWith("U2FsdGVkX1")) {
    targetObj.lastName = encryptData(targetObj.lastName);
  }

  next();
});

// --- 3. DECRYPT WHEN FETCHING DOCUMENTS ---
userSchema.post(/^find|save|findOneAndUpdate/, function (docs) {
  if (!docs) return;

  const decryptDocument = (doc) => {
    if (!doc) return;
    if (doc.firstName) doc.firstName = decryptData(doc.firstName);
    if (doc.lastName) doc.lastName = decryptData(doc.lastName);
  };

  if (Array.isArray(docs)) {
    docs.forEach(decryptDocument);
  } else {
    decryptDocument(docs);
  }
});

module.exports = mongoose.models.User || mongoose.model("User", userSchema);