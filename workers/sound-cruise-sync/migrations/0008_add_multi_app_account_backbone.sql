-- Multi-App Account is an additive control plane above the existing app-scoped
-- sync_users and datasets. Nothing in this migration links, rekeys, revokes or
-- otherwise mutates an existing Chord identity.

CREATE TABLE IF NOT EXISTS sync_accounts (
    id TEXT PRIMARY KEY,
    state TEXT NOT NULL DEFAULT 'provisioning'
        CHECK (state IN ('provisioning', 'active', 'deleting', 'deleted')),
    recovery_version INTEGER NOT NULL DEFAULT 0
        CHECK (recovery_version >= 0),
    recovery_verifier TEXT UNIQUE,
    generation INTEGER NOT NULL DEFAULT 1
        CHECK (generation >= 1),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    recovery_created_at INTEGER,
    recovery_rotated_at INTEGER,
    delete_requested_at INTEGER,
    purge_after INTEGER,
    deleted_at INTEGER,
    CHECK (updated_at >= created_at),
    CHECK (
        (state = 'provisioning' AND recovery_version = 0 AND recovery_verifier IS NULL)
        OR
        (state IN ('active', 'deleting') AND recovery_version >= 1 AND recovery_verifier IS NOT NULL)
        OR
        (state = 'deleted' AND recovery_version >= 1)
    ),
    CHECK (recovery_created_at IS NULL OR recovery_created_at >= created_at),
    CHECK (recovery_rotated_at IS NULL OR recovery_rotated_at >= created_at),
    CHECK (delete_requested_at IS NULL OR delete_requested_at >= created_at),
    CHECK (purge_after IS NULL OR delete_requested_at IS NOT NULL),
    CHECK (deleted_at IS NULL OR deleted_at >= created_at)
);

CREATE INDEX IF NOT EXISTS idx_sync_accounts_purge
    ON sync_accounts(state, purge_after);

