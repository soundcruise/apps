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
-- Old Workers keep their normal NEWS paths. They must not approve a new Dot
-- admission without the candidate-scope protocol. SELECT-only: no extra writes
-- and no change to meta.changes. Rejection/takedown remains possible.
CREATE TRIGGER IF NOT EXISTS news_dot_scope_protocol
BEFORE INSERT ON news_decision_ledger
WHEN NEW.verdict='approve' AND EXISTS(SELECT 1 FROM news_dot_admission_receipts r WHERE r.candidate_id=NEW.candidate_id)
BEGIN
 SELECT RAISE(ABORT,'dot_scope_protocol_required')
 WHERE NEW.actor_type<>'human_operator'
 OR json_extract(CASE WHEN json_valid(NEW.checks_json) THEN NEW.checks_json ELSE '{}' END,'$.dotPublication.ruleVersion') IS NOT 'dot-candidate-scope-1'
 OR length(COALESCE(json_extract(NEW.checks_json,'$.dotPublication.scopeDigest'),''))<>64
 OR json_extract(NEW.checks_json,'$.dotPublication.scopeDigest') GLOB '*[^0-9a-f]*'
 OR NOT EXISTS(SELECT 1 FROM news_dot_admission_receipts r WHERE r.candidate_id=NEW.candidate_id AND r.request_id=json_extract(NEW.checks_json,'$.dotPublication.receiptId') AND r.candidate_digest=json_extract(NEW.checks_json,'$.dotPublication.candidateDigest') AND r.staging_revision=json_extract(NEW.checks_json,'$.dotPublication.stagingRevision'));
END;
-- Older structured-review and automatic paths update candidate_items directly.
-- Dot approvals must instead be the effect of a matching protocol Ledger entry.
CREATE TRIGGER IF NOT EXISTS news_dot_scope_candidate_approval
BEFORE UPDATE ON candidate_items
WHEN NEW.review_status='approved' AND EXISTS(SELECT 1 FROM news_dot_admission_receipts r WHERE r.candidate_id=OLD.id)
AND (OLD.review_status<>'approved' OR NEW.product_facts IS NOT OLD.product_facts OR NEW.facts_provenance IS NOT OLD.facts_provenance OR NEW.label IS NOT OLD.label OR NEW.source_url IS NOT OLD.source_url OR NEW.normalized_url IS NOT OLD.normalized_url OR NEW.published_at IS NOT OLD.published_at OR NEW.category IS NOT OLD.category OR NEW.event_type IS NOT OLD.event_type OR NEW.topic_key IS NOT OLD.topic_key OR NEW.source_id IS NOT OLD.source_id OR NEW.origin IS NOT OLD.origin OR NEW.expires_at IS NOT OLD.expires_at OR NEW.sale_ends_at IS NOT OLD.sale_ends_at OR NEW.event_ends_at IS NOT OLD.event_ends_at OR NEW.publication_decision IS NOT OLD.publication_decision OR NEW.title_fingerprint IS NOT OLD.title_fingerprint)
BEGIN
 SELECT RAISE(ABORT,'dot_scope_protocol_required') WHERE NOT EXISTS(
 SELECT 1 FROM news_decision_ledger l JOIN news_dot_admission_receipts r ON r.candidate_id=l.candidate_id
 WHERE l.candidate_id=OLD.id AND l.verdict='approve' AND l.actor_type='human_operator' AND l.success_state='committed' AND l.candidate_revision=OLD.review_revision
 AND l.persisted_label=NEW.label AND json_extract(l.checks_json,'$.dotPublication.ruleVersion')='dot-candidate-scope-1'
 AND json_extract(l.checks_json,'$.dotPublication.receiptId')=r.request_id AND json_extract(l.checks_json,'$.dotPublication.candidateDigest')=r.candidate_digest AND json_extract(l.checks_json,'$.dotPublication.stagingRevision')=r.staging_revision);
END;
CREATE TRIGGER IF NOT EXISTS news_dot_scope_candidate_insert
BEFORE INSERT ON candidate_items
WHEN NEW.review_status='approved' AND EXISTS(SELECT 1 FROM news_dot_admission_receipts r WHERE r.candidate_id=NEW.id)
BEGIN
 SELECT RAISE(ABORT,'dot_scope_protocol_required');
END;
