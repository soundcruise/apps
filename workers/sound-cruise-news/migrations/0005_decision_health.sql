ALTER TABLE candidate_items ADD COLUMN publication_decision TEXT NOT NULL DEFAULT 'PUBLISH_REVIEW'
 CHECK(publication_decision IN ('AUTO_PUBLISHABLE','PUBLISH_REVIEW','REJECT'));
ALTER TABLE candidate_items ADD COLUMN decision_reason TEXT NOT NULL DEFAULT 'legacy_review_required';

CREATE TABLE source_health (
 source_id TEXT PRIMARY KEY, status TEXT NOT NULL, reason_code TEXT NOT NULL,
 last_successful_run_at INTEGER, last_checked_at INTEGER NOT NULL,
 next_eligible_run_at INTEGER, failure_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE source_health_alerts (
 id TEXT PRIMARY KEY, source_id TEXT NOT NULL, status TEXT NOT NULL,
 reason_code TEXT NOT NULL, occurred_at INTEGER NOT NULL
);
CREATE INDEX source_health_alerts_order ON source_health_alerts(occurred_at DESC, id);
