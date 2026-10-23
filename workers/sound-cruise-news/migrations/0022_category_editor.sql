-- Presentation classification is separate from primary facts and publication decisions.
CREATE TABLE news_category_overrides (
 candidate_id TEXT PRIMARY KEY,
 category TEXT NOT NULL CHECK(category IN ('acoustic_guitar','electric_guitar_bass','amps_effects','recording_audio','dtm_software','creator_streaming','artist_guitar','live_guitar','media_other','sale')),
 updated_at INTEGER NOT NULL,
 actor_type TEXT NOT NULL CHECK(actor_type='human_operator'),
 actor_id TEXT NOT NULL
);
CREATE TABLE news_category_edits (
 request_id TEXT PRIMARY KEY,
 payload_hash TEXT NOT NULL,
 candidate_id TEXT NOT NULL,
 old_category TEXT NOT NULL,
 new_category TEXT NOT NULL CHECK(new_category IN ('acoustic_guitar','electric_guitar_bass','amps_effects','recording_audio','dtm_software','creator_streaming','artist_guitar','live_guitar','media_other','sale')),
 created_at INTEGER NOT NULL,
 actor_type TEXT NOT NULL CHECK(actor_type='human_operator'),
 actor_id TEXT NOT NULL,
 operation_type TEXT NOT NULL CHECK(operation_type='manual_category_edit'),
 expected_revision INTEGER NOT NULL
);
CREATE INDEX news_category_history ON news_category_edits(candidate_id,created_at DESC);
CREATE TRIGGER news_category_guard BEFORE INSERT ON news_category_edits BEGIN
 SELECT RAISE(ABORT,'category_changed') WHERE NOT EXISTS (
  SELECT 1 FROM candidate_items c WHERE c.id=NEW.candidate_id AND c.review_revision=NEW.expected_revision
  AND c.review_status IN ('approved','pending','reopened') AND c.expires_at>NEW.created_at
  AND COALESCE((SELECT category FROM news_category_overrides WHERE candidate_id=c.id),c.category)=NEW.old_category
  AND NOT EXISTS(SELECT 1 FROM news_takedowns WHERE item_id=c.id)
  AND NOT EXISTS(SELECT 1 FROM source_state WHERE source_id=c.source_id AND (takedown=1 OR publication_blocked=1))
 );
END;
CREATE TRIGGER news_category_apply AFTER INSERT ON news_category_edits BEGIN
 INSERT INTO news_category_overrides(candidate_id,category,updated_at,actor_type,actor_id)
 VALUES(NEW.candidate_id,NEW.new_category,NEW.created_at,NEW.actor_type,NEW.actor_id)
 ON CONFLICT(candidate_id) DO UPDATE SET category=excluded.category,updated_at=excluded.updated_at,actor_type=excluded.actor_type,actor_id=excluded.actor_id;
 UPDATE candidate_items SET review_revision=review_revision+1 WHERE id=NEW.candidate_id;
 UPDATE news_controls SET revision=revision+1 WHERE id=1;
END;
