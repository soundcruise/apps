-- Binary Asset Sync Phase 1. D1 is lifecycle authority; object bytes remain in
-- the private R2 binding. Asset rows intentionally survive Account row purge
-- long enough for the scheduled R2 cleanup to finish safely.

CREATE TABLE sync_assets (
    asset_id TEXT PRIMARY KEY CHECK(length(asset_id) = 36),
    account_id TEXT NOT NULL,
    membership_id TEXT NOT NULL,
    sync_user_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN (
        'gear_photo_final', 'gear_photo_source',
        'my_app_icon_final', 'my_app_icon_source'
    )),
    state TEXT NOT NULL CHECK(state IN (
        'prepared', 'uploaded', 'available', 'unreferenced', 'deleted'
    )),
    content_hash TEXT NOT NULL
        CHECK(length(content_hash) = 64 AND content_hash NOT GLOB '*[^0-9a-f]*'),
    mime_type TEXT NOT NULL CHECK(mime_type IN ('image/webp', 'image/png', 'image/jpeg')),
    byte_size INTEGER NOT NULL CHECK(byte_size > 0),
    width INTEGER NOT NULL CHECK(width > 0),
    height INTEGER NOT NULL CHECK(height > 0),
    object_key TEXT NOT NULL UNIQUE,
    object_version INTEGER NOT NULL DEFAULT 1 CHECK(object_version >= 1),
    created_by_device_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    uploaded_at INTEGER,
    committed_at INTEGER,
    unreferenced_at INTEGER,
    deleted_at INTEGER,
    CHECK(updated_at >= created_at),
    CHECK(uploaded_at IS NULL OR uploaded_at >= created_at),
    CHECK(committed_at IS NULL OR committed_at >= created_at),
    CHECK(unreferenced_at IS NULL OR unreferenced_at >= created_at),
    CHECK(deleted_at IS NULL OR deleted_at >= created_at)
);

CREATE INDEX idx_sync_assets_owner
    ON sync_assets(account_id, sync_user_id, state, created_at);
CREATE INDEX idx_sync_assets_cleanup
    ON sync_assets(state, unreferenced_at, updated_at);

CREATE TABLE sync_asset_operations (
    operation_id TEXT PRIMARY KEY CHECK(length(operation_id) = 36),
    asset_id TEXT NOT NULL REFERENCES sync_assets(asset_id) ON DELETE CASCADE,
    account_id TEXT NOT NULL,
    sync_user_id TEXT NOT NULL,
    app_device_id TEXT NOT NULL,
    request_fingerprint TEXT NOT NULL
        CHECK(length(request_fingerprint) = 64 AND request_fingerprint NOT GLOB '*[^0-9a-f]*'),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(sync_user_id, asset_id)
);

CREATE INDEX idx_sync_asset_operations_owner
    ON sync_asset_operations(account_id, app_device_id, created_at);
