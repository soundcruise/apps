-- M20: Cruise Port becomes an Account-managed data-plane member. The public
-- four-app API remains unchanged; `port` is a hidden system membership.

PRAGMA defer_foreign_keys = ON;

CREATE TABLE sync_account_managed_users_m20_backup AS
    SELECT sync_user_id, account_id, membership_id, app_id, created_at
    FROM sync_account_managed_users;

-- Rebuilding the membership CHECK constraint fires ON DELETE actions even
-- while foreign-key validation is deferred. Preserve every membership child
-- explicitly so a production migration cannot erase active links or pending
-- lifecycle operations.
CREATE TABLE sync_membership_device_links_m20_backup AS
    SELECT * FROM sync_membership_device_links;
CREATE TABLE sync_account_recovery_claims_m20_backup AS
    SELECT * FROM sync_account_recovery_claims;
CREATE TABLE sync_account_delete_intents_m20_backup AS
    SELECT * FROM sync_account_delete_intents;
CREATE TABLE sync_membership_handoffs_m20_backup AS
    SELECT * FROM sync_membership_handoffs;
CREATE TABLE sync_chord_account_bridges_m20_backup AS
    SELECT * FROM sync_chord_account_bridges;
CREATE TABLE sync_app_join_invitations_m20_backup AS
    SELECT * FROM sync_app_join_invitations;

CREATE TABLE sync_account_memberships_m20 (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES sync_accounts(id) ON DELETE CASCADE,
    app_id TEXT NOT NULL CHECK (app_id IN ('chord', 'pitch', 'fretboard', 'rhythm', 'port')),
    state TEXT NOT NULL DEFAULT 'pending'
        CHECK (state IN ('pending', 'active', 'deleting', 'deleted')),
    sync_user_id TEXT UNIQUE REFERENCES sync_users(id) ON DELETE SET NULL
        DEFERRABLE INITIALLY DEFERRED,
    recovery_mode TEXT NOT NULL DEFAULT 'account'
        CHECK (recovery_mode IN ('legacy', 'dual', 'account')),
    generation INTEGER NOT NULL DEFAULT 1 CHECK (generation >= 1),
    created_at INTEGER NOT NULL,
    activated_at INTEGER,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    prepared_operation_id TEXT,
    prepared_by_account_device_id TEXT REFERENCES sync_account_devices(id),
    legacy_recovery_disabled_at INTEGER,
    delete_requested_at INTEGER,
    purge_after INTEGER,
    UNIQUE (account_id, app_id),
    UNIQUE (account_id, id),
    CHECK (updated_at >= created_at),
    CHECK (
        (state = 'pending' AND sync_user_id IS NULL AND activated_at IS NULL)
        OR
        (state IN ('active', 'deleting') AND sync_user_id IS NOT NULL AND activated_at IS NOT NULL)
        OR state = 'deleted'
    ),
    CHECK (activated_at IS NULL OR activated_at >= created_at),
    CHECK (deleted_at IS NULL OR deleted_at >= created_at),
    CHECK (legacy_recovery_disabled_at IS NULL OR legacy_recovery_disabled_at >= created_at),
    CHECK (purge_after IS NULL OR delete_requested_at IS NOT NULL)
);

INSERT INTO sync_account_memberships_m20 (
    id, account_id, app_id, state, sync_user_id, recovery_mode, generation,
    created_at, activated_at, updated_at, deleted_at, prepared_operation_id,
    prepared_by_account_device_id, legacy_recovery_disabled_at,
    delete_requested_at, purge_after
) SELECT id, account_id, app_id, state, sync_user_id, recovery_mode, generation,
    created_at, activated_at, updated_at, deleted_at, prepared_operation_id,
    prepared_by_account_device_id, legacy_recovery_disabled_at,
    delete_requested_at, purge_after
FROM sync_account_memberships;

DROP TABLE sync_account_memberships;
ALTER TABLE sync_account_memberships_m20 RENAME TO sync_account_memberships;
CREATE INDEX idx_sync_account_memberships_state
    ON sync_account_memberships(account_id, state, app_id);
CREATE INDEX idx_sync_account_memberships_purge
    ON sync_account_memberships(state, purge_after);

