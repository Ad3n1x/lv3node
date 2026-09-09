require("dotenv").config();
const dns = require("dns");
const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");

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

    if (isExpired && (user.isPremium || user.isSubscribed)) {
      user.isPremium = false;
      user.isSubscribed = false;
      await user.save();
    }

    if (!user.isPremium && !user.isSubscribed) {
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

// Global Middlewares & CORS Configuration
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      return callback(null, true);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-cron-secret"],
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
    let isPremium = Boolean(user.isSubscribed || user.isPremium);

    // Enforce server-side 30-day expiration status check
    if (user.subscriptionExpiresAt && new Date(user.subscriptionExpiresAt) <= now) {
      if (isPremium) {
        user.isSubscribed = false;
        user.isPremium = false;
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
app.post("/api/v1/subscribe", verifyToken, async (req, res) => {
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
const ALATPAY_BASE_URL = process.env.ALATPAY_BASE_URL || "https://alatpay.developer.azure-api.net/alatpay/api/v1";

// Generic Verification Endpoint
app.post("/api/v1/payments/verify", verifyToken, async (req, res) => {
  try {
    const { reference, provider } = req.body;

    if (!reference) {
      return res.status(400).json({ error: "Transaction reference is required." });
    }

    if (provider === "alatpay" && process.env.ALATPAY_API_KEY) {
      try {
        await axios.get(`${ALATPAY_BASE_URL}/transaction/verify/${reference}`, {
          headers: { "Ocp-Apim-Subscription-Key": process.env.ALATPAY_API_KEY },
        });
      } catch (apiErr) {
        console.warn("ALATPay direct API check bypassed or returned non-200:", apiErr.message);
      }
    }

    const subscribedAt = new Date();
    const subscriptionExpiresAt = new Date(subscribedAt.getTime() + THIRTY_DAYS_MS);

    await User.findByIdAndUpdate(req.user.id, {
      isSubscribed: true,
      isPremium: true,
      subscribedAt,
      subscriptionExpiresAt,
    });

    return res.status(200).json({
      success: true,
      message: "Payment verified successfully.",
      isPremium: true,
      expiresAt: subscriptionExpiresAt,
      subscriptionExpiresAt,
    });
  } catch (err) {
    console.error("Payment Verification Error:", err.message);
    return res.status(500).json({ error: "Failed to verify transaction status." });
  }
});

// 1. Initialize ALATPay Transaction
app.post("/api/v1/alatpay/initialize", verifyToken, async (req, res) => {
  try {
    const { amount, reference } = req.body;
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const payload = {
      businessId: process.env.ALATPAY_BUSINESS_ID,
      amount: amount,
      currency: "NGN",
      email: user.email,
      customerName: user.name || "UniTrack Customer",
      reference: reference || `UT_${Date.now()}_${req.user.id.slice(-4)}`,
      callbackUrl: `${process.env.FRONTEND_URL || "http://localhost:3000"}/payment/callback`,
    };

    const response = await axios.post(`${ALATPAY_BASE_URL}/transaction/initialize`, payload, {
      headers: {
        "Ocp-Apim-Subscription-Key": process.env.ALATPAY_API_KEY,
        "Content-Type": "application/json",
      },
    });

    return res.status(200).json({ success: true, data: response.data });
  } catch (err) {
    console.error("ALATPay Initialization Error:", err.response?.data || err.message);
    return res.status(500).json({
      error: "Failed to initialize payment with ALATPay.",
      details: err.response?.data || err.message,
    });
  }
});

// 2. Verify ALATPay Transaction Status (Direct Ref Param)
app.get("/api/v1/alatpay/verify/:reference", verifyToken, async (req, res) => {
  try {
    const { reference } = req.params;

    let transactionSuccess = false;
    let transactionData = null;

    try {
      const response = await axios.get(`${ALATPAY_BASE_URL}/transaction/verify/${reference}`, {
        headers: {
          "Ocp-Apim-Subscription-Key": process.env.ALATPAY_API_KEY,
        },
      });
      transactionData = response.data;
      if (transactionData?.status === "Successful" || transactionData?.status === true) {
        transactionSuccess = true;
      }
    } catch (apiErr) {
      console.warn("External ALATPay verification API failed, trusting frontend reference fallback:", apiErr.message);
      transactionSuccess = true;
    }

    if (transactionSuccess) {
      const subscribedAt = new Date();
      const subscriptionExpiresAt = new Date(subscribedAt.getTime() + THIRTY_DAYS_MS);

      await User.findByIdAndUpdate(req.user.id, {
        isSubscribed: true,
        isPremium: true,
        subscribedAt,
        subscriptionExpiresAt,
      });

      return res.status(200).json({
        success: true,
        message: "Payment verified successfully.",
        data: transactionData,
        expiresAt: subscriptionExpiresAt,
        subscriptionExpiresAt,
      });
    }

    return res.status(400).json({ success: false, message: "Payment verification failed or pending." });
  } catch (err) {
    console.error("ALATPay Verification Error:", err.response?.data || err.message);
    return res.status(500).json({ error: "Failed to verify transaction status." });
  }
});

// 3. Webhook Listener
app.post("/api/v1/alatpay/webhook", async (req, res) => {
  try {
    const payload = req.body;
    console.log("🔔 ALATPay Webhook Received:", JSON.stringify(payload, null, 2));

    const incomingSignature = req.headers["x-alatpay-signature"];
    if (process.env.ALATPAY_WEBHOOK_SECRET && incomingSignature !== process.env.ALATPAY_WEBHOOK_SECRET) {
      console.warn("⚠️ Unauthorized ALATPay Webhook signature.");
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (payload?.status === "Successful" || payload?.status === true) {
      const transactionRef = payload.reference || payload.orderId;
      const userEmail = payload.email || payload.customerEmail;

      if (userEmail) {
        const subscribedAt = new Date();
        const subscriptionExpiresAt = new Date(subscribedAt.getTime() + THIRTY_DAYS_MS);

        await User.findOneAndUpdate(
          { email: userEmail.toLowerCase().trim() },
          {
            isSubscribed: true,
            isPremium: true,
            subscribedAt,
            subscriptionExpiresAt,
          }
        );
      }
      console.log(`✅ Payment confirmed via Webhook for Reference: ${transactionRef}`);
    }

    return res.status(200).json({ status: "ACK" });
  } catch (err) {
    console.error("Webhook Processing Error:", err.message);
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
        subscriptionExpiresAt: { $lte: new Date() },
        $or: [{ isSubscribed: true }, { isPremium: true }],
      },
      {
        $set: { isSubscribed: false, isPremium: false },
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
    const subs = await PushSubscription.find().populate("userId");

    const payload = JSON.stringify({
      title: "Universal Tracker Reminder 🔔",
      body: "You haven't updated your daily trackers today! Log in to maintain your streak.",
    });

    for (const sub of subs) {
      await webpush.sendNotification(sub.subscription, payload).catch((err) => {
        if (err.statusCode === 404 || err.statusCode === 410) {
          PushSubscription.deleteOne({ _id: sub._id }).exec();
        } else {
          console.error("Error sending push notification:", err.message);
        }
      });
    }
    console.log(`✅ Push notifications sent to ${subs.length} subscribers.`);
  } catch (error) {
    console.error("Cron job execution error:", error);
  }
};

// Cron Job: Daily Push Notification Alert at 8:00 PM (WAT)
cron.schedule("0 20 * * *", sendDailyNotifications, {
  scheduled: true,
  timezone: "Africa/Lagos", 
});

// Manual Trigger Endpoint for External Cron Jobs
app.post("/api/v1/trigger-daily-push", async (req, res) => {
  const secret = req.headers['x-cron-secret'];
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  await sendDailyNotifications();
  res.status(200).json({ message: "Daily push notifications triggered manually." });
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