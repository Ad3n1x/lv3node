const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const verifyToken = require("../middleware/auth");
const User = require("../models/User");

// Initialize Paystack Subscription Checkout Session
router.post("/create-checkout-session", verifyToken, async (req, res) => {
  console.log("👉 [PAYSTACK CHECKOUT] Route hit! Request user:", req.user);

  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    if (!userId) {
      return res.status(400).json({ error: "User ID missing from token payload." });
    }

    const user = await User.findById(userId).maxTimeMS(5000);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;
    const planCode = process.env.PAYSTACK_PLAN_CODE;

    if (!paystackSecretKey || !planCode) {
      console.error("❌ [PAYSTACK ERROR]: Missing PAYSTACK_SECRET_KEY or PAYSTACK_PLAN_CODE");
      return res.status(500).json({ error: "Server configuration error: Paystack keys are not set." });
    }

    console.log("👉 [PAYSTACK CHECKOUT] Initializing transaction with Paystack API...");

    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackSecretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: user.email,
        plan: planCode,
        callback_url: `${req.headers.origin || "http://localhost:5173"}/?upgrade=success`,
        metadata: {
          userId: user._id.toString(),
        },
      }),
    });

    const data = await response.json();

    if (!data.status) {
      console.error("❌ [PAYSTACK API ERROR]:", data.message);
      return res.status(400).json({ error: data.message || "Failed to initialize Paystack checkout" });
    }

    console.log("✅ [PAYSTACK CHECKOUT] Authorization URL generated successfully.");
    return res.json({ url: data.data.authorization_url });
  } catch (err) {
    console.error("❌ [CHECKOUT ERROR]:", err);
    return res.status(500).json({ error: err.message || "Failed to create checkout session" });
  }
});

// Paystack Webhook Handler with Signature Verification
router.post("/webhook", express.json(), async (req, res) => {
  const hash = crypto
    .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY)
    .update(JSON.stringify(req.body))
    .digest("hex");

  if (hash !== req.headers["x-paystack-signature"]) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  // Acknowledge receipt immediately to Paystack
  res.sendStatus(200);

  const event = req.body;
  if (event.event === "charge.success" || event.event === "subscription.create") {
    const subscriptionData = event.data;
    const userId = subscriptionData.metadata?.userId;

    if (userId) {
      try {
        await User.findByIdAndUpdate(userId, {
          isPro: true,
          subscriptionId: subscriptionData.subscription_code || subscriptionData.reference,
        });
        console.log(`✅ User ${userId} upgraded to Pro via Paystack Webhook.`);
      } catch (err) {
        console.error("Error updating user subscription status in DB:", err);
      }
    }
  }
});

module.exports = router;