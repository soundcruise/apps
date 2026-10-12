import { assertion, clearAssertions, policyAllows, WriterFenceError, translateFenceError } from './writer-fence.js';
import { createD1SyncRepository } from './sync-database.js';

const unavailable = () => new WriterFenceError('dataset_authority_unavailable');
const stale = () => new WriterFenceError('migration_generation_stale');
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const positiveGeneration = value => Number.isSafeInteger(value) && value >= 1;
const bindingPredicate = `EXISTS (SELECT 1 FROM sync_authority_cutovers c
  JOIN sync_account_memberships m ON m.id=c.membership_id AND m.account_id=c.account_id
    AND m.app_id=c.app_id AND m.sync_user_id=c.sync_user_id
  JOIN sync_accounts a ON a.id=c.account_id
  WHERE c.account_id=? AND c.migration_id=? AND c.generation=? AND c.account_generation=? AND c.membership_generation=?
    AND a.state='active' AND m.state='active' AND a.generation=c.account_generation AND m.generation=c.membership_generation
    AND EXISTS (SELECT 1 FROM sync_account_managed_users am WHERE am.membership_id=m.id AND am.account_id=a.id
      AND am.sync_user_id=m.sync_user_id AND am.app_id=m.app_id))`;

// No HTTP route and no environment switch. B1-6 must design production operator authorization.
// The only caller today is the isolated test harness with its code-branded capability.
export function createIsolatedCutoverController(binding, policy) {
  const db = binding.withSession?.('first-primary') || binding;
  async function read(accountId) {
    return db.prepare("SELECT * FROM sync_authority_cutovers WHERE account_id=? AND app_id='port'").bind(accountId).first();
  }
  function generationAssertion(row) {
    return db.prepare(`INSERT INTO sync_writer_fence_assertion(code)
      SELECT CASE WHEN (${bindingPredicate}) THEN 'ok' ELSE 'migration_generation_stale' END`)
      .bind(row.account_id,row.migration_id,row.generation,row.account_generation,row.membership_generation);
  }
  async function assertFresh(row) {
    if (!positiveGeneration(row?.account_generation) || !positiveGeneration(row?.membership_generation)) throw stale();
    try {
      await db.batch([generationAssertion(row), clearAssertions(db)]);
    } catch (error) { throw translateFenceError(error); }
  }
  async function transition(input) {
    const { accountId, migrationId, generation, operationId, phase } = input;
    if (!policyAllows(policy, accountId)) throw unavailable();
    if (![accountId, migrationId, generation, operationId].every(identifier) || !['prepared','paused','enforced'].includes(phase)) throw unavailable();
    const existing = await read(accountId);
    if (existing && (existing.migration_id !== migrationId || existing.generation !== generation)) throw unavailable();
    const opKey = { prepared: 'prepare_operation_id', paused: 'pause_operation_id', enforced: 'enforce_operation_id' }[phase];
    if (existing?.[opKey]) {
      if (existing[opKey] !== operationId) throw unavailable();
      await assertFresh(existing);
      return existing; // lost-response recovery, including a retry of an earlier completed phase
    }
    const now = Date.now();
    const statements = []; let bound = existing;
    if (phase === 'prepared') {
      // Capture the authenticated server rows before any awaited mutation. A
      // concurrent change is rejected by both INSERT predicate and SQL trigger.
      const source = await db.prepare(`SELECT m.id,m.sync_user_id,m.generation membership_generation,a.generation account_generation
        FROM sync_account_memberships m JOIN sync_accounts a ON a.id=m.account_id
        WHERE m.account_id=? AND m.app_id='port' AND m.state='active' AND a.state='active'`).bind(accountId).first();
      if (!positiveGeneration(source?.account_generation) || !positiveGeneration(source?.membership_generation)) throw stale();
      bound = { ...source, account_id: accountId, migration_id: migrationId, generation };
      statements.push(db.prepare(`INSERT INTO sync_authority_cutovers
        (account_id,app_id,membership_id,sync_user_id,migration_id,generation,phase,base_epoch,target_epoch,
         minimum_protocol,prepare_operation_id,created_at,updated_at,account_generation,membership_generation)
        SELECT m.account_id,'port',m.id,m.sync_user_id,?,?,'prepared',m.write_epoch,m.write_epoch+1,2,?,?,?,?,?
        FROM sync_account_memberships m JOIN sync_accounts a ON a.id=m.account_id
        WHERE m.account_id=? AND m.app_id='port' AND m.state='active' AND a.state='active'
          AND EXISTS (SELECT 1 FROM sync_account_managed_users am WHERE am.membership_id=m.id AND am.account_id=m.account_id AND am.sync_user_id=m.sync_user_id AND am.app_id='port')
          AND m.authority_state='legacy' AND m.minimum_writer_protocol<=2 AND m.write_epoch<9007199254740991
          AND EXISTS (SELECT 1 FROM sync_datasets d WHERE d.user_id=m.sync_user_id AND d.app_id='port' AND d.state='ready')
          AND NOT EXISTS (SELECT 1 FROM sync_authority_cleanup_claims cl WHERE cl.account_id=m.account_id)`)
        .bind(migrationId,generation,operationId,now,now,source.account_generation,source.membership_generation,accountId));
      // Verify the captured identity/generations inside the same transaction,
      // even when the INSERT's active-state predicate selected zero rows.
      statements.unshift(db.prepare(`INSERT INTO sync_writer_fence_assertion(code)
        SELECT CASE WHEN EXISTS (SELECT 1 FROM sync_accounts a JOIN sync_account_memberships m ON m.account_id=a.id
          WHERE a.id=? AND m.id=? AND m.sync_user_id=? AND m.app_id='port' AND a.state='active' AND m.state='active'
          AND a.generation=? AND m.generation=?) THEN 'ok' ELSE 'migration_generation_stale' END`)
        .bind(accountId,source.id,source.sync_user_id,source.account_generation,source.membership_generation));
    } else {
      if (!existing || existing.phase !== (phase === 'paused' ? 'prepared' : 'paused')) throw unavailable();
      await assertFresh(existing);
      let checkpoint = null;
      if (phase === 'enforced') {
        // paused is durable before this read; every data mutation uses that same ledger guard.
        const snapshot = await createD1SyncRepository(db).readSnapshot({ userId: existing.sync_user_id, appId: 'port' });
        checkpoint = JSON.stringify({ cursor: String(snapshot.dataset.last_change_seq), lastChangeSeq: snapshot.dataset.last_change_seq, manifestHash: snapshot.manifestHash,
          recordCount: snapshot.recordCount, schemaVersion: snapshot.dataset.schema_version });
      }
      statements.push(db.prepare(`UPDATE sync_authority_cutovers SET phase=?, ${opKey}=?,
          checkpoint_json=COALESCE(?,checkpoint_json),updated_at=?
        WHERE account_id=? AND migration_id=? AND generation=? AND phase=?`)
        .bind(phase,operationId,checkpoint,now,accountId,migrationId,generation,existing.phase));
    }
    statements.push(assertion(db, 'changes()=1'));
    statements.push(db.prepare(`UPDATE sync_account_memberships SET authority_state=?,
        write_epoch=(SELECT CASE WHEN phase='enforced' THEN target_epoch ELSE base_epoch END
          FROM sync_authority_cutovers WHERE account_id=? AND app_id='port'),
        minimum_writer_protocol=CASE WHEN ?='enforced' THEN 2 ELSE minimum_writer_protocol END,
        authority_updated_at=? WHERE account_id=? AND app_id='port' AND state='active'
          AND EXISTS (SELECT 1 FROM sync_accounts a WHERE a.id=? AND a.state='active')`)
      .bind(phase,accountId,phase,now,accountId,accountId));
    statements.push(assertion(db, 'changes()=1'), generationAssertion(bound), clearAssertions(db));
    try { await db.batch(statements); }
    catch (error) {
      // A concurrent retry may have committed the exact operation. No epoch increment on recovery.
      const recovered = await read(accountId);
      if (recovered?.migration_id === migrationId && recovered.generation === generation && recovered[opKey] === operationId) {
        await assertFresh(recovered); return recovered;
      }
      throw translateFenceError(error);
    }
    const committed = await read(accountId); await assertFresh(committed); return committed;
  }
  return Object.freeze({ transition, async recover(accountId, migrationId) {
    if (!policyAllows(policy, accountId)) throw unavailable();
    const row = await read(accountId); if (!row || row.migration_id !== migrationId) throw unavailable();
    try { await assertFresh(row); return row; }
    catch (error) {
      if (error.reason !== 'migration_generation_stale') throw error;
      // Historical fact is inspectable by the scoped capability, never a fresh
      // authorization receipt. No retag, phase rollback or epoch mutation.
      return { ...row, authorizationFresh: false, recoveryRequired: true, reason: error.reason };
    }
  } });
}

