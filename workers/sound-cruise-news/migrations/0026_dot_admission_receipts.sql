-- D1 is authoritative for Dot review admission. No publication or Firestore mutation.
CREATE TABLE IF NOT EXISTS news_dot_admission_receipts (
 request_id TEXT PRIMARY KEY,
 dot_candidate_id TEXT NOT NULL UNIQUE,
 delivery_key_hash TEXT NOT NULL UNIQUE,
 candidate_id TEXT NOT NULL UNIQUE,
 confirmation_id TEXT NOT NULL UNIQUE,
 candidate_digest TEXT NOT NULL,
 staging_revision TEXT NOT NULL,
 evidence_hash TEXT NOT NULL,
 admission_hash TEXT NOT NULL,
 actor_id TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 FOREIGN KEY(candidate_id) REFERENCES candidate_items(id),
 FOREIGN KEY(confirmation_id) REFERENCES news_dot_confirmations(request_id)
);
-- A failed postcondition raises a constraint error inside the same D1 batch.
CREATE TABLE IF NOT EXISTS news_dot_admission_batch_guards (
 request_id TEXT PRIMARY KEY,
 valid INTEGER NOT NULL CHECK(valid=1)
);
