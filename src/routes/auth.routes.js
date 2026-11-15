const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const { BrevoClient } = require("@getbrevo/brevo");
const User = require("../models/User");
const { createOtp, hashOtp, verifyOtpHash, escapeHtml } = require("../utils/otp");

const middleware = require("../middleware/auth");
const verifyToken = typeof middleware === "function" ? middleware : middleware.verifyToken;
const router = express.Router();
const brevo = process.env.BREVO_API_KEY ? new BrevoClient({ apiKey: process.env.BREVO_API_KEY }) : null;
const SESSION_COOKIE = "unitrack_session";
const CSRF_COOKIE = "unitrack_csrf";
const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const secureCookies = process.env.NODE_ENV !== "development";

function setAuthCookies(res, token) {
  const cookieOptions = { path: "/", secure: secureCookies, sameSite: "lax", maxAge: SESSION_MAX_AGE };
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions, httpOnly: true });
  res.cookie(CSRF_COOKIE, crypto.randomBytes(32).toString("hex"), { ...cookieOptions, httpOnly: false });
}

function clearAuthCookies(res) {
  const cookieOptions = { path: "/", secure: secureCookies, sameSite: "lax" };
  res.clearCookie(SESSION_COOKIE, { ...cookieOptions, httpOnly: true });
  res.clearCookie(CSRF_COOKIE, { ...cookieOptions, httpOnly: false });
}


const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { message: "Too many attempts. Please wait 15 minutes and try again." } });
const otpLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false, message: { message: "Too many code attempts. Please wait before trying again." } });

const cleanEmail = (value) => String(value || "").trim().toLowerCase();
const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const validatePassword = (value) => typeof value === "string" && value.length >= 8 &&
  /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[@$!%*?&]/.test(value);
const getOtpSecret = () => process.env.OTP_HASH_SECRET || process.env.JWT_SECRET;

async function sendOtpEmail(toEmail, firstName, otp, subject) {
  if (!brevo || !process.env.SENDER_EMAIL) {
    const error = new Error("Email delivery is not configured.");
    error.statusCode = 503;
    throw error;
  }
  const emailParams = {
    subject,
    sender: { name: process.env.SENDER_NAME || "UNI-TRACK Security", email: process.env.SENDER_EMAIL },
    to: [{ email: toEmail, name: firstName }],
    htmlContent: `<div style="font-family:Arial,sans-serif;background:#f5f7fb;padding:32px 16px;color:#172033"><div style="max-width:480px;margin:auto;background:#fff;border:1px solid #e5eaf2;border-radius:16px;padding:32px"><h1 style="font-size:22px;margin:0 0 8px">UNI-TRACK</h1><p style="color:#64748b">Account security verification</p><p>Hello ${escapeHtml(firstName)},</p><p>Your verification code is below. It expires in 10 minutes.</p><div style="font-size:30px;font-weight:700;letter-spacing:8px;padding:18px;text-align:center;background:#f1f5f9;border-radius:10px">${otp}</div><p style="font-size:13px;color:#64748b">If you did not request this code, you can ignore this email.</p></div></div>`,
  };
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try { return await brevo.transactionalEmails.sendTransacEmail(emailParams); }
    catch (error) { lastError = error; if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1000)); }
  }
  throw lastError || new Error("Email delivery failed.");
}

function issueOtpFields(email, purpose, otp) {
  if (!getOtpSecret()) {
    const error = new Error("OTP signing is not configured.");
    error.statusCode = 503;
    throw error;
  }
  return { otp: undefined, otpHash: hashOtp(email, purpose, otp, getOtpSecret()), otpPurpose: purpose, otpAttempts: 0, otpExpires: new Date(Date.now() + 10 * 60 * 1000) };
}

function clearOtpFields(user) {
  user.otp = undefined; user.otpHash = undefined; user.otpPurpose = undefined;
  user.otpAttempts = 0; user.otpExpires = undefined;
}

