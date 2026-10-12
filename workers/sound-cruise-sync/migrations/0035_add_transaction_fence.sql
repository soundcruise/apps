-- B1-5 additive, inert until an explicit isolated/operator transition. No production activation.
CREATE TABLE sync_writer_fence_assertion (code TEXT NOT NULL CHECK(code = 'ok'));
CREATE TRIGGER sync_fence_dataset_authority_unavailable BEFORE INSERT ON sync_writer_fence_assertion
WHEN NEW.code = 'dataset_authority_unavailable' BEGIN SELECT RAISE(ABORT, 'b15_dataset_authority_unavailable'); END;
CREATE TRIGGER sync_fence_writer_protocol_required BEFORE INSERT ON sync_writer_fence_assertion
WHEN NEW.code = 'writer_protocol_required' BEGIN SELECT RAISE(ABORT, 'b15_writer_protocol_required'); END;
CREATE TRIGGER sync_fence_writer_protocol_outdated BEFORE INSERT ON sync_writer_fence_assertion
WHEN NEW.code = 'writer_protocol_outdated' BEGIN SELECT RAISE(ABORT, 'b15_writer_protocol_outdated'); END;
CREATE TRIGGER sync_fence_dataset_epoch_stale BEFORE INSERT ON sync_writer_fence_assertion
WHEN NEW.code = 'dataset_epoch_stale' BEGIN SELECT RAISE(ABORT, 'b15_dataset_epoch_stale'); END;
CREATE TRIGGER sync_fence_invalid_credential BEFORE INSERT ON sync_writer_fence_assertion
WHEN NEW.code = 'invalid_credential' BEGIN SELECT RAISE(ABORT, 'b15_invalid_credential'); END;
CREATE TRIGGER sync_fence_account_membership_required BEFORE INSERT ON sync_writer_fence_assertion
WHEN NEW.code = 'account_membership_required' BEGIN SELECT RAISE(ABORT, 'b15_account_membership_required'); END;
CREATE TRIGGER sync_fence_pro_required BEFORE INSERT ON sync_writer_fence_assertion
WHEN NEW.code = 'pro_required' BEGIN SELECT RAISE(ABORT, 'b15_pro_required'); END;
CREATE TRIGGER sync_fence_pro_reauth_required BEFORE INSERT ON sync_writer_fence_assertion
WHEN NEW.code = 'pro_reauth_required' BEGIN SELECT RAISE(ABORT, 'b15_pro_reauth_required'); END;
CREATE TRIGGER sync_fence_pro_revalidation_required BEFORE INSERT ON sync_writer_fence_assertion
WHEN NEW.code = 'pro_revalidation_required' BEGIN SELECT RAISE(ABORT, 'b15_pro_revalidation_required'); END;

CREATE TABLE sync_authority_cutovers (
 account_id TEXT NOT NULL, app_id TEXT NOT NULL CHECK(app_id='port'),
 membership_id TEXT NOT NULL, sync_user_id TEXT NOT NULL,
 migration_id TEXT NOT NULL, generation TEXT NOT NULL,
 phase TEXT NOT NULL CHECK(phase IN ('prepared','paused','enforced')),
 base_epoch INTEGER NOT NULL CHECK(base_epoch >= 1),
 target_epoch INTEGER NOT NULL CHECK(target_epoch = base_epoch + 1),
 minimum_protocol INTEGER NOT NULL CHECK(minimum_protocol = 2),
 prepare_operation_id TEXT NOT NULL, pause_operation_id TEXT, enforce_operation_id TEXT,
 checkpoint_json TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 PRIMARY KEY(account_id, app_id), UNIQUE(membership_id), UNIQUE(sync_user_id, app_id), UNIQUE(migration_id),
 CHECK(pause_operation_id IS NULL OR pause_operation_id<>prepare_operation_id),
 CHECK(enforce_operation_id IS NULL OR (enforce_operation_id<>prepare_operation_id AND enforce_operation_id<>pause_operation_id)),
 CHECK(phase='prepared' OR pause_operation_id IS NOT NULL),
 CHECK(phase<>'enforced' OR (enforce_operation_id IS NOT NULL AND checkpoint_json IS NOT NULL))
);
-- A fence-capable rollback cannot silently downgrade a completed transition.
CREATE TRIGGER sync_cutover_no_delete BEFORE DELETE ON sync_authority_cutovers
BEGIN SELECT RAISE(ABORT, 'b15_dataset_authority_unavailable'); END;
CREATE TRIGGER sync_cutover_monotonic BEFORE UPDATE ON sync_authority_cutovers
WHEN NEW.account_id<>OLD.account_id OR NEW.app_id<>OLD.app_id OR NEW.membership_id<>OLD.membership_id
 OR NEW.sync_user_id<>OLD.sync_user_id OR NEW.migration_id<>OLD.migration_id OR NEW.generation<>OLD.generation
 OR NEW.base_epoch<>OLD.base_epoch OR NEW.target_epoch<>OLD.target_epoch OR NEW.minimum_protocol<>OLD.minimum_protocol
 OR NEW.prepare_operation_id<>OLD.prepare_operation_id
 OR (OLD.pause_operation_id IS NOT NULL AND NEW.pause_operation_id IS NOT OLD.pause_operation_id)
 OR (OLD.enforce_operation_id IS NOT NULL AND NEW.enforce_operation_id IS NOT OLD.enforce_operation_id)
 OR (OLD.checkpoint_json IS NOT NULL AND NEW.checkpoint_json IS NOT OLD.checkpoint_json)
 OR (OLD.phase='paused' AND NEW.phase='prepared') OR (OLD.phase='enforced' AND NEW.phase<>'enforced')
BEGIN SELECT RAISE(ABORT, 'b15_dataset_authority_unavailable'); END;
CREATE TRIGGER sync_cutover_membership_monotonic BEFORE UPDATE OF write_epoch,minimum_writer_protocol,authority_state ON sync_account_memberships
WHEN EXISTS (SELECT 1 FROM sync_authority_cutovers c WHERE c.membership_id=OLD.id AND
 (NEW.write_epoch<>CASE WHEN c.phase='enforced' THEN c.target_epoch ELSE c.base_epoch END
 OR NEW.authority_state<>c.phase OR (c.phase='enforced' AND NEW.minimum_writer_protocol<>c.minimum_protocol)))
BEGIN SELECT RAISE(ABORT, 'b15_dataset_authority_unavailable'); END;
-- Cleanup holds a durable claim while outside D1 in R2. Cutover cannot pass a claim.
-- A crashed claim requires operator recovery; it never expires into an unsafe delete.
CREATE TABLE sync_authority_cleanup_claims (
 account_id TEXT PRIMARY KEY, asset_id TEXT NOT NULL, created_at INTEGER NOT NULL
);
