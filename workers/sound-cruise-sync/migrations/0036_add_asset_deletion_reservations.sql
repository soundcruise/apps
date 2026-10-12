-- Asset deletion reservations are independent of writer protocol rollout.
-- No production data rewrite, authority transition, or TTL cancellation.
CREATE TABLE sync_asset_deletions (
 asset_id TEXT PRIMARY KEY, claim_id TEXT NOT NULL UNIQUE,
 account_id TEXT NOT NULL, membership_id TEXT NOT NULL, sync_user_id TEXT NOT NULL,
 account_generation INTEGER, membership_generation INTEGER, write_epoch INTEGER,
 object_key TEXT NOT NULL UNIQUE, object_version INTEGER NOT NULL, content_hash TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('deleting','recovery-required','deleted')),
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX sync_asset_deletions_pending ON sync_asset_deletions(state,updated_at);
CREATE TRIGGER sync_asset_deletion_no_delete BEFORE DELETE ON sync_asset_deletions
BEGIN SELECT RAISE(ABORT,'asset_cleanup_conflict'); END;
CREATE TRIGGER sync_asset_deletion_identity BEFORE UPDATE ON sync_asset_deletions
WHEN NEW.asset_id IS NOT OLD.asset_id OR NEW.claim_id IS NOT OLD.claim_id
 OR NEW.account_id IS NOT OLD.account_id OR NEW.membership_id IS NOT OLD.membership_id
 OR NEW.sync_user_id IS NOT OLD.sync_user_id OR NEW.account_generation IS NOT OLD.account_generation
 OR NEW.membership_generation IS NOT OLD.membership_generation OR NEW.write_epoch IS NOT OLD.write_epoch
 OR NEW.object_key IS NOT OLD.object_key OR NEW.object_version IS NOT OLD.object_version
 OR NEW.content_hash IS NOT OLD.content_hash OR NEW.created_at IS NOT OLD.created_at
 OR (OLD.state='deleted' AND NEW.state<>'deleted')
BEGIN SELECT RAISE(ABORT,'asset_cleanup_conflict'); END;
-- Legacy unresolved claims remain reserved; they cannot be cancelled by a timer or old Worker.
CREATE TRIGGER sync_asset_claim_no_update BEFORE UPDATE ON sync_authority_cleanup_claims
BEGIN SELECT RAISE(ABORT,'asset_cleanup_conflict'); END;
CREATE TRIGGER sync_asset_claim_release BEFORE DELETE ON sync_authority_cleanup_claims
WHEN NOT EXISTS (SELECT 1 FROM sync_asset_deletions d WHERE d.account_id=OLD.account_id
 AND d.asset_id=OLD.asset_id AND d.state='deleted')
BEGIN SELECT RAISE(ABORT,'asset_cleanup_conflict'); END;
CREATE TRIGGER sync_asset_claim_refs BEFORE INSERT ON sync_authority_cleanup_claims
WHEN EXISTS (SELECT 1 FROM sync_records r, json_tree(r.payload_json) j
 WHERE r.app_id='port' AND r.deleted_at IS NULL AND j.key='assetId' AND j.value=NEW.asset_id)
BEGIN SELECT RAISE(ABORT,'asset_cleanup_conflict'); END;
-- Executes within the record mutation, including migration and tombstone resurrection.
CREATE TRIGGER sync_asset_reference_insert BEFORE INSERT ON sync_records
WHEN NEW.app_id='port' AND NEW.deleted_at IS NULL AND EXISTS (
 SELECT 1 FROM json_tree(NEW.payload_json) j WHERE j.key='assetId' AND (
  EXISTS (SELECT 1 FROM sync_authority_cleanup_claims c WHERE c.asset_id=j.value)
  OR EXISTS (SELECT 1 FROM sync_asset_deletions d WHERE d.asset_id=j.value)
  OR EXISTS (SELECT 1 FROM sync_assets a WHERE a.asset_id=j.value AND
   (a.state NOT IN ('available','unreferenced') OR a.sync_user_id<>NEW.user_id))))
BEGIN SELECT RAISE(ABORT,'asset_reference_unavailable'); END;
-- Executes within the record mutation, including migration and tombstone resurrection.
CREATE TRIGGER sync_asset_reference_update BEFORE UPDATE ON sync_records
WHEN NEW.app_id='port' AND NEW.deleted_at IS NULL AND EXISTS (
 SELECT 1 FROM json_tree(NEW.payload_json) j WHERE j.key='assetId' AND (
  EXISTS (SELECT 1 FROM sync_authority_cleanup_claims c WHERE c.asset_id=j.value)
  OR EXISTS (SELECT 1 FROM sync_asset_deletions d WHERE d.asset_id=j.value)
  OR EXISTS (SELECT 1 FROM sync_assets a WHERE a.asset_id=j.value AND
   (a.state NOT IN ('available','unreferenced') OR a.sync_user_id<>NEW.user_id))))
BEGIN SELECT RAISE(ABORT,'asset_reference_unavailable'); END;
-- Keep a permanent tombstone for every reserved ID/key. Re-upload requires a fresh asset ID/key.
CREATE TRIGGER sync_asset_reserved_insert BEFORE INSERT ON sync_assets
WHEN EXISTS (SELECT 1 FROM sync_asset_deletions d WHERE d.asset_id=NEW.asset_id OR d.object_key=NEW.object_key)
BEGIN SELECT RAISE(ABORT,'asset_cleanup_conflict'); END;
CREATE TRIGGER sync_asset_reserved_delete BEFORE DELETE ON sync_assets
WHEN EXISTS (SELECT 1 FROM sync_asset_deletions d WHERE d.asset_id=OLD.asset_id)
 OR EXISTS (SELECT 1 FROM sync_authority_cleanup_claims c WHERE c.asset_id=OLD.asset_id)
BEGIN SELECT RAISE(ABORT,'asset_cleanup_conflict'); END;
CREATE TRIGGER sync_asset_reserved_update BEFORE UPDATE ON sync_assets
WHEN (EXISTS (SELECT 1 FROM sync_asset_deletions d WHERE d.asset_id=OLD.asset_id)
 OR EXISTS (SELECT 1 FROM sync_authority_cleanup_claims c WHERE c.asset_id=OLD.asset_id)) AND (
 NEW.asset_id IS NOT OLD.asset_id OR NEW.account_id IS NOT OLD.account_id
 OR NEW.membership_id IS NOT OLD.membership_id OR NEW.sync_user_id IS NOT OLD.sync_user_id
 OR NEW.object_key IS NOT OLD.object_key OR NEW.object_version IS NOT OLD.object_version
 OR NEW.content_hash IS NOT OLD.content_hash OR NEW.kind IS NOT OLD.kind
 OR NEW.mime_type IS NOT OLD.mime_type OR NEW.byte_size IS NOT OLD.byte_size
 OR NEW.owner_record_id IS NOT OLD.owner_record_id OR NEW.owner_record_type IS NOT OLD.owner_record_type
 OR NEW.state<>'deleted' OR NOT EXISTS (SELECT 1 FROM sync_asset_deletions d
   WHERE d.asset_id=OLD.asset_id AND d.state='deleted'))
BEGIN SELECT RAISE(ABORT,'asset_cleanup_conflict'); END;
