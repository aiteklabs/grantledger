-- Fit checks now run on a confirmed structured form. AI only prefills the form (optional) and enriches records offline.
ALTER TABLE fit_checks ADD COLUMN form TEXT;          -- JSON ProfileForm confirmed by the user
ALTER TABLE fit_checks ADD COLUMN mode TEXT NOT NULL DEFAULT 'sql';  -- sql | ai (legacy)

-- Structured fields extracted once per record from the official text, when the source publishes none.
CREATE TABLE grant_enrichments (
  grant_id TEXT PRIMARY KEY,
  beneficiary_types TEXT NOT NULL DEFAULT '[]',
  sectors TEXT NOT NULL DEFAULT '[]',        -- NACE divisions (2-digit) inferred from the text
  regions TEXT NOT NULL DEFAULT '[]',
  company_sizes TEXT NOT NULL DEFAULT '[]',  -- micro | small | medium | large
  min_company_age INTEGER,
  max_company_age INTEGER,
  consortium_required INTEGER,               -- 0/1/null
  summary_en TEXT,
  model TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  created_at TEXT NOT NULL,
  reviewed INTEGER NOT NULL DEFAULT 0
);
