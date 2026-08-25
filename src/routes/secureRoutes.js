const mongoose = require("mongoose");
const User = require("./User"); // 👈 Import your main User model

const secureItemSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  ciphertext: { type: String, required: true },
}, { timestamps: true });

const SecureItem = mongoose.models.SecureItem || mongoose.model("SecureItem", secureItemSchema);

module.exports = { User, SecureItem }; // Or better yet, just export SecureItem and require User directly where needed