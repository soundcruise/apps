-- Pro authentication metadata only. No Account, dataset, record or asset is rewritten.
ALTER TABLE pro_auth_state ADD COLUMN session_lifecycle_started_at INTEGER;
ALTER TABLE pro_auth_state ADD COLUMN unbound_backend_until INTEGER;
UPDATE pro_auth_state SET session_lifecycle_started_at = unixepoch() * 1000,
  unbound_backend_until = (unixepoch() + 90 * 86400) * 1000 WHERE singleton_id = 1;

ALTER TABLE pro_credentials ADD COLUMN device_public_key TEXT;
ALTER TABLE pro_credentials ADD COLUMN session_bound_at INTEGER;
ALTER TABLE pro_credentials ADD COLUMN last_validated_at INTEGER;
ALTER TABLE pro_credentials ADD COLUMN lease_expires_at INTEGER;

CREATE TABLE pro_session_proofs (
  challenge_id TEXT PRIMARY KEY,
  credential_id TEXT NOT NULL REFERENCES pro_credentials(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX pro_session_proofs_expiry_idx ON pro_session_proofs(expires_at);
