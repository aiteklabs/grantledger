-- Radar: a paid, lifetime weekly email of new calls matching one company profile. One row per purchase.
CREATE TABLE radars (
  id TEXT PRIMARY KEY,                 -- random token; also the unsubscribe key in every email
  email TEXT NOT NULL,
  fit_check_id TEXT NOT NULL,          -- the fit check the profile was copied from
  form TEXT NOT NULL,                  -- ProfileForm JSON at purchase time
  company_name TEXT,
  stripe_session_id TEXT UNIQUE,       -- Checkout session, so a replayed webhook never creates a second radar
  paid_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_sent_at TEXT,                   -- calls first seen after this moment are "new" for the next email
  active INTEGER NOT NULL DEFAULT 1    -- 0 after unsubscribe
);
CREATE INDEX radars_email ON radars (email);
CREATE INDEX radars_fit ON radars (fit_check_id);
