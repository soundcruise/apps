-- Additive observations only. No candidate, decision or teacher mutation.
CREATE TABLE news_preparation_runs (
 run_id TEXT PRIMARY KEY, source_id TEXT NOT NULL, observed_at INTEGER NOT NULL,
 jst_day TEXT NOT NULL, request_mode TEXT NOT NULL, outcome TEXT NOT NULL,
 metrics_json TEXT NOT NULL CHECK(json_valid(metrics_json))
);
CREATE INDEX news_preparation_day ON news_preparation_runs(jst_day,source_id);
CREATE TABLE news_discovery_receipts (
 source_id TEXT NOT NULL, normalized_url TEXT NOT NULL, first_seen_at INTEGER NOT NULL,
 last_seen_at INTEGER NOT NULL, published_at TEXT, outcome TEXT NOT NULL,
 reason_code TEXT NOT NULL, candidate_id TEXT,
 PRIMARY KEY(source_id,normalized_url)
);
