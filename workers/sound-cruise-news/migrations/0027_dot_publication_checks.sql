-- A human's fresh source observation; not publication authority.
CREATE TABLE IF NOT EXISTS news_dot_publication_checks (
 request_id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL,
 candidate_snapshot TEXT NOT NULL, candidate_revision INTEGER NOT NULL,
 receipt_id TEXT NOT NULL, dot_candidate_id TEXT NOT NULL,
 candidate_digest TEXT NOT NULL, staging_revision TEXT NOT NULL,
 delivery_key_hash TEXT NOT NULL, source_url TEXT NOT NULL,
 actor_id TEXT NOT NULL, checked_at INTEGER NOT NULL,
 observation TEXT NOT NULL, evidence_hash TEXT NOT NULL,
 FOREIGN KEY(candidate_id) REFERENCES candidate_items(id),
 FOREIGN KEY(receipt_id) REFERENCES news_dot_admission_receipts(request_id)
);
CREATE INDEX IF NOT EXISTS news_dot_publication_checks_candidate ON news_dot_publication_checks(candidate_id,checked_at DESC);
