-- M7: add the locally implemented Fretboard adapter record types. Runtime
-- admission remains controlled by SYNC_ALLOWED_APP_IDS, so this additive
-- schema migration does not expose Fretboard in production by itself.

CREATE TABLE sync_records_m7 (
    user_id TEXT NOT NULL REFERENCES sync_users(id) ON DELETE CASCADE,
    app_id TEXT NOT NULL,
    record_type TEXT NOT NULL CHECK (record_type IN (
        'settings', 'folder', 'chord', 'library_order',
        'custom_chord', 'custom_progression', 'melody_stage', 'chord_stage',
        'stage_order', 'progress',
        'custom_stage', 'create_preset', 'custom_preset', 'preset_order',
        'builtin_stage_preferences',
        'custom_route', 'custom_quiz', 'builtin_route_override',
        'builtin_quiz_override'
    )),
    record_id TEXT NOT NULL,
    payload_json TEXT,
    payload_hash TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision >= 1),
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    updated_by_device_id TEXT,
    last_operation_id TEXT NOT NULL,
    schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version >= 1),
    PRIMARY KEY (user_id, app_id, record_type, record_id),
    CHECK ((deleted_at IS NULL AND payload_json IS NOT NULL)
        OR (deleted_at IS NOT NULL AND payload_json IS NULL))
);

INSERT INTO sync_records_m7 SELECT
    user_id, app_id, record_type, record_id, payload_json, payload_hash,
    revision, updated_at, deleted_at, updated_by_device_id, last_operation_id,
    schema_version
FROM sync_records;

DROP TABLE sync_records;
ALTER TABLE sync_records_m7 RENAME TO sync_records;
CREATE INDEX idx_sync_records_dataset
    ON sync_records(user_id, app_id, deleted_at, record_type);

CREATE TABLE sync_changes_m7 (
    change_seq INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES sync_users(id) ON DELETE CASCADE,
    app_id TEXT NOT NULL,
    record_type TEXT NOT NULL CHECK (record_type IN (
        'settings', 'folder', 'chord', 'library_order',
        'custom_chord', 'custom_progression', 'melody_stage', 'chord_stage',
        'stage_order', 'progress',
        'custom_stage', 'create_preset', 'custom_preset', 'preset_order',
        'builtin_stage_preferences',
        'custom_route', 'custom_quiz', 'builtin_route_override',
        'builtin_quiz_override'
    )),
    record_id TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision >= 1),
    operation_id TEXT NOT NULL,
    operation_hash TEXT NOT NULL,
    payload_json TEXT,
    payload_hash TEXT NOT NULL,
    deleted_at INTEGER,
    changed_at INTEGER NOT NULL,
    schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version >= 1),
    UNIQUE (user_id, app_id, operation_id)
);

INSERT INTO sync_changes_m7 SELECT
    change_seq, user_id, app_id, record_type, record_id, revision, operation_id,
    operation_hash, payload_json, payload_hash, deleted_at, changed_at,
    schema_version
FROM sync_changes;

DROP TABLE sync_changes;
ALTER TABLE sync_changes_m7 RENAME TO sync_changes;
CREATE INDEX idx_sync_changes_pull
    ON sync_changes(user_id, app_id, change_seq);
