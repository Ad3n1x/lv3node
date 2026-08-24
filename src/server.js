require("dotenv").config();
const dns = require("dns");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const authRoutes = require("./routes/auth.routes");
const trackerRoutes = require("./routes/trackerRoutes");

// Fallback to Google DNS only if resolving SRV records fails on cloud providers
if (process.env.MONGODB_URI && process.env.MONGODB_URI.startsWith("mongodb+srv://")) {
  try {
    dns.setServers(["8.8.8.8", "8.8.4.4"]);
  } catch (e) {
    console.warn("Could not set custom DNS servers:", e.message);
  }
}

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Base Health Check
app.get("/health", (req, res) => res.status(200).send("OK"));

// API Routes (Prefixing all routes under /api/v1)
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/trackers", trackerRoutes); 
// Note: If trackerRoutes already contains "/trackers" inside it, use: app.use("/api/v1", trackerRoutes);

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGODB_URI;

if (!MONGO_URI) {
  console.error("FATAL ERROR: MONGODB_URI is not defined in environment variables.");
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