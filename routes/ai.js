const express = require("express");
const { query } = require("../lib/db");
const { requireAuth } = require("../lib/middleware");
const { templateCancelEmail } = require("../lib/emailTemplate");

const router = express.Router();
router.use(requireAuth);

function formatCurrency(cents, currency) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(
    cents / 100
  );
}

// POST /api/ai/cancel-email { subscriptionId }
// Premium feature: draft a cancellation/negotiation email. Uses the Anthropic
// API when ANTHROPIC_API_KEY is set for a personalized draft; otherwise falls
// back to a solid local template so the feature never hard-fails.
router.post("/cancel-email", async (req, res) => {
  const userResult = await query("SELECT is_premium FROM users WHERE id = $1", [req.session.userId]);
  const user = userResult.rows[0];
  if (!user || !user.is_premium) {
    return res.status(402).json({
      error: "premium_required",
      message: "AI-drafted cancellation emails are a premium feature. Upgrade to unlock them.",
    });
  }

  const subResult = await query("SELECT * FROM subscriptions WHERE id = $1 AND user_id = $2", [
    req.body.subscriptionId,
    req.session.userId,
  ]);
  const sub = subResult.rows[0];
  if (!sub) return res.status(404).json({ error: "not_found" });

  const costDisplay = `${formatCurrency(sub.cost_cents, sub.currency)}/${sub.billing_cycle.replace("ly", "")}`;

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.json({ email: templateCancelEmail({ name: sub.name, costDisplay, billingCycle: sub.billing_cycle }), source: "template" });
  }

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 400,
        messages: [
          {
            role: "user",
            content: `Write a short, polite email canceling a "${sub.name}" subscription currently billed at ${costDisplay}. Ask them to confirm the cancellation and mention I'm open to a retention offer (discount or pause) instead of full cancellation if one is available. Keep it under 120 words. Output only the email body, no subject line, no preamble.`,
          },
        ],
      }),
    });
    if (!resp.ok) throw new Error(`Anthropic API returned ${resp.status}`);
    const data = await resp.json();
    const text = data?.content?.[0]?.text?.trim();
    if (!text) throw new Error("Empty response from Anthropic API");
    res.json({ email: text, source: "ai" });
  } catch (err) {
    // Never fail the feature outright — fall back to the template and say why.
    res.json({
      email: templateCancelEmail({ name: sub.name, costDisplay, billingCycle: sub.billing_cycle }),
      source: "template",
      note: `AI draft unavailable (${err.message}); showing template instead.`,
    });
  }
});

module.exports = router;
