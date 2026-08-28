// 3. Backend Checkout Session Route (routes/subscription.js)
const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const authMiddleware = require('../middleware/auth'); // Your existing JWT auth middleware

router.post('/create-checkout-session', authMiddleware, async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer_email: req.user.email,
      line_items: [
        {
          price: process.env.STRIPE_PRO_PRICE_ID, // Price ID from your Stripe dashboard
          quantity: 1,
        },
      ],
      success_url: `${process.env.CLIENT_URL}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL}/dashboard`,
      metadata: {
        userId: req.user._id.toString(),
      },
    });

    res.json({ url: session.url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// 1. Add Stripe Customer Portal Route to backend (routes/subscription.js)
// This allows users to manage or cancel their subscriptions securely via Stripe's hosted portal.
const requireAuth = require("../middleware/auth"); // your existing auth middleware

router.post("/create-portal-session", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || !user.stripeCustomerId) {
      return res.status(400).json({ error: "No active billing profile found." });
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${process.env.CLIENT_URL}/homepage`,
    });

    res.json({ url: portalSession.url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
module.exports = router;