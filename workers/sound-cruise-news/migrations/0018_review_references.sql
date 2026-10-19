-- Private review identifiers are not publication facts, headlines or teachers.
CREATE TABLE news_review_references (
 candidate_id TEXT PRIMARY KEY REFERENCES candidate_items(id) ON DELETE CASCADE,
 source_url TEXT NOT NULL,
 published_at TEXT NOT NULL,
 identifier TEXT NOT NULL CHECK(length(identifier) BETWEEN 2 AND 80),
 basis TEXT NOT NULL CHECK(basis='owner_audit_identifier'),
 recorded_at INTEGER NOT NULL,
 reference TEXT NOT NULL
);
