-- B1-1: additive only. Apply once through the D1 migration ledger.
-- No cutover, epoch increment, minimum increase or enforcement activation.
ALTER TABLE sync_account_memberships ADD COLUMN minimum_writer_protocol INTEGER NOT NULL DEFAULT 0
    CHECK (minimum_writer_protocol >= 0);
ALTER TABLE sync_account_memberships ADD COLUMN write_epoch INTEGER NOT NULL DEFAULT 1
    CHECK (write_epoch >= 1);
ALTER TABLE sync_account_memberships ADD COLUMN authority_state TEXT NOT NULL DEFAULT 'legacy'
    CHECK (authority_state IN ('legacy', 'prepared', 'enforced', 'paused'));
ALTER TABLE sync_account_memberships ADD COLUMN authority_updated_at INTEGER NOT NULL DEFAULT 0
    CHECK (authority_updated_at >= 0);
ALTER TABLE sync_asset_operations ADD COLUMN writer_protocol INTEGER;
ALTER TABLE sync_asset_operations ADD COLUMN sync_protocol INTEGER;
ALTER TABLE sync_asset_operations ADD COLUMN expected_write_epoch INTEGER;
ALTER TABLE sync_asset_operations ADD COLUMN admitted_write_epoch INTEGER;
