-- A user-chosen display name for a sync target (Cloud Sync UX 2.0 Phase N1).
-- label stays the original registration metadata and is never rewritten.
-- user_label is display-only: identity, credentials, memberships, reports,
-- revoke scope and Auto Rejoin never read it. Existing rows keep NULL.
-- The Worker stores NFC-normalized, trimmed text of 1..40 code points; the
-- CHECK is a bound only (SQLite length() counts characters for TEXT).
ALTER TABLE sync_devices
  ADD COLUMN user_label TEXT
  CHECK (user_label IS NULL OR length(user_label) BETWEEN 1 AND 40);

ALTER TABLE sync_account_devices
  ADD COLUMN user_label TEXT
  CHECK (user_label IS NULL OR length(user_label) BETWEEN 1 AND 40);
