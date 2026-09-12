ALTER TABLE sync_users
    ADD COLUMN delete_requested_at INTEGER;

ALTER TABLE sync_users
    ADD COLUMN purge_after INTEGER;

CREATE INDEX IF NOT EXISTS idx_sync_users_purge
    ON sync_users(state, purge_after);

CREATE INDEX IF NOT EXISTS idx_sync_devices_user_last_seen
    ON sync_devices(user_id, app_id, revoked_at, last_seen_at);

CREATE TABLE IF NOT EXISTS account_delete_intents (
    intent_id TEXT PRIMARY KEY,
    intent_verifier TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL REFERENCES sync_users(id) ON DELETE CASCADE,
    app_id TEXT NOT NULL,
    requested_by_device_id TEXT NOT NULL REFERENCES sync_devices(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    consumed_at INTEGER,
    CHECK (expires_at > created_at),
    CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);

CREATE INDEX IF NOT EXISTS idx_account_delete_intents_user
    ON account_delete_intents(user_id, app_id, expires_at, consumed_at);
