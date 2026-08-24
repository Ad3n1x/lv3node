const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const router = express.Router();

// POST /api/v1/auth/register
router.post("/register", async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body;

    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ message: "All fields are required." });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    const existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) {
      return res.status(400).json({ message: "User with this email already exists." });
    }

    const hashedPassword = await bcrypt.hash(cleanPassword, 10);

    const user = await User.create({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: cleanEmail,
      password: hashedPassword,
    });

    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET || "your_jwt_secret_key",
      { expiresIn: "7d" }
    );

    return res.status(201).json({
      token,
      message: "User registered successfully!",
      user: { id: user._id, firstName: user.firstName, lastName: user.lastName, email: user.email },
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Registration failed." });
  }
});

// POST /api/v1/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Please provide email and password." });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const isMatch = await bcrypt.compare(cleanPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET || "your_jwt_secret_key",
      { expiresIn: "7d" }
    );

    return res.status(200).json({
      token,
      message: "Login successful!",
      user: { id: user._id, firstName: user.firstName, lastName: user.lastName, email: user.email },
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Login failed." });
  }
});

module.exports = router;