const express = require("express");
const bcrypt = require("bcryptjs");
const { query } = require("../lib/db");

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post("/register", async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: "invalid_email", message: "Enter a valid email address." });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ error: "weak_password", message: "Password must be at least 8 characters." });
    }
    const normalizedEmail = email.toLowerCase();
    const existing = await query("SELECT id FROM users WHERE email = $1", [normalizedEmail]);
    if (existing.rows.length) {
      return res.status(409).json({ error: "email_taken", message: "An account with that email already exists." });
    }
    const hash = bcrypt.hashSync(password, 10);
    const inserted = await query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, is_premium",
      [normalizedEmail, hash]
    );
    const user = inserted.rows[0];
    req.session.userId = user.id;
    res.json({ id: user.id, email: user.email, is_premium: user.is_premium });
  } catch (err) {
    next(err);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    const result = await query("SELECT * FROM users WHERE email = $1", [(email || "").toLowerCase()]);
    const user = result.rows[0];
    if (!user || !bcrypt.compareSync(password || "", user.password_hash)) {
      return res.status(401).json({ error: "invalid_credentials", message: "Incorrect email or password." });
    }
    req.session.userId = user.id;
    res.json({ id: user.id, email: user.email, is_premium: user.is_premium });
  } catch (err) {
    next(err);
  }
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get("/me", async (req, res, next) => {
  try {
    if (!req.session || !req.session.userId) return res.json(null);
    const result = await query("SELECT id, email, is_premium FROM users WHERE id = $1", [req.session.userId]);
    const user = result.rows[0];
    if (!user) return res.json(null);
    res.json({ id: user.id, email: user.email, is_premium: user.is_premium });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
