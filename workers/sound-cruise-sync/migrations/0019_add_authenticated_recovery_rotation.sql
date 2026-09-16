-- Authenticated Recovery rotation is intentionally separate from Account
-- Recovery. It rotates only the Account Recovery verifier and never replaces
-- or revokes Account/App devices. Candidate plaintext is never stored.
CREATE TABLE IF NOT EXISTS sync_account_recovery_rotations (
    claim_id TEXT PRIMARY KEY,
    claim_verifier TEXT NOT NULL UNIQUE
        CHECK (length(claim_verifier) = 64 AND claim_verifier NOT GLOB '*[^0-9a-f]*'),
    account_id TEXT NOT NULL REFERENCES sync_accounts(id) ON DELETE CASCADE,
    requested_by_account_device_id TEXT NOT NULL
        REFERENCES sync_account_devices(id) ON DELETE CASCADE,
    expected_recovery_version INTEGER NOT NULL CHECK (expected_recovery_version >= 1),
    expected_account_generation INTEGER NOT NULL CHECK (expected_account_generation >= 1),
    next_recovery_verifier TEXT NOT NULL UNIQUE
        CHECK (length(next_recovery_verifier) = 64 AND next_recovery_verifier NOT GLOB '*[^0-9a-f]*'),
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    committed_at INTEGER,
    cancelled_at INTEGER,
    prepare_operation_id TEXT NOT NULL UNIQUE,
    prepare_fingerprint TEXT NOT NULL
        CHECK (length(prepare_fingerprint) = 64 AND prepare_fingerprint NOT GLOB '*[^0-9a-f]*'),
    commit_operation_id TEXT UNIQUE,
    commit_fingerprint TEXT
        CHECK (commit_fingerprint IS NULL OR (
            length(commit_fingerprint) = 64 AND commit_fingerprint NOT GLOB '*[^0-9a-f]*'
        )),
    CHECK (expires_at > created_at),
    CHECK (committed_at IS NULL OR committed_at >= created_at),
    CHECK (cancelled_at IS NULL OR cancelled_at >= created_at),
    CHECK ((commit_operation_id IS NULL) = (commit_fingerprint IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_sync_account_recovery_rotations_active
    ON sync_account_recovery_rotations(
        account_id, expected_recovery_version, expires_at, committed_at, cancelled_at
    );
