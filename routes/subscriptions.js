const express = require("express");
const { query } = require("../lib/db");
const { requireAuth, FREE_SUB_LIMIT } = require("../lib/middleware");

const router = express.Router();
router.use(requireAuth);

const CYCLES = new Set(["monthly", "yearly", "weekly"]);
const STATUSES = new Set(["active", "flagged", "cancelled"]);

function monthlyEquivalentCents(costCents, cycle) {
  if (cycle === "yearly") return costCents / 12;
  if (cycle === "weekly") return (costCents * 52) / 12;
  return costCents; // monthly
}

async function isPremium(userId) {
  const result = await query("SELECT is_premium FROM users WHERE id = $1", [userId]);
  return !!(result.rows[0] && result.rows[0].is_premium);
}

router.get("/", async (req, res, next) => {
  try {
    const result = await query(
      "SELECT * FROM subscriptions WHERE user_id = $1 AND status != 'cancelled' ORDER BY next_renewal_date ASC",
      [req.session.userId]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const { name, cost, currency, billing_cycle, category, next_renewal_date, notes } = req.body || {};

    if (!(await isPremium(req.session.userId))) {
      const countResult = await query(
        "SELECT COUNT(*) AS n FROM subscriptions WHERE user_id = $1 AND status != 'cancelled'",
        [req.session.userId]
      );
      if (Number(countResult.rows[0].n) >= FREE_SUB_LIMIT) {
        return res.status(402).json({
          error: "limit_reached",
          message: `Free plan tracks up to ${FREE_SUB_LIMIT} subscriptions. Upgrade to track more.`,
        });
      }
    }

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "invalid_name", message: "Subscription name is required." });
    }
    const costCents = Math.round(Number(cost) * 100);
    if (!Number.isFinite(costCents) || costCents < 0) {
      return res.status(400).json({ error: "invalid_cost", message: "Cost must be a positive number." });
    }
    const cycle = CYCLES.has(billing_cycle) ? billing_cycle : "monthly";
    if (!next_renewal_date) {
      return res.status(400).json({ error: "invalid_date", message: "Next renewal date is required." });
    }

    const inserted = await query(
      `INSERT INTO subscriptions (user_id, name, cost_cents, currency, billing_cycle, category, next_renewal_date, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        req.session.userId,
        name.trim(),
        costCents,
        (currency || "USD").toUpperCase(),
        cycle,
        (category || "other").toLowerCase(),
        next_renewal_date,
        notes || "",
      ]
    );

    res.status(201).json(inserted.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    const existing = await query("SELECT * FROM subscriptions WHERE id = $1 AND user_id = $2", [
      req.params.id,
      req.session.userId,
    ]);
    const sub = existing.rows[0];
    if (!sub) return res.status(404).json({ error: "not_found" });

    const { name, cost, currency, billing_cycle, category, next_renewal_date, notes, status } = req.body || {};

    const newCostCents = cost !== undefined ? Math.round(Number(cost) * 100) : sub.cost_cents;
    if (!Number.isFinite(newCostCents) || newCostCents < 0) {
      return res.status(400).json({ error: "invalid_cost" });
    }

    if (newCostCents !== sub.cost_cents) {
      await query(
        "INSERT INTO price_history (subscription_id, old_cost_cents, new_cost_cents) VALUES ($1, $2, $3)",
        [sub.id, sub.cost_cents, newCostCents]
      );
    }

    const updated = await query(
      `UPDATE subscriptions SET
         name = $1, cost_cents = $2, currency = $3, billing_cycle = $4, category = $5,
         next_renewal_date = $6, notes = $7, status = $8, updated_at = now()
       WHERE id = $9
       RETURNING *`,
      [
        name !== undefined ? String(name).trim() : sub.name,
        newCostCents,
        currency !== undefined ? String(currency).toUpperCase() : sub.currency,
        CYCLES.has(billing_cycle) ? billing_cycle : sub.billing_cycle,
        category !== undefined ? String(category).toLowerCase() : sub.category,
        next_renewal_date !== undefined ? next_renewal_date : sub.next_renewal_date,
        notes !== undefined ? notes : sub.notes,
        STATUSES.has(status) ? status : sub.status,
        sub.id,
      ]
    );

    res.json(updated.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.patch("/:id/flag", async (req, res, next) => {
  try {
    const existing = await query("SELECT * FROM subscriptions WHERE id = $1 AND user_id = $2", [
      req.params.id,
      req.session.userId,
    ]);
    const sub = existing.rows[0];
    if (!sub) return res.status(404).json({ error: "not_found" });
    const newStatus = sub.status === "flagged" ? "active" : "flagged";
    const updated = await query(
      "UPDATE subscriptions SET status = $1, updated_at = now() WHERE id = $2 RETURNING *",
      [newStatus, sub.id]
    );
    res.json(updated.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const result = await query("DELETE FROM subscriptions WHERE id = $1 AND user_id = $2 RETURNING id", [
      req.params.id,
      req.session.userId,
    ]);
    if (!result.rows.length) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get("/summary", async (req, res, next) => {
  try {
    const result = await query(
      "SELECT * FROM subscriptions WHERE user_id = $1 AND status != 'cancelled'",
      [req.session.userId]
    );
    const subs = result.rows;

    let monthlyCents = 0;
    const byCategory = {};
    const today = new Date();
    const in30 = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    const upcoming = [];
    let flaggedMonthlySavingsCents = 0;

    for (const s of subs) {
      const m = monthlyEquivalentCents(s.cost_cents, s.billing_cycle);
      monthlyCents += m;
      byCategory[s.category] = (byCategory[s.category] || 0) + m;

      const renewDate = new Date(s.next_renewal_date);
      if (renewDate >= today && renewDate <= in30) {
        upcoming.push({
          id: s.id,
          name: s.name,
          next_renewal_date: s.next_renewal_date,
          cost_cents: s.cost_cents,
          currency: s.currency,
          days_away: Math.ceil((renewDate - today) / (24 * 60 * 60 * 1000)),
        });
      }

      if (s.status === "flagged") flaggedMonthlySavingsCents += m;
    }

    upcoming.sort((a, b) => a.days_away - b.days_away);

    res.json({
      monthly_cents: Math.round(monthlyCents),
      yearly_cents: Math.round(monthlyCents * 12),
      by_category_cents: Object.fromEntries(
        Object.entries(byCategory).map(([k, v]) => [k, Math.round(v)])
      ),
      upcoming_renewals: upcoming,
      flagged_count: subs.filter((s) => s.status === "flagged").length,
      flagged_monthly_savings_cents: Math.round(flaggedMonthlySavingsCents),
      total_tracked: subs.length,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