INSERT INTO sync_membership_device_links SELECT * FROM sync_membership_device_links_m20_backup;
INSERT INTO sync_account_recovery_claims SELECT * FROM sync_account_recovery_claims_m20_backup;
INSERT INTO sync_account_delete_intents SELECT * FROM sync_account_delete_intents_m20_backup;
INSERT INTO sync_membership_handoffs SELECT * FROM sync_membership_handoffs_m20_backup;
INSERT INTO sync_chord_account_bridges SELECT * FROM sync_chord_account_bridges_m20_backup;
INSERT INTO sync_app_join_invitations SELECT * FROM sync_app_join_invitations_m20_backup;
DROP TABLE sync_membership_device_links_m20_backup;
DROP TABLE sync_account_recovery_claims_m20_backup;
DROP TABLE sync_account_delete_intents_m20_backup;
DROP TABLE sync_membership_handoffs_m20_backup;
DROP TABLE sync_chord_account_bridges_m20_backup;
DROP TABLE sync_app_join_invitations_m20_backup;

CREATE TABLE sync_account_managed_users_m20 (
    sync_user_id TEXT PRIMARY KEY REFERENCES sync_users(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL REFERENCES sync_accounts(id) ON DELETE CASCADE,
    membership_id TEXT NOT NULL UNIQUE,
    app_id TEXT NOT NULL CHECK (app_id IN ('chord', 'pitch', 'fretboard', 'rhythm', 'port')),
    created_at INTEGER NOT NULL,
    UNIQUE (account_id, app_id),
    FOREIGN KEY (account_id, membership_id)
        REFERENCES sync_account_memberships(account_id, id) ON DELETE CASCADE
);

INSERT INTO sync_account_managed_users_m20
    SELECT sync_user_id, account_id, membership_id, app_id, created_at
    FROM sync_account_managed_users_m20_backup;
DROP TABLE sync_account_managed_users;
ALTER TABLE sync_account_managed_users_m20 RENAME TO sync_account_managed_users;
CREATE INDEX idx_sync_account_managed_users_membership
    ON sync_account_managed_users(account_id, membership_id, app_id);
DROP TABLE sync_account_managed_users_m20_backup;

CREATE TABLE sync_records_m20 (
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

INSERT INTO sync_records_m20 SELECT
    user_id, app_id, record_type, record_id, payload_json, payload_hash,
    revision, updated_at, deleted_at, updated_by_device_id, last_operation_id,
    schema_version
FROM sync_records;
DROP TABLE sync_records;
ALTER TABLE sync_records_m20 RENAME TO sync_records;
CREATE INDEX idx_sync_records_dataset
    ON sync_records(user_id, app_id, deleted_at, record_type);

CREATE TABLE sync_changes_m20 (
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

INSERT INTO sync_changes_m20 SELECT
    change_seq, user_id, app_id, record_type, record_id, revision, operation_id,
    operation_hash, payload_json, payload_hash, deleted_at, changed_at,
    schema_version
FROM sync_changes;
DROP TABLE sync_changes;
ALTER TABLE sync_changes_m20 RENAME TO sync_changes;
CREATE INDEX idx_sync_changes_pull
    ON sync_changes(user_id, app_id, change_seq);

CREATE TABLE sync_port_device_operations (
    operation_id TEXT PRIMARY KEY CHECK(length(operation_id) = 36),
    request_fingerprint TEXT NOT NULL
        CHECK(length(request_fingerprint) = 64 AND request_fingerprint NOT GLOB '*[^0-9a-f]*'),
    account_id TEXT NOT NULL REFERENCES sync_accounts(id) ON DELETE CASCADE,
    account_device_id TEXT NOT NULL REFERENCES sync_account_devices(id) ON DELETE CASCADE,
    membership_id TEXT NOT NULL,
    sync_user_id TEXT NOT NULL REFERENCES sync_users(id) ON DELETE CASCADE,
    app_device_id TEXT NOT NULL UNIQUE REFERENCES sync_devices(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (account_id, membership_id)
        REFERENCES sync_account_memberships(account_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_sync_port_device_operations_account
    ON sync_port_device_operations(account_id, account_device_id, created_at);

PRAGMA defer_foreign_keys = OFF;
