-- Radar send log: one row per call emailed to one profile. A call is "new" for a profile until it has a row here,
-- so a call that only passes the rules once its enrichment lands, or that did not fit in one email, is sent later
-- instead of never. It is also the proof that an email went out.
CREATE TABLE radar_sent (
  radar_id TEXT NOT NULL,
  grant_id TEXT NOT NULL,
  verdict TEXT NOT NULL,               -- verdict at send time; a call sent as "eligible" is sent again once it is relevant
  sent_at TEXT NOT NULL,
  PRIMARY KEY (radar_id, grant_id)
);
