CREATE TABLE news_controls (
 id INTEGER PRIMARY KEY CHECK(id=1), collection_enabled INTEGER NOT NULL DEFAULT 0 CHECK(collection_enabled IN (0,1)),
 api_enabled INTEGER NOT NULL DEFAULT 0 CHECK(api_enabled IN (0,1)), revision INTEGER NOT NULL DEFAULT 0
);
INSERT INTO news_controls(id) VALUES(1);
ALTER TABLE source_state ADD COLUMN takedown INTEGER NOT NULL DEFAULT 0;
ALTER TABLE candidate_items RENAME TO candidate_items_legacy;
CREATE TABLE candidate_items (
 id TEXT PRIMARY KEY, source_id TEXT NOT NULL, source_name TEXT NOT NULL,
 source_url TEXT NOT NULL UNIQUE, normalized_url TEXT NOT NULL, published_at TEXT,
 category TEXT NOT NULL, label TEXT NOT NULL CHECK(length(label) BETWEEN 4 AND 140), topic_key TEXT NOT NULL,
 collected_at TEXT NOT NULL, title_hash TEXT NOT NULL, title_fingerprint TEXT,
 review_status TEXT NOT NULL CHECK(review_status IN ('pending','approved','rejected','reopened')),
 review_reason TEXT NOT NULL, reviewed_at TEXT, expires_at INTEGER NOT NULL,
 event_type TEXT NOT NULL DEFAULT 'other', product_facts TEXT, feed_published_at TEXT,
 reviewed_by TEXT, review_checks TEXT, article_checks TEXT, date_override_reason TEXT
);
INSERT INTO candidate_items(id,source_id,source_name,source_url,normalized_url,published_at,category,label,topic_key,collected_at,title_hash,review_status,review_reason,reviewed_at,expires_at,feed_published_at)
 SELECT id,source_id,source_name,source_url,normalized_url,published_at,category,label,topic_key,collected_at,title_hash,
 CASE WHEN review_status='rejected' THEN 'rejected' ELSE 'pending' END,'legacy_recollection_required',NULL,expires_at,published_at FROM candidate_items_legacy;
DROP TABLE candidate_items_legacy;
CREATE INDEX news_public_order ON candidate_items(review_status,published_at DESC,id);
CREATE INDEX news_expiry ON candidate_items(expires_at);
CREATE INDEX news_source ON candidate_items(source_id);
CREATE UNIQUE INDEX news_approved_topic ON candidate_items(topic_key) WHERE review_status='approved';
CREATE TABLE news_admin_audit (
 id TEXT PRIMARY KEY, action TEXT NOT NULL, target TEXT NOT NULL, occurred_at INTEGER NOT NULL, reason_code TEXT NOT NULL
);
CREATE INDEX news_audit_expiry ON news_admin_audit(occurred_at);
CREATE INDEX news_run_expiry ON collection_runs(collected_at);
CREATE TABLE news_takedowns (item_id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
