-- Two lifetime plans: solo (one company profile) and team (three).
ALTER TABLE accounts ADD COLUMN plan TEXT NOT NULL DEFAULT 'solo';
