-- Fit checks: one row per company profile analysed (URL, PDF or pasted text). Private, admin only.
CREATE TABLE fit_checks (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  input_type TEXT NOT NULL,          -- url | pdf | text
  input_ref TEXT,                    -- the URL, or the R2 key of the uploaded file
  input_name TEXT,                   -- file name or page title
  input_text TEXT,                   -- extracted text sent to the model (truncated)
  contact_email TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | done | error
  error TEXT,
  profile TEXT,                      -- JSON company profile extracted by the model
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  duration_ms INTEGER,
  ip_hash TEXT,
  user_agent TEXT,
  finished_at TEXT
);
CREATE INDEX fit_checks_created ON fit_checks (created_at DESC);

CREATE TABLE fit_matches (
  fit_check_id TEXT NOT NULL,
  grant_id TEXT NOT NULL,
  rank INTEGER NOT NULL,
  verdict TEXT NOT NULL,             -- fit | not_yet | no
  score INTEGER NOT NULL,
  reasons TEXT NOT NULL DEFAULT '[]',
  missing TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (fit_check_id, grant_id)
);
