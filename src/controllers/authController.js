const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { Resend } = require("resend");
const User = require("../models/User");
const verifyToken = require("../middleware/auth");
const { sendPasswordResetEmail } = require("../config/mailer");

const router = express.Router();

// Initialize Resend with your environment variable safely
const resend = new Resend(process.env.RESEND_API_KEY);

// ==========================================
// 1. REGISTER: Create user (unverified), generate OTP, and send email
// ==========================================
router.post("/register", async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body;

    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ message: "All fields are required." });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanFirstName = firstName.trim();
    const cleanLastName = lastName.trim();

    let user = await User.findOne({ email: cleanEmail });
    if (user && user.isVerified) {
      return res.status(400).json({ message: "Email is already registered and verified." });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password.trim(), salt);

    // Generate 6-digit OTP (Valid for 10 minutes)
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    if (user) {
      // If user exists but wasn't verified, update their info and assign a fresh OTP
      user.firstName = cleanFirstName;
      user.lastName = cleanLastName;
      user.password = hashedPassword;
      user.otp = otp;
      user.otpExpires = otpExpires;
      await user.save();
    } else {
      // Create new unverified user
      user = new User({
        firstName: cleanFirstName,
        lastName: cleanLastName,
        email: cleanEmail,
        password: hashedPassword,
        otp,
        otpExpires,
        isVerified: false,
      });
      await user.save();
    }

    // Send Email via Resend using your custom high-end template
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
              <p style="margin-top: 0; font-size: 16px; font-weight: 500;">Hello <strong>${cleanFirstName}</strong>,</p>
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
      status: "success",
      message: "Registration successful! Please check your email for the OTP.",
    });
  } catch (error) {
    console.error("Register Error:", error);
    return res.status(500).json({ message: error.message || "Server error during registration." });
  }
});

// ==========================================
// 2. VERIFY OTP: Check code, activate user, and return JWT token
// ==========================================
router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required." });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: cleanEmail }).select("+password");

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: "User is already verified." });
    }

    if (user.otp !== otp || user.otpExpires < Date.now()) {
      return res.status(400).json({ message: "Invalid or expired OTP code." });
    }

    // Mark user as verified and clear OTP tracking fields
    user.isVerified = true;
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();

    // Generate JWT Token (supports both userId and id conventions)
    const token = jwt.sign(
      { id: user._id, userId: user._id, email: user.email },
      process.env.JWT_SECRET || "fallback_secret",
      { expiresIn: "7d" }
    );

    return res.status(200).json({
      status: "success",
      message: "Email verified successfully!",
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Verify OTP Error:", error);
    return res.status(500).json({ message: error.message || "Server error during OTP verification." });
  }
});

// ==========================================
// 3. LOGIN & PUBLIC KEY SYNC
// ==========================================
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Please provide email and password." });

    const cleanEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: cleanEmail }).select("+password");

    if (!user) return res.status(401).json({ message: "Invalid email or password." });
    if (!user.isVerified) return res.status(403).json({ message: "Please verify your email with the OTP sent during registration." });

    const isMatch = await bcrypt.compare(password.trim(), user.password);
    if (!isMatch) return res.status(401).json({ message: "Invalid email or password." });

    const token = jwt.sign(
      { id: user._id, userId: user._id, email: user.email },
      process.env.JWT_SECRET || "fallback_secret",
      { expiresIn: "7d" }
    );

    return res.status(200).json({
      status: "success",
      token,
      message: "Login successful!",
      user: { id: user._id, firstName: user.firstName, lastName: user.lastName, email: user.email },
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Login failed." });
  }
});

router.post("/public-key", verifyToken, async (req, res) => {
  try {
    const { publicKey } = req.body;
    if (!publicKey) return res.status(400).json({ message: "Public key is required." });

    const userId = req.user?.id || req.user?.userId;
    await User.findByIdAndUpdate(userId, { publicKey });
    return res.status(200).json({ message: "Public key saved successfully." });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Failed to save public key." });
  }
});

// ==========================================
// 4. PASSWORD RECOVERY (FORGOT / RESET)
// ==========================================
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required." });

    const cleanEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: cleanEmail });
    
    // Return 200 even if user doesn't exist for security (prevents user enumeration)
    if (!user) return res.status(200).json({ message: "If that email exists, a reset link has been sent." });

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
    console.error("Forgot Password Error:", err);
    res.status(500).json({ error: "Server error processing password reset." });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const { email, token, newPassword } = req.body;
    if (!email || !token || !newPassword) return res.status(400).json({ error: "All fields are required." });

    const cleanEmail = email.trim().toLowerCase();
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
    
    const user = await User.findOne({
      email: cleanEmail,
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    }).select("+password");

    if (!user) return res.status(400).json({ error: "Invalid or expired password reset token." });

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword.trim(), salt);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.status(200).json({ message: "Password updated successfully. You can now log in." });
  } catch (err) {
    console.error("Reset Password Error:", err);
    res.status(500).json({ error: "Failed to reset password." });
  }
});

module.exports = router;