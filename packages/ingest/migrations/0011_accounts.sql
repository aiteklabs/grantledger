-- Pro accounts: one lifetime payment unlocks AI prefill, up to two company profiles (radars) and the weekly Radar email.
CREATE TABLE accounts (
  email TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  paid_at TEXT,
  stripe_session_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  business_name TEXT,
  tax_id TEXT,
  last_login_at TEXT
);
-- Magic links: one token per email sent, valid 30 minutes, single use.
CREATE TABLE logins (
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE INDEX logins_email ON logins (email);
