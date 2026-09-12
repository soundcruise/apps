ALTER TABLE sync_devices
    ADD COLUMN pairing_pending_at INTEGER;

ALTER TABLE sync_devices
    ADD COLUMN paired_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_sync_devices_pairing_pending
    ON sync_devices(user_id, app_id, pairing_pending_at, paired_at);

CREATE INDEX IF NOT EXISTS idx_pairing_codes_user_active
    ON pairing_codes(user_id, target_app_id, created_by_device_id, expires_at, consumed_at, cancelled_at);

CREATE TABLE IF NOT EXISTS pairing_issue_windows (
    device_id TEXT PRIMARY KEY REFERENCES sync_devices(id) ON DELETE CASCADE,
    window_started_at INTEGER NOT NULL,
    issued_count INTEGER NOT NULL CHECK (issued_count >= 1 AND issued_count <= 3),
    last_issue_id TEXT NOT NULL
);
