-- Discovery hints remain separate from formal NEWS and carry no publication authority.
CREATE TABLE IF NOT EXISTS news_web_hints (
 url TEXT PRIMARY KEY, title TEXT NOT NULL, provider TEXT NOT NULL,
 searched_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL,
 status TEXT NOT NULL CHECK (status IN ('unreviewed','hold','excluded','classified')),
 reason TEXT, estimate_json TEXT, expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS news_web_hints_expiry ON news_web_hints(expires_at);
ALTER TABLE news_web_hints ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE news_web_hints ADD COLUMN retry_at INTEGER NOT NULL DEFAULT 0;
CREATE TABLE news_web_runs (
 day TEXT PRIMARY KEY, searches INTEGER NOT NULL DEFAULT 0, ai_calls INTEGER NOT NULL DEFAULT 0,
 processed INTEGER NOT NULL DEFAULT 0, errors INTEGER NOT NULL DEFAULT 0,
 manual_started INTEGER NOT NULL DEFAULT 0, lock_until INTEGER NOT NULL DEFAULT 0
);
