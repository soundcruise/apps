-- Facts-entry audit only, independent of publication decision/feedback.
CREATE TABLE news_assisted_edits(
 request_id TEXT PRIMARY KEY,payload_hash TEXT NOT NULL,candidate_id TEXT NOT NULL,
 source_url TEXT NOT NULL,published_at TEXT NOT NULL,facts_json TEXT NOT NULL CHECK(json_valid(facts_json)),
 label TEXT NOT NULL,permission_ref TEXT NOT NULL,verified_at INTEGER NOT NULL,
 actor_type TEXT NOT NULL CHECK(actor_type='human_operator'),actor_id TEXT NOT NULL,
 operation_type TEXT NOT NULL CHECK(operation_type IN ('create','edit'))
);
CREATE INDEX news_assisted_candidate ON news_assisted_edits(candidate_id,verified_at);
