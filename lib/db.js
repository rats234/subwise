// lib/db.js — Postgres connection + schema. Every route talks to the DB only
// through `query()`/`getClient()` below, so drivers can be swapped in one
// place if needed again.
const { Pool, types } = require("pg");

// Return DATE columns as plain "YYYY-MM-DD" strings instead of pg's default
// JS Date objects (which serialize to full ISO timestamps and break the
// <input type="date"> population and display in the frontend).
types.setTypeParser(1082, (val) => val);

if (!process.env.DATABASE_URL) {
  console.error(
    "DATABASE_URL is not set. Point it at a Postgres connection string (see .env.example)."
  );
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Most managed Postgres hosts (Neon, Render, Supabase, ...) require TLS
  // and use certs not in Node's default trust store for this purpose.
  ssl: process.env.PGSSL === "disable" ? false : { rejectUnauthorized: false },
});

async function query(text, params) {
  return pool.query(text, params);
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  is_premium BOOLEAN NOT NULL DEFAULT FALSE,
  stripe_customer_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cost_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  billing_cycle TEXT NOT NULL DEFAULT 'monthly', -- monthly | yearly | weekly
  category TEXT NOT NULL DEFAULT 'other',
  next_renewal_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- active | flagged | cancelled
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS price_history (
  id SERIAL PRIMARY KEY,
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  old_cost_cents INTEGER NOT NULL,
  new_cost_cents INTEGER NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

async function init() {
  await pool.query(SCHEMA);
}

module.exports = { query, init, pool };
