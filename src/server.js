require("dotenv").config();
const dns = require("dns");
const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");
const crypto = require("crypto");

// Disable Mongoose command buffering globally to prevent hanging queries on DB connection issues
mongoose.set("bufferCommands", false);

const cors = require("cors");
const cron = require("node-cron");
const webpush = require("web-push");

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// 1. INITIALIZE EXPRESS APP
const app = express();

// 2. CONFIGURE TRUST PROXY BEFORE MIDDLEWARE
app.set("trust proxy", 1);

const User = require("./models/User");

// Safely resolve router imports (handles module.exports = router AND module.exports = { router })
const rawAuthRoutes = require("./routes/auth.routes");
const authRoutes = rawAuthRoutes.router || rawAuthRoutes.default || rawAuthRoutes;

const rawTrackerRoutes = require("./routes/trackerRoutes");
const trackerRoutes = rawTrackerRoutes.router || rawTrackerRoutes.default || rawTrackerRoutes;

// Safely resolve auth middleware
const rawVerifyToken = require("./middleware/auth");
const verifyToken = typeof rawVerifyToken === "function"
  ? rawVerifyToken
  : (rawVerifyToken.verifyToken || rawVerifyToken.default || rawVerifyToken);

// Internal Premium Gate Middleware with 30-Day Expiration Check
const requirePremium = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized: Please log in." });
  }

  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const now = new Date();
    const isExpired = user.subscriptionExpiresAt && new Date(user.subscriptionExpiresAt) <= now;

    if (isExpired && user.isPremium) {
      user.isPremiumRaw = false;
      user.subscriptionStatus = "expired";
      await user.save();
    }

    if (!user.isPremium) {
      return res.status(403).json({
        error: "Forbidden: Active 30-day premium subscription required.",
        code: "PREMIUM_REQUIRED",
      });
    }

    req.userObj = user;
    next();
  } catch (err) {
    console.error("Error checking premium status in middleware:", err);
    return res.status(500).json({ error: "Server error verifying subscription access." });
  }
};

// Fix DNS resolution for MongoDB Atlas SRV connection strings in restricted environments
if (
  process.env.MONGODB_URI &&
  process.env.MONGODB_URI.startsWith("mongodb+srv://")
) {
  try {
    dns.setServers(["8.8.8.8", "8.8.4.4"]);
  } catch (e) {
    console.warn("Could not set custom DNS servers:", e.message);
  }
}

// Restrict browser access to the official app and local development origins.
const allowedOrigins = new Set([
  "https://unitrack-app.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
  ...(process.env.FRONTEND_URL || "").split(",").map((value) => value.trim()).filter(Boolean),
]);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      return callback(new Error("Origin not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-cron-secret", "x-alatpay-signature", "If-Match"],
  })
);

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Global Request Logger
app.use((req, res, next) => {
  console.log(`📥 INCOMING REQUEST: ${req.method} ${req.originalUrl} from ${req.headers.origin || "unknown origin"}`);
  next();
});

// VAPID Configuration for Web Push Notifications
const publicVapidKey = process.env.VAPID_PUBLIC_KEY;
const privateVapidKey = process.env.VAPID_PRIVATE_KEY;

if (publicVapidKey && privateVapidKey) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:support@unitrack.com",
    publicVapidKey,
    privateVapidKey
  );
} else {
  console.warn("⚠️ [VAPID Warning] VAPID keys are missing from environment variables.");
}

// Push Subscription Schema & Model
const subscriptionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  subscription: { type: Object, required: true },
});
const PushSubscription =
  mongoose.models.PushSubscription || mongoose.model("PushSubscription", subscriptionSchema);

// Base & Health Routes
app.get("/", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "Universal Tracker API service is operational.",
    health: "/health",
  });
});

app.get("/health", (req, res) => res.status(200).send("OK"));

// ==========================================
// API ROUTES
// ==========================================
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/trackers", trackerRoutes);

// Premium Feature Route Example
app.get("/api/v1/premium-analytics", verifyToken, requirePremium, async (req, res) => {
  return res.status(200).json({
    success: true,
    data: "This analytics data is restricted to premium subscribers only.",
  });
});

