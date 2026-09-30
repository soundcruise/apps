-- Additive, rollback-compatible. A lease consumes the scheduled JST day before any request.
ALTER TABLE source_state ADD COLUMN scheduled_jst_day TEXT NOT NULL DEFAULT '';
ALTER TABLE source_state ADD COLUMN backoff_until INTEGER NOT NULL DEFAULT 0;
UPDATE source_state SET backoff_until=next_at WHERE failures>0;
ALTER TABLE candidate_items ADD COLUMN origin TEXT NOT NULL DEFAULT 'automatic_collection';
CREATE TABLE legacy_news_grants(item_id TEXT PRIMARY KEY,label TEXT NOT NULL,source_id TEXT NOT NULL,source_url TEXT NOT NULL,published_at TEXT NOT NULL,category TEXT NOT NULL,fixture_digest TEXT NOT NULL);
CREATE TABLE news_operator_feedback(id TEXT PRIMARY KEY,candidate_id TEXT NOT NULL,occurred_at INTEGER NOT NULL,reason_code TEXT NOT NULL);
ALTER TABLE collection_runs ADD COLUMN request_mode TEXT NOT NULL DEFAULT 'normal';
