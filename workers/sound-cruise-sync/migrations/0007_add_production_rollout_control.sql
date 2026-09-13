CREATE TABLE IF NOT EXISTS sync_runtime_control (
    singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
    rollout_mode TEXT NOT NULL CHECK (rollout_mode IN ('closed', 'cohort', 'open')),
    admission_enabled INTEGER NOT NULL CHECK (admission_enabled IN (0, 1)),
    data_write_enabled INTEGER NOT NULL CHECK (data_write_enabled IN (0, 1)),
    data_read_enabled INTEGER NOT NULL CHECK (data_read_enabled IN (0, 1)),
    recovery_enabled INTEGER NOT NULL CHECK (recovery_enabled IN (0, 1)),
    cloud_delete_enabled INTEGER NOT NULL CHECK (cloud_delete_enabled IN (0, 1)),
    generation INTEGER NOT NULL CHECK (generation >= 1),
    updated_at INTEGER NOT NULL
);

-- Applying the migration alone never admits a new production identity. Existing
-- devices retain normal read/write, Recovery and deletion so a rollout close is
-- not itself a data lockout.
INSERT OR IGNORE INTO sync_runtime_control (
    singleton_id, rollout_mode, admission_enabled, data_write_enabled,
    data_read_enabled, recovery_enabled, cloud_delete_enabled, generation, updated_at
) VALUES (1, 'closed', 0, 1, 1, 1, 1, 1, 0);

CREATE TABLE IF NOT EXISTS sync_enrollment_codes (
    code_verifier TEXT PRIMARY KEY,
    app_id TEXT NOT NULL CHECK (app_id = 'chord'),
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    consumed_at INTEGER,
    consumed_by_user_id TEXT REFERENCES sync_users(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
    cancelled_at INTEGER,
    CHECK (expires_at > created_at),
    CHECK (consumed_at IS NULL OR consumed_at >= created_at),
    CHECK (cancelled_at IS NULL OR cancelled_at >= created_at),
    CHECK ((consumed_at IS NULL) = (consumed_by_user_id IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_sync_enrollment_codes_status
    ON sync_enrollment_codes(app_id, expires_at, consumed_at, cancelled_at);