// User Status Endpoint with Automatic 30-Day Expiration Handling
app.get(["/api/v1/user/status", "/api/user/status"], verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const now = new Date();
    let isPremium = Boolean(user.isPremium);

    // Enforce server-side 30-day expiration status check
    if (user.subscriptionExpiresAt && new Date(user.subscriptionExpiresAt) <= now) {
      if (isPremium) {
        user.isPremiumRaw = false;
        user.subscriptionStatus = "expired";
        await user.save();
        isPremium = false;
      }
    }

    return res.status(200).json({
      success: true,
      email: user.email,
      isPremium,
      subscribedAt: user.subscribedAt || null,
      expiresAt: user.subscriptionExpiresAt || null,
      subscriptionExpiresAt: user.subscriptionExpiresAt || null,
    });
  } catch (err) {
    console.error("Error fetching user status:", err);
    return res.status(500).json({ error: "Server error fetching user status." });
  }
});

// Web Push Notification Subscription Endpoint
app.post("/api/v1/subscribe", verifyToken, requirePremium, async (req, res) => {
  try {
    const subscription = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: "Invalid subscription payload." });
    }

    await PushSubscription.findOneAndUpdate(
      { userId: req.user.id },
      { subscription },
      { upsert: true, new: true }
    );
    return res.status(201).json({ message: "Subscribed to push notifications successfully." });
  } catch (err) {
    console.error("Failed to save push subscription:", err);
    return res.status(500).json({ error: "Failed to save push subscription." });
  }
});

// ==========================================
// ALATPAY INTEGRATION ROUTES
// ==========================================
// Payment verification is server-authoritative. Client-supplied references alone never grant PRO.
const ALATPAY_BASE_URL = (process.env.ALATPAY_BASE_URL || "https://alatpay.developer.azure-api.net/alatpay/api/v1").replace(/\/$/, "");
const ALATPAY_PRO_AMOUNT_NGN = Number(process.env.ALATPAY_PRO_AMOUNT_NGN || 5000);

const isAlatPayConfigured = () =>
  Boolean(process.env.ALATPAY_API_KEY && process.env.ALATPAY_BUSINESS_ID &&
    Number.isFinite(ALATPAY_PRO_AMOUNT_NGN) && ALATPAY_PRO_AMOUNT_NGN > 0);

const verifyAlatPayWithProvider = async (reference) => {
  if (!isAlatPayConfigured()) {
    const error = new Error("ALATPay is not configured on the server.");
    error.statusCode = 503;
    throw error;
  }

  const response = await axios.get(
    `${ALATPAY_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: { "Ocp-Apim-Subscription-Key": process.env.ALATPAY_API_KEY },
      timeout: 15000,
    }
  );

  const root = response.data || {};
  const transaction = root.data?.data || root.data || root;
  const status = transaction.status ?? root.status;
  const paidReference = transaction.reference || transaction.orderId ||
    transaction.paymentReference || transaction.paymentreference;

  const amount = Number(transaction.amount ?? transaction.amountPaid ?? transaction.totalAmount);
  const currency = String(transaction.currency || transaction.currencyCode || "").toUpperCase();

  const valid =
    (status === "Successful" || status === true) &&
    paidReference === reference &&
    amount === ALATPAY_PRO_AMOUNT_NGN &&
    currency === "NGN" &&
    transaction.businessId === process.env.ALATPAY_BUSINESS_ID;

  return { valid, transaction };
};

// Legacy generic endpoint is deliberately disabled: it previously upgraded accounts
// from a caller-provided reference without requiring a successful provider verification.
app.post("/api/v1/payments/verify", verifyToken, async (req, res) => {
  return res.status(410).json({
    success: false,
    code: "PAYMENT_VERIFICATION_MOVED",
    error: "Use the secure ALATPay verification flow.",
  });
});

// Initialize a fixed-price NGN checkout. Never trust the amount or reference from the browser.
app.post("/api/v1/alatpay/initialize", verifyToken, async (req, res) => {
  try {
    if (!isAlatPayConfigured()) {
      return res.status(503).json({ success: false, error: "Secure payment checkout is not configured." });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found." });

    const reference = `UT_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;
    const amount = ALATPAY_PRO_AMOUNT_NGN;
    const payload = {
      businessId: process.env.ALATPAY_BUSINESS_ID,
      amount,
      currency: "NGN",
      email: user.email,
      customerName: user.name || "UniTrack Customer",
      reference,
      callbackUrl: `${process.env.FRONTEND_URL || "https://unitrack-app.vercel.app"}/payment/callback`,
    };

    const response = await axios.post(`${ALATPAY_BASE_URL}/transaction/initialize`, payload, {
      headers: {
        "Ocp-Apim-Subscription-Key": process.env.ALATPAY_API_KEY,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    });

    if (response.data?.status === false) {
      return res.status(502).json({ success: false, error: "Payment provider rejected checkout initialization." });
    }

    await User.findByIdAndUpdate(user._id, {
      pendingPaymentReference: reference,
      pendingPaymentAmount: amount,
      pendingPaymentCurrency: "NGN",
      pendingPaymentCreatedAt: new Date(),
    });

    return res.status(200).json({ success: true, reference, amount, currency: "NGN", data: response.data });
  } catch (err) {
    console.error("ALATPay Initialization Error:", err.response?.status || err.message);
    return res.status(err.statusCode || 502).json({
      success: false,
      error: "Failed to initialize payment with ALATPay.",
    });
  }
});

