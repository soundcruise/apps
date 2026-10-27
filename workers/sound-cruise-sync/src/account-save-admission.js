// UNROUTED, explicit co-located fixture contract. An HTTP observation cannot
// implement readAtCommit for a browser IndexedDB transaction.
import { verifyAccountCredentialSnapshot } from './account-auth.js';

const positive = n => Number.isSafeInteger(n) && n > 0;
const text = x => typeof x === 'string' && x.length > 0 && x.length <= 256;
const hex = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const keys = ['contractVersion','purpose','operationId','action','partitionId','datasetGeneration','targetKey',
  'accountId','accountDeviceId','accountGeneration','membershipId','membershipGeneration','credentialVersion',
  'sourceDigest','baseRevision','changesDigest'];
function failure(code) { const e = Error(code); e.code = code; return e; }
function fixedRequest(value) {
  if (!value || typeof value !== 'object' || Object.getOwnPropertySymbols(value).length ||
      Object.keys(value).length !== keys.length) throw failure('save-admission-request-invalid');
  const result = {};
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(value,key);
    if (!d || !Object.hasOwn(d,'value')) throw failure('save-admission-request-invalid');
    result[key] = d.value;
  }
  if (result.contractVersion !== 1 || result.purpose !== 'port-dataset-save' || result.action !== 'saveBpm' ||
      result.targetKey !== 'cruisePort.metronome' || !/^[A-Za-z0-9_-]{1,64}$/.test(result.operationId) ||
      !['partitionId','datasetGeneration','accountId','accountDeviceId','membershipId','baseRevision'].every(k=>text(result[k])) ||
      !['accountGeneration','membershipGeneration','credentialVersion'].every(k=>positive(result[k])) ||
      !hex(result.sourceDigest) || !hex(result.changesDigest)) throw failure('save-admission-request-invalid');
  return Object.freeze(result);
}

// Lifecycle is owner data, never a UI counter or the observation's 5s deadline.
export function evaluateSaveCredential(row, request, now) {
  if (!row || !positive(now) || !positive(row.credential_clock_floor) || now < row.credential_clock_floor)
    return 'unknown';
  if (row.account_id !== request.accountId || row.device_id !== request.accountDeviceId) return 'old-account';
  if (row.generation !== request.accountGeneration || row.membership_id !== request.membershipId ||
      row.membership_generation !== request.membershipGeneration || row.credential_version !== request.credentialVersion)
    return 'generation-mismatch';
  if (row.revoked_at !== null || row.account_state !== 'active' || row.membership_state !== 'active' ||
      row.membership_deleted_at !== null || row.credential_lifecycle === 'revoked') return 'revoked';
  if (row.credential_lifecycle === 'expired') return 'expired';
  if (row.credential_lifecycle === 'renewing') return 'renewing';
  if (row.credential_lifecycle === 'renewal-failed') return 'renewal-failed';
  if (row.credential_lifecycle !== 'active' || !positive(row.credential_issued_at) ||
      !positive(row.credential_expires_at) || row.credential_expires_at <= row.credential_issued_at ||
      row.credential_issued_at > now || !positive(row.credential_lease_revision) ||
      row.admission_provenance !== 'production' || row.device_linked !== 1 ||
      !positive(row.runtime_generation) || !hex(row.credential_verifier)) return 'unknown';
  if (row.save_enabled !== 1) return 'permission-denied';
  return now >= row.credential_expires_at ? 'expired' : 'valid';
}

const pinKeys = ['account_id','device_id','generation','membership_id','membership_generation','credential_version',
  'credential_verifier','credential_issued_at','credential_expires_at','credential_lease_revision','runtime_generation'];
const pin = row => JSON.stringify(pinKeys.map(k=>row[k]));
const sameIdentity = (a,b) => a && b && Object.keys(a).length === Object.keys(b).length &&
  Object.keys(b).every(k=>Object.hasOwn(a,k) && a[k] === b[k]);
async function requestHash(request) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(request))))]
    .map(n=>n.toString(16).padStart(2,'0')).join('');
}

