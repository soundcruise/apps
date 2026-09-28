CREATE TABLE IF NOT EXISTS source_state (
 source_id TEXT PRIMARY KEY, disabled INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0,
 failures INTEGER NOT NULL DEFAULT 0, robots_hash TEXT, etag TEXT, last_modified TEXT, lease_until INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS candidate_items (
 id TEXT PRIMARY KEY, source_id TEXT NOT NULL, source_name TEXT NOT NULL,
 source_url TEXT NOT NULL UNIQUE, normalized_url TEXT NOT NULL, published_at TEXT,
 category TEXT NOT NULL, label TEXT NOT NULL CHECK(length(label) BETWEEN 4 AND 140), topic_key TEXT NOT NULL,
 collected_at TEXT NOT NULL, title_hash TEXT NOT NULL,
 review_status TEXT NOT NULL CHECK(review_status IN ('pending','approved','rejected')),
 review_reason TEXT NOT NULL, reviewed_at TEXT, expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS news_public_order ON candidate_items(review_status, published_at DESC, id);
CREATE TABLE IF NOT EXISTS collection_runs (
 id TEXT PRIMARY KEY, source_id TEXT NOT NULL, collected_at INTEGER NOT NULL,
 requests INTEGER NOT NULL, candidates INTEGER NOT NULL, pending INTEGER NOT NULL,
 rejected INTEGER NOT NULL, duplicates INTEGER NOT NULL, outcome TEXT NOT NULL, duration_ms INTEGER NOT NULL
);
