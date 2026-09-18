-- Practice Menu attachments reuse the private R2 asset contract while keeping
-- their quota, ownership metadata, and executable-content restrictions
-- separate from Gear/My Apps image storage.

CREATE TABLE sync_assets_v2 (
    asset_id TEXT PRIMARY KEY CHECK(length(asset_id) = 36),
    account_id TEXT NOT NULL,
    membership_id TEXT NOT NULL,
    sync_user_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN (
        'gear_photo_final', 'gear_photo_source',
        'my_app_icon_final', 'my_app_icon_source',
        'practice_attachment_image', 'practice_attachment_pdf', 'practice_attachment_text'
    )),
    state TEXT NOT NULL CHECK(state IN (
        'prepared', 'uploaded', 'available', 'unreferenced', 'deleted'
    )),
    content_hash TEXT NOT NULL
        CHECK(length(content_hash) = 64 AND content_hash NOT GLOB '*[^0-9a-f]*'),
    mime_type TEXT NOT NULL CHECK(mime_type IN (
        'image/webp', 'image/png', 'image/jpeg', 'application/pdf', 'text/plain'
    )),
    byte_size INTEGER NOT NULL CHECK(byte_size > 0),
    width INTEGER NOT NULL CHECK(width > 0),
    height INTEGER NOT NULL CHECK(height > 0),
    object_key TEXT NOT NULL UNIQUE,
    object_version INTEGER NOT NULL DEFAULT 1 CHECK(object_version >= 1),
    created_by_device_id TEXT NOT NULL,
    owner_record_type TEXT,
    owner_record_id TEXT,
    original_filename TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    uploaded_at INTEGER,
    committed_at INTEGER,
    unreferenced_at INTEGER,
    deleted_at INTEGER,
    storage_category TEXT NOT NULL DEFAULT 'image'
        CHECK(storage_category IN ('image', 'document_score', 'audio', 'practice_attachment')),
    CHECK(updated_at >= created_at),
    CHECK(uploaded_at IS NULL OR uploaded_at >= created_at),
    CHECK(committed_at IS NULL OR committed_at >= created_at),
    CHECK(unreferenced_at IS NULL OR unreferenced_at >= created_at),
    CHECK(deleted_at IS NULL OR deleted_at >= created_at),
    CHECK(
      (kind IN ('practice_attachment_image', 'practice_attachment_pdf', 'practice_attachment_text')
       AND storage_category = 'practice_attachment'
       AND owner_record_type = 'practice_menu'
       AND owner_record_id IS NOT NULL AND length(owner_record_id) BETWEEN 1 AND 200
       AND original_filename IS NOT NULL AND length(original_filename) BETWEEN 1 AND 255)
      OR
      (kind NOT IN ('practice_attachment_image', 'practice_attachment_pdf', 'practice_attachment_text')
       AND storage_category <> 'practice_attachment'
       AND owner_record_type IS NULL AND owner_record_id IS NULL AND original_filename IS NULL)
    )
);

INSERT INTO sync_assets_v2 (
    asset_id, account_id, membership_id, sync_user_id, kind, state,
    content_hash, mime_type, byte_size, width, height, object_key,
    object_version, created_by_device_id, created_at, updated_at,
    uploaded_at, committed_at, unreferenced_at, deleted_at, storage_category
)
SELECT asset_id, account_id, membership_id, sync_user_id, kind, state,
       content_hash, mime_type, byte_size, width, height, object_key,
       object_version, created_by_device_id, created_at, updated_at,
       uploaded_at, committed_at, unreferenced_at, deleted_at, storage_category
FROM sync_assets;

CREATE TABLE sync_asset_operations_v2 (
    operation_id TEXT PRIMARY KEY CHECK(length(operation_id) = 36),
    asset_id TEXT NOT NULL REFERENCES sync_assets_v2(asset_id) ON DELETE CASCADE,
    account_id TEXT NOT NULL,
    sync_user_id TEXT NOT NULL,
    app_device_id TEXT NOT NULL,
    request_fingerprint TEXT NOT NULL
        CHECK(length(request_fingerprint) = 64 AND request_fingerprint NOT GLOB '*[^0-9a-f]*'),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(sync_user_id, asset_id)
);

INSERT INTO sync_asset_operations_v2
SELECT operation_id, asset_id, account_id, sync_user_id, app_device_id,
       request_fingerprint, created_at, updated_at
FROM sync_asset_operations;

DROP TABLE sync_asset_operations;
DROP TABLE sync_assets;
ALTER TABLE sync_assets_v2 RENAME TO sync_assets;
ALTER TABLE sync_asset_operations_v2 RENAME TO sync_asset_operations;

CREATE INDEX idx_sync_assets_owner
    ON sync_assets(account_id, sync_user_id, state, created_at);
CREATE INDEX idx_sync_assets_cleanup
    ON sync_assets(state, unreferenced_at, updated_at);
CREATE INDEX idx_sync_assets_category_quota
    ON sync_assets(account_id, storage_category, state, created_at);
CREATE INDEX idx_sync_assets_practice_owner
    ON sync_assets(account_id, sync_user_id, owner_record_id, state, created_at);
CREATE INDEX idx_sync_asset_operations_owner
    ON sync_asset_operations(account_id, app_device_id, created_at);