// Verify the exact pending payment created for this signed-in user.
app.get("/api/v1/alatpay/verify/:reference", verifyToken, async (req, res) => {
  try {
    if (!isAlatPayConfigured()) {
      return res.status(503).json({ success: false, error: "Payment verification is not configured." });
    }

    const reference = String(req.params.reference || "");
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found." });

    const pendingAge = user.pendingPaymentCreatedAt
      ? Date.now() - new Date(user.pendingPaymentCreatedAt).getTime()
      : Infinity;

    if (!reference || reference !== user.pendingPaymentReference ||
        user.pendingPaymentAmount !== ALATPAY_PRO_AMOUNT_NGN ||
        user.pendingPaymentCurrency !== "NGN" || pendingAge < 0 || pendingAge > 30 * 60 * 1000) {
      return res.status(400).json({ success: false, message: "No matching active checkout was found." });
    }

    const result = await verifyAlatPayWithProvider(reference);
    if (!result.valid) {
      return res.status(400).json({ success: false, message: "Payment is not confirmed or does not match this checkout." });
    }

    const subscribedAt = new Date();
    const subscriptionExpiresAt = new Date(subscribedAt.getTime() + THIRTY_DAYS_MS);
    await User.findByIdAndUpdate(user._id, {
      isPremiumRaw: true,
      subscriptionStatus: "active",
      subscribedAt,
      subscriptionExpiresAt,
      pendingPaymentReference: null,
      pendingPaymentAmount: null,
      pendingPaymentCurrency: null,
      pendingPaymentCreatedAt: null,
    });

    return res.status(200).json({
      success: true,
      isPremium: true,
      message: "Payment verified successfully.",
      expiresAt: subscriptionExpiresAt,
      subscriptionExpiresAt,
    });
  } catch (err) {
    console.error("ALATPay Verification Error:", err.response?.status || err.message);
    return res.status(err.statusCode || 502).json({
      success: false,
      error: "Unable to verify payment with the provider. PRO access has not been activated.",
    });
  }
});

