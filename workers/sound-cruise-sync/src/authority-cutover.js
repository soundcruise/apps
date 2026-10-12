import { assertion, clearAssertions, policyAllows, WriterFenceError, translateFenceError } from './writer-fence.js';
import { createD1SyncRepository } from './sync-database.js';

const unavailable = () => new WriterFenceError('dataset_authority_unavailable');
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);

// No HTTP route and no environment switch. B1-6 must design production operator authorization.
// The only caller today is the isolated test harness with its code-branded capability.
export function createIsolatedCutoverController(binding, policy) {
  const db = binding.withSession?.('first-primary') || binding;
  async function read(accountId) {
    return db.prepare("SELECT * FROM sync_authority_cutovers WHERE account_id=? AND app_id='port'").bind(accountId).first();
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
      return existing; // lost-response recovery, including a retry of an earlier completed phase
    }
    const now = Date.now();
    const statements = [];
    if (phase === 'prepared') {
      statements.push(db.prepare(`INSERT INTO sync_authority_cutovers
        (account_id,app_id,membership_id,sync_user_id,migration_id,generation,phase,base_epoch,target_epoch,
         minimum_protocol,prepare_operation_id,created_at,updated_at)
        SELECT m.account_id,'port',m.id,m.sync_user_id,?,?,'prepared',m.write_epoch,m.write_epoch+1,2,?,?,?
        FROM sync_account_memberships m JOIN sync_accounts a ON a.id=m.account_id
        WHERE m.account_id=? AND m.app_id='port' AND m.state='active' AND a.state='active'
          AND EXISTS (SELECT 1 FROM sync_account_managed_users am WHERE am.membership_id=m.id AND am.account_id=m.account_id AND am.sync_user_id=m.sync_user_id AND am.app_id='port')
          AND m.authority_state='legacy' AND m.minimum_writer_protocol<=2 AND m.write_epoch<9007199254740991
          AND EXISTS (SELECT 1 FROM sync_datasets d WHERE d.user_id=m.sync_user_id AND d.app_id='port' AND d.state='ready')
          AND NOT EXISTS (SELECT 1 FROM sync_authority_cleanup_claims cl WHERE cl.account_id=m.account_id)`)
        .bind(migrationId,generation,operationId,now,now,accountId));
    } else {
      if (!existing || existing.phase !== (phase === 'paused' ? 'prepared' : 'paused')) throw unavailable();
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
    statements.push(assertion(db, 'changes()=1'), clearAssertions(db));
    try { await db.batch(statements); }
    catch (error) {
      // A concurrent retry may have committed the exact operation. No epoch increment on recovery.
      const recovered = await read(accountId);
      if (recovered?.migration_id === migrationId && recovered.generation === generation && recovered[opKey] === operationId) return recovered;
      throw translateFenceError(error);
    }
    return read(accountId);
  }
  return Object.freeze({ transition, async recover(accountId, migrationId) {
    if (!policyAllows(policy, accountId)) throw unavailable();
    const row = await read(accountId); if (!row || row.migration_id !== migrationId) throw unavailable(); return row;
  } });
}

// One SQL read joins the evidence to the very ledger and membership used by fenceQuery.
export async function readAuthorityEvidence(db, authority) {
  const row = await db.prepare(`SELECT m.write_epoch,m.minimum_writer_protocol,m.authority_state,m.authority_updated_at,
      c.phase,c.base_epoch,c.target_epoch,c.minimum_protocol,c.migration_id,c.generation,c.checkpoint_json
    FROM sync_account_memberships m LEFT JOIN sync_authority_cutovers c
      ON c.account_id=m.account_id AND c.app_id=m.app_id AND c.membership_id=m.id AND c.sync_user_id=m.sync_user_id
    WHERE m.id=? AND m.account_id=? AND m.app_id='port' AND m.state='active'`)
    .bind(authority.membershipId,authority.accountId).first();
  if (!row || !Number.isSafeInteger(row.write_epoch) || row.write_epoch < 1 ||
      !Number.isSafeInteger(row.minimum_writer_protocol) || row.minimum_writer_protocol < 0 ||
      !Number.isSafeInteger(row.authority_updated_at) || row.authority_updated_at < 0 ||
      !['legacy','prepared','paused','enforced'].includes(row.authority_state)) throw unavailable();
  const result = { accountId: authority.accountId, appId: 'port', writeEpoch: row.write_epoch,
    minimumWriterProtocol: row.minimum_writer_protocol, state: row.authority_state };
  if (!row.phase) return result; // a bare enforced label is never evidence
  if (row.phase !== row.authority_state || row.write_epoch !== (row.phase === 'enforced' ? row.target_epoch : row.base_epoch) ||
      (row.phase === 'enforced' && row.minimum_writer_protocol !== row.minimum_protocol)) throw unavailable();
  const checkpoint = row.checkpoint_json ? JSON.parse(row.checkpoint_json) : null;
  if (row.phase === 'enforced' && (!checkpoint || !Number.isSafeInteger(checkpoint.lastChangeSeq) || checkpoint.lastChangeSeq < 0 ||
      checkpoint.cursor !== String(checkpoint.lastChangeSeq) || !/^[a-f0-9]{64}$/.test(checkpoint.manifestHash) ||
      !Number.isSafeInteger(checkpoint.recordCount) || checkpoint.recordCount < 0 || checkpoint.schemaVersion !== 1)) throw unavailable();
  return { ...result, fence: { version: 1, guard: 'd1-transaction-v1', transactionalAdmission: true,
    cutoverBarrier: row.phase !== 'prepared', migrationId: row.migration_id, generation: row.generation,
    epoch: row.write_epoch, barrierState: row.phase, checkpoint,
    recovery: row.phase === 'paused' ? 'authorized-resume-required' : null } };
}