async function consumeOtp(user, email, purpose, suppliedOtp) {
  if (!user.otpHash || user.otpPurpose !== purpose || !user.otpExpires ||
      user.otpExpires.getTime() <= Date.now() || user.otpAttempts >= 5) return false;
  if (!verifyOtpHash(email, purpose, suppliedOtp, user.otpHash, getOtpSecret())) {
    user.otpAttempts = (user.otpAttempts || 0) + 1;
    if (user.otpAttempts >= 5) clearOtpFields(user);
    await user.save();
    return false;
  }
  return true;
}

router.post("/register", authLimiter, async (req, res) => {
  try {
    const email = cleanEmail(req.body.email);
    const firstName = String(req.body.firstName || req.body.firstname || "").trim();
    const lastName = String(req.body.lastName || req.body.lastname || "").trim();
    const password = req.body.password;
    if (!validEmail(email) || !firstName || !lastName || !password) return res.status(400).json({ message: "Enter a valid email, first name, last name and password." });
    if (firstName.length > 80 || lastName.length > 80 || email.length > 254) return res.status(400).json({ message: "One or more fields are too long." });
    if (!validatePassword(password)) return res.status(400).json({ message: "Password must be at least 8 characters and include uppercase, lowercase, a number and a special character." });
    const existingUser = await User.findOne({ email });
    if (existingUser?.isVerified) return res.status(409).json({ message: "An account with this email already exists." });
    const otp = createOtp();
    const hashedPassword = await bcrypt.hash(password, 12);
    const otpFields = issueOtpFields(email, "verify", otp);
    let user = existingUser;
    if (user) {
      user.firstName = firstName; user.lastName = lastName; user.password = hashedPassword;
      Object.assign(user, otpFields); await user.save();
    } else {
      user = await User.create({ firstName, lastName, email, password: hashedPassword, isVerified: false, ...otpFields });
    }
    try { await sendOtpEmail(email, firstName, otp, "Your UNI-TRACK verification code"); }
    catch (mailError) {
      clearOtpFields(user); await user.save();
      console.error("Registration email delivery failed:", mailError.message);
      return res.status(mailError.statusCode || 503).json({ message: "We could not send the verification email. Please try again shortly." });
    }
    return res.status(200).json({ status: "success", message: "Verification code sent. It expires in 10 minutes." });
  } catch (error) {
    console.error("Registration failed:", error.message);
    return res.status(error.statusCode || 500).json({ message: "Registration could not be completed." });
  }
});

router.post("/verify-otp", otpLimiter, async (req, res) => {
  try {
    const email = cleanEmail(req.body.email);
    const otp = String(req.body.otp || "").trim();
    if (!validEmail(email) || !/^\d{6}$/.test(otp)) return res.status(400).json({ message: "Enter a valid email and six-digit code." });
    const user = await User.findOne({ email }).select("+otpHash +otpPurpose +otpAttempts +otpExpires +otp");
    if (!user) return res.status(400).json({ message: "Invalid or expired verification code." });
    if (user.isVerified) return res.status(409).json({ message: "This account is already verified." });
    if (!(await consumeOtp(user, email, "verify", otp))) return res.status(400).json({ message: "Invalid or expired verification code." });
    user.isVerified = true; clearOtpFields(user); await user.save();
    return res.status(200).json({ status: "success", message: "Email verified successfully!", user: { id: user._id, firstName: user.firstName, lastName: user.lastName, email: user.email } });
  } catch (error) {
    console.error("OTP verification failed:", error.message);
    return res.status(500).json({ message: "Verification could not be completed." });
  }
});

