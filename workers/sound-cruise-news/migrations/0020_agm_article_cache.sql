-- Structured evidence only. No publisher HTML, titles, descriptions or images.
CREATE TABLE news_agm_article_cache (
 canonical_url TEXT PRIMARY KEY,
 payload_json TEXT,
 payload_hash TEXT,
 checked_at INTEGER NOT NULL DEFAULT 0,
 attempted_at INTEGER NOT NULL DEFAULT 0,
 lease_token TEXT,
 lease_until INTEGER NOT NULL DEFAULT 0,
 etag TEXT,
 last_modified TEXT
);
