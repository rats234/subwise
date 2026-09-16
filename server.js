require("dotenv").config();
const path = require("path");
const express = require("express");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const db = require("./lib/db");

const authRoutes = require("./routes/auth");
const subscriptionRoutes = require("./routes/subscriptions");
const billingRoutes = require("./routes/billing");
const aiRoutes = require("./routes/ai");

const app = express();
const PORT = process.env.PORT || 3000;

app.set("trust proxy", 1);

// Stripe webhook needs the RAW request body to verify the signature, so it
// must be mounted before express.json() touches this path. Handled inline
// here (not in routes/billing.js) to keep that ordering guaranteed.
app.post("/api/billing/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).send("Webhook not configured");
  }
  const Stripe = require("stripe");
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers["stripe-signature"],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook signature verification failed: ${err.message}`);
  }
  if (event.type === "checkout.session.completed") {
    const checkoutSession = event.data.object;
    const userId = Number(checkoutSession.client_reference_id);
    if (userId) {
      await db.query("UPDATE users SET is_premium = TRUE, stripe_customer_id = $1 WHERE id = $2", [
        checkoutSession.customer,
        userId,
      ]);
    }
  }
  res.json({ received: true });
});

app.use(express.json());
app.use(
  session({
    store: new pgSession({ pool: db.pool, tableName: "session", createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET || "dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    },
  })
);

app.use(express.static(path.join(__dirname, "public")));

app.use("/api/auth", authRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/ai", aiRoutes);

app.get("/healthz", (req, res) => res.json({ ok: true }));

// Last-resort error handler so a DB hiccup returns JSON, not an HTML stack trace.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "internal_error", message: "Something went wrong. Try again." });
});

db.init()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`SubWise listening on http://localhost:${PORT}`);
      if (process.env.SESSION_SECRET === undefined) {
        console.warn("⚠️  SESSION_SECRET not set — using an insecure dev default. Set one before deploying.");
      }
    });
  })
  .catch((err) => {
    console.error("Failed to initialize database:", err.message);
    process.exit(1);
  });
