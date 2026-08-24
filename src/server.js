require("dotenv").config();
const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4"])
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const authRoutes = require("./routes/auth.routes");
const trackerRoutes = require("./routes/trackerRoutes");

const app = express();
app.use(cors());
app.use(express.json());

// API Routes
app.use("/api/v1", authRoutes);
app.use("/api", trackerRoutes);

const PORT = process.env.PORT || 5000;
// Added IPv4 local fallback to prevent the 'undefined' URI error and IPv6 connection issues
const MONGO_URI = process.env.MONGODB_URI;

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("Connected to MongoDB");
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => console.error("MongoDB connection error:", err));