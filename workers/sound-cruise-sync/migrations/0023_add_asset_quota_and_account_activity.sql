-- Binary Asset Sync policy controls. Quotas are scoped by storage category so
-- future document, score, audio, and practice-attachment storage never shares
-- the image allowance by accident.

ALTER TABLE sync_assets ADD COLUMN storage_category TEXT NOT NULL DEFAULT 'image'
    CHECK(storage_category IN ('image', 'document_score', 'audio', 'practice_attachment'));

CREATE INDEX idx_sync_assets_category_quota
    ON sync_assets(account_id, storage_category, state, created_at);

-- No row means the server-side default. Rows are reserved for an Account
-- override; `total_storage_limit_bytes` is deliberately nullable because a
-- cross-category Account ceiling is not enabled in Phase 1.
CREATE TABLE sync_account_asset_quotas (
    account_id TEXT NOT NULL REFERENCES sync_accounts(id) ON DELETE CASCADE,
    storage_category TEXT NOT NULL CHECK(storage_category IN (
        'image', 'document_score', 'audio', 'practice_attachment'
    )),
    storage_limit_bytes INTEGER NOT NULL CHECK(storage_limit_bytes > 0),
    asset_variant_limit INTEGER NOT NULL CHECK(asset_variant_limit > 0),
    daily_new_variant_limit INTEGER NOT NULL CHECK(daily_new_variant_limit > 0),
    total_storage_limit_bytes INTEGER CHECK(total_storage_limit_bytes IS NULL OR total_storage_limit_bytes > 0),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY(account_id, storage_category)
);

CREATE TABLE sync_asset_daily_variant_counts (
    scope TEXT NOT NULL CHECK(scope IN ('account', 'global')),
    scope_id TEXT NOT NULL,
    storage_category TEXT NOT NULL CHECK(storage_category IN (
        'image', 'document_score', 'audio', 'practice_attachment'
    )),
    day_key TEXT NOT NULL CHECK(length(day_key) = 10),
    variant_count INTEGER NOT NULL CHECK(variant_count >= 0),
    updated_at INTEGER NOT NULL,
    PRIMARY KEY(scope, scope_id, storage_category, day_key)
);

CREATE INDEX idx_sync_asset_daily_counts_cleanup
    ON sync_asset_daily_variant_counts(day_key, updated_at);

-- This lifecycle is intentionally independent of the existing manual Account
-- Delete state and its seven-day grace period.
CREATE TABLE sync_account_activity (
    account_id TEXT PRIMARY KEY REFERENCES sync_accounts(id) ON DELETE CASCADE,
    state TEXT NOT NULL CHECK(state IN ('active', 'dormant')) DEFAULT 'active',
    last_activity_at INTEGER NOT NULL,
    dormant_at INTEGER,
    inactive_purge_after INTEGER,
    updated_at INTEGER NOT NULL,
    CHECK((state = 'active' AND dormant_at IS NULL AND inactive_purge_after IS NULL)
       OR (state = 'dormant' AND dormant_at IS NOT NULL AND inactive_purge_after IS NOT NULL))
);

CREATE INDEX idx_sync_account_activity_lifecycle
    ON sync_account_activity(state, last_activity_at, inactive_purge_after);

-- Existing Accounts begin this new policy from their most recent durable
-- Account update, without altering manual deletion state or data.
INSERT OR IGNORE INTO sync_account_activity (
    account_id, state, last_activity_at, dormant_at, inactive_purge_after, updated_at
)
SELECT id, 'active', updated_at, NULL, NULL, updated_at
FROM sync_accounts
WHERE state = 'active' AND deleted_at IS NULL;
