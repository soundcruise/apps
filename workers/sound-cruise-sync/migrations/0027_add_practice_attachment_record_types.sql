-- Practice attachment asset metadata is published through the Port structured
-- data plane. M26 added the private asset kinds; this migration registers the
-- matching structured record types without changing existing rows or sequence
-- numbers.

CREATE TABLE sync_records_m27 (
    user_id TEXT NOT NULL REFERENCES sync_users(id) ON DELETE CASCADE,
    app_id TEXT NOT NULL,
    record_type TEXT NOT NULL CHECK (record_type IN (
        'settings', 'folder', 'chord', 'library_order',
        'custom_chord', 'custom_progression', 'melody_stage', 'chord_stage',
        'stage_order', 'progress', 'custom_stage', 'create_preset',
        'custom_preset', 'preset_order', 'builtin_stage_preferences',
        'custom_route', 'custom_quiz', 'builtin_route_override',
        'builtin_quiz_override', 'metronome_settings', 'metronome_preset',
        'tuner_settings', 'gear_category', 'gear_category_order', 'gear_item',
        'gear_order', 'calendar_event', 'practice_menu', 'practice_menu_order',
        'practice_attachment', 'practice_attachment_set',
        'practice_history_event', 'practice_cycle', 'my_app', 'my_app_order'
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

INSERT INTO sync_records_m27 SELECT
    user_id, app_id, record_type, record_id, payload_json, payload_hash,
    revision, updated_at, deleted_at, updated_by_device_id, last_operation_id,
    schema_version
FROM sync_records;
DROP TABLE sync_records;
ALTER TABLE sync_records_m27 RENAME TO sync_records;
CREATE INDEX idx_sync_records_dataset
    ON sync_records(user_id, app_id, deleted_at, record_type);

CREATE TABLE sync_changes_m27 (
    change_seq INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES sync_users(id) ON DELETE CASCADE,
    app_id TEXT NOT NULL,
    record_type TEXT NOT NULL CHECK (record_type IN (
        'settings', 'folder', 'chord', 'library_order',
        'custom_chord', 'custom_progression', 'melody_stage', 'chord_stage',
        'stage_order', 'progress', 'custom_stage', 'create_preset',
        'custom_preset', 'preset_order', 'builtin_stage_preferences',
        'custom_route', 'custom_quiz', 'builtin_route_override',
        'builtin_quiz_override', 'metronome_settings', 'metronome_preset',
        'tuner_settings', 'gear_category', 'gear_category_order', 'gear_item',
        'gear_order', 'calendar_event', 'practice_menu', 'practice_menu_order',
        'practice_attachment', 'practice_attachment_set',
        'practice_history_event', 'practice_cycle', 'my_app', 'my_app_order'
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

INSERT INTO sync_changes_m27 SELECT
    change_seq, user_id, app_id, record_type, record_id, revision, operation_id,
    operation_hash, payload_json, payload_hash, deleted_at, changed_at,
    schema_version
FROM sync_changes;
DROP TABLE sync_changes;
ALTER TABLE sync_changes_m27 RENAME TO sync_changes;
CREATE INDEX idx_sync_changes_pull
    ON sync_changes(user_id, app_id, change_seq);
