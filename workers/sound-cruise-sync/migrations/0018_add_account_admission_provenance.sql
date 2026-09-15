-- M10: make Account admission provenance explicit before public admission is
-- enabled. Existing Accounts and invitations are QA-originated and therefore
-- backfill to `qa`. Applying this migration does not enable public traffic.

ALTER TABLE sync_accounts
  ADD COLUMN admission_provenance TEXT NOT NULL DEFAULT 'qa'
  CHECK (admission_provenance IN ('qa', 'production'));

CREATE TABLE sync_app_join_invitations_v2 (
  invitation_id TEXT PRIMARY KEY CHECK(length(invitation_id) = 36),
  code_verifier TEXT NOT NULL UNIQUE
    CHECK(length(code_verifier) = 64 AND code_verifier NOT GLOB '*[^0-9a-f]*'),
  account_id TEXT NOT NULL,
  membership_id TEXT NOT NULL,
  target_app_id TEXT NOT NULL
    CHECK(target_app_id IN ('chord', 'pitch', 'fretboard', 'rhythm')),
  admission_provenance TEXT NOT NULL DEFAULT 'qa'
    CHECK(admission_provenance IN ('qa', 'production')),
  created_by_account_device_id TEXT NOT NULL,
  claimed_by_app_device_id TEXT,
  claimed_by_account_device_id TEXT,
  created_at INTEGER NOT NULL CHECK(created_at >= 0),
  expires_at INTEGER NOT NULL CHECK(expires_at > created_at),
  consumed_at INTEGER,
  cancelled_at INTEGER,
  issue_operation_id TEXT NOT NULL UNIQUE,
  issue_fingerprint TEXT NOT NULL CHECK(length(issue_fingerprint) = 64),
  consume_operation_id TEXT UNIQUE,
  consume_fingerprint TEXT,
  consume_mode TEXT CHECK(consume_mode IN ('new_app', 'existing_chord')),
  cancelled_by_account_device_id TEXT,
  qa_issuer_session_id TEXT,
  qa_app_session_id TEXT,
  FOREIGN KEY (account_id) REFERENCES sync_accounts(id),
  FOREIGN KEY (membership_id) REFERENCES sync_account_memberships(id),
  FOREIGN KEY (created_by_account_device_id) REFERENCES sync_account_devices(id),
  FOREIGN KEY (claimed_by_app_device_id) REFERENCES sync_devices(id),
  FOREIGN KEY (claimed_by_account_device_id) REFERENCES sync_account_devices(id),
  FOREIGN KEY (cancelled_by_account_device_id) REFERENCES sync_account_devices(id),
  FOREIGN KEY (qa_issuer_session_id) REFERENCES sync_account_qa_sessions(id),
  FOREIGN KEY (qa_app_session_id) REFERENCES sync_account_qa_sessions(id),
  CHECK (
    (admission_provenance = 'qa' AND qa_issuer_session_id IS NOT NULL)
    OR
    (admission_provenance = 'production' AND qa_issuer_session_id IS NULL AND qa_app_session_id IS NULL)
  ),
  CHECK(consumed_at IS NULL OR consumed_at >= created_at),
  CHECK(cancelled_at IS NULL OR cancelled_at >= created_at),
  CHECK(NOT (consumed_at IS NOT NULL AND cancelled_at IS NOT NULL)),
  CHECK(
    (consumed_at IS NULL AND consume_operation_id IS NULL AND consume_fingerprint IS NULL AND
      consume_mode IS NULL AND claimed_by_app_device_id IS NULL AND
      claimed_by_account_device_id IS NULL AND qa_app_session_id IS NULL)
    OR
    (consumed_at IS NOT NULL AND consume_operation_id IS NOT NULL AND consume_fingerprint IS NOT NULL AND
      consume_mode IS NOT NULL AND claimed_by_app_device_id IS NOT NULL AND
      claimed_by_account_device_id IS NOT NULL AND
      ((admission_provenance = 'qa' AND qa_app_session_id IS NOT NULL) OR
       (admission_provenance = 'production' AND qa_app_session_id IS NULL)))
  )
);

INSERT INTO sync_app_join_invitations_v2 (
  invitation_id, code_verifier, account_id, membership_id, target_app_id,
  admission_provenance, created_by_account_device_id, claimed_by_app_device_id,
  claimed_by_account_device_id, created_at, expires_at, consumed_at, cancelled_at,
  issue_operation_id, issue_fingerprint, consume_operation_id, consume_fingerprint,
  consume_mode, cancelled_by_account_device_id, qa_issuer_session_id, qa_app_session_id
)
SELECT invitation_id, code_verifier, account_id, membership_id, target_app_id,
       'qa', created_by_account_device_id, claimed_by_app_device_id,
       claimed_by_account_device_id, created_at, expires_at, consumed_at, cancelled_at,
       issue_operation_id, issue_fingerprint, consume_operation_id, consume_fingerprint,
       consume_mode, cancelled_by_account_device_id, qa_issuer_session_id, qa_app_session_id
FROM sync_app_join_invitations;

DROP TABLE sync_app_join_invitations;
ALTER TABLE sync_app_join_invitations_v2 RENAME TO sync_app_join_invitations;

CREATE UNIQUE INDEX idx_app_join_active_membership
  ON sync_app_join_invitations(account_id, membership_id)
  WHERE consumed_at IS NULL AND cancelled_at IS NULL;

CREATE INDEX idx_app_join_expiry
  ON sync_app_join_invitations(expires_at, consumed_at, cancelled_at);

CREATE INDEX idx_app_join_issuer
  ON sync_app_join_invitations(account_id, created_by_account_device_id, created_at);
