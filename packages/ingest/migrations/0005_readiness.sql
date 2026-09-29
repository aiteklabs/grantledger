-- Readiness gaps (what is missing for a clean submission) and negative memos, both computed by rules per match.
ALTER TABLE fit_matches ADD COLUMN gaps TEXT NOT NULL DEFAULT '[]';
ALTER TABLE fit_matches ADD COLUMN memo TEXT;
