-- Preserve pending decisions; add atomic, explicit human takedown of approved articles.
DROP TRIGGER news_decision_commit;
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
  AND ((review_status IN ('pending','reopened') AND origin<>'legacy_fixture_backfill' AND json_extract(NEW.decision_features_json,'$.operation') IS NOT 'human_takedown') OR (review_status='approved' AND NEW.verdict='reject' AND NEW.actor_type='human_operator' AND json_extract(NEW.decision_features_json,'$.operation')='human_takedown'));
 SELECT RAISE(ABORT,'stale_decision') WHERE changes()<>1;
 INSERT INTO news_takedowns(item_id,expires_at) SELECT id,expires_at FROM candidate_items WHERE id=NEW.candidate_id AND json_extract(NEW.decision_features_json,'$.operation')='human_takedown' ON CONFLICT(item_id) DO UPDATE SET expires_at=MAX(expires_at,excluded.expires_at);
 INSERT INTO news_admin_audit(id,action,target,occurred_at,reason_code)
 VALUES(NEW.decision_id,'review-'||NEW.verdict,NEW.candidate_id,NEW.decided_at,NEW.reason);
 INSERT INTO news_operator_feedback(id,candidate_id,occurred_at,reason_code)
 VALUES(NEW.decision_id,NEW.candidate_id,NEW.decided_at,NEW.reason);
 UPDATE news_controls SET revision=revision+1 WHERE id=1;
END;
