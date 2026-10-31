-- Append-only, candidate-bound change sequence. Old Workers' INSERT/DELETE on
-- the evidence table cannot bypass it; the event contains no evidence text.
CREATE TABLE IF NOT EXISTS news_dot_evidence_events (
 seq INTEGER PRIMARY KEY AUTOINCREMENT,
 candidate_id TEXT NOT NULL,
 request_id TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('insert','delete'))
);
CREATE INDEX IF NOT EXISTS news_dot_evidence_events_candidate ON news_dot_evidence_events(candidate_id,seq);
CREATE TRIGGER IF NOT EXISTS news_dot_evidence_events_immutable_update BEFORE UPDATE ON news_dot_evidence_events BEGIN SELECT RAISE(ABORT,'dot_evidence_events_immutable'); END;
CREATE TRIGGER IF NOT EXISTS news_dot_evidence_events_immutable_delete BEFORE DELETE ON news_dot_evidence_events BEGIN SELECT RAISE(ABORT,'dot_evidence_events_immutable'); END;
CREATE TRIGGER IF NOT EXISTS news_dot_evidence_insert_event AFTER INSERT ON news_dot_history_exclusions BEGIN
 INSERT INTO news_dot_evidence_events(candidate_id,request_id,action) VALUES(NEW.candidate_id,NEW.request_id,'insert');
END;
CREATE TRIGGER IF NOT EXISTS news_dot_evidence_delete_event AFTER DELETE ON news_dot_history_exclusions BEGIN
 INSERT INTO news_dot_evidence_events(candidate_id,request_id,action) VALUES(OLD.candidate_id,OLD.request_id,'delete');
END;
