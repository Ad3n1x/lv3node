const jwt = require("jsonwebtoken");

// 1. Authentication Middleware (Verifies JWT token)
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Access denied. No token provided." });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "your_jwt_secret_key");
    req.user = decoded; // Sets user details (id, isPremium, etc.) on request
    next();
  } catch (err) {
    return res.status(403).json({ message: "Invalid or expired token." });
  }
};

// 2. Premium Guard Middleware (Checks if user is premium)
const requirePremium = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized: Please log in first." });
  }

  // Checks both isPremium and isSubscribed flags from the token/user payload
  if (!req.user.isPremium && !req.user.isSubscribed) {
    return res.status(403).json({
      error: "Upgrade to Premium to access this feature.",
      code: "PREMIUM_REQUIRED",
    });
  }

  next();
};

// Export both middlewares as a CommonJS module
module.exports = {
  verifyToken,
  requirePremium,
};