router.post("/login", authLimiter, async (req, res) => {
  try {
    const email = cleanEmail(req.body.email);
    const password = req.body.password;
    if (!validEmail(email) || typeof password !== "string" || !password) return res.status(400).json({ message: "Email and password are required." });
    if (!process.env.JWT_SECRET) return res.status(503).json({ message: "Authentication is temporarily unavailable." });
    const user = await User.findOne({ email });
    if (!user || !user.isVerified || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ message: "Invalid email or password, or account not verified." });
    const token = jwt.sign({ id: user._id, userId: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "7d", issuer: "unitrack-api", audience: "unitrack-app" });
    setAuthCookies(res, token);
    return res.status(200).json({ status: "success", message: "Login successful!", user: { id: user._id, firstName: user.firstName, lastName: user.lastName, email: user.email } });
  } catch (error) {
    console.error("Login failed:", error.message);
    return res.status(500).json({ message: "Login could not be completed." });
  }
});

router.post("/public-key", verifyToken, async (req, res) => {
  try {
    const publicKey = String(req.body.publicKey || "").trim();
    if (!publicKey || publicKey.length > 12000) return res.status(400).json({ message: "A valid public key is required." });
    await User.findByIdAndUpdate(req.user.id, { publicKey });
    return res.status(200).json({ message: "Public key saved successfully." });
  } catch (error) {
    console.error("Public-key update failed:", error.message);
    return res.status(500).json({ message: "Could not save the public key." });
  }
});

router.post("/forgot-password", otpLimiter, async (req, res) => {
  try {
    const email = cleanEmail(req.body.email);
    if (!validEmail(email)) return res.status(400).json({ message: "Enter a valid email address." });
    const user = await User.findOne({ email });
    const genericMessage = "If an account exists, a password reset code has been sent.";
    if (!user) return res.status(200).json({ message: genericMessage });
    const otp = createOtp();
    Object.assign(user, issueOtpFields(email, "reset", otp)); await user.save();
    try { await sendOtpEmail(email, user.firstName, otp, "Your UNI-TRACK password reset code"); }
    catch (mailError) {
      clearOtpFields(user); await user.save();
      console.error("Password-reset email delivery failed:", mailError.message);
      return res.status(503).json({ message: "We could not send the reset email. Please try again shortly." });
    }
    return res.status(200).json({ message: genericMessage });
  } catch (error) {
    console.error("Password-reset request failed:", error.message);
    return res.status(error.statusCode || 500).json({ message: "Could not process the password-reset request." });
  }
});

router.post("/reset-password", otpLimiter, async (req, res) => {
  try {
    const email = cleanEmail(req.body.email);
    const otp = String(req.body.otp || "").trim();
    const password = req.body.newPassword;
    if (!validEmail(email) || !/^\d{6}$/.test(otp) || typeof password !== "string") return res.status(400).json({ message: "Email, six-digit code and new password are required." });
    if (!validatePassword(password)) return res.status(400).json({ message: "Password must be at least 8 characters and include uppercase, lowercase, a number and a special character." });
    const user = await User.findOne({ email }).select("+otpHash +otpPurpose +otpAttempts +otpExpires +otp");
    if (!user || !(await consumeOtp(user, email, "reset", otp))) return res.status(400).json({ message: "Invalid or expired reset code." });
    user.password = await bcrypt.hash(password, 12); clearOtpFields(user); await user.save();
    return res.status(200).json({ message: "Password reset successfully. Please sign in again." });
  } catch (error) {
    console.error("Password reset failed:", error.message);
    return res.status(500).json({ message: "Password reset could not be completed." });
  }
});

router.post("/logout", (req, res) => {
  clearAuthCookies(res);
  return res.status(200).json({ message: "Signed out successfully." });
});

router.get("/me", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password -otp -otpHash -otpExpires -otpPurpose -otpAttempts");
    if (!user) return res.status(404).json({ message: "User not found." });
    return res.status(200).json({ id: user._id, email: user.email, firstName: user.firstName, lastName: user.lastName, isPro: user.isPremium });
  } catch (error) {
    console.error("Profile lookup failed:", error.message);
    return res.status(500).json({ message: "Could not load account details." });
  }
});

module.exports = router;
