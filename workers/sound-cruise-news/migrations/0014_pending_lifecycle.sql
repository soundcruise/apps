-- Operational lifecycle and intent; never an approve/reject teacher.
CREATE TABLE news_pending_lifecycle (
 candidate_id TEXT PRIMARY KEY,
 last_rechecked_at INTEGER,
 assessed_revision INTEGER NOT NULL DEFAULT -1,
 next_recheck_at INTEGER,
 recheck_attempt_count INTEGER NOT NULL DEFAULT 0,
 recheck_status TEXT NOT NULL DEFAULT 'WAITING',
 unresolved_reason TEXT,
 last_recheck_result TEXT,
 recheck_policy_version TEXT NOT NULL,
 user_publish_interest INTEGER NOT NULL DEFAULT 0 CHECK(user_publish_interest IN (0,1)),
 user_publish_interest_at INTEGER,
 lease_token TEXT,
 lease_until INTEGER NOT NULL DEFAULT 0,
 history_json TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX news_pending_due ON news_pending_lifecycle(next_recheck_at,lease_until);
