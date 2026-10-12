import { checkFence, fenceQuery, clearAssertions, translateFenceError, policyAllows } from './writer-fence.js';
import { parseWriterFields } from '../../../apps/shared/sync-account/writer-authority.mjs';

// Production default. Only a branded code capability or a durable cutover ledger activates the fence.
export const WRITER_ADMISSION_MODE = 'ACCEPT_COMPAT';

export async function admitWriter(db, identity, input, authority, options = {}) {
  const parsed = parseWriterFields(input);
  if (!parsed.ok) return { error: parsed.code, status: parsed.status };
  if (!identity?.deviceId || !identity?.userId || !identity?.appId)
    return { error: 'invalid_credential', status: 401 };
  // Existing standalone apps retain their existing admission contract.
  let metadata = null;
  if (authority) {
    metadata = await db.prepare(`SELECT minimum_writer_protocol, write_epoch, authority_state, authority_updated_at
      FROM sync_account_memberships WHERE id = ? AND account_id = ? AND app_id = ? AND sync_user_id = ?`)
      .bind(authority.membershipId, authority.accountId, identity.appId, identity.userId).first();
    if (!metadata || !Number.isSafeInteger(metadata.minimum_writer_protocol) || metadata.minimum_writer_protocol < 0 ||
        !Number.isSafeInteger(metadata.write_epoch) || metadata.write_epoch < 1 ||
        !Number.isSafeInteger(metadata.authority_updated_at) || metadata.authority_updated_at < 0 ||
        !['legacy', 'prepared', 'enforced', 'paused'].includes(metadata.authority_state))
      return { error: 'dataset_authority_unavailable', status: 503 };
  } else if (identity.appId === 'port' && Object.keys(parsed.value).length) {
    return { error: 'account_membership_required', status: 409 };
  }
  // Direct repository fixtures have no HTTP verifier; only their branded capability may capture test proofs.
  if (policyAllows(options.policy, authority?.accountId)) {
    options = { ...options,
      deviceVerifier: options.deviceVerifier ?? (await db.prepare('SELECT credential_verifier FROM sync_devices WHERE id=?').bind(identity.deviceId).first())?.credential_verifier,
      proVerifier: options.proVerifier ?? (await db.prepare('SELECT verifier FROM pro_credentials WHERE id=?').bind(options.proCredentialId || '').first())?.verifier };
  }
  const admission = Object.freeze({ deviceVerifier: options.deviceVerifier, proVerifier: options.proVerifier, policy: options.policy, proCredentialId: options.proCredentialId, mode: WRITER_ADMISSION_MODE, fields: parsed.value,
    identity: Object.freeze({ ...identity }), authority: authority && Object.freeze({ ...authority }),
    metadata: metadata && Object.freeze({ ...metadata }) });
  if (!options.defer) await checkFence(db, admission);
  return admission;
}

// The default compatibility observation remains for non-Port apps.
export function writerObservation(db, admission) {
  return db.prepare(`SELECT minimum_writer_protocol, write_epoch, authority_state
    FROM sync_account_memberships WHERE id = ? AND account_id = ? AND app_id = ? AND sync_user_id = ?`)
    .bind(admission.authority?.membershipId || '', admission.authority?.accountId || '',
      admission.identity.appId, admission.identity.userId);
}

export function writerMutationDatabase(db, admission, constraints = {}) {
  if (!admission) return db;
  const batch = async statements => {
    const port = admission.identity.appId === 'port';
    const q = port && fenceQuery(admission, constraints);
    const guard = port ? db.prepare(`INSERT INTO sync_writer_fence_assertion(code) ${q.sql}`).bind(...q.values)
      : writerObservation(db, admission);
    try {
      const results = await db.batch([guard, ...statements, ...(port ? [clearAssertions(db)] : [])]);
      return port ? results.slice(1, -1) : results.slice(1);
    } catch (error) { throw translateFenceError(error); }
  };
  return {
    assertWriter: extra => checkFence(db, admission, { ...constraints, ...extra }),
    withWriterConstraints: extra => writerMutationDatabase(db, admission, { ...constraints, ...extra }),
    prepare(sql) {
      const wrap = statement => ({
        bind(...values) { return wrap(statement.bind(...values)); },
        first(...args) { return statement.first(...args); },
        all(...args) { return statement.all(...args); },
        async run() { return (await batch([statement]))[0]; },
        writerNativeStatement: statement
      });
      return wrap(db.prepare(sql));
    },
    batch(statements) { return batch(statements.map(statement => statement.writerNativeStatement || statement)); }
  };
}
