const express = require("express");
const router = express.Router();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const verifyToken = require("../middleware/auth");
const User = require("../models/User");

// Create Stripe Checkout Session for Pro upgrade
router.post("/create-checkout-session", verifyToken, async (req, res) => {
  console.log("👉 [CHECKOUT] Route hit! Request user:", req.user);

  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    if (!userId) {
      console.log("❌ [CHECKOUT] User ID missing from token payload.");
      return res.status(400).json({ error: "User ID missing from token payload." });
    }

    console.log("👉 [CHECKOUT] Finding user in database...");
    // Add a 5-second timeout safeguard so Mongoose never hangs infinitely
    const user = await User.findById(userId).maxTimeMS(5000);
    
    if (!user) {
      console.log("❌ [CHECKOUT] User not found in database for ID:", userId);
      return res.status(404).json({ error: "User not found" });
    }
    console.log("✅ [CHECKOUT] User found:", user.email);

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      console.log("👉 [CHECKOUT] Creating Stripe customer...");
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: user._id.toString() },
      }, { timeout: 10000 }); // 10s timeout for Stripe

      customerId = customer.id;
      user.stripeCustomerId = customerId;
      await user.save();
      console.log("✅ [CHECKOUT] Stripe customer created:", customerId);
    }

    const priceId = process.env.STRIPE_PRO_PRICE_ID || process.env.STRIPE_PRICE_ID;
    if (!priceId) {
      console.error("❌ [CHECKOUT ERROR]: STRIPE_PRO_PRICE_ID is missing from environment variables!");
      return res.status(500).json({ error: "Server configuration error: Stripe price ID is not set." });
    }

    console.log("👉 [CHECKOUT] Creating Stripe checkout session...");
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${req.headers.origin || "http://localhost:5173"}/?upgrade=success`,
      cancel_url: `${req.headers.origin || "http://localhost:5173"}/?upgrade=cancelled`,
      metadata: { userId: user._id.toString() },
    }, { timeout: 10000 }); // 10s timeout for Stripe

    console.log("✅ [CHECKOUT] Session created successfully:", session.url);
    return res.json({ url: session.url });
  } catch (err) {
    console.error("❌ [CHECKOUT ERROR]:", err);
    return res.status(500).json({ error: err.message || "Failed to create checkout session" });
  }
});

// Create Stripe Billing Portal Session
router.post("/create-portal-session", verifyToken, async (req, res) => {
  console.log("👉 [PORTAL] Route hit!");
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const user = await User.findById(userId).maxTimeMS(5000);
    
    if (!user || !user.stripeCustomerId) {
      return res.status(400).json({ error: "No active billing profile found." });
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${req.headers.origin || "http://localhost:5173"}/`,
    }, { timeout: 10000 });

    return res.json({ url: portalSession.url });
  } catch (err) {
    console.error("❌ [PORTAL ERROR]:", err);
    return res.status(500).json({ error: err.message || "Failed to create billing portal session" });
  }
});

module.exports = router;