export function createIsolatedAccountSaveAdmissionOwner({backend,pepper,now=Date.now}={}) {
  if (backend?.fixtureOnly !== true || backend.boundary !== 'co-located-owner-fixture' ||
      typeof backend.readPrimary !== 'function' || typeof backend.readAtCommit !== 'function' ||
      typeof pepper !== 'string' || pepper.length < 32 || typeof now !== 'function')
    throw failure('save-admission-owner-boundary-required');
  const contexts = new WeakMap(), operations = new Map();
  let disposed = false, previous = 0;
  function clock() {
    const time = now();
    if (disposed || !positive(time) || time < previous) throw failure('save-admission-clock-invalid');
    previous = time; return time;
  }
  function check(row, q, p) {
    const state = evaluateSaveCredential(row,q,clock());
    if (state !== 'valid') throw failure('save-admission-'+state);
    if (p && (p.invalid || pin(row) !== p.pin)) throw failure('save-admission-stale');
    return row;
  }
  async function authenticated(q, authorization, p) {
    const row = await backend.readPrimary(q);
    const credential = typeof authorization === 'string' && authorization.startsWith('Bearer ') ? authorization.slice(7) : null;
    const verified = await verifyAccountCredentialSnapshot(row,credential,pepper);
    if (!verified?.row) throw failure('save-admission-credential-invalid');
    return check(row,q,p);
  }
  return Object.freeze({
    fixtureOnly:true,
    async prepare(value,{authorization}={}) {
      const q = fixedRequest(value), operationKey = JSON.stringify([q.partitionId,q.datasetGeneration,q.operationId]);
      const serialized = JSON.stringify(q), previousRequest = operations.get(operationKey);
      if (previousRequest && previousRequest !== serialized) throw failure('save-admission-operation-conflict');
      const row = await authenticated(q,authorization);
      const hash = await requestHash(q);
      // Crypto/read awaits cannot extend a credential's lifetime or accept an
      // owner change. A synchronous authoritative probe is mandatory, not optional.
      const latest = backend.readAtCommit(q);
      if (latest?.then) { latest.catch?.(()=>{}); throw failure('save-admission-async-boundary'); }
      check(latest,q,{pin:pin(row),invalid:false});
      const existing = operations.get(operationKey);
      if (existing && existing !== serialized) throw failure('save-admission-operation-conflict');
      operations.set(operationKey,serialized);
      const context = Object.freeze({contractVersion:1,purpose:'isolated-account-save-admission'});
      const binding = Object.freeze({contractVersion:1,owner:'account',requestDigest:hash,
        credentialVersion:q.credentialVersion,credentialExpiresAt:row.credential_expires_at,
        credentialLeaseRevision:row.credential_lease_revision,runtimeGeneration:row.runtime_generation});
      contexts.set(context,{q,authorization,pin:pin(row),binding,invalid:false});
      return Object.freeze({context,binding});
    },
    async assertCurrent(context) {
      const p = contexts.get(context); if (!p || p.invalid || disposed) return false;
      try { await authenticated(p.q,p.authorization,p); return !p.invalid && !disposed; }
      catch { p.invalid = true; return false; }
    },
    guard(context, details) {
      const p = contexts.get(context); if (!p || p.invalid || disposed) return false;
      try {
        const q = p.q, i = details?.control?.identity;
        if (details?.operationId !== q.operationId || details.action !== q.action || details.generation !== q.datasetGeneration ||
            details.head?.revision !== q.baseRevision || details.changesDigest !== q.changesDigest ||
            details.targetKeys?.length !== 1 || details.targetKeys[0] !== q.targetKey ||
            i?.ownership !== 'bound-account' || i.appId !== 'port' || i.datasetOwner !== 'port' ||
            i.partitionId !== q.partitionId || i.accountId !== q.accountId || i.accountGeneration !== q.accountGeneration ||
            i.membershipId !== q.membershipId || i.membershipGeneration !== q.membershipGeneration ||
            details.authorizationIdentity?.accountDigest !== q.sourceDigest ||
            !sameIdentity(details.authorizationIdentity?.identity,i) ||
            details.authorizationIdentity?.credentialVersion !== q.credentialVersion ||
            JSON.stringify(details.authorizationIdentity?.admission) !== JSON.stringify(p.binding))
          throw failure('save-admission-binding-mismatch');
        const row = backend.readAtCommit(q);
        if (row?.then) { row.catch?.(()=>{}); throw failure('save-admission-async-boundary'); }
        check(row,q,p); return true;
      } catch { p.invalid = true; return false; }
    },
    dispose() { disposed = true; operations.clear(); }
  });
}
