-- Port-only launch extends the existing verifier-only handoff primitive to an
-- active Account membership. The grant stays short-lived and one-time; it now
-- also records the admission boundary and the exact existing app identity it
-- is allowed to rejoin. Existing rows are QA initial-join handoffs.

ALTER TABLE sync_membership_handoffs
  ADD COLUMN admission_provenance TEXT NOT NULL DEFAULT 'qa'
  CHECK (admission_provenance IN ('qa', 'production'));

ALTER TABLE sync_membership_handoffs
  ADD COLUMN handoff_kind TEXT NOT NULL DEFAULT 'initial'
  CHECK (handoff_kind IN ('initial', 'rejoin'));

ALTER TABLE sync_membership_handoffs
  ADD COLUMN expected_sync_user_id TEXT
  REFERENCES sync_users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_sync_membership_handoffs_rejoin
  ON sync_membership_handoffs(
    account_id, membership_id, handoff_kind, expires_at, consumed_at, cancelled_at
  );
