-- Model spend is accounted in its own ledger, independent of the rows that produced it, so deleting a
-- fit check or re-running an enrichment never lowers the month's total.
CREATE TABLE model_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  kind TEXT NOT NULL,            -- prefill | enrichment
  ref TEXT,                      -- fit check id or grant id
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX model_usage_created ON model_usage (created_at);

INSERT INTO model_usage (created_at, kind, ref, model, input_tokens, output_tokens)
  SELECT created_at, 'enrichment', grant_id, model, COALESCE(input_tokens, 0), COALESCE(output_tokens, 0) FROM grant_enrichments;
INSERT INTO model_usage (created_at, kind, ref, model, input_tokens, output_tokens)
  SELECT created_at, 'prefill', id, COALESCE(model, ''), COALESCE(input_tokens, 0), COALESCE(output_tokens, 0) FROM fit_checks WHERE profile IS NOT NULL;

-- Enrichments remember which content version they were extracted from; a changed record is enriched again.
ALTER TABLE grant_enrichments ADD COLUMN content_hash TEXT;
