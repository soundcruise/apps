CREATE TABLE studio_reports (
 report_id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, app TEXT NOT NULL, app_version TEXT NOT NULL,
 category TEXT NOT NULL, feature TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL,
 reproduction_steps TEXT NOT NULL, expected_behavior TEXT NOT NULL, environment TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'new', priority TEXT NOT NULL DEFAULT 'unreviewed', duplicate_group TEXT,
 ai_analysis TEXT, admin_decision TEXT, related_issue TEXT, related_pr TEXT, resolved_version TEXT,
 request_hash TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0,
 ai_state TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, lease_until INTEGER NOT NULL DEFAULT 0,
 next_attempt INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX studio_reports_queue ON studio_reports(ai_state,next_attempt,created_at);
CREATE TABLE studio_report_audit(id TEXT PRIMARY KEY,report_id TEXT NOT NULL,created_at INTEGER NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,details TEXT NOT NULL);
CREATE TABLE studio_report_limits(bucket TEXT PRIMARY KEY, count INTEGER NOT NULL);
CREATE TABLE studio_report_budget(day TEXT PRIMARY KEY,calls INTEGER NOT NULL,reserved_microusd INTEGER NOT NULL);
