-- M3 response-loss and activation metadata. This is additive to the immutable
-- M2 backbone; it does not backfill or mutate any legacy Chord identity.

CREATE TABLE IF NOT EXISTS sync_account_start_operations (
    operation_id TEXT PRIMARY KEY,
    request_fingerprint TEXT NOT NULL
        CHECK (length(request_fingerprint) = 64 AND request_fingerprint NOT GLOB '*[^0-9a-f]*'),
    account_id TEXT NOT NULL UNIQUE REFERENCES sync_accounts(id) ON DELETE CASCADE,
    account_device_id TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (account_id, account_device_id)
        REFERENCES sync_account_devices(account_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sync_account_start_operations_created
    ON sync_account_start_operations(created_at);

ALTER TABLE sync_account_memberships
    ADD COLUMN prepared_operation_id TEXT;

ALTER TABLE sync_account_memberships
    ADD COLUMN prepared_by_account_device_id TEXT
        REFERENCES sync_account_devices(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_account_memberships_prepare_operation
    ON sync_account_memberships(prepared_operation_id)
    WHERE prepared_operation_id IS NOT NULL;

ALTER TABLE sync_membership_handoffs
    ADD COLUMN issue_operation_id TEXT;

ALTER TABLE sync_membership_handoffs
    ADD COLUMN issue_fingerprint TEXT
        CHECK (issue_fingerprint IS NULL OR (
            length(issue_fingerprint) = 64 AND issue_fingerprint NOT GLOB '*[^0-9a-f]*'
        ));

ALTER TABLE sync_membership_handoffs
    ADD COLUMN consume_operation_id TEXT;

ALTER TABLE sync_membership_handoffs
    ADD COLUMN consume_fingerprint TEXT
        CHECK (consume_fingerprint IS NULL OR (
            length(consume_fingerprint) = 64 AND consume_fingerprint NOT GLOB '*[^0-9a-f]*'
        ));

ALTER TABLE sync_membership_handoffs
    ADD COLUMN claimed_by_account_device_id TEXT
        REFERENCES sync_account_devices(id) ON DELETE SET NULL;

ALTER TABLE sync_membership_handoffs
    ADD COLUMN cancelled_by_account_device_id TEXT
        REFERENCES sync_account_devices(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_membership_handoffs_issue_operation
    ON sync_membership_handoffs(issue_operation_id)
    WHERE issue_operation_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_membership_handoffs_consume_operation
    ON sync_membership_handoffs(consume_operation_id)
    WHERE consume_operation_id IS NOT NULL;

-- New Account-managed app identities remain explicit. Their internal verifier
-- only satisfies the legacy sync_users invariant and is not a user-facing
-- Recovery credential. Future legacy Recovery paths can reject this marker.
CREATE TABLE IF NOT EXISTS sync_account_managed_users (
    sync_user_id TEXT PRIMARY KEY REFERENCES sync_users(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL REFERENCES sync_accounts(id) ON DELETE CASCADE,
    membership_id TEXT NOT NULL UNIQUE,
    app_id TEXT NOT NULL
        CHECK (app_id IN ('chord', 'pitch', 'fretboard', 'rhythm')),
    created_at INTEGER NOT NULL,
    UNIQUE (account_id, app_id),
    FOREIGN KEY (account_id, membership_id)
        REFERENCES sync_account_memberships(account_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sync_account_managed_users_membership
    ON sync_account_managed_users(account_id, membership_id, app_id);
