# SubWise

A subscription tracker: log every recurring bill, see total monthly/yearly spend,
get warned before renewals hit, flag subscriptions to cancel, and (on the
premium tier) get an AI-drafted cancellation/negotiation email. Free tier
caps at 5 tracked subscriptions; premium is unlimited + AI emails, sold via
Stripe Checkout.

This is a real, working MVP — auth, database, billing, and the dashboard all
function today. What's missing before you can charge strangers real money is
listed under "Before you launch" below.

## Why this idea

Recurring subscriptions are a near-universal pain point — the average person
loses track of several small charges a month, and "which of these should I
cancel" is a recurring question with no default home. That combination
(broad audience, genuine recurring utility, obvious freemium upsell) is what
makes this a reasonable bet for something people keep coming back to, versus
a one-off tool.

## Local setup

```bash
npm install
cp .env.example .env   # then edit SESSION_SECRET at minimum
npm start
```

Visit `http://localhost:3000`, sign up, and start adding subscriptions. With
no Stripe/Anthropic keys set, everything works except real payments (you'll
get a clear "not configured" message) and AI email drafts fall back to a
solid template.

Data lives in `data.sqlite` in the project root — delete it to reset.

## Deployment (recommended path, ~$0 to start)

SQLite + a single Node process is enough for hundreds of early users and
keeps hosting free or near-free:

1. **Render** or **Railway** (both have free/low tiers with a persistent
   disk, which SQLite needs — Vercel/Netlify's serverless functions do NOT
   keep a disk between requests, so avoid those for this app as-is).
   - Push this folder to a GitHub repo, connect it, set the start command to
     `node server.js`, and add the env vars from `.env.example`.
   - Mount a persistent disk at the project root (or set `DB_PATH` to point
     at the mounted volume) so `data.sqlite` survives restarts/deploys.
2. **Domain** (optional at first): a `.com` is ~$12/year. Not needed to
   validate demand — ship on the free `*.onrender.com`/`*.up.railway.app`
   URL first, buy a domain once people are actually using it.
3. **Stripe**: free to set up, no monthly fee — they take ~2.9% + $0.30 per
   transaction. Start in **test mode**, confirm the checkout → webhook →
   premium-unlock flow works end to end with a test card
   (`4242 4242 4242 4242`), then flip to live keys.
4. **Anthropic API key** (optional): the AI email feature costs fractions of
   a cent per draft on Haiku. Skip it entirely at first — the template
   fallback is genuinely fine — and add it once premium users exist.

**Budget recommendation:** launch on $0 (free hosting tier + Stripe's
pay-as-you-go pricing, no upfront cost). Spend your first real dollars on a
domain (~$12/yr) once you have users, and only move off SQLite to a hosted
Postgres (Supabase/Neon free tiers exist) if you outgrow a single server —
not before.

## Before you launch to real strangers

This MVP is honest about what it is: functional, not yet production-hardened.
Do these before taking real payments from people who aren't you:

- **Add a privacy policy and terms of service.** You're storing emails and
  financial-adjacent data (what people subscribe to and pay). Termly and
  similar tools generate a reasonable baseline for free/cheap.
- **Rate-limit auth endpoints** (e.g. `express-rate-limit`) to slow down
  brute-force login attempts.
- **Turn on HTTPS** — Render/Railway do this automatically; just don't skip
  it if you self-host.
- **Back up `data.sqlite` regularly** if you stay on SQLite — it's one file;
  losing it loses everyone's data.
- **Test the Stripe webhook against your live URL** (Stripe's CLI has a
  `stripe listen --forward-to` command for this) before flipping to live
  keys, so a real charge can't succeed while the unlock silently fails.

## Where to take it next

- Email reminders before renewals (currently shown only in-app on login) —
  Resend or Postmark have generous free tiers.
- Bank-sync via Plaid to auto-detect subscriptions instead of manual entry —
  this is the single biggest retention lever, but adds real compliance
  surface (Plaid needs a signed agreement); do it after you have paying users
  who ask for it, not before.
- Shareable "cancel guide" content (how to cancel any given service) doubles
  as SEO/acquisition and reuses data you already have.

## Project layout

```
server.js              — entry point, session config, Stripe webhook (raw body)
lib/db.js               — SQLite schema (users, subscriptions, price_history)
lib/middleware.js        — auth guard, free-tier subscription limit
lib/emailTemplate.js     — zero-cost fallback cancellation email
routes/auth.js           — register / login / logout / me
routes/subscriptions.js  — CRUD + summary (spend totals, upcoming renewals)
routes/billing.js        — Stripe Checkout session creation + status
routes/ai.js              — AI (or template) cancellation email draft
public/                  — the dashboard (vanilla HTML/CSS/JS, no build step)
```
