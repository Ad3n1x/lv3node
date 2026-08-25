const express = require("express");
const router = express.Router();
const { User, SecureItem } = require("../models/SecureItem");

// Save or update user's public key
router.post("/keys", async (req, res) => {
  try {
    const { username, publicKey } = req.body;
    await User.findOneAndUpdate(
      { username },
      { publicKey },
      { upsert: true, new: true }
    );
    res.json({ success: true, message: "Public key saved successfully." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get a user's public key
router.get("/keys/:username", async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ publicKey: user.publicKey });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save encrypted payload (Server only sees ciphertext)
router.post("/items", async (req, res) => {
  try {
    const { userId, ciphertext } = req.body;
    const newItem = new SecureItem({ userId, ciphertext });
    await newItem.save();
    res.json({ success: true, itemId: newItem._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch encrypted payload
router.get("/items/:userId", async (req, res) => {
  try {
    const items = await SecureItem.find({ userId: req.params.userId });
    res.json(items); // Returns raw ciphertext array
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;