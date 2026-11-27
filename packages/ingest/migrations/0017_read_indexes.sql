-- Read-cost indexes (D1 insights, 2026-11-04):
-- - the coverage register's "latest run per source" subquery scanned ingest_runs
--   once per row (~2M rows read per page view);
-- - the live-counts filter "status IN (...) AND closes_at >= ?" had no usable
--   index, so every stats query walked the whole grants table.
CREATE INDEX IF NOT EXISTS ingest_runs_source_started ON ingest_runs (source, started_at);
CREATE INDEX IF NOT EXISTS grants_status_closes ON grants (status, closes_at);
