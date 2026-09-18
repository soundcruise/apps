-- The Port never reads an app's browser storage.  Each authenticated app
-- device reports only its own completed-sync safety state; Account summary
-- derives a fail-closed, membership-level presentation from these rows.
CREATE TABLE sync_app_device_sync_safety (
  app_device_id TEXT PRIMARY KEY REFERENCES sync_devices(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES sync_accounts(id) ON DELETE CASCADE,
  membership_id TEXT NOT NULL REFERENCES sync_account_memberships(id) ON DELETE CASCADE,
  app_id TEXT NOT NULL CHECK (app_id IN ('chord', 'pitch', 'fretboard', 'rhythm')),
  state TEXT NOT NULL CHECK (state IN ('clean', 'pending', 'attention', 'error')),
  last_successful_sync_at INTEGER,
  reported_at INTEGER NOT NULL,
  CHECK ((state = 'clean' AND last_successful_sync_at IS NOT NULL) OR state != 'clean')
);

CREATE INDEX idx_app_device_sync_safety_membership
  ON sync_app_device_sync_safety(membership_id, state, reported_at);
