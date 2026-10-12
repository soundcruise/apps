import { PRO_SESSION_IDLE_MS } from './pro-device-session.js';

// Code capability only: index.js never constructs or accepts one. JSON/env/query cannot brand it.
const policies = new WeakMap();
export function createIsolatedWriterPolicy(accountId) {
  if (typeof accountId !== 'string' || !accountId) throw new TypeError('accountId required');
  const policy = Object.freeze({}); policies.set(policy, accountId); return policy;
}
export function policyAllows(policy, accountId) { return typeof accountId === 'string' && policies.get(policy) === accountId; }
export class WriterFenceError extends Error {
  constructor(code) { super(code); this.code = code; this.status = code === 'invalid_credential' ? 401
    : code.startsWith('pro_') ? 403 : code === 'dataset_authority_unavailable' ? 503 : 409; }
}
export function translateFenceError(error) {
  const match = String(error?.message || '').match(/b15_(dataset_authority_unavailable|writer_protocol_required|writer_protocol_outdated|dataset_epoch_stale|invalid_credential|account_membership_required|pro_required|pro_reauth_required|pro_revalidation_required)\b/);
  return match ? new WriterFenceError(match[1]) : error;
}
export function assertion(db, predicate, values = []) {
  return db.prepare(`INSERT INTO sync_writer_fence_assertion(code)
    SELECT CASE WHEN (${predicate}) THEN 'ok' ELSE 'dataset_authority_unavailable' END`).bind(...values);
}
export function clearAssertions(db) { return db.prepare('DELETE FROM sync_writer_fence_assertion'); }

