-- Evidence only; this migration never creates or changes a NEWS candidate.
CREATE TABLE IF NOT EXISTS news_dot_confirmations (
  request_id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  candidate_digest TEXT NOT NULL,
  staging_revision TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  confirmed_at INTEGER NOT NULL,
  evidence_json TEXT NOT NULL,
  evidence_hash TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK(outcome IN ('needs_confirmation','confirmed'))
);
CREATE INDEX IF NOT EXISTS news_dot_confirmations_candidate ON news_dot_confirmations(candidate_id, confirmed_at);
