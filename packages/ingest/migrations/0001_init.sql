-- Normalized opportunities. Arrays are JSON text.
CREATE TABLE grants (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_license TEXT NOT NULL,
  title TEXT NOT NULL,
  title_lang TEXT NOT NULL,
  summary TEXT,
  funder_name TEXT,
  funder_level TEXT NOT NULL,
  country TEXT NOT NULL,
  regions TEXT NOT NULL DEFAULT '[]',
  funding_types TEXT NOT NULL DEFAULT '[]',
  beneficiary_types TEXT NOT NULL DEFAULT '[]',
  sectors TEXT NOT NULL DEFAULT '[]',
  amount_min REAL,
  amount_max REAL,
  budget_total REAL,
  currency TEXT,
  status TEXT NOT NULL,
  opens_at TEXT,
  closes_at TEXT,
  documents TEXT NOT NULL DEFAULT '[]',
  source_updated_at TEXT,
  content_hash TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  raw_key TEXT
);
CREATE INDEX grants_source ON grants (source);
CREATE INDEX grants_country_status ON grants (country, status);
CREATE INDEX grants_closes_at ON grants (closes_at);

-- Every content change keeps the previous snapshot. Nothing is ever deleted.
CREATE TABLE grant_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  grant_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  seen_at TEXT NOT NULL
);
CREATE INDEX grant_versions_grant ON grant_versions (grant_id, seen_at);

CREATE VIRTUAL TABLE grants_fts USING fts5(title, summary, content='grants', content_rowid='rowid');
CREATE TRIGGER grants_ai AFTER INSERT ON grants BEGIN
  INSERT INTO grants_fts(rowid, title, summary) VALUES (new.rowid, new.title, new.summary);
END;
CREATE TRIGGER grants_ad AFTER DELETE ON grants BEGIN
  INSERT INTO grants_fts(grants_fts, rowid, title, summary) VALUES ('delete', old.rowid, old.title, old.summary);
END;
CREATE TRIGGER grants_au AFTER UPDATE ON grants BEGIN
  INSERT INTO grants_fts(grants_fts, rowid, title, summary) VALUES ('delete', old.rowid, old.title, old.summary);
  INSERT INTO grants_fts(rowid, title, summary) VALUES (new.rowid, new.title, new.summary);
END;

CREATE TABLE ingest_runs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  cursor TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  pages INTEGER NOT NULL DEFAULT 0,
  upserted INTEGER NOT NULL DEFAULT 0,
  changed INTEGER NOT NULL DEFAULT 0,
  error TEXT
);
