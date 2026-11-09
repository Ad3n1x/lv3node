const jwt = require("jsonwebtoken");
const User = require("../models/User");

// 1. Authentication Middleware (Verifies JWT token)
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Access denied. No token provided." });
  }

  const token = authHeader.split(" ")[1];
  if (!process.env.JWT_SECRET) {
    return res.status(503).json({ message: "Authentication is temporarily unavailable." });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Sets user details (id, isPremium, etc.) on request
    next();
  } catch (err) {
    return res.status(403).json({ message: "Invalid or expired token." });
  }
};

// 2. Premium Guard Middleware (always checks the database, never JWT flags)
const requirePremium = async (req, res, next) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: "Unauthorized: Please log in first." });
  }

  try {
    const user = await User.findById(req.user.id);
    if (!user || !user.isPremium) {
      return res.status(403).json({
        error: "Upgrade to Premium to access this feature.",
        code: "PREMIUM_REQUIRED",
      });
    }
    req.userObj = user;
    return next();
  } catch (error) {
    console.error("Premium access check failed:", error.message);
    return res.status(500).json({ error: "Unable to verify premium access." });
  }
};

// Export both middlewares as a CommonJS module
module.exports = {
  verifyToken,
  requirePremium,
};