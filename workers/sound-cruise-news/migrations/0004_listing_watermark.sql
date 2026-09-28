-- Successful discovery watermark. failed/backoff attempts must not hide new entries.
ALTER TABLE source_state ADD COLUMN last_discovery_at INTEGER NOT NULL DEFAULT 0;
