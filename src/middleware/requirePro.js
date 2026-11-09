// Database-backed Pro access check. Never trust a client-controlled JWT flag.
const User = require("../models/User");

const requirePro = async (req, res, next) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({
      error: "Authentication required",
      message: "Please sign in to continue.",
    });
  }

  try {
    const user = await User.findById(req.user.id);
    if (!user || !user.isPremium) {
      return res.status(403).json({
        error: "Subscription required",
        code: "PREMIUM_REQUIRED",
        message: "An active Pro subscription is required for this feature.",
      });
    }

    req.userObj = user;
    return next();
  } catch (error) {
    console.error("Pro access check failed:", error.message);
    return res.status(500).json({ error: "Unable to verify subscription access." });
  }
};

module.exports = requirePro;