// ALATPay callbacks are accepted only when a webhook secret is configured and the
// matching pending transaction is independently verified against ALATPay.
app.post("/api/v1/alatpay/webhook", async (req, res) => {
  try {
    const webhookSecret = process.env.ALATPAY_WEBHOOK_SECRET;
    const incomingSignature = req.headers["x-alatpay-signature"];

    if (!webhookSecret) {
      return res.status(503).json({ error: "Webhook verification is not configured." });
    }
    if (typeof incomingSignature !== "string") {
      return res.status(401).json({ error: "Unauthorized." });
    }

    const expected = Buffer.from(webhookSecret);
    const received = Buffer.from(incomingSignature);
    if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
      return res.status(401).json({ error: "Unauthorized." });
    }

    const payload = req.body || {};
    const reference = payload.reference || payload.orderId || payload.paymentreference;
    if (!reference) return res.status(400).json({ error: "Transaction reference is required." });

    const user = await User.findOne({ pendingPaymentReference: reference });
    if (!user) return res.status(200).json({ status: "ACK" });

    const result = await verifyAlatPayWithProvider(reference);
    if (!result.valid) return res.status(200).json({ status: "PENDING" });

    const subscribedAt = new Date();
    const subscriptionExpiresAt = new Date(subscribedAt.getTime() + THIRTY_DAYS_MS);
    await User.findByIdAndUpdate(user._id, {
      isPremiumRaw: true,
      subscriptionStatus: "active",
      subscribedAt,
      subscriptionExpiresAt,
      pendingPaymentReference: null,
      pendingPaymentAmount: null,
      pendingPaymentCurrency: null,
      pendingPaymentCreatedAt: null,
    });

    return res.status(200).json({ status: "ACK" });
  } catch (err) {
    console.error("ALATPay Webhook Error:", err.response?.status || err.message);
    return res.status(500).json({ error: "Webhook processing error." });
  }
});

// ==========================================
// CRON JOBS
// ==========================================

// Daily Cron Job: Clean up & auto-downgrade expired PRO subscriptions at midnight
cron.schedule("0 0 * * *", async () => {
  try {
    const result = await User.updateMany(
      {
        isPremiumRaw: true,
        subscriptionExpiresAt: { $lte: new Date() },
      },
      {
        $set: { isPremiumRaw: false, subscriptionStatus: "expired" },
      }
    );

    if (result.modifiedCount > 0) {
      console.log(`🧹 Auto-expired ${result.modifiedCount} overdue PRO subscriptions.`);
    }
  } catch (err) {
    console.error("Error executing subscription expiration cleanup:", err.message);
  }
});

// Push Notification Reminder Function
const sendDailyNotifications = async () => {
  try {
    const subs = (await PushSubscription.find().populate("userId")).filter((sub) => sub.userId && sub.userId.isPremium);

    const payload = JSON.stringify({
      title: "Universal Tracker Reminder 🔔",
      body: "You haven't updated your daily trackers today! Log in to maintain your streak.",
    });

    for (const sub of subs) {
      try {
        await webpush.sendNotification(sub.subscription, payload);
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await PushSubscription.deleteOne({ _id: sub._id });
        } else {
          console.error("Error sending push notification:", err.message);
        }
      }
    }
    console.log(`✅ Push notifications sent to ${subs.length} subscribers.`);
  } catch (error) {
    console.error("Cron job execution error:", error);
  }
};

// Cron Job: Daily Push Notification Alert at 8:00 PM (WAT)
cron.schedule("0 20 * * *", sendDailyNotifications, {
  timezone: "Africa/Lagos",
});

// Manual Trigger Endpoint for External Cron Jobs
app.post("/api/v1/trigger-daily-push", async (req, res) => {
  const configuredSecret = process.env.CRON_SECRET;
  const suppliedSecret = req.headers["x-cron-secret"];

  // Fail closed: a missing secret must never turn this endpoint public.
  if (!configuredSecret || typeof suppliedSecret !== "string") {
    return res.status(503).json({ error: "Scheduled trigger is not configured." });
  }

  const expected = Buffer.from(configuredSecret);
  const received = Buffer.from(suppliedSecret);
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  await sendDailyNotifications();
  return res.status(200).json({ message: "Daily push notifications triggered manually." });
});

// 404 Handler for Unmatched Routes
app.use((req, res) => {
  console.log(`⚠️ UNMATCHED ROUTE HIT: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ message: `Route ${req.originalUrl} not found on this server.` });
});

// Database Connection & Server Startup
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGODB_URI;

if (!MONGO_URI) {
  console.error("FATAL ERROR: MONGODB_URI is not defined in environment variables.");
  process.exit(1);
}

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("✅ Connected to MongoDB successfully");
    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });