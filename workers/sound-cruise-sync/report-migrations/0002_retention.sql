ALTER TABLE studio_reports ADD COLUMN redacted_at INTEGER;
ALTER TABLE studio_report_limits ADD COLUMN expires_at INTEGER NOT NULL DEFAULT 0;
CREATE INDEX studio_reports_retention ON studio_reports(redacted_at,created_at);
CREATE INDEX studio_report_audit_retention ON studio_report_audit(created_at);
CREATE INDEX studio_report_limits_retention ON studio_report_limits(expires_at);
