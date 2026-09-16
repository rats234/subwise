const express = require("express");
const { query } = require("../lib/db");
const { requireAuth } = require("../lib/middleware");

const router = express.Router();

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  const Stripe = require("stripe");
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

// GET /api/billing/status — is the current user premium?
router.get("/status", requireAuth, async (req, res, next) => {
  try {
    const result = await query("SELECT is_premium FROM users WHERE id = $1", [req.session.userId]);
    res.json({ is_premium: !!(result.rows[0] && result.rows[0].is_premium) });
  } catch (err) {
    next(err);
  }
});

// POST /api/billing/checkout — create a Stripe Checkout session for premium upgrade.
router.post("/checkout", requireAuth, async (req, res) => {
  const stripe = getStripe();
  if (!stripe || !process.env.STRIPE_PRICE_ID) {
    return res.status(503).json({
      error: "billing_not_configured",
      message:
        "Payments aren't set up yet. Add STRIPE_SECRET_KEY and STRIPE_PRICE_ID to your environment (see README) to accept real upgrades.",
    });
  }
  try {
    const result = await query("SELECT * FROM users WHERE id = $1", [req.session.userId]);
    const user = result.rows[0];
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      customer_email: user.email,
      client_reference_id: String(user.id),
      success_url: `${req.protocol}://${req.get("host")}/?upgraded=1`,
      cancel_url: `${req.protocol}://${req.get("host")}/?upgraded=0`,
    });
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: "stripe_error", message: err.message });
  }
});

// NOTE: the Stripe webhook handler lives in server.js, not here — it needs
// the raw request body (for signature verification) mounted before the
// global express.json() parser runs, which only works cleanly at the
// top-level app, not inside this sub-router.

module.exports = router;
