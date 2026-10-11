import { parseWriterFields } from '../../../apps/shared/sync-account/writer-authority.mjs';

// Deliberately NOT an environment/client flag. Enforcing requires B1-5 code and
// its acceptance gates. Metadata alone cannot turn enforcement on in B1-1.
export const WRITER_ADMISSION_MODE = 'ACCEPT_COMPAT';

export async function admitWriter(db, identity, input, authority) {
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
  return Object.freeze({ mode: WRITER_ADMISSION_MODE, fields: parsed.value,
    identity: Object.freeze({ ...identity }), authority: authority && Object.freeze({ ...authority }),
    metadata: metadata && Object.freeze({ ...metadata }) });
}

// A transaction-local observation, not an HTTP-only preflight. B1-1 always
// accepts the current metadata regardless of minimum/epoch/state. B1-5 must
// replace this SELECT with a rejecting SQL predicate/guard in the SAME batch.
export function writerObservation(db, admission) {
  return db.prepare(`SELECT minimum_writer_protocol, write_epoch, authority_state
    FROM sync_account_memberships WHERE id = ? AND account_id = ? AND app_id = ? AND sync_user_id = ?`)
    .bind(admission.authority?.membershipId || '', admission.authority?.accountId || '',
      admission.identity.appId, admission.identity.userId);
}

// Keep the observation and all mutations in a single D1 batch. No statements
// are removed or split, and callers see the original result shape.
export function writerMutationDatabase(db, admission) {
  if (!admission) return db;
  const batch = async statements => (await db.batch([writerObservation(db, admission), ...statements])).slice(1);
  return {
    prepare(sql) {
      const wrap = statement => ({
        bind(...values) { return wrap(statement.bind(...values)); },
        first(...args) { return statement.first(...args); },
        all(...args) { return statement.all(...args); },
        async run() { return (await batch([statement]))[0]; },
        // batch receives the native prepared statement, not this view.
        writerNativeStatement: statement
      });
      return wrap(db.prepare(sql));
    },
    batch(statements) { return batch(statements.map(statement => statement.writerNativeStatement || statement)); }
  };
}
