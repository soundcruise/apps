-- Additive: disabled continues to mean collection stop. Explicit takedowns stay hidden.
ALTER TABLE source_state ADD COLUMN publication_blocked INTEGER NOT NULL DEFAULT 0 CHECK(publication_blocked IN (0,1));
UPDATE source_state SET publication_blocked=1 WHERE takedown=1;
ALTER TABLE candidate_items ADD COLUMN event_ends_at INTEGER;
-- Existing manual facts only. No fabricated dates and no premature retention deletion.
UPDATE candidate_items SET event_ends_at=CAST(ROUND((julianday(COALESCE(json_extract(product_facts,'$.endDate'),json_extract(product_facts,'$.eventDate')) || 'T00:00:00+09:00')-2440587.5)*86400000) AS INTEGER)+86400000-1
 WHERE json_valid(product_facts) AND json_extract(product_facts,'$.kind') IN ('artist_live','guitar_event')
 AND COALESCE(json_extract(product_facts,'$.eventType'),'')<>'interview'
 AND COALESCE(json_extract(product_facts,'$.endDate'),json_extract(product_facts,'$.eventDate')) GLOB '20??-??-??';
CREATE INDEX news_event_deadline ON candidate_items(event_ends_at) WHERE event_ends_at IS NOT NULL;
ALTER TABLE candidate_items ADD COLUMN dedupe_key TEXT;
CREATE INDEX news_candidate_dedupe ON candidate_items(source_id,dedupe_key);
CREATE INDEX news_source_topic_date ON candidate_items(source_id,topic_key,published_at);
UPDATE news_controls SET revision=revision+1 WHERE id=1;
INSERT INTO news_admin_audit VALUES('core-quality-migration-0010','schema-migrate','news-core-quality',CAST(strftime('%s','now') AS INTEGER)*1000,'quality_review');
