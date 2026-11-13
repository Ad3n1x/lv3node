const jwt = require("jsonwebtoken");
const Session = require("../models/Session");

// Every newly issued UNI-TRACK token carries a revocable session identifier.
// Legacy tokens without jti remain accepted only until their existing expiry.
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Access denied. No token provided." });
  }

  if (!process.env.JWT_SECRET) {
    return res.status(503).json({ message: "Authentication is temporarily unavailable." });
  }

  try {
    const decoded = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
    if (decoded.jti) {
      const session = await Session.findOne({
        userId: decoded.id,
        jti: decoded.jti,
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      }).select("_id lastSeenAt");
      if (!session) return res.status(401).json({ message: "This session has expired or been revoked. Please sign in again." });

      // Avoid writing to MongoDB on every API request.
      if (!session.lastSeenAt || Date.now() - new Date(session.lastSeenAt).getTime() > 5 * 60 * 1000) {
        Session.updateOne({ _id: session._id }, { $set: { lastSeenAt: new Date() } }).catch((err) => {
          console.warn("Session activity timestamp update failed:", err.message);
        });
      }
    }
    req.user = decoded;
    return next();
  } catch (err) {
    if (err.name === "TokenExpiredError" || err.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "Invalid or expired token." });
    }
    console.error("Session verification failed:", err);
    return res.status(503).json({ message: "Unable to verify session right now." });
  }
};

module.exports = { verifyToken };
