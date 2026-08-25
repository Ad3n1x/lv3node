const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { Resend } = require("resend");
const User = require("../models/User");
const verifyToken = require("../middleware/auth");
const { sendPasswordResetEmail } = require("../config/mailer");

const router = express.Router();

// Initialize Resend with your environment variable (Secure!)
const resend = new Resend(process.env.RESEND_API_KEY);

// ==========================================
// 1. REGISTRATION & OTP VERIFICATION
// ==========================================

// POST /api/v1/auth/register (Step 1: Save unverified user & send OTP)
router.post("/register", async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body;

    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ message: "All fields are required." });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    let existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser && existingUser.isVerified) {
      return res.status(400).json({ message: "User with this email already exists and is verified." });
    }

    const hashedPassword = await bcrypt.hash(cleanPassword, 10);

    // Generate 6-digit OTP and expiration (10 minutes from now)
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

    // Send the OTP via Resend using your custom template
    await resend.emails.send({
      from: 'Tracker App <onboarding@resend.dev>',
      to: [cleanEmail],
      subject: '🔐 Your Verification Code — Tracker App',
      html: `
        <div style="background-color: #f8f9fa; padding: 40px 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
          <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border: 1px solid #e9ecef;">
            
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #0d6efd 0%, #0a58ca 100%); padding: 30px; text-align: center; color: #ffffff;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 0.5px;">Tracker App</h1>
              <p style="margin: 8px 0 0 0; font-size: 14px; opacity: 0.9;">Secure Account Verification</p>
            </div>

            <!-- Body -->
            <div style="padding: 35px 30px; text-align: left; color: #495057;">
              <p style="margin-top: 0; font-size: 16px; font-weight: 500;">Hello <strong>${firstName}</strong>,</p>
              <p style="font-size: 15px; line-height: 1.5; color: #6c757d;">
                Thank you for signing up! Use the secure verification code below to activate your account. This code is valid for <strong>10 minutes</strong>.
              </p>

              <!-- OTP Box Badge -->
              <div style="margin: 30px 0; text-align: center;">
                <div style="display: inline-block; background-color: #f1f3f5; border: 2px dashed #ced4da; border-radius: 8px; padding: 15px 30px; font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #0d6efd;">
                  ${otp}
                </div>
              </div>

              <p style="font-size: 13px; color: #adb5bd; line-height: 1.4; margin-bottom: 0;">
                If you didn't request this code, you can safely ignore this email. Someone else might have typed your email address by mistake.
              </p>
            </div>

            <!-- Footer -->
            <div style="background-color: #f8f9fa; padding: 15px 30px; text-align: center; font-size: 12px; color: #adb5bd; border-top: 1px solid #e9ecef;">
              &copy; ${new Date().getFullYear()} Tracker App. All rights reserved.
            </div>

          </div>
        </div>
      `,
    });

    return res.status(200).json({
      message: "Registration successful! Please check your email for the OTP.",
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Registration failed." });
  }
});

// POST /api/v1/auth/verify-otp
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
      user: { id: user._id, firstName: user.firstName, lastName: user.lastName, email: user.email },
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || "OTP verification failed." });
  }
});


// ==========================================
// 2. LOGIN & PUBLIC KEY SYNC
// ==========================================

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

    if (!user.isVerified) {
      return res.status(403).json({ message: "Please verify your email with the OTP sent during registration." });
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

// POST /api/v1/auth/public-key (Syncs the client's E2EE public key)
router.post("/public-key", verifyToken, async (req, res) => {
  try {
    const { publicKey } = req.body;
    if (!publicKey) {
      return res.status(400).json({ message: "Public key is required." });
    }

    await User.findByIdAndUpdate(req.user.id, { publicKey });
    return res.status(200).json({ message: "Public key saved successfully." });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Failed to save public key." });
  }
});


// ==========================================
// 3. PASSWORD RECOVERY (FORGOT / RESET)
// ==========================================

// POST /api/v1/auth/forgot-password
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email is required." });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: cleanEmail });
    
    // Security: return 200 even if not found to prevent user enumeration
    if (!user) {
      return res.status(200).json({ message: "If that email exists, a reset link has been sent." });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken = crypto.createHash("sha256").update(resetToken).digest("hex");
    user.resetPasswordExpires = Date.now() + 15 * 60 * 1000; // 15 minutes
    await user.save();

    const resetUrl = `https://your-frontend-app.com/reset-password?token=${resetToken}&email=${cleanEmail}`;

    const emailResult = await sendPasswordResetEmail(user.email, resetUrl);
    
    if (!emailResult.success) {
      return res.status(500).json({ error: "Failed to send reset email. Please try again later." });
    }

    res.status(200).json({ message: "Password reset link sent successfully." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error processing password reset." });
  }
});

// POST /api/v1/auth/reset-password
router.post("/reset-password", async (req, res) => {
  try {
    const { email, token, newPassword } = req.body;
    
    if (!email || !token || !newPassword) {
      return res.status(400).json({ error: "All fields are required." });
    }

    const cleanEmail = email.trim().toLowerCase();
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
    
    const user = await User.findOne({
      email: cleanEmail,
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired password reset token." });
    }

    user.password = await bcrypt.hash(newPassword.trim(), 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.status(200).json({ message: "Password updated successfully. You can now log in." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to reset password." });
  }
});

module.exports = router;