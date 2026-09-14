-- M4 bridges an existing Chord identity into the Account control plane without
-- rekeying its user, devices or dataset. Bridge rows are durable resumable
-- state machines; no plaintext credential or Recovery material is stored.

ALTER TABLE sync_account_memberships
    ADD COLUMN legacy_recovery_disabled_at INTEGER;

CREATE TABLE IF NOT EXISTS sync_chord_account_bridges (
    bridge_id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES sync_accounts(id) ON DELETE CASCADE,
    membership_id TEXT NOT NULL,
    sync_user_id TEXT NOT NULL REFERENCES sync_users(id) ON DELETE CASCADE,
    app_device_id TEXT NOT NULL REFERENCES sync_devices(id) ON DELETE RESTRICT,
    account_device_id TEXT NOT NULL REFERENCES sync_account_devices(id) ON DELETE RESTRICT,
    state TEXT NOT NULL DEFAULT 'prepared'
        CHECK (state IN ('prepared', 'dual', 'finalized', 'rolled_back')),
    generation INTEGER NOT NULL DEFAULT 1 CHECK (generation >= 1),
    expected_account_generation INTEGER NOT NULL CHECK (expected_account_generation >= 1),
    expected_membership_generation INTEGER NOT NULL CHECK (expected_membership_generation >= 1),
    expected_legacy_recovery_version INTEGER NOT NULL CHECK (expected_legacy_recovery_version >= 1),
    account_recovery_version INTEGER NOT NULL CHECK (account_recovery_version >= 1),
    recovery_acknowledged_at INTEGER,
    prepare_operation_id TEXT NOT NULL UNIQUE,
    prepare_fingerprint TEXT NOT NULL
        CHECK (length(prepare_fingerprint) = 64 AND prepare_fingerprint NOT GLOB '*[^0-9a-f]*'),
    dual_operation_id TEXT UNIQUE,
    dual_fingerprint TEXT
        CHECK (dual_fingerprint IS NULL OR (
            length(dual_fingerprint) = 64 AND dual_fingerprint NOT GLOB '*[^0-9a-f]*'
        )),
    finalize_operation_id TEXT UNIQUE,
    finalize_fingerprint TEXT
        CHECK (finalize_fingerprint IS NULL OR (
            length(finalize_fingerprint) = 64 AND finalize_fingerprint NOT GLOB '*[^0-9a-f]*'
        )),
    rollback_operation_id TEXT UNIQUE,
    rollback_fingerprint TEXT
        CHECK (rollback_fingerprint IS NULL OR (
            length(rollback_fingerprint) = 64 AND rollback_fingerprint NOT GLOB '*[^0-9a-f]*'
        )),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    dual_committed_at INTEGER,
    finalized_at INTEGER,
    rolled_back_at INTEGER,
    FOREIGN KEY (account_id, membership_id)
        REFERENCES sync_account_memberships(account_id, id) ON DELETE CASCADE,
    CHECK (updated_at >= created_at),
    CHECK (expires_at > created_at),
    CHECK (recovery_acknowledged_at IS NULL OR recovery_acknowledged_at >= created_at),
    CHECK (dual_committed_at IS NULL OR dual_committed_at >= created_at),
    CHECK (finalized_at IS NULL OR finalized_at >= created_at),
    CHECK (rolled_back_at IS NULL OR rolled_back_at >= created_at),
    CHECK (
        (state = 'prepared' AND dual_committed_at IS NULL AND finalized_at IS NULL AND rolled_back_at IS NULL)
        OR
        (state = 'dual' AND dual_committed_at IS NOT NULL AND finalized_at IS NULL AND rolled_back_at IS NULL)
        OR
        (state = 'finalized' AND dual_committed_at IS NOT NULL AND finalized_at IS NOT NULL AND rolled_back_at IS NULL)
        OR
        (state = 'rolled_back' AND finalized_at IS NULL AND rolled_back_at IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_chord_account_bridges_active_user
    ON sync_chord_account_bridges(sync_user_id)
    WHERE state IN ('prepared', 'dual', 'finalized');

CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_chord_account_bridges_active_membership
    ON sync_chord_account_bridges(account_id, membership_id)
    WHERE state IN ('prepared', 'dual', 'finalized');

CREATE INDEX IF NOT EXISTS idx_sync_chord_account_bridges_cleanup
    ON sync_chord_account_bridges(state, expires_at, updated_at);

CREATE INDEX IF NOT EXISTS idx_sync_chord_account_bridges_operation
    ON sync_chord_account_bridges(
        prepare_operation_id, dual_operation_id, finalize_operation_id, rollback_operation_id
    );
