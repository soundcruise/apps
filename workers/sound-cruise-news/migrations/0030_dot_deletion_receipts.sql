-- A deletion receipt is independent of candidate and confirmation lifetimes.
-- URLs are retained solely as exact public-article deny keys for legacy SQL,
-- which cannot compute the application's SHA-256. No label/facts/body/actor.
CREATE TABLE IF NOT EXISTS news_dot_deleted_receipts (
 request_id TEXT PRIMARY KEY,
 dot_candidate_id TEXT NOT NULL UNIQUE,
 delivery_key_hash TEXT NOT NULL UNIQUE,
 candidate_id TEXT NOT NULL UNIQUE,
 confirmation_id TEXT NOT NULL,
 candidate_digest TEXT NOT NULL,
 staging_revision TEXT NOT NULL,
 evidence_hash TEXT NOT NULL,
 admission_hash TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 deleted_at INTEGER NOT NULL,
 source_id TEXT NOT NULL,
 source_url TEXT NOT NULL,
 normalized_url TEXT NOT NULL,
 prior_status TEXT NOT NULL,
 item_takedown INTEGER NOT NULL,
 source_stopped INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS news_dot_deleted_source_url ON news_dot_deleted_receipts(source_url);
CREATE INDEX IF NOT EXISTS news_dot_deleted_normalized_url ON news_dot_deleted_receipts(normalized_url);
CREATE TRIGGER IF NOT EXISTS news_dot_deleted_immutable_update BEFORE UPDATE ON news_dot_deleted_receipts
BEGIN
 SELECT RAISE(ABORT,'dot_deleted_receipt_immutable');
END;
CREATE TRIGGER IF NOT EXISTS news_dot_deleted_immutable_delete BEFORE DELETE ON news_dot_deleted_receipts
BEGIN
 SELECT RAISE(ABORT,'dot_deleted_receipt_immutable');
END;
CREATE TRIGGER IF NOT EXISTS news_dot_live_receipt_immutable BEFORE UPDATE ON news_dot_admission_receipts
BEGIN
 SELECT RAISE(ABORT,'dot_receipt_immutable');
END;
CREATE TRIGGER IF NOT EXISTS news_dot_live_receipt_delete BEFORE DELETE ON news_dot_admission_receipts
WHEN NOT EXISTS(SELECT 1 FROM news_dot_deleted_receipts d WHERE d.request_id=OLD.request_id AND d.candidate_id=OLD.candidate_id AND d.admission_hash=OLD.admission_hash)
BEGIN
 SELECT RAISE(ABORT,'dot_deletion_receipt_required');
END;
CREATE TRIGGER IF NOT EXISTS news_dot_candidate_delete BEFORE DELETE ON candidate_items
WHEN EXISTS(SELECT 1 FROM news_dot_admission_receipts r WHERE r.candidate_id=OLD.id)
BEGIN
 INSERT INTO news_dot_deleted_receipts(
  request_id,dot_candidate_id,delivery_key_hash,candidate_id,confirmation_id,
  candidate_digest,staging_revision,evidence_hash,admission_hash,created_at,
  deleted_at,source_id,source_url,normalized_url,prior_status,item_takedown,source_stopped)
 SELECT r.request_id,r.dot_candidate_id,r.delivery_key_hash,r.candidate_id,r.confirmation_id,r.candidate_digest,r.staging_revision,r.evidence_hash,r.admission_hash,r.created_at,
 CAST(strftime('%s','now') AS INTEGER)*1000,OLD.source_id,OLD.source_url,OLD.normalized_url,OLD.review_status,
 EXISTS(SELECT 1 FROM news_takedowns WHERE item_id=OLD.id),
 EXISTS(SELECT 1 FROM source_state WHERE source_id=OLD.source_id AND (disabled=1 OR takedown=1 OR publication_blocked=1))
 FROM news_dot_admission_receipts r WHERE r.candidate_id=OLD.id;
 DELETE FROM news_dot_publication_checks WHERE candidate_id=OLD.id OR receipt_id IN (SELECT request_id FROM news_dot_admission_receipts WHERE candidate_id=OLD.id);
 DELETE FROM news_dot_history_checks WHERE candidate_id=OLD.id;
 DELETE FROM news_dot_history_exclusions WHERE candidate_id=OLD.id;
 DELETE FROM news_assisted_edits WHERE candidate_id=OLD.id;
 DELETE FROM news_facts_rechecks WHERE candidate_id=OLD.id;
 DELETE FROM news_shadow_evaluations WHERE candidate_id=OLD.id;
 DELETE FROM news_category_edits WHERE candidate_id=OLD.id;
 DELETE FROM news_category_overrides WHERE candidate_id=OLD.id;
 DELETE FROM news_pending_lifecycle WHERE candidate_id=OLD.id;
 DELETE FROM news_discovery_work WHERE candidate_id=OLD.id OR normalized_url IN (OLD.source_url,OLD.normalized_url);
 DELETE FROM news_discovery_receipts WHERE normalized_url IN (OLD.source_url,OLD.normalized_url);
 UPDATE news_decision_ledger SET persisted_label=NULL WHERE candidate_id=OLD.id;
 DELETE FROM news_dot_admission_receipts WHERE candidate_id=OLD.id;
 DELETE FROM news_dot_confirmations WHERE request_id IN (SELECT confirmation_id FROM news_dot_deleted_receipts WHERE candidate_id=OLD.id) OR candidate_id IN (SELECT dot_candidate_id FROM news_dot_deleted_receipts WHERE candidate_id=OLD.id);
END;
-- IGNORE permits legacy collection to continue for unrelated articles.
CREATE TRIGGER IF NOT EXISTS news_dot_deleted_candidate_insert BEFORE INSERT ON candidate_items
WHEN EXISTS(SELECT 1 FROM news_dot_deleted_receipts d WHERE d.candidate_id=NEW.id OR d.source_url IN (NEW.source_url,NEW.normalized_url) OR d.normalized_url IN (NEW.source_url,NEW.normalized_url))
BEGIN
 SELECT RAISE(IGNORE);
END;
CREATE TRIGGER IF NOT EXISTS news_dot_deleted_candidate_update BEFORE UPDATE ON candidate_items
WHEN EXISTS(SELECT 1 FROM news_dot_deleted_receipts d WHERE d.candidate_id=NEW.id OR d.source_url IN (NEW.source_url,NEW.normalized_url) OR d.normalized_url IN (NEW.source_url,NEW.normalized_url))
BEGIN
 SELECT RAISE(ABORT,'dot_candidate_deleted');
END;
CREATE TRIGGER IF NOT EXISTS news_dot_deleted_admission BEFORE INSERT ON news_dot_admission_receipts
WHEN EXISTS(SELECT 1 FROM news_dot_deleted_receipts d WHERE d.candidate_id=NEW.candidate_id OR d.request_id=NEW.request_id OR d.dot_candidate_id=NEW.dot_candidate_id OR d.delivery_key_hash=NEW.delivery_key_hash)
BEGIN
 SELECT RAISE(ABORT,'dot_candidate_deleted');
END;
CREATE TRIGGER IF NOT EXISTS news_dot_deleted_approval BEFORE INSERT ON news_decision_ledger
WHEN NEW.verdict='approve' AND EXISTS(SELECT 1 FROM news_dot_deleted_receipts WHERE candidate_id=NEW.candidate_id)
BEGIN
 SELECT RAISE(ABORT,'dot_candidate_deleted');
END;
CREATE TRIGGER IF NOT EXISTS news_dot_deleted_confirmation BEFORE INSERT ON news_dot_confirmations
WHEN EXISTS(SELECT 1 FROM news_dot_deleted_receipts WHERE dot_candidate_id=NEW.candidate_id)
BEGIN
 SELECT RAISE(ABORT,'dot_candidate_deleted');
END;
CREATE TRIGGER IF NOT EXISTS news_dot_deleted_confirmation_update BEFORE UPDATE ON news_dot_confirmations
WHEN EXISTS(SELECT 1 FROM news_dot_deleted_receipts WHERE dot_candidate_id=NEW.candidate_id)
BEGIN
 SELECT RAISE(ABORT,'dot_candidate_deleted');
END;
