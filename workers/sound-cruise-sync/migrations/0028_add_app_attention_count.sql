-- An app device reports unresolved user decisions separately from the
-- dataset's record count. Older clients leave this at zero until updated.
ALTER TABLE sync_app_device_sync_safety
  ADD COLUMN attention_count INTEGER NOT NULL DEFAULT 0
  CHECK (attention_count BETWEEN 0 AND 10000);
