// 2. Create Express Middleware to Gate Pro Routes (middleware/requirePro.js)
const requirePro = (req, res, next) => {
  if (!req.user || !req.user.isPro) {
    return res.status(403).json({ 
      error: "Subscription required", 
      message: "Please upgrade to Pro to access this feature." 
    });
  }
  next();
};

module.exports = requirePro;