// This exact evaluator serves preflight, transaction guard and asset operation guard.
// Its reads execute INSIDE the mutation batch. D1 serializes the batch as one transaction.
export function fenceQuery(admission, { operationId = null, payload = null } = {}) {
  const a = admission, i = a.identity, auth = a.authority;
  const values = [auth?.accountId || '', auth?.membershipId || '', i.userId, i.deviceId,
    Number(policyAllows(a.policy, auth?.accountId)), a.fields.writerProtocol ?? null,
    a.fields.syncProtocol ?? null, a.fields.expectedWriteEpoch ?? null, a.metadata?.write_epoch ?? null,
    a.proCredentialId || '', operationId, payload == null ? null : JSON.stringify(payload), a.deviceVerifier || null, a.proVerifier || null];
  const sql = `WITH x AS (SELECT ? account_id, ? membership_id, ? user_id, ? device_id,
      ? enforce, ? writer, ? sync, ? expected_epoch, ? admitted_epoch, ? pro_id, ? operation_id, ? payload, ? device_verifier, ? pro_verifier),
    now AS (SELECT CAST((julianday('now')-2440587.5)*86400000 AS INTEGER) ms)
    SELECT CASE
      WHEN x.enforce=0 AND c.account_id IS NULL THEN 'ok'
      WHEN m.id IS NULL OR ac.id IS NULL OR ac.state<>'active' OR m.state<>'active'
        OR m.account_id<>x.account_id OR m.sync_user_id<>x.user_id OR m.app_id<>'port'
        OR NOT EXISTS (SELECT 1 FROM sync_account_managed_users am WHERE am.membership_id=m.id
          AND am.account_id=x.account_id AND am.sync_user_id=x.user_id AND am.app_id='port')
        THEN 'account_membership_required'
      WHEN NOT EXISTS (SELECT 1 FROM sync_devices d JOIN sync_users u ON u.id=d.user_id
        WHERE d.id=x.device_id AND d.user_id=x.user_id AND d.app_id='port'
          AND d.credential_verifier=x.device_verifier AND d.revoked_at IS NULL AND u.state IN ('active','provisioning')) THEN 'invalid_credential'
      WHEN NOT EXISTS (SELECT 1 FROM pro_credentials p WHERE p.id=x.pro_id
        AND p.verifier=x.pro_verifier AND p.revoked_at IS NULL AND p.scope='global_pro') THEN 'pro_required'
      WHEN NOT EXISTS (SELECT 1 FROM pro_credentials p JOIN pro_auth_state ps ON ps.singleton_id=1
        WHERE p.id=x.pro_id AND p.generation=ps.generation
        AND now.ms < (CASE WHEN p.device_public_key IS NOT NULL THEN p.last_validated_at
          ELSE MAX(p.created_at,ps.session_lifecycle_started_at) END) + ${PRO_SESSION_IDLE_MS}) THEN 'pro_reauth_required'
      WHEN NOT EXISTS (SELECT 1 FROM pro_credentials p JOIN pro_auth_state ps ON ps.singleton_id=1
        WHERE p.id=x.pro_id AND now.ms < CASE WHEN p.device_public_key IS NOT NULL
          THEN p.lease_expires_at ELSE ps.unbound_backend_until END) THEN 'pro_revalidation_required'
      WHEN typeof(m.authority_updated_at)<>'integer' OR m.authority_updated_at<0 OR m.authority_updated_at>9007199254740991 OR typeof(m.write_epoch)<>'integer' OR m.write_epoch<1 OR m.write_epoch>9007199254740991
        OR typeof(m.minimum_writer_protocol)<>'integer' OR m.minimum_writer_protocol<0
        OR m.minimum_writer_protocol>2 OR m.authority_state NOT IN ('legacy','prepared','paused','enforced')
        OR (c.account_id IS NOT NULL AND (c.membership_id<>m.id OR c.sync_user_id<>x.user_id
          OR c.phase<>m.authority_state OR (c.phase='enforced' AND m.minimum_writer_protocol<>c.minimum_protocol) OR m.write_epoch<>CASE WHEN c.phase='enforced' THEN c.target_epoch ELSE c.base_epoch END))
        OR (m.authority_state IN ('paused','enforced') AND c.account_id IS NULL)
        OR m.authority_state='paused' THEN 'dataset_authority_unavailable'
      WHEN x.admitted_epoch IS NOT m.write_epoch THEN 'dataset_epoch_stale'
      WHEN m.authority_state='enforced' AND (x.writer IS NULL OR x.sync IS NULL) THEN 'writer_protocol_required'
      WHEN m.authority_state='enforced' AND x.writer<m.minimum_writer_protocol THEN 'writer_protocol_outdated'
      WHEN m.authority_state='enforced' AND x.expected_epoch IS NOT m.write_epoch THEN 'dataset_epoch_stale'
      WHEN x.operation_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sync_asset_operations o
        WHERE o.operation_id=x.operation_id AND o.account_id=x.account_id AND o.sync_user_id=x.user_id
          AND o.app_device_id=x.device_id AND o.admitted_write_epoch=m.write_epoch
          AND o.writer_protocol IS x.writer AND o.sync_protocol IS x.sync AND o.expected_write_epoch IS x.expected_epoch)
        THEN 'dataset_epoch_stale'
      WHEN x.payload IS NOT NULL AND EXISTS (SELECT 1 FROM json_tree(x.payload) j WHERE j.key='assetId'
        AND NOT EXISTS (SELECT 1 FROM sync_assets s WHERE s.asset_id=j.value AND s.account_id=x.account_id
          AND s.membership_id=m.id AND s.sync_user_id=x.user_id AND s.state IN ('available','unreferenced')))
        THEN 'dataset_authority_unavailable'
      ELSE 'ok' END AS code
    FROM x CROSS JOIN now LEFT JOIN sync_account_memberships m ON m.id=x.membership_id
      LEFT JOIN sync_accounts ac ON ac.id=x.account_id
      LEFT JOIN sync_authority_cutovers c ON (c.account_id=x.account_id OR c.sync_user_id=x.user_id) AND c.app_id='port'`;
  return { sql, values };
}
export async function checkFence(db, admission, constraints) {
  if (admission.identity.appId !== 'port') return;
  const q = fenceQuery(admission, constraints);
  const row = await db.prepare(q.sql).bind(...q.values).first();
  if (row?.code !== 'ok') throw new WriterFenceError(row?.code || 'dataset_authority_unavailable');
}
