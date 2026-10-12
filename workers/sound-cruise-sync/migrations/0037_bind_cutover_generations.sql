-- Additive generation binding. Existing ledgers remain NULL and require review;
-- never infer their original generation from today's Account/membership rows.
ALTER TABLE sync_authority_cutovers ADD COLUMN account_generation INTEGER
 CHECK(account_generation IS NULL OR (typeof(account_generation)='integer' AND account_generation BETWEEN 1 AND 9007199254740991));
ALTER TABLE sync_authority_cutovers ADD COLUMN membership_generation INTEGER
 CHECK(membership_generation IS NULL OR (typeof(membership_generation)='integer' AND membership_generation BETWEEN 1 AND 9007199254740991));
CREATE TRIGGER sync_fence_migration_generation_stale BEFORE INSERT ON sync_writer_fence_assertion
WHEN NEW.code='migration_generation_stale' BEGIN SELECT RAISE(ABORT,'b15_migration_generation_stale'); END;
CREATE TRIGGER sync_cutover_generation_immutable BEFORE UPDATE ON sync_authority_cutovers
WHEN NEW.account_generation IS NOT OLD.account_generation OR NEW.membership_generation IS NOT OLD.membership_generation
BEGIN SELECT RAISE(ABORT,'b15_migration_generation_stale'); END;
CREATE TRIGGER sync_cutover_generation_insert BEFORE INSERT ON sync_authority_cutovers
WHEN NOT EXISTS (SELECT 1 FROM sync_accounts a JOIN sync_account_memberships m ON m.account_id=a.id
 WHERE a.id=NEW.account_id AND m.id=NEW.membership_id AND m.app_id=NEW.app_id AND m.sync_user_id=NEW.sync_user_id
  AND a.state='active' AND m.state='active'
  AND a.generation=NEW.account_generation AND m.generation=NEW.membership_generation
  AND NEW.account_generation IS NOT NULL AND NEW.membership_generation IS NOT NULL
  AND EXISTS (SELECT 1 FROM sync_account_managed_users am WHERE am.membership_id=m.id AND am.account_id=a.id
   AND am.sync_user_id=m.sync_user_id AND am.app_id=m.app_id))
BEGIN SELECT RAISE(ABORT,'b15_migration_generation_stale'); END;
CREATE TRIGGER sync_cutover_generation_update BEFORE UPDATE ON sync_authority_cutovers
WHEN NOT EXISTS (SELECT 1 FROM sync_accounts a JOIN sync_account_memberships m ON m.account_id=a.id
 WHERE a.id=NEW.account_id AND m.id=NEW.membership_id AND m.app_id=NEW.app_id AND m.sync_user_id=NEW.sync_user_id
  AND a.state='active' AND m.state='active'
  AND a.generation=NEW.account_generation AND m.generation=NEW.membership_generation
  AND NEW.account_generation IS NOT NULL AND NEW.membership_generation IS NOT NULL
  AND EXISTS (SELECT 1 FROM sync_account_managed_users am WHERE am.membership_id=m.id AND am.account_id=a.id
   AND am.sync_user_id=m.sync_user_id AND am.app_id=m.app_id))
BEGIN SELECT RAISE(ABORT,'b15_migration_generation_stale'); END;
-- Protect the second mutation of the transition batch as well, including an
-- injected generation change between ledger UPDATE and membership publication.
CREATE TRIGGER sync_cutover_generation_membership BEFORE UPDATE OF authority_state,write_epoch,minimum_writer_protocol ON sync_account_memberships
WHEN EXISTS (SELECT 1 FROM sync_authority_cutovers c WHERE c.account_id=OLD.account_id AND c.app_id=OLD.app_id
 AND (c.membership_id<>NEW.id OR c.sync_user_id<>NEW.sync_user_id OR c.membership_generation IS NOT NEW.generation
  OR c.account_generation IS NOT (SELECT generation FROM sync_accounts WHERE id=NEW.account_id)
  OR NOT EXISTS (SELECT 1 FROM sync_accounts a WHERE a.id=NEW.account_id AND a.state='active') OR NEW.state<>'active'))
BEGIN SELECT RAISE(ABORT,'b15_migration_generation_stale'); END;
