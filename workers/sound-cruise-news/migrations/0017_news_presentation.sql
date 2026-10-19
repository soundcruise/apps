-- Display preferences are separate from editorial decisions and training data.
CREATE TABLE news_presentation_days (
 day TEXT PRIMARY KEY,
 revision INTEGER NOT NULL CHECK(revision>=1),
 items_json TEXT NOT NULL CHECK(json_valid(items_json) AND json_type(items_json)='array'),
 updated_at INTEGER NOT NULL
);
CREATE TABLE news_presentation_requests (
 request_id TEXT PRIMARY KEY,
 payload_hash TEXT NOT NULL,
 actor_type TEXT NOT NULL,
 actor_id TEXT NOT NULL,
 day TEXT NOT NULL,
 expected_revision INTEGER NOT NULL,
 items_json TEXT NOT NULL CHECK(json_valid(items_json) AND json_type(items_json)='array'),
 created_at INTEGER NOT NULL
);
CREATE TRIGGER news_presentation_revision BEFORE INSERT ON news_presentation_requests BEGIN
 SELECT RAISE(ABORT,'presentation_changed') WHERE COALESCE((SELECT revision FROM news_presentation_days WHERE day=NEW.day),0)<>NEW.expected_revision;
END;
CREATE TRIGGER news_presentation_apply AFTER INSERT ON news_presentation_requests BEGIN
 INSERT INTO news_presentation_days(day,revision,items_json,updated_at) VALUES(NEW.day,NEW.expected_revision+1,NEW.items_json,NEW.created_at)
 ON CONFLICT(day) DO UPDATE SET revision=excluded.revision,items_json=excluded.items_json,updated_at=excluded.updated_at;
 UPDATE news_controls SET revision=revision+1 WHERE id=1;
END;
