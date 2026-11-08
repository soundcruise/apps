-- Additive. Old Workers ignore the optional hint metadata and new search log.
-- No candidate, publication, judgment, Ledger, takedown or existing hint rewrite.
ALTER TABLE news_web_hints ADD COLUMN search_meta_json TEXT
 CHECK(search_meta_json IS NULL OR (json_valid(search_meta_json) AND length(search_meta_json)<=4000));
CREATE TABLE news_web_searches (
 id TEXT PRIMARY KEY,
 query_id TEXT NOT NULL CHECK(length(query_id)<=100),
 queried_at INTEGER NOT NULL,
 query_text TEXT NOT NULL CHECK(length(query_text)<=1024),
 provider TEXT NOT NULL CHECK(provider='exa'),
 outcome TEXT NOT NULL CHECK(outcome IN ('started','completed','search_failed','processing_failed')),
 results_json TEXT NOT NULL CHECK(json_valid(results_json) AND length(results_json)<=32768),
 expires_at INTEGER NOT NULL
);
CREATE INDEX news_web_searches_expiry ON news_web_searches(expires_at);
