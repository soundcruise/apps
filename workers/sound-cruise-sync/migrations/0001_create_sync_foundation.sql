PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sync_users (
    id TEXT PRIMARY KEY,
    state TEXT NOT NULL DEFAULT 'provisioning'
        CHECK (state IN ('provisioning', 'active', 'deleting', 'deleted')),
    recovery_version INTEGER NOT NULL DEFAULT 0
        CHECK (recovery_version >= 0),
    recovery_verifier TEXT UNIQUE,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    CHECK (
        (state = 'provisioning' AND recovery_version = 0 AND recovery_verifier IS NULL)
        OR
        (state <> 'provisioning' AND recovery_version >= 1 AND recovery_verifier IS NOT NULL)
    )
);

CREATE TABLE IF NOT EXISTS sync_devices (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES sync_users(id) ON DELETE CASCADE,
    app_id TEXT NOT NULL,
    credential_version INTEGER NOT NULL DEFAULT 1 CHECK (credential_version >= 1),
    credential_verifier TEXT NOT NULL UNIQUE,
    label TEXT,
    last_cursor INTEGER NOT NULL DEFAULT 0 CHECK (last_cursor >= 0),
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    revoked_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_sync_devices_user_active
    ON sync_devices(user_id, app_id, revoked_at);

CREATE TABLE IF NOT EXISTS pairing_codes (
    code_verifier TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES sync_users(id) ON DELETE CASCADE,
    created_by_device_id TEXT REFERENCES sync_devices(id) ON DELETE SET NULL,
    target_app_id TEXT NOT NULL,
    attempts_remaining INTEGER NOT NULL DEFAULT 5
        CHECK (attempts_remaining >= 0 AND attempts_remaining <= 5),
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    consumed_at INTEGER,
    cancelled_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_pairing_codes_expiry
    ON pairing_codes(expires_at, consumed_at, cancelled_at);

CREATE TABLE IF NOT EXISTS sync_datasets (
    user_id TEXT NOT NULL REFERENCES sync_users(id) ON DELETE CASCADE,
    app_id TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'initializing'
        CHECK (state IN ('initializing', 'ready')),
    schema_version INTEGER NOT NULL CHECK (schema_version >= 1),
    record_count INTEGER NOT NULL DEFAULT 0 CHECK (record_count >= 0),
    manifest_hash TEXT,
    min_change_seq INTEGER NOT NULL DEFAULT 0 CHECK (min_change_seq >= 0),
    initialized_at INTEGER,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, app_id)
);

CREATE TABLE IF NOT EXISTS sync_records (
    user_id TEXT NOT NULL REFERENCES sync_users(id) ON DELETE CASCADE,
    app_id TEXT NOT NULL,
    record_type TEXT NOT NULL
        CHECK (record_type IN ('settings', 'folder', 'chord', 'library_order')),
    record_id TEXT NOT NULL,
    payload_json TEXT,
    payload_hash TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision >= 1),
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    updated_by_device_id TEXT,
    last_operation_id TEXT NOT NULL,
    PRIMARY KEY (user_id, app_id, record_type, record_id),
    CHECK (
        (deleted_at IS NULL AND payload_json IS NOT NULL)
        OR
        (deleted_at IS NOT NULL AND payload_json IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_sync_records_dataset
    ON sync_records(user_id, app_id, deleted_at, record_type);

CREATE TABLE IF NOT EXISTS sync_changes (
    change_seq INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES sync_users(id) ON DELETE CASCADE,
    app_id TEXT NOT NULL,
    record_type TEXT NOT NULL
        CHECK (record_type IN ('settings', 'folder', 'chord', 'library_order')),
    record_id TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision >= 1),
    operation_id TEXT NOT NULL,
    operation_hash TEXT NOT NULL,
    payload_json TEXT,
    payload_hash TEXT NOT NULL,
    deleted_at INTEGER,
    changed_at INTEGER NOT NULL,
    UNIQUE (user_id, app_id, operation_id)
);

CREATE INDEX IF NOT EXISTS idx_sync_changes_pull
    ON sync_changes(user_id, app_id, change_seq);
