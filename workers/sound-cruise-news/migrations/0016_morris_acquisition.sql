-- Additive permission ledger. Never purge once-only URL receipts with candidate retention.
-- A claimed request remains spent after a crash, failure, deploy or repair.
CREATE TABLE news_morris_acquisition (
 request_key TEXT PRIMARY KEY,
 scope TEXT NOT NULL CHECK(scope IN ('listing','article')),
 source_url TEXT NOT NULL,
 jst_day TEXT NOT NULL,
 published_at TEXT,
 discovered_at INTEGER NOT NULL,
 attempted_at INTEGER,
 actual_requests INTEGER NOT NULL DEFAULT 0,
 outcome TEXT NOT NULL,
 response_hash TEXT,
 facts_json TEXT,
 proof_json TEXT,
 fingerprint_json TEXT,
 entries_json TEXT,
 permission_ref TEXT NOT NULL
);
CREATE INDEX news_morris_acquisition_day ON news_morris_acquisition(scope,jst_day);
-- New source stays OFF until its permission ledger is initialized and explicitly enabled.
INSERT OR IGNORE INTO source_state(source_id,disabled) VALUES('morris',1);
