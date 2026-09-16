const crypto = require("crypto");
const express = require("express");
const { query } = require("../lib/db");
const { requireAuth } = require("../lib/middleware");

const router = express.Router();

// GET /api/billing/status — is the current user premium?
router.get("/status", requireAuth, async (req, res, next) => {
  try {
    const result = await query("SELECT is_premium FROM users WHERE id = $1", [req.session.userId]);
    res.json({ is_premium: !!(result.rows[0] && result.rows[0].is_premium) });
  } catch (err) {
    next(err);
  }
});

// GET /api/billing/config — public info the frontend needs to render the
// support/upgrade panel. No secrets here, just the donation link (if set).
router.get("/config", (req, res) => {
  res.json({
    paypal_link: process.env.PAYPAL_LINK || null,
    redeem_enabled: !!process.env.UNLOCK_CODE,
  });
});

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  // Buffers must be equal length for timingSafeEqual, so pad the shorter
  // one — a length mismatch alone should never short-circuit the compare.
  const len = Math.max(bufA.length, bufB.length, 1);
  const padA = Buffer.alloc(len);
  const padB = Buffer.alloc(len);
  bufA.copy(padA);
  bufB.copy(padB);
  return bufA.length === bufB.length && crypto.timingSafeEqual(padA, padB);
}

// POST /api/billing/redeem { code } — manual "buy me a coffee" unlock.
// There's no automated payment verification: the operator sets UNLOCK_CODE
// in the environment, hands it out by hand to anyone who sends a coffee via
// PayPal, and this just checks what the user typed against it.
router.post("/redeem", requireAuth, async (req, res, next) => {
  try {
    const configured = process.env.UNLOCK_CODE;
    if (!configured) {
      return res.status(503).json({
        error: "redeem_not_configured",
        message: "Unlock codes aren't set up yet. Set UNLOCK_CODE in the environment to enable this.",
      });
    }
    const code = (req.body && req.body.code ? String(req.body.code) : "").trim();
    if (!code || !timingSafeEqual(code, configured.trim())) {
      return res.status(400).json({ error: "invalid_code", message: "That code doesn't look right." });
    }
    await query("UPDATE users SET is_premium = TRUE WHERE id = $1", [req.session.userId]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