-- An Account Device means one credential container, not one physical device.
-- Safari, a Home Screen PWA and a different app may therefore be distinct.
CREATE TABLE IF NOT EXISTS sync_account_devices (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES sync_accounts(id) ON DELETE CASCADE,
    credential_version INTEGER NOT NULL DEFAULT 1
        CHECK (credential_version >= 1),
    credential_verifier TEXT NOT NULL UNIQUE,
    label TEXT,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    revoked_at INTEGER,
    UNIQUE (account_id, id),
    CHECK (last_seen_at >= created_at),
    CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE INDEX IF NOT EXISTS idx_sync_account_devices_active
    ON sync_account_devices(account_id, revoked_at, last_seen_at);

-- Each membership owns exactly one app namespace. sync_user_id is deliberately
-- nullable: Cruise Port can prepare a membership before that app is opened in
-- its own isolated storage container. Existing Chord users are not backfilled.
CREATE TABLE IF NOT EXISTS sync_account_memberships (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES sync_accounts(id) ON DELETE CASCADE,
    app_id TEXT NOT NULL
        CHECK (app_id IN ('chord', 'pitch', 'fretboard', 'rhythm')),
    state TEXT NOT NULL DEFAULT 'pending'
        CHECK (state IN ('pending', 'active', 'deleting', 'deleted')),
    sync_user_id TEXT UNIQUE REFERENCES sync_users(id) ON DELETE SET NULL
        DEFERRABLE INITIALLY DEFERRED,
    recovery_mode TEXT NOT NULL DEFAULT 'account'
        CHECK (recovery_mode IN ('legacy', 'dual', 'account')),
    generation INTEGER NOT NULL DEFAULT 1
        CHECK (generation >= 1),
    created_at INTEGER NOT NULL,
    activated_at INTEGER,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    UNIQUE (account_id, app_id),
    UNIQUE (account_id, id),
    CHECK (updated_at >= created_at),
    CHECK (
        (state = 'pending' AND sync_user_id IS NULL AND activated_at IS NULL)
        OR
        (state IN ('active', 'deleting') AND sync_user_id IS NOT NULL AND activated_at IS NOT NULL)
        OR
        state = 'deleted'
    ),
    CHECK (activated_at IS NULL OR activated_at >= created_at),
    CHECK (deleted_at IS NULL OR deleted_at >= created_at)
);

CREATE INDEX IF NOT EXISTS idx_sync_account_memberships_state
    ON sync_account_memberships(account_id, state, app_id);

-- This bridge preserves the existing app-scoped device and credential model.
-- An app device can belong to only one membership. account_device_id is
-- optional so an app can operate standalone without Cruise Port.
CREATE TABLE IF NOT EXISTS sync_membership_device_links (
    account_id TEXT NOT NULL REFERENCES sync_accounts(id) ON DELETE CASCADE,
    membership_id TEXT NOT NULL,
    app_device_id TEXT NOT NULL UNIQUE REFERENCES sync_devices(id) ON DELETE CASCADE,
    account_device_id TEXT REFERENCES sync_account_devices(id) ON DELETE SET NULL,
    linked_at INTEGER NOT NULL,
    PRIMARY KEY (membership_id, app_device_id),
    FOREIGN KEY (account_id, membership_id)
        REFERENCES sync_account_memberships(account_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sync_membership_device_links_account_device
    ON sync_membership_device_links(account_device_id, membership_id);

-- Account Recovery always rotates the single Account Recovery verifier. Scope
-- controls whether only one membership's app devices or every membership's app
-- devices are revoked at commit. Claims store verifiers only, never plaintext.
CREATE TABLE IF NOT EXISTS sync_account_recovery_claims (
    claim_id TEXT PRIMARY KEY,
    claim_verifier TEXT NOT NULL UNIQUE,
    account_id TEXT NOT NULL REFERENCES sync_accounts(id) ON DELETE CASCADE,
    scope TEXT NOT NULL CHECK (scope IN ('app', 'account')),
    target_membership_id TEXT,
    expected_recovery_version INTEGER NOT NULL CHECK (expected_recovery_version >= 1),
    expected_account_generation INTEGER NOT NULL CHECK (expected_account_generation >= 1),
    next_recovery_verifier TEXT NOT NULL UNIQUE,
    next_account_device_id TEXT NOT NULL UNIQUE,
    next_account_credential_verifier TEXT NOT NULL UNIQUE,
    device_label TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    committed_at INTEGER,
    cancelled_at INTEGER,
    FOREIGN KEY (account_id, target_membership_id)
        REFERENCES sync_account_memberships(account_id, id) ON DELETE CASCADE,
    CHECK (
        (scope = 'app' AND target_membership_id IS NOT NULL)
        OR
        (scope = 'account' AND target_membership_id IS NULL)
    ),
    CHECK (expires_at > created_at),
    CHECK (committed_at IS NULL OR committed_at >= created_at),
    CHECK (cancelled_at IS NULL OR cancelled_at >= created_at)
);

CREATE INDEX IF NOT EXISTS idx_sync_account_recovery_claims_active
    ON sync_account_recovery_claims(
        account_id, expected_recovery_version, expires_at, committed_at, cancelled_at
    );

-- Deletion is also explicitly scoped. The destructive commit implementation is
-- intentionally not wired to public routes in M2.
CREATE TABLE IF NOT EXISTS sync_account_delete_intents (
    intent_id TEXT PRIMARY KEY,
    intent_verifier TEXT NOT NULL UNIQUE,
    account_id TEXT NOT NULL REFERENCES sync_accounts(id) ON DELETE CASCADE,
    scope TEXT NOT NULL CHECK (scope IN ('app', 'account')),
    target_membership_id TEXT,
    requested_by_account_device_id TEXT NOT NULL,
    expected_account_generation INTEGER NOT NULL CHECK (expected_account_generation >= 1),
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    consumed_at INTEGER,
    cancelled_at INTEGER,
    FOREIGN KEY (account_id, target_membership_id)
        REFERENCES sync_account_memberships(account_id, id) ON DELETE CASCADE,
    FOREIGN KEY (account_id, requested_by_account_device_id)
        REFERENCES sync_account_devices(account_id, id) ON DELETE CASCADE,
    CHECK (
        (scope = 'app' AND target_membership_id IS NOT NULL)
        OR
        (scope = 'account' AND target_membership_id IS NULL)
    ),
    CHECK (expires_at > created_at),
    CHECK (consumed_at IS NULL OR consumed_at >= created_at),
    CHECK (cancelled_at IS NULL OR cancelled_at >= created_at)
);

CREATE INDEX IF NOT EXISTS idx_sync_account_delete_intents_active
    ON sync_account_delete_intents(account_id, scope, expires_at, consumed_at, cancelled_at);

-- A one-time handoff lets Cruise Port prepare an app membership without ever
-- reading that app's local storage. Only the verifier is stored server-side.
CREATE TABLE IF NOT EXISTS sync_membership_handoffs (
    handoff_id TEXT PRIMARY KEY,
    handoff_verifier TEXT NOT NULL UNIQUE,
    account_id TEXT NOT NULL REFERENCES sync_accounts(id) ON DELETE CASCADE,
    membership_id TEXT NOT NULL,
    created_by_account_device_id TEXT
        REFERENCES sync_account_devices(id) ON DELETE SET NULL,
    claimed_by_app_device_id TEXT UNIQUE
        REFERENCES sync_devices(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    consumed_at INTEGER,
    cancelled_at INTEGER,
    FOREIGN KEY (account_id, membership_id)
        REFERENCES sync_account_memberships(account_id, id) ON DELETE CASCADE,
    CHECK (expires_at > created_at),
    CHECK (consumed_at IS NULL OR consumed_at >= created_at),
    CHECK (cancelled_at IS NULL OR cancelled_at >= created_at),
    CHECK ((consumed_at IS NULL) = (claimed_by_app_device_id IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_sync_membership_handoffs_active
    ON sync_membership_handoffs(account_id, membership_id, expires_at, consumed_at, cancelled_at);

-- Multi-App rollout is independent from the already-open Chord runtime gate.
-- Applying this migration exposes no new route and enables no new operation.
CREATE TABLE IF NOT EXISTS sync_account_runtime_control (
    singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
    rollout_mode TEXT NOT NULL
        CHECK (rollout_mode IN ('development', 'closed', 'cohort', 'open')),
    account_admission_enabled INTEGER NOT NULL CHECK (account_admission_enabled IN (0, 1)),
    membership_admission_enabled INTEGER NOT NULL CHECK (membership_admission_enabled IN (0, 1)),
    account_read_enabled INTEGER NOT NULL CHECK (account_read_enabled IN (0, 1)),
    account_recovery_enabled INTEGER NOT NULL CHECK (account_recovery_enabled IN (0, 1)),
    account_delete_enabled INTEGER NOT NULL CHECK (account_delete_enabled IN (0, 1)),
    port_orchestration_enabled INTEGER NOT NULL CHECK (port_orchestration_enabled IN (0, 1)),
    generation INTEGER NOT NULL CHECK (generation >= 1),
    updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO sync_account_runtime_control (
    singleton_id, rollout_mode, account_admission_enabled, membership_admission_enabled,
    account_read_enabled, account_recovery_enabled, account_delete_enabled,
    port_orchestration_enabled, generation, updated_at
) VALUES (1, 'development', 0, 0, 0, 0, 0, 0, 1, 0);
