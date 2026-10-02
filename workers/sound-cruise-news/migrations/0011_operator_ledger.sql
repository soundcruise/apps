-- Additive only. No historical decisions are relabelled as human decisions.
ALTER TABLE candidate_items ADD COLUMN review_revision INTEGER NOT NULL DEFAULT 0;
CREATE TABLE news_decision_ledger (
 decision_id TEXT PRIMARY KEY,
 candidate_id TEXT NOT NULL,
 verdict TEXT NOT NULL CHECK(verdict IN ('approve','reject')),
 reason TEXT NOT NULL,
 actor_type TEXT NOT NULL CHECK(actor_type IN ('human_operator','automatic_policy','migration','fixture','system_repair')),
 actor_id TEXT NOT NULL,
 decided_at INTEGER NOT NULL,
 source_id TEXT NOT NULL,
 category TEXT NOT NULL,
 decision_features_json TEXT NOT NULL CHECK(json_valid(decision_features_json)),
 policy_version TEXT NOT NULL,
 request_id TEXT NOT NULL UNIQUE,
 request_payload_hash TEXT NOT NULL,
 candidate_revision INTEGER NOT NULL,
 candidate_snapshot TEXT NOT NULL,
 success_state TEXT NOT NULL CHECK(success_state='committed'),
 correction_of TEXT,
 created_at INTEGER NOT NULL,
 persisted_label TEXT CHECK(persisted_label IS NULL OR length(persisted_label) BETWEEN 4 AND 140),
 checks_json TEXT NOT NULL CHECK(json_valid(checks_json))
);
CREATE INDEX news_decision_history ON news_decision_ledger(candidate_id,decided_at DESC,decision_id);
CREATE INDEX news_decision_retention ON news_decision_ledger(created_at);
-- The service inserts one ledger row through a conditional INSERT SELECT.
-- A single SQLite statement (also when invoked through remote CLI) owns all writes.
-- Failure of ANY child write aborts the entire statement, not just a JS response.
CREATE TRIGGER news_decision_commit AFTER INSERT ON news_decision_ledger
BEGIN
 UPDATE candidate_items SET
  review_revision=review_revision+1,
  review_status=iif(NEW.verdict='approve','approved','rejected'),
  label=iif(NEW.verdict='approve',NEW.persisted_label,label),
  reviewed_by=NEW.actor_type,reviewed_at=strftime('%Y-%m-%dT%H:%M:%fZ',NEW.decided_at/1000.0,'unixepoch'),
  review_reason=iif(NEW.verdict='approve','operator_surface_verified',NEW.reason),
  review_checks=NEW.checks_json
 WHERE id=NEW.candidate_id AND review_revision=NEW.candidate_revision
  AND review_status IN ('pending','reopened') AND origin<>'legacy_fixture_backfill';
 SELECT RAISE(ABORT,'stale_decision') WHERE changes()<>1;
 INSERT INTO news_admin_audit(id,action,target,occurred_at,reason_code)
 VALUES(NEW.decision_id,'review-'||NEW.verdict,NEW.candidate_id,NEW.decided_at,NEW.reason);
 INSERT INTO news_operator_feedback(id,candidate_id,occurred_at,reason_code)
 VALUES(NEW.decision_id,NEW.candidate_id,NEW.decided_at,NEW.reason);
 UPDATE news_controls SET revision=revision+1 WHERE id=1;
END;
