ALTER TABLE news_controls ADD COLUMN publication_enabled INTEGER NOT NULL DEFAULT 0 CHECK(publication_enabled IN (0,1));
CREATE INDEX news_auto_pending ON candidate_items(source_id,publication_decision,review_status);
