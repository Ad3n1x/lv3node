require("dotenv").config();
const dns = require("dns");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const cron = require("node-cron");
const webpush = require("web-push");

const User = require("./models/User"); // 👈 Required for updating public keys
const authRoutes = require("./routes/auth.routes");
const trackerRoutes = require("./routes/trackerRoutes");
const verifyToken = require("./middleware/auth");

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

const app = express();

app.use(cors());
app.use(express.json());

// ✨ VAPID Configuration for Web Push
const publicVapidKey = process.env.VAPID_PUBLIC_KEY || "YOUR_PUBLIC_VAPID_KEY";
const privateVapidKey =
  process.env.VAPID_PRIVATE_KEY || "YOUR_PRIVATE_VAPID_KEY";

webpush.setVapidDetails(
  "mailto:support@unitrack.com",
  publicVapidKey,
  privateVapidKey
);

// ✨ Push Subscription Schema & Model
const subscriptionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  subscription: Object,
});
const PushSubscription = mongoose.model("PushSubscription", subscriptionSchema);

// Base & Health Routes
app.get("/", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "API service is running.",
    health: "/health",
  });
});

app.get("/health", (req, res) => res.status(200).send("OK"));

// API Routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/trackers", trackerRoutes);

// ✨ Endpoint to save or update the authenticated user's E2EE public key
app.post("/api/v1/users/public-key", verifyToken, async (req, res) => {
  try {
    const { publicKey } = req.body;
    await User.findByIdAndUpdate(req.user.id, { publicKey });
    res.status(200).json({ message: "Public key synchronized successfully" });
  } catch (err) {
    console.error("Failed to save public key:", err);
    res.status(500).json({ error: "Failed to save public key" });
  }
});

// ✨ Endpoint to save browser push subscription
app.post("/api/v1/subscribe", verifyToken, async (req, res) => {
  try {
    const subscription = req.body;
    await PushSubscription.findOneAndUpdate(
      { userId: req.user.id },
      { subscription },
      { upsert: true, new: true },
    );
    res.status(201).json({ message: "Subscribed successfully" });
  } catch (err) {
    console.error("Failed to save subscription:", err);
    res.status(500).json({ error: "Failed to save subscription" });
  }
});

// ✨ Cron job running daily at 8:00 PM to dispatch push alerts even if browser is closed
cron.schedule("0 20 * * *", async () => {
  try {
    const subs = await PushSubscription.find().populate("userId");

    const payload = JSON.stringify({
      title: "Uni-Track Reminder 🔔",
      body: "You haven't updated your trackers today! Keep your streak alive.",
    });

    for (const sub of subs) {
      await webpush.sendNotification(sub.subscription, payload).catch((err) => {
        console.error("Error sending push notification:", err);
      });
    }
  } catch (error) {
    console.error("Cron job error:", error);
  }
});

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGODB_URI;

if (!MONGO_URI) {
  console.error(
    "FATAL ERROR: MONGODB_URI is not defined in environment variables.",
  );
  process.exit(1);
}

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("Connected to MongoDB successfully");
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
  });