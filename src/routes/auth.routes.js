const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const User = require("../models/User");
const verifyToken = require("../middleware/auth");

const router = express.Router();

// Initialize Nodemailer Transporter using Gmail SMTP
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true, // SSL required on cloud platforms like Render
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // 16-character App Password
  },
});

// Helper function to send OTP email
const sendOtpEmail = async (toEmail, firstName, otp, subjectTitle) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn("⚠️ Warning: EMAIL_USER or EMAIL_PASS missing. Email skipped.");
    console.log(`🔑 DEVELOPMENT OTP for ${toEmail}: ${otp}`);
    return;
  }

  const mailOptions = {
    from: `"UNI-TRACK Security" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: subjectTitle,
    html: `
      <div style="background-color: #f8f9fa; padding: 40px 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
        <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border: 1px solid #e9ecef;">
          <div style="background: linear-gradient(135deg, #0d6efd 0%, #0a58ca 100%); padding: 30px; text-align: center; color: #ffffff;">
            <h1 style="margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 0.5px;">UNI-TRACK</h1>
            <p style="margin: 8px 0 0 0; font-size: 14px; opacity: 0.9;">Secure Account Verification</p>
          </div>
          <div style="padding: 35px 30px; text-align: left; color: #495057;">
            <p style="margin-top: 0; font-size: 16px; font-weight: 500;">Hello <strong>${firstName}</strong>,</p>
            <p style="font-size: 15px; line-height: 1.5; color: #6c757d;">
              Use the secure verification code below to verify your account action. This code is valid for <strong>10 minutes</strong>.
            </p>
            <div style="margin: 30px 0; text-align: center;">
              <div style="display: inline-block; background-color: #f1f3f5; border: 2px dashed #ced4da; border-radius: 8px; padding: 15px 30px; font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #0d6efd;">
                ${otp}
              </div>
            </div>
            <p style="font-size: 13px; color: #adb5bd; line-height: 1.4; margin-bottom: 0;">
              If you didn't request this code, you can safely ignore this email.
            </p>
          </div>
          <div style="background-color: #f8f9fa; padding: 15px 30px; text-align: center; font-size: 12px; color: #adb5bd; border-top: 1px solid #e9ecef;">
            &copy; ${new Date().getFullYear()} UNI-TRACK. All rights reserved.
          </div>
        </div>
      </div>
    `,
  };

  return await transporter.sendMail(mailOptions);
};

// ==========================================
// 1. POST /api/v1/auth/register
// ==========================================
router.post("/register", async (req, res) => {
  try {
    const firstName = req.body.firstName || req.body.firstname;
    const lastName = req.body.lastName || req.body.lastname;
    const { email, password } = req.body;

    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ message: "All fields are required." });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    let existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser && existingUser.isVerified) {
      return res.status(400).json({
        message: "User with this email already exists and is verified.",
      });
    }

    const hashedPassword = await bcrypt.hash(cleanPassword, 10);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    if (existingUser && !existingUser.isVerified) {
      existingUser.firstName = firstName.trim();
      existingUser.lastName = lastName.trim();
      existingUser.password = hashedPassword;
      existingUser.otp = otp;
      existingUser.otpExpires = otpExpires;
      await existingUser.save();
    } else {
      await User.create({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: cleanEmail,
        password: hashedPassword,
        isVerified: false,
        otp,
        otpExpires,
      });
    }

    try {
      await sendOtpEmail(cleanEmail, firstName.trim(), otp, "🔐 Your Verification Code — UNI-TRACK");
    } catch (emailErr) {
      console.error("⚠️ Nodemailer Delivery Warning:", emailErr.message);
    }

    return res.status(200).json({
      message: "Registration successful! Please check your email for the OTP.",
    });
  } catch (err) {
    console.error("❌ Registration Error:", err);
    return res.status(500).json({ message: err.message || "Registration failed." });
  }
});

// ==========================================
// 2. POST /api/v1/auth/verify-otp
// ==========================================
router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required." });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: cleanEmail });

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: "User is already verified." });
    }

    if (user.otp !== otp || user.otpExpires < Date.now()) {
      return res.status(400).json({ message: "Invalid or expired OTP code." });
    }

    user.isVerified = true;
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();

    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET || "your_jwt_secret_key",
      { expiresIn: "7d" }
    );

    return res.status(200).json({
      token,
      message: "Account verified successfully!",
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
      },
    });
  } catch (err) {
    console.error("❌ Verify OTP Error:", err);
    return res.status(500).json({ message: err.message || "OTP verification failed." });
  }
});

// ==========================================
// 3. POST /api/v1/auth/login
// ==========================================
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

    if (!user.isVerified) {
      return res.status(403).json({
        message: "Please verify your email with the OTP sent during registration.",
      });
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
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
      },
    });
  } catch (err) {
    console.error("❌ Login Error:", err);
    return res.status(500).json({ message: err.message || "Login failed." });
  }
});

// ==========================================
// 4. POST /api/v1/auth/public-key
// ==========================================
router.post("/public-key", verifyToken, async (req, res) => {
  try {
    const { publicKey } = req.body;
    if (!publicKey) {
      return res.status(400).json({ message: "Public key is required." });
    }

    await User.findByIdAndUpdate(req.user.id, { publicKey });
    return res.status(200).json({ message: "Public key saved successfully." });
  } catch (err) {
    console.error("❌ Public Key Error:", err);
    return res.status(500).json({ message: err.message || "Failed to save public key." });
  }
});

// ==========================================
// 5. POST /api/v1/auth/forgot-password
// ==========================================
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email is required." });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: cleanEmail });

    if (!user) {
      return res.status(404).json({ message: "No account found with this email." });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    user.otp = otp;
    user.otpExpires = otpExpires;
    await user.save();

    try {
      await sendOtpEmail(cleanEmail, user.firstName, otp, "🔒 Password Reset Code — UNI-TRACK");
    } catch (emailErr) {
      console.error("⚠️ Nodemailer Error:", emailErr.message);
    }

    return res.status(200).json({ message: "Password reset code sent to your email." });
  } catch (err) {
    console.error("❌ Forgot Password Error:", err);
    return res.status(500).json({ message: err.message || "Failed to process request." });
  }
});

// ==========================================
// 6. POST /api/v1/auth/reset-password
// ==========================================
router.post("/reset-password", async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ message: "Email, OTP, and new password are required." });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: cleanEmail });

    if (!user || user.otp !== otp || user.otpExpires < Date.now()) {
      return res.status(400).json({ message: "Invalid or expired reset code." });
    }

    user.password = await bcrypt.hash(newPassword.trim(), 10);
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();

    return res.status(200).json({ message: "Password reset successful! Please log in." });
  } catch (err) {
    console.error("❌ Reset Password Error:", err);
    return res.status(500).json({ message: err.message || "Password reset failed." });
  }
});

module.exports = router;