-- English search terms extracted by enrichment, indexed so that English keywords reach calls published in other languages.
ALTER TABLE grant_enrichments ADD COLUMN keywords_en TEXT NOT NULL DEFAULT '[]';

CREATE VIRTUAL TABLE enrichment_fts USING fts5(grant_id UNINDEXED, text);
CREATE TRIGGER enrichment_ai AFTER INSERT ON grant_enrichments BEGIN
  INSERT INTO enrichment_fts(grant_id, text) VALUES (new.grant_id, COALESCE(new.summary_en, '') || ' ' || new.keywords_en);
END;
CREATE TRIGGER enrichment_ad AFTER DELETE ON grant_enrichments BEGIN
  DELETE FROM enrichment_fts WHERE grant_id = old.grant_id;
END;
CREATE TRIGGER enrichment_au AFTER UPDATE ON grant_enrichments BEGIN
  DELETE FROM enrichment_fts WHERE grant_id = old.grant_id;
  INSERT INTO enrichment_fts(grant_id, text) VALUES (new.grant_id, COALESCE(new.summary_en, '') || ' ' || new.keywords_en);
END;

INSERT INTO enrichment_fts(grant_id, text) SELECT grant_id, COALESCE(summary_en, '') || ' ' || keywords_en FROM grant_enrichments;
