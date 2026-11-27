-- Key/value settings edited from the admin: model spend limit and anything else that must not need a deploy.
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO settings (key, value, updated_at) VALUES ('model_monthly_limit_usd', '10', '2026-09-28T00:00:00.000Z');
