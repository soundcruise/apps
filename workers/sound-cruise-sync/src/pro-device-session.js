import { hmacVerifier, timingSafeHexEqual } from './crypto.js';

export const PRO_SESSION_IDLE_MS = 90 * 86400_000;
export const PRO_SESSION_LEASE_MS = 7 * 86400_000;
export const PRO_SESSION_REVALIDATE_MS = 12 * 3600_000;
const CHALLENGE_MS = 120_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const COORDINATE = /^[A-Za-z0-9_-]{43}$/;

export function canonicalDeviceKey(value) {
  if (!value || value.kty !== 'EC' || value.crv !== 'P-256' ||
      typeof value.x !== 'string' || typeof value.y !== 'string' || !COORDINATE.test(value.x) || !COORDINATE.test(value.y) || Object.hasOwn(value, 'd') ||
      Object.keys(value).some(key => !['kty', 'crv', 'x', 'y', 'ext', 'key_ops'].includes(key)) ||
      (value.key_ops !== undefined && (!Array.isArray(value.key_ops) || value.key_ops.some(op => op !== 'verify')))) return null;
  return JSON.stringify({ kty: 'EC', crv: 'P-256', x: value.x, y: value.y });
}

export function sessionInactive(row, current, now) {
  const anchor = row.device_public_key ? row.last_validated_at :
    Math.max(row.created_at, current.session_lifecycle_started_at);
  return !Number.isSafeInteger(anchor) || anchor < 0 || now >= anchor + PRO_SESSION_IDLE_MS;
}

export function backendSessionDecision(row, current, now) {
  if (sessionInactive(row, current, now)) return { ok: false, code: 'pro_reauth_required' };
  if (row.device_public_key) {
    if (!Number.isSafeInteger(row.lease_expires_at) || now >= row.lease_expires_at) {
      return { ok: false, code: 'pro_revalidation_required' };
    }
  } else if (!Number.isSafeInteger(current.unbound_backend_until) || now >= current.unbound_backend_until) {
    return { ok: false, code: 'pro_revalidation_required' };
  }
  return { ok: true };
}

export function deviceSessionMetadata(row, now) {
  return { version: 3, serverTime: now, issuedAt: row.created_at, boundAt: row.session_bound_at,
    lastValidatedAt: row.last_validated_at, inactiveExpiresAt: row.last_validated_at + PRO_SESSION_IDLE_MS,
    accessExpiresAt: row.lease_expires_at, offlineUntil: row.lease_expires_at,
    revalidateAfter: row.last_validated_at + PRO_SESSION_REVALIDATE_MS,
    devicePublicKey: JSON.parse(row.device_public_key) };
}

function challengeText(c) {
  return JSON.stringify({ purpose: 'sound-cruise-pro-device-session-v1', id: c.id,
    credentialId: c.credentialId, generation: c.generation, key: c.key,
    issuedAt: c.issuedAt, expiresAt: c.expiresAt });
}

export async function createSessionChallenge(parsed, row, current, publicKey, env, now, cryptoImpl = crypto) {
  const key = canonicalDeviceKey(publicKey);
  if (!key) return { status: 400, code: 'invalid_device_key' };
  if (row.device_public_key && row.device_public_key !== key) return { status: 401, code: 'device_session_mismatch' };
  // Import validates the actual curve point, not just the shape of the JWK.
  try { await cryptoImpl.subtle.importKey('jwk', JSON.parse(key), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']); }
  catch { return { status: 400, code: 'invalid_device_key' }; }
  const challenge = { id: cryptoImpl.randomUUID(), credentialId: parsed.id,
    generation: current.generation, key, issuedAt: now, expiresAt: now + CHALLENGE_MS };
  const message = challengeText(challenge);
  const mac = await hmacVerifier(message, env.PRO_CREDENTIAL_PEPPER, cryptoImpl);
  return { status: 200, body: { ok: true, challenge, mac, message } };
}

export async function renewDeviceSession(session, parsed, row, current, body, env, now, cryptoImpl = crypto) {
  const c = body?.challenge;
  const key = canonicalDeviceKey(body?.publicKey);
  if (!c || !UUID.test(c.id) || c.credentialId !== parsed.id || c.generation !== current.generation ||
      key === null || c.key !== key || (row.device_public_key && row.device_public_key !== key) ||
      !Number.isSafeInteger(c.issuedAt) || c.issuedAt > now || c.expiresAt !== c.issuedAt + CHALLENGE_MS ||
      now >= c.expiresAt || typeof body.mac !== 'string' || !/^[a-f0-9]{64}$/.test(body.mac) ||
      typeof body.signature !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(body.signature)) {
    return { status: 401, code: 'invalid_session_proof' };
  }
  const message = challengeText(c);
  const expected = await hmacVerifier(message, env.PRO_CREDENTIAL_PEPPER, cryptoImpl);
  if (!timingSafeHexEqual(body.mac, expected)) return { status: 401, code: 'invalid_session_proof' };
  let valid = false;
  try {
    const publicKey = await cryptoImpl.subtle.importKey('jwk', JSON.parse(key), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const bytes = Uint8Array.from(atob(body.signature.replace(/-/g, '+').replace(/_/g, '/') + '=='), c => c.charCodeAt(0));
    valid = await cryptoImpl.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, bytes, new TextEncoder().encode(message));
  } catch { /* malformed proof never binds or renews */ }
  if (!valid) return { status: 401, code: 'invalid_session_proof' };
  // A single guarded UPDATE enforces current generation/revocation/inactivity,
  // key binding and one-use proof even across concurrent renew/reset requests.
  const results = await session.batch([
    session.prepare(`UPDATE pro_credentials SET device_public_key = ?,
      session_bound_at = COALESCE(session_bound_at, ?), last_validated_at = ?, lease_expires_at = ?
      WHERE id = ? AND verifier = ? AND revoked_at IS NULL AND scope = 'global_pro'
        AND generation = ? AND generation = (SELECT generation FROM pro_auth_state WHERE singleton_id = 1)
        AND (device_public_key IS NULL OR device_public_key = ?)
        AND COALESCE(last_validated_at, MAX(created_at,
          (SELECT session_lifecycle_started_at FROM pro_auth_state WHERE singleton_id = 1))) > ?
        AND NOT EXISTS (SELECT 1 FROM pro_session_proofs WHERE challenge_id = ?)`)
      .bind(key, now, now, now + PRO_SESSION_LEASE_MS, parsed.id, parsed.verifier,
        current.generation, key, now - PRO_SESSION_IDLE_MS, c.id),
    session.prepare(`INSERT OR IGNORE INTO pro_session_proofs (challenge_id, credential_id, expires_at)
      VALUES (?, ?, ?)`).bind(c.id, parsed.id, c.expiresAt)
  ]);
  if (results.some(result => result?.success === false)) throw new Error('Pro session batch failed');
  if (Number(results[0]?.meta?.changes) !== 1) return { status: 401, code: 'reauth_required' };
  return { status: 200, body: { ok: true, generation: current.generation,
    session: deviceSessionMetadata({ ...row, device_public_key: key,
      session_bound_at: row.session_bound_at ?? now, last_validated_at: now,
      lease_expires_at: now + PRO_SESSION_LEASE_MS }, now) } };
}
