CREATE TABLE IF NOT EXISTS pairing_attempts (
    code_verifier TEXT PRIMARY KEY,
    first_attempt_at INTEGER NOT NULL,
    last_attempt_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL CHECK (attempts >= 1 AND attempts <= 5)
);

CREATE INDEX IF NOT EXISTS idx_pairing_attempts_expiry
    ON pairing_attempts(first_attempt_at);
