-- Additive only. No triggers or changes to legacy NEWS writes.
-- Each exclusion is human evidence for one candidate and one retained subject.
CREATE TABLE IF NOT EXISTS news_dot_history_exclusions (
 request_id TEXT PRIMARY KEY,
 candidate_id TEXT NOT NULL,
 candidate_snapshot TEXT NOT NULL,
 candidate_digest TEXT NOT NULL,
 staging_revision TEXT NOT NULL,
 receipt_id TEXT NOT NULL,
 subject_key TEXT NOT NULL,
 subject_token TEXT NOT NULL,
 actor_id TEXT NOT NULL,
 checked_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 archive_url TEXT NOT NULL,
 archive_brand TEXT NOT NULL,
 archive_product TEXT NOT NULL,
 archive_event TEXT NOT NULL,
 evidence_ref TEXT NOT NULL,
 evidence_hash TEXT NOT NULL,
 UNIQUE(candidate_id,subject_key,subject_token,request_id)
);
CREATE INDEX IF NOT EXISTS news_dot_history_exclusion_lookup ON news_dot_history_exclusions(candidate_id,subject_key,expires_at);
CREATE TRIGGER IF NOT EXISTS news_dot_history_exclusion_immutable
BEFORE UPDATE ON news_dot_history_exclusions
BEGIN
 SELECT RAISE(ABORT,'history_evidence_immutable');
END;
