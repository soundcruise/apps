-- Account lifecycle is additive to the M2 Account control plane. Existing app
-- datasets remain in sync_users until the seven-day grace period is purged.

ALTER TABLE sync_account_memberships
    ADD COLUMN delete_requested_at INTEGER;

ALTER TABLE sync_account_memberships
    ADD COLUMN purge_after INTEGER;

CREATE INDEX IF NOT EXISTS idx_sync_account_memberships_purge
    ON sync_account_memberships(state, purge_after);

ALTER TABLE sync_account_recovery_claims
    ADD COLUMN prepare_operation_id TEXT;

ALTER TABLE sync_account_recovery_claims
    ADD COLUMN prepare_fingerprint TEXT
        CHECK (prepare_fingerprint IS NULL OR (
            length(prepare_fingerprint) = 64 AND prepare_fingerprint NOT GLOB '*[^0-9a-f]*'
        ));

ALTER TABLE sync_account_recovery_claims
    ADD COLUMN commit_operation_id TEXT;

ALTER TABLE sync_account_recovery_claims
    ADD COLUMN commit_fingerprint TEXT
        CHECK (commit_fingerprint IS NULL OR (
            length(commit_fingerprint) = 64 AND commit_fingerprint NOT GLOB '*[^0-9a-f]*'
        ));

CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_account_recovery_prepare_operation
    ON sync_account_recovery_claims(prepare_operation_id)
    WHERE prepare_operation_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_account_recovery_commit_operation
    ON sync_account_recovery_claims(commit_operation_id)
    WHERE commit_operation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS sync_account_recovery_attempts (
    recovery_verifier TEXT PRIMARY KEY,
    first_attempt_at INTEGER NOT NULL,
    last_attempt_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL CHECK (attempts BETWEEN 1 AND 5)
);

CREATE INDEX IF NOT EXISTS idx_sync_account_recovery_attempts_window
    ON sync_account_recovery_attempts(first_attempt_at);

ALTER TABLE sync_account_delete_intents
    ADD COLUMN issue_operation_id TEXT;

ALTER TABLE sync_account_delete_intents
    ADD COLUMN issue_fingerprint TEXT
        CHECK (issue_fingerprint IS NULL OR (
            length(issue_fingerprint) = 64 AND issue_fingerprint NOT GLOB '*[^0-9a-f]*'
        ));

ALTER TABLE sync_account_delete_intents
    ADD COLUMN consume_operation_id TEXT;

ALTER TABLE sync_account_delete_intents
    ADD COLUMN consume_fingerprint TEXT
        CHECK (consume_fingerprint IS NULL OR (
            length(consume_fingerprint) = 64 AND consume_fingerprint NOT GLOB '*[^0-9a-f]*'
        ));

CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_account_delete_issue_operation
    ON sync_account_delete_intents(issue_operation_id)
    WHERE issue_operation_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_account_delete_consume_operation
    ON sync_account_delete_intents(consume_operation_id)
    WHERE consume_operation_id IS NOT NULL;

-- A completed destructive operation can be resolved after credentials have
-- been revoked, without retaining any plaintext intent or credential.
CREATE TABLE IF NOT EXISTS sync_account_lifecycle_operations (
    operation_id TEXT PRIMARY KEY,
    request_fingerprint TEXT NOT NULL
        CHECK (length(request_fingerprint) = 64 AND request_fingerprint NOT GLOB '*[^0-9a-f]*'),
    account_id TEXT NOT NULL REFERENCES sync_accounts(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('recovery', 'device_revoke', 'app_delete', 'account_delete')),
    target_id TEXT,
    result_json TEXT NOT NULL CHECK (json_valid(result_json)),
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_account_lifecycle_operations_account
    ON sync_account_lifecycle_operations(account_id, kind, created_at);
