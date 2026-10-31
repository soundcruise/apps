-- Exact, short-lived evidence membership remains server-side. No article body.
CREATE TABLE IF NOT EXISTS news_dot_scope_witnesses (
 nonce TEXT PRIMARY KEY,
 candidate_id TEXT NOT NULL REFERENCES candidate_items(id) ON DELETE CASCADE,
 keys_hash TEXT NOT NULL,
 keys_json TEXT NOT NULL CHECK(json_valid(keys_json)),
 state TEXT NOT NULL CHECK(json_valid(state)),
 expires_at INTEGER NOT NULL,
 decision_id TEXT
);
CREATE INDEX IF NOT EXISTS news_dot_scope_witness_lookup ON news_dot_scope_witnesses(candidate_id,keys_hash,expires_at);
CREATE INDEX IF NOT EXISTS news_dot_scope_witness_expiry ON news_dot_scope_witnesses(expires_at) WHERE decision_id IS NULL;
CREATE TRIGGER IF NOT EXISTS news_dot_scope_witness_immutable BEFORE UPDATE ON news_dot_scope_witnesses
WHEN NEW.nonce IS NOT OLD.nonce OR NEW.candidate_id IS NOT OLD.candidate_id OR NEW.keys_hash IS NOT OLD.keys_hash OR NEW.keys_json IS NOT OLD.keys_json OR NEW.state IS NOT OLD.state OR NEW.expires_at IS NOT OLD.expires_at OR (NEW.decision_id IS NOT OLD.decision_id AND (OLD.decision_id IS NOT NULL OR NOT EXISTS(SELECT 1 FROM news_decision_ledger WHERE decision_id=NEW.decision_id AND candidate_id=OLD.candidate_id AND verdict='approve')))
BEGIN SELECT RAISE(ABORT,'dot_witness_immutable'); END;
CREATE TRIGGER IF NOT EXISTS news_dot_scope_witness_commit AFTER INSERT ON news_decision_ledger
WHEN NEW.verdict='approve' AND EXISTS(SELECT 1 FROM news_dot_admission_receipts WHERE candidate_id=NEW.candidate_id)
BEGIN
 UPDATE news_dot_scope_witnesses SET decision_id=NEW.decision_id WHERE nonce=json_extract(NEW.checks_json,'$.dotPublication.scopeWitnessId') AND candidate_id=NEW.candidate_id;
END;
DROP TRIGGER IF EXISTS news_dot_scope_protocol;
DROP TRIGGER IF EXISTS news_dot_scope_candidate_approval;
CREATE TRIGGER IF NOT EXISTS news_dot_scope_protocol
BEFORE INSERT ON news_decision_ledger
WHEN NEW.verdict='approve' AND EXISTS(SELECT 1 FROM news_dot_admission_receipts r WHERE r.candidate_id=NEW.candidate_id)
BEGIN
 SELECT RAISE(ABORT,'dot_scope_protocol_required')
 WHERE NEW.actor_type<>'human_operator'
 OR json_extract(CASE WHEN json_valid(NEW.checks_json) THEN NEW.checks_json ELSE '{}' END,'$.dotPublication.ruleVersion') IS NOT 'dot-candidate-scope-2'
 OR length(COALESCE(json_extract(NEW.checks_json,'$.dotPublication.scopeDigest'),''))<>64
 OR json_extract(NEW.checks_json,'$.dotPublication.scopeDigest') GLOB '*[^0-9a-f]*'
OR NOT EXISTS(SELECT 1 FROM news_dot_scope_witnesses w WHERE w.candidate_id=NEW.candidate_id AND w.nonce=json_extract(NEW.checks_json,'$.dotPublication.scopeWitnessId') AND w.decision_id IS NULL AND w.expires_at>NEW.decided_at AND json_extract(w.keys_json,'$.snapshot')=NEW.candidate_snapshot AND json_extract(w.keys_json,'$.receipt')=json_extract(NEW.checks_json,'$.dotPublication.receiptId') AND json_extract(w.state,'$.unresolved')=0 AND json_extract(w.state,'$.related')=0 AND json_extract(w.state,'$.blocked')=0)
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
 AND l.persisted_label=NEW.label AND json_extract(l.checks_json,'$.dotPublication.ruleVersion')='dot-candidate-scope-2'
 AND json_extract(l.checks_json,'$.dotPublication.receiptId')=r.request_id AND json_extract(l.checks_json,'$.dotPublication.candidateDigest')=r.candidate_digest AND json_extract(l.checks_json,'$.dotPublication.stagingRevision')=r.staging_revision);
END;
