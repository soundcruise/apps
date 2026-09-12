ALTER TABLE sync_users
    ADD COLUMN recovery_created_at INTEGER;

ALTER TABLE sync_users
    ADD COLUMN recovery_rotated_at INTEGER;

CREATE TABLE IF NOT EXISTS recovery_claims (
    claim_id TEXT PRIMARY KEY,
    claim_verifier TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL REFERENCES sync_users(id) ON DELETE CASCADE,
    target_app_id TEXT NOT NULL,
    expected_recovery_version INTEGER NOT NULL CHECK (expected_recovery_version >= 1),
    next_recovery_verifier TEXT NOT NULL UNIQUE,
    next_device_id TEXT NOT NULL UNIQUE,
    next_credential_verifier TEXT NOT NULL UNIQUE,
    device_label TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    committed_at INTEGER,
    cancelled_at INTEGER,
    CHECK (expires_at > created_at),
    CHECK (committed_at IS NULL OR committed_at >= created_at),
    CHECK (cancelled_at IS NULL OR cancelled_at >= created_at)
);

CREATE INDEX IF NOT EXISTS idx_recovery_claims_user_active
    ON recovery_claims(user_id, target_app_id, expected_recovery_version, expires_at, committed_at, cancelled_at);

CREATE TABLE IF NOT EXISTS recovery_attempts (
    recovery_verifier TEXT PRIMARY KEY,
    first_attempt_at INTEGER NOT NULL,
    last_attempt_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL CHECK (attempts >= 1 AND attempts <= 5)
);

CREATE INDEX IF NOT EXISTS idx_recovery_attempts_expiry
    ON recovery_attempts(first_attempt_at);
