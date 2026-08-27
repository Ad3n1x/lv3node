const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const { BrevoClient } = require("@getbrevo/brevo");
const User = require("../models/User");
const verifyToken = require("../middleware/auth");

const router = express.Router();

// ==========================================
// BREVO HTTP API CLIENT INITIALIZATION
// ==========================================
const brevo = new BrevoClient({
  apiKey: process.env.BREVO_API_KEY,
});

// ==========================================
// SECURITY RATE LIMITERS (Brute-Force Protection)
// ==========================================
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per window
  message: { message: "Too many attempts from this IP, please try again after 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5, // Limit each IP to 5 OTP requests
  message: { message: "Too many OTP requests. Please wait a few minutes before trying again." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ==========================================
// HELPER: RETRY LOGIC FOR EMAIL DELIVERY (BREVO HTTP API)
// ==========================================
const sendBrevoMailWithRetry = async (emailParams, retries = 3, delay = 2000) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await brevo.transactionalEmails.sendTransacEmail(emailParams);
      console.log(`✅ [Email Sent via Brevo] MessageId: ${response.messageId} (Attempt ${attempt})`);
      return response;
    } catch (err) {
      console.warn(`⚠️ [Email Attempt ${attempt}/${retries} Failed]: ${err.message || err}`);
      if (attempt === retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, delay * attempt));
    }
  }
};

// ==========================================
// HELPER: BACKGROUND OTP MAILER VIA BREVO API
// ==========================================
const sendOtpEmail = async (toEmail, firstName, otp, subjectTitle) => {
  if (!process.env.BREVO_API_KEY || !process.env.SENDER_EMAIL) {
    console.warn("⚠️ [Config Warning] BREVO_API_KEY or SENDER_EMAIL missing in environment.");
    console.log(`🔑 [DEV MODE OTP] Destination: ${toEmail} | Code: ${otp}`);
    return;
  }

  const emailParams = {
    subject: subjectTitle,
    sender: {
      name: process.env.SENDER_NAME || "UNI-TRACK Security",
      email: process.env.SENDER_EMAIL,
    },
    to: [{ email: toEmail, name: firstName }],
    htmlContent: `
      <div style="background-color: #f8f9fa; padding: 40px 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
        <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border: 1px solid #e9ecef;">
          <div style="background: linear-gradient(135deg, #0d6efd 0%, #0a58ca 100%); padding: 30px; text-align: center; color: #ffffff;">
            <h1 style="margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 0.5px;">UNI-TRACK</h1>
            <p style="margin: 8px 0 0 0; font-size: 14px; opacity: 0.9;">Secure Account Verification</p>
          </div>
          <div style="padding: 35px 30px; text-align: left; color: #495057;">
            <p style="margin-top: 0; font-size: 16px; font-weight: 500;">Hello <strong>${firstName}</strong>,</p>
            <p style="font-size: 15px; line-height: 1.5; color: #6c757d;">
              Use the secure verification code below to complete your action. This code expires in <strong>10 minutes</strong>.
            </p>
            <div style="margin: 30px 0; text-align: center;">
              <div style="display: inline-block; background-color: #f1f3f5; border: 2px dashed #ced4da; border-radius: 8px; padding: 15px 30px; font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #0d6efd;">
                ${otp}
              </div>
            </div>
            <p style="font-size: 13px; color: #adb5bd; line-height: 1.4; margin-bottom: 0;">
              If you did not request this verification code, please ignore this email.
            </p>
          </div>
          <div style="background-color: #f8f9fa; padding: 15px 30px; text-align: center; font-size: 12px; color: #adb5bd; border-top: 1px solid #e9ecef;">
            &copy; ${new Date().getFullYear()} UNI-TRACK. All rights reserved.
          </div>
        </div>
      </div>
    `,
  };

  // Non-blocking asynchronous dispatch
  sendBrevoMailWithRetry(emailParams).catch((err) => {
    console.error(`❌ [Critical Email Failure] Failed to send OTP via Brevo to ${toEmail}:`, err.stack || err);
  });
};

