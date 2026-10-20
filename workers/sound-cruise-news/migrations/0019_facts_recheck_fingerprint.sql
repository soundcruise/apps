-- Correct future recovery commits only; existing articles and history are not rewritten.
DROP TRIGGER news_facts_recheck_commit;
CREATE TRIGGER news_facts_recheck_commit AFTER INSERT ON news_facts_rechecks
WHEN NEW.patch_json IS NOT NULL
BEGIN
 UPDATE candidate_items SET
 title_fingerprint=COALESCE(json_extract(NEW.patch_json,'$.title_fingerprint'),title_fingerprint),
 product_facts=json_extract(NEW.patch_json,'$.product_facts'),
 category=json_extract(NEW.patch_json,'$.category'),
 event_type=json_extract(NEW.patch_json,'$.event_type'),
 label=json_extract(NEW.patch_json,'$.label'),
 topic_key=json_extract(NEW.patch_json,'$.topic_key'),
 event_ends_at=json_extract(NEW.patch_json,'$.event_ends_at'),
 publication_decision='PUBLISH_REVIEW',decision_reason='verified_facts_recheck',
 facts_provenance=NEW.provenance_json,review_revision=review_revision+1
 WHERE id=NEW.candidate_id AND review_status IN ('pending','reopened');
 SELECT iif(changes()=1,1,RAISE(ABORT,'facts_candidate_changed'));
 UPDATE news_controls SET revision=revision+1 WHERE id=1;
 INSERT INTO news_admin_audit VALUES(NEW.request_id,'facts-recheck',NEW.candidate_id,NEW.checked_at,'verified_facts_only');
END;
