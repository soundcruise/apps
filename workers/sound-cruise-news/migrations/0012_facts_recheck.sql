-- Recovery records are operational evidence, never human decisions or feedback.
ALTER TABLE candidate_items ADD COLUMN facts_provenance TEXT;
CREATE TABLE news_facts_sources (
 source_id TEXT PRIMARY KEY,
 lease_token TEXT NOT NULL,
 lease_until INTEGER NOT NULL DEFAULT 0,
 checked_at INTEGER NOT NULL DEFAULT 0,
 outcome TEXT NOT NULL,
 items_json TEXT,
 proof_json TEXT
);
CREATE TABLE news_facts_rechecks (
 request_id TEXT PRIMARY KEY,
 request_payload_hash TEXT NOT NULL,
 candidate_id TEXT NOT NULL,
 checked_at INTEGER NOT NULL,
 outcome TEXT NOT NULL,
 provenance_json TEXT NOT NULL,
 patch_json TEXT
);
CREATE INDEX news_facts_rechecks_candidate ON news_facts_rechecks(candidate_id,checked_at);
CREATE TRIGGER news_facts_recheck_commit AFTER INSERT ON news_facts_rechecks
WHEN NEW.patch_json IS NOT NULL
BEGIN
 UPDATE candidate_items SET
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
