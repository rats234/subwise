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
