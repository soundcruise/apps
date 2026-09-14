CREATE TABLE sync_account_qa_enrollments (
  id TEXT PRIMARY KEY,
  code_verifier TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  cancelled_at INTEGER,
  consumed_by_session_id TEXT UNIQUE,
  CHECK (length(code_verifier) = 64),
  CHECK (expires_at > created_at)
);

CREATE TABLE sync_account_qa_sessions (
  id TEXT PRIMARY KEY,
  credential_verifier TEXT NOT NULL UNIQUE,
  enrollment_id TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('port', 'app')),
  account_id TEXT,
  app_id TEXT CHECK (app_id IS NULL OR app_id IN ('chord', 'pitch', 'fretboard', 'rhythm')),
  app_device_id TEXT,
  parent_session_id TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  revoked_at INTEGER,
  generation INTEGER NOT NULL DEFAULT 1 CHECK (generation >= 1),
  FOREIGN KEY (enrollment_id) REFERENCES sync_account_qa_enrollments(id) ON DELETE RESTRICT,
  FOREIGN KEY (account_id) REFERENCES sync_accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (app_device_id) REFERENCES sync_devices(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_session_id) REFERENCES sync_account_qa_sessions(id) ON DELETE RESTRICT,
  CHECK (expires_at > created_at),
  CHECK (
    (scope = 'port' AND app_id IS NULL AND app_device_id IS NULL) OR
    (scope = 'app' AND account_id IS NOT NULL AND app_id IS NOT NULL AND app_device_id IS NOT NULL AND parent_session_id IS NOT NULL)
  )
);

CREATE INDEX idx_account_qa_sessions_account
  ON sync_account_qa_sessions(account_id, revoked_at, expires_at);
CREATE INDEX idx_account_qa_sessions_app_device
  ON sync_account_qa_sessions(app_id, app_device_id, revoked_at, expires_at);

ALTER TABLE sync_membership_handoffs ADD COLUMN qa_issuer_session_id TEXT
  REFERENCES sync_account_qa_sessions(id) ON DELETE RESTRICT;
ALTER TABLE sync_membership_handoffs ADD COLUMN qa_app_session_id TEXT
  REFERENCES sync_account_qa_sessions(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX idx_membership_handoffs_qa_app_session
  ON sync_membership_handoffs(qa_app_session_id) WHERE qa_app_session_id IS NOT NULL;
