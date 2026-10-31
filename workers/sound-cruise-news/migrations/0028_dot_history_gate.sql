-- Candidate-specific human history review. No triggers on normal NEWS writes.
CREATE TABLE IF NOT EXISTS news_dot_history_checks (
 request_id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL, candidate_snapshot TEXT NOT NULL,
 candidate_revision INTEGER NOT NULL, receipt_id TEXT NOT NULL, actor_id TEXT NOT NULL,
 checked_at INTEGER NOT NULL, basis TEXT NOT NULL, evidence_ref TEXT NOT NULL,
 evidence_hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS news_dot_history_candidate ON news_dot_history_checks(candidate_id,checked_at DESC);
