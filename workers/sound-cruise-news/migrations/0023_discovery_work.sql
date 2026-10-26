-- Additive operational work queue; never a human publication decision.
CREATE TABLE news_discovery_work (
 source_id TEXT NOT NULL, normalized_url TEXT NOT NULL,
 first_seen_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 processing_state TEXT NOT NULL, reason_code TEXT NOT NULL,
 candidate_id TEXT, next_at INTEGER, next_action TEXT NOT NULL,
 parser_version TEXT, evidence_ref TEXT,
 diagnostics_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(diagnostics_json)),
 evidence_json TEXT CHECK(evidence_json IS NULL OR json_valid(evidence_json)),
 history_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(history_json)),
 PRIMARY KEY(source_id,normalized_url)
);
CREATE INDEX news_discovery_due ON news_discovery_work(source_id,processing_state,next_at,first_seen_at);
-- Preserve existing receipts. An unknown, late-listed URL is never made known
-- merely because the old collector called it before_watermark.
INSERT INTO news_discovery_work(source_id,normalized_url,first_seen_at,updated_at,processing_state,reason_code,candidate_id,next_action)
SELECT r.source_id,r.normalized_url,r.first_seen_at,r.last_seen_at,
 CASE WHEN c.review_status IN ('approved','rejected','system_excluded') THEN 'known'
 WHEN CAST(strftime('%s',r.published_at) AS INTEGER)*1000<=r.last_seen_at-7776000000 THEN 'outside_date_window'
 WHEN r.outcome='ready_for_human_decision' THEN 'validated_ready'
 WHEN r.outcome='duplicate_blocked' THEN 'duplicate'
 WHEN r.reason_code='date_outside_window' THEN 'outside_date_window'
 WHEN r.reason_code='agm_detail_budget_deferred' THEN 'awaiting_fetch_budget'
 WHEN r.reason_code IN ('before_watermark','awaiting_evaluation') AND c.id IS NULL THEN 'discovered'
 WHEN c.id IS NOT NULL OR r.reason_code IN ('receipt_evaluation','listing_metadata_unparsed') THEN 'evidence_insufficient'
 ELSE 'out_of_scope' END,
 CASE WHEN c.id IS NULL AND CAST(strftime('%s',r.published_at) AS INTEGER)*1000<=r.last_seen_at-7776000000 THEN 'date_outside_window' ELSE r.reason_code END,c.id,
 CASE WHEN r.reason_code IN ('agm_detail_budget_deferred','before_watermark','awaiting_evaluation') AND c.id IS NULL THEN 'daily_recovery' ELSE 'none' END
FROM news_discovery_receipts r LEFT JOIN candidate_items c ON c.source_id=r.source_id AND c.normalized_url=r.normalized_url;