// ==========================================
// 1. POST /api/v1/auth/register
// ==========================================
router.post("/register", authLimiter, async (req, res) => {
  try {
    const rawFirstName = req.body.firstName || req.body.firstname;
    const rawLastName = req.body.lastName || req.body.lastname;
    const { email, password } = req.body;

    if (!email || !password || !rawFirstName || !rawLastName) {
      return res.status(400).json({ message: "All fields are required." });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanPassword = String(password).trim();
    const firstName = String(rawFirstName).trim();
    const lastName = String(rawLastName).trim();

    if (cleanPassword.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters long." });
    }

    let existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser && existingUser.isVerified) {
      return res.status(400).json({
        message: "User with this email already exists and is verified.",
      });
    }

    const hashedPassword = await bcrypt.hash(cleanPassword, 10);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    if (existingUser && !existingUser.isVerified) {
      existingUser.firstName = firstName;
      existingUser.lastName = lastName;
      existingUser.password = hashedPassword;
      existingUser.otp = otp;
      existingUser.otpExpires = otpExpires;
      await existingUser.save();
    } else {
      await User.create({
        firstName,
        lastName,
        email: cleanEmail,
        password: hashedPassword,
        isVerified: false,
        otp,
        otpExpires,
      });
    }

    // Trigger email via Brevo HTTP API
    sendOtpEmail(cleanEmail, firstName, otp, "🔐 Your Verification Code — UNI-TRACK");

    return res.status(200).json({
      message: "Registration successful! Please check your email for the verification code.",
    });
  } catch (err) {
    console.error("❌ Registration Endpoint Error:", err);
    return res.status(500).json({ message: "Internal server error during registration." });
  }
});

// ==========================================
// 2. POST /api/v1/auth/verify-otp
// ==========================================
router.post("/verify-otp", otpLimiter, async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required." });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanOtp = String(otp).trim();

    const user = await User.findOne({ email: cleanEmail });

    if (!user) {
      return res.status(404).json({ message: "Account not found." });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: "Account is already verified." });
    }

    if (!user.otp || !user.otpExpires) {
      return res.status(400).json({ message: "No active verification request found. Please request a new code." });
    }

    if (user.otpExpires.getTime() < Date.now()) {
      return res.status(400).json({ message: "OTP code has expired. Please request a new one." });
    }

    if (user.otp !== cleanOtp) {
      return res.status(400).json({ message: "Invalid verification code." });
    }

    // Mark user verified & invalidate OTP
    user.isVerified = true;
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();

    const secret = process.env.JWT_SECRET || "fallback_development_secret_key";
    const token = jwt.sign(
      { id: user._id, email: user.email },
      secret,
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
    console.error("❌ Verify OTP Endpoint Error:", err);
    return res.status(500).json({ message: "Internal server error during verification." });
  }
});

// ==========================================
// 3. POST /api/v1/auth/login
// ==========================================
router.post("/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanPassword = String(password).trim();

    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    if (!user.isVerified) {
      return res.status(403).json({
        message: "Account not verified. Please verify your account using the OTP sent to your email.",
      });
    }

    const isMatch = await bcrypt.compare(cleanPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    const secret = process.env.JWT_SECRET || "fallback_development_secret_key";
    const token = jwt.sign(
      { id: user._id, email: user.email },
      secret,
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
    console.error("❌ Login Endpoint Error:", err);
    return res.status(500).json({ message: "Internal server error during login." });
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

    await User.findByIdAndUpdate(req.user.id, { publicKey: String(publicKey).trim() });
    return res.status(200).json({ message: "Public key saved successfully." });
  } catch (err) {
    console.error("❌ Public Key Endpoint Error:", err);
    return res.status(500).json({ message: "Failed to store public key." });
  }
});

// ==========================================
// 5. POST /api/v1/auth/forgot-password
// ==========================================
router.post("/forgot-password", otpLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email is required." });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: cleanEmail });

    if (!user) {
      // Generic message to prevent email enumeration attacks
      return res.status(200).json({ message: "If an account exists, a reset code has been sent." });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    user.otp = otp;
    user.otpExpires = otpExpires;
    await user.save();

    // Trigger email via Brevo HTTP API
    sendOtpEmail(cleanEmail, user.firstName, otp, "🔒 Password Reset Code — UNI-TRACK");

    return res.status(200).json({ message: "Password reset code sent to your email." });
  } catch (err) {
    console.error("❌ Forgot Password Endpoint Error:", err);
    return res.status(500).json({ message: "Failed to process request." });
  }
});

// ==========================================
// 6. POST /api/v1/auth/reset-password
// ==========================================
router.post("/reset-password", authLimiter, async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ message: "Email, OTP, and new password are required." });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanOtp = String(otp).trim();
    const cleanPassword = String(newPassword).trim();

    if (cleanPassword.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters long." });
    }

    const user = await User.findOne({ email: cleanEmail });

    if (!user || !user.otp || !user.otpExpires) {
      return res.status(400).json({ message: "Invalid or expired reset code." });
    }

    if (user.otpExpires.getTime() < Date.now()) {
      return res.status(400).json({ message: "Reset code has expired." });
    }

    if (user.otp !== cleanOtp) {
      return res.status(400).json({ message: "Invalid reset code." });
    }

    user.password = await bcrypt.hash(cleanPassword, 10);
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();

    return res.status(200).json({ message: "Password reset successful! Please log in with your new password." });
  } catch (err) {
    console.error("❌ Reset Password Endpoint Error:", err);
    return res.status(500).json({ message: "Password reset failed." });
  }
});

module.exports = router;