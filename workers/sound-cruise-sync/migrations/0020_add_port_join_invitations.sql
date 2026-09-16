-- M15: verifier-only, one-time Cruise Port addition invitations.
-- This is additive control-plane state. It never changes Account Recovery,
-- memberships, datasets, app devices, or existing Account Devices.
CREATE TABLE IF NOT EXISTS sync_port_join_invitations (
  invitation_id TEXT PRIMARY KEY CHECK(length(invitation_id) = 36),
  code_verifier TEXT NOT NULL UNIQUE
    CHECK(length(code_verifier) = 64 AND code_verifier NOT GLOB '*[^0-9a-f]*'),
  account_id TEXT NOT NULL,
  admission_provenance TEXT NOT NULL
    CHECK(admission_provenance IN ('qa', 'production')),
  created_by_account_device_id TEXT NOT NULL,
  claimed_by_account_device_id TEXT UNIQUE,
  expected_recovery_version INTEGER NOT NULL CHECK(expected_recovery_version >= 1),
  expected_account_generation INTEGER NOT NULL CHECK(expected_account_generation >= 1),
  created_at INTEGER NOT NULL CHECK(created_at >= 0),
  expires_at INTEGER NOT NULL CHECK(expires_at > created_at),
  consumed_at INTEGER,
  cancelled_at INTEGER,
  issue_operation_id TEXT NOT NULL UNIQUE,
  issue_fingerprint TEXT NOT NULL CHECK(length(issue_fingerprint) = 64),
  consume_operation_id TEXT UNIQUE,
  consume_fingerprint TEXT,
  cancelled_by_account_device_id TEXT,
  qa_issuer_session_id TEXT,
  qa_port_session_id TEXT,
  FOREIGN KEY (account_id) REFERENCES sync_accounts(id),
  FOREIGN KEY (created_by_account_device_id) REFERENCES sync_account_devices(id),
  FOREIGN KEY (claimed_by_account_device_id) REFERENCES sync_account_devices(id),
  FOREIGN KEY (cancelled_by_account_device_id) REFERENCES sync_account_devices(id),
  FOREIGN KEY (qa_issuer_session_id) REFERENCES sync_account_qa_sessions(id),
  FOREIGN KEY (qa_port_session_id) REFERENCES sync_account_qa_sessions(id),
  CHECK (
    (admission_provenance = 'qa' AND qa_issuer_session_id IS NOT NULL)
    OR
    (admission_provenance = 'production' AND qa_issuer_session_id IS NULL AND qa_port_session_id IS NULL)
  ),
  CHECK(consumed_at IS NULL OR consumed_at >= created_at),
  CHECK(cancelled_at IS NULL OR cancelled_at >= created_at),
  CHECK(NOT (consumed_at IS NOT NULL AND cancelled_at IS NOT NULL)),
  CHECK(
    (consumed_at IS NULL AND consume_operation_id IS NULL AND consume_fingerprint IS NULL
      AND claimed_by_account_device_id IS NULL AND qa_port_session_id IS NULL)
    OR
    (consumed_at IS NOT NULL AND consume_operation_id IS NOT NULL AND consume_fingerprint IS NOT NULL
      AND claimed_by_account_device_id IS NOT NULL
      AND ((admission_provenance = 'qa' AND qa_port_session_id IS NOT NULL)
        OR (admission_provenance = 'production' AND qa_port_session_id IS NULL)))
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_port_join_active_issuer
  ON sync_port_join_invitations(account_id, created_by_account_device_id)
  WHERE consumed_at IS NULL AND cancelled_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_port_join_expiry
  ON sync_port_join_invitations(expires_at, consumed_at, cancelled_at);

CREATE INDEX IF NOT EXISTS idx_port_join_account
  ON sync_port_join_invitations(account_id, created_at);