// One SQL read joins the evidence to the very ledger and membership used by fenceQuery.
export async function readAuthorityEvidence(db, authority) {
  const row = await db.prepare(`SELECT m.write_epoch,m.minimum_writer_protocol,m.authority_state,m.authority_updated_at,
      m.id membership_id,m.sync_user_id,m.generation current_membership_generation,a.generation current_account_generation,a.state account_state,
      c.phase,c.base_epoch,c.target_epoch,c.minimum_protocol,c.migration_id,c.generation,c.checkpoint_json,
      c.account_generation,c.membership_generation,c.pause_operation_id,c.membership_id bound_membership_id,c.sync_user_id bound_sync_user_id
    FROM sync_account_memberships m LEFT JOIN sync_authority_cutovers c
      ON c.account_id=m.account_id AND c.app_id=m.app_id
    JOIN sync_accounts a ON a.id=m.account_id
    WHERE m.id=? AND m.account_id=? AND m.app_id='port' AND m.state='active'`)
    .bind(authority.membershipId,authority.accountId).first();
  if (!row || row.account_state !== 'active' || !positiveGeneration(row.current_account_generation) || !positiveGeneration(row.current_membership_generation) || !Number.isSafeInteger(row.write_epoch) || row.write_epoch < 1 ||
      !Number.isSafeInteger(row.minimum_writer_protocol) || row.minimum_writer_protocol < 0 ||
      !Number.isSafeInteger(row.authority_updated_at) || row.authority_updated_at < 0 ||
      !['legacy','prepared','paused','enforced'].includes(row.authority_state)) throw unavailable();
  const result = { accountId: authority.accountId, appId: 'port', writeEpoch: row.write_epoch,
    minimumWriterProtocol: row.minimum_writer_protocol, state: row.authority_state };
  if (!row.phase) return result; // a bare enforced label is never evidence
  if (!positiveGeneration(row.account_generation) || !positiveGeneration(row.membership_generation) ||
      row.account_generation !== row.current_account_generation || row.membership_generation !== row.current_membership_generation ||
      row.membership_id !== authority.membershipId || row.bound_membership_id !== row.membership_id || row.bound_sync_user_id !== row.sync_user_id) throw stale();
  if (row.phase !== row.authority_state || row.write_epoch !== (row.phase === 'enforced' ? row.target_epoch : row.base_epoch) ||
      (row.phase === 'enforced' && row.minimum_writer_protocol !== row.minimum_protocol)) throw unavailable();
  const checkpoint = row.checkpoint_json ? JSON.parse(row.checkpoint_json) : null;
  if (row.phase === 'enforced' && (!checkpoint || !Number.isSafeInteger(checkpoint.lastChangeSeq) || checkpoint.lastChangeSeq < 0 ||
      checkpoint.cursor !== String(checkpoint.lastChangeSeq) || !/^[a-f0-9]{64}$/.test(checkpoint.manifestHash) ||
      !Number.isSafeInteger(checkpoint.recordCount) || checkpoint.recordCount < 0 || checkpoint.schemaVersion !== 1)) throw unavailable();
  return { ...result, fence: { version: 1, guard: 'd1-transaction-v1', transactionalAdmission: true,
    accountId: authority.accountId, accountGeneration: row.account_generation, appId: 'port',
    membershipId: row.membership_id, membershipGeneration: row.membership_generation, generationBinding: true,
    barrierId: row.pause_operation_id,
    cutoverBarrier: row.phase !== 'prepared', migrationId: row.migration_id, generation: row.generation,
    epoch: row.write_epoch, barrierState: row.phase, checkpoint,
    recovery: row.phase === 'paused' ? 'authorized-resume-required' : null } };
}
