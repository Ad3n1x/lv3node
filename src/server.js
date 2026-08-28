require("dotenv").config();
const dns = require("dns");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const cron = require("node-cron");
const webpush = require("web-push");

// 1. INITIALIZE EXPRESS APP
const app = express();

// 2. CONFIGURE TRUST PROXY
app.set("trust proxy", 1);

const User = require("./models/User");
const authRoutes = require("./routes/auth.routes");
const trackerRoutes = require("./routes/trackerRoutes");
const verifyToken = require("./middleware/auth");

// Fix DNS resolution for MongoDB Atlas SRV connection strings
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

// Global CORS Configuration
const corsOptions = {
  origin: true, // Dynamically allow request origins
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));

// Explicit preflight handling across all endpoints
app.options("*", cors(corsOptions));

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
app.use("/api/auth", authRoutes); // Fallback alias

// Mount tracker routes on all paths queried by frontend
app.use("/api/v1/trackers", trackerRoutes);
app.use("/api/trackers", trackerRoutes);     // Legacy fallback alias
app.use("/api/v1/tracker", trackerRoutes);    // Singular fallback alias
app.use("/api/tracker", trackerRoutes);       // Singular fallback alias

// Endpoint for Web Push Notification Subscriptions
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

// Catch-all Unmatched Route Logger (404 Handler)
app.use((req, res) => {
  console.log(`⚠️ UNMATCHED ROUTE HIT: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ message: `Route ${req.originalUrl} not found on this server.` });
});

// Cron Job: Daily Push Notification Alert at 8:00 PM
cron.schedule("0 20 * * *", async () => {
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
  } catch (error) {
    console.error("Cron job execution error:", error);
  }
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