import { hmacVerifier, timingSafeHexEqual } from './crypto.js';
import { issueProCredentialAndReset, proLockoutKey, proLockoutStatus,
  recordWrongProPasscode } from './pro-auth-lockout.js';
import { verifyTurnstileToken } from './turnstile.js';
import { backendSessionDecision, canonicalDeviceKey, createSessionChallenge, deviceSessionMetadata,
  renewDeviceSession, sessionInactive, PRO_SESSION_LEASE_MS } from './pro-device-session.js';
import { isJsonContentType, readBodyWithLimit } from './validation.js';

const ROUTES = Object.freeze({
  '/v2/pro-auth/verify': { method: 'POST', headers: ['content-type'] },
  '/v2/pro-auth/session': { method: 'GET', headers: ['authorization'] },
  '/v2/pro-auth/revoke': { method: 'POST', headers: ['authorization', 'content-type'] },
  '/v2/pro-auth/device-session/challenge': { method: 'POST', headers: ['authorization', 'content-type'] },
  '/v2/pro-auth/device-session/renew': { method: 'POST', headers: ['authorization', 'content-type'] },
  '/v2/pro-auth/policy': { method: 'GET', headers: [] }
});
const TOKEN_RE = /^scp1\.([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/u;

function cors(origin, route) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': `${route.method}, OPTIONS`,
    'Access-Control-Allow-Headers': route.headers.map((header) =>
      header.replace(/(^|-)([a-z])/gu, (_match, prefix, letter) => prefix + letter.toUpperCase())).join(', '),
    'Access-Control-Max-Age': '600',
    'Cache-Control': 'no-store',
    Vary: 'Origin'
  };
}

function response(status, body, origin, route, extras = {}) {
  const headers = new Headers(origin && route ? cors(origin, route) : { Vary: 'Origin' });
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  for (const [name, value] of Object.entries(extras)) headers.set(name, value);
  return new Response(JSON.stringify(body), { status, headers });
}

function error(status, code, origin, route, extras) {
  return response(status, { ok: false, code }, origin, route, extras);
}

function db(env) {
  if (!env.SYNC_DB?.prepare) throw new Error('Pro D1 unavailable');
  return env.SYNC_DB.withSession ? env.SYNC_DB.withSession('first-primary') : env.SYNC_DB;
}

async function state(session) {
  const row = await session.prepare(`SELECT generation, active_code_slot, legacy_compat_enabled,
      session_lifecycle_started_at, unbound_backend_until
    FROM pro_auth_state WHERE singleton_id = 1`).first();
  if (!row || !Number.isSafeInteger(row.generation) || row.generation < 1 ||
      !['A', 'B'].includes(row.active_code_slot) || ![0, 1].includes(row.legacy_compat_enabled) ||
      !Number.isSafeInteger(row.session_lifecycle_started_at) || row.session_lifecycle_started_at < 0 ||
      !Number.isSafeInteger(row.unbound_backend_until) || row.unbound_backend_until < row.session_lifecycle_started_at) {
    throw new Error('Pro state unavailable');
  }
  return row;
}

async function parseVerifyBody(request) {
  const read = await readBodyWithLimit(request, 4096);
  if (!read.ok) return { error: read.tooLarge ? 'payload_too_large' : 'invalid_json', status: read.tooLarge ? 413 : 400 };
  let body;
  try { body = JSON.parse(read.text); } catch { return { error: 'invalid_json', status: 400 }; }
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => !['passcode', 'turnstileToken', 'devicePublicKey'].includes(key)) || !Object.hasOwn(body, 'passcode') || !Object.hasOwn(body, 'turnstileToken') ||
      typeof body.passcode !== 'string' || !/^[0-9]{4}$/u.test(body.passcode) ||
      typeof body.turnstileToken !== 'string' || body.turnstileToken.length < 1 || body.turnstileToken.length > 2048) {
    return { error: 'invalid_input', status: 400 };
  }
  if (body.devicePublicKey !== undefined && !canonicalDeviceKey(body.devicePublicKey)) {
    return { error: 'invalid_device_key', status: 400 };
  }
  return { body };
}

function base64url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/gu, '');
}

async function tokenMaterial(pepper, cryptoImpl) {
  const id = cryptoImpl.randomUUID();
  const bytes = new Uint8Array(32);
  cryptoImpl.getRandomValues(bytes);
  const token = `scp1.${id}.${base64url(bytes)}`;
  return { id, token, verifier: await hmacVerifier(`sound-cruise-pro:v1:${token}`, pepper, cryptoImpl) };
}

async function parseProBearer(value, pepper, cryptoImpl) {
  if (!value || !/^Bearer /u.test(value)) return null;
  const token = value.slice(7);
  const match = TOKEN_RE.exec(token);
  if (!match) return null;
  return { id: match[1], verifier: await hmacVerifier(`sound-cruise-pro:v1:${token}`, pepper, cryptoImpl) };
}

async function bearer(request, pepper, cryptoImpl) {
  return parseProBearer(request.headers.get('Authorization'), pepper, cryptoImpl);
}

// Read-only Pro check for other Worker routes (AI support beta): the same token parsing, verifier
// compare, scope, revocation and generation rules as GET /v2/pro-auth/session, with SELECTs only.
// Returns { ok: true } or { ok: false, code }. Throws only when the Pro store is unavailable.
export async function inspectProCredentialReadOnly(headerValue, env, dependencies = {}) {
  if (typeof env.PRO_CREDENTIAL_PEPPER !== 'string' || env.PRO_CREDENTIAL_PEPPER.length < 32) {
    throw new Error('Pro verification unavailable');
  }
  const parsed = await parseProBearer(headerValue, env.PRO_CREDENTIAL_PEPPER, dependencies.cryptoImpl || crypto);
  if (!parsed) return { ok: false, code: 'pro_required' };
  const session = db(env);
  const current = await state(session);
  const row = await credential(session, parsed);
  if (!row || row.scope !== 'global_pro' || row.revoked_at !== null) return { ok: false, code: 'pro_required' };
  if (row.generation !== current.generation) return { ok: false, code: 'pro_reauth_required' };
  return backendSessionDecision(row, current, dependencies.now ? dependencies.now() : Date.now());
}

async function credential(session, parsed) {
  if (!parsed) return null;
  const row = await session.prepare(`SELECT verifier, generation, scope, revoked_at, created_at,
      device_public_key, session_bound_at, last_validated_at, lease_expires_at
    FROM pro_credentials WHERE id = ?`).bind(parsed.id).first();
  return row && timingSafeHexEqual(row.verifier, parsed.verifier) ? row : null;
}

async function verify(request, env, origin, route, dependencies) {
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip || !env.PRO_VERIFY_RATE_LIMITER?.limit) return error(503, 'verification_unavailable', origin, route);
  let limited;
  try { limited = await env.PRO_VERIFY_RATE_LIMITER.limit({ key: `pro-verify:${ip}` }); }
  catch { return error(503, 'verification_unavailable', origin, route); }
  if (limited?.success !== true) return error(429, 'rate_limited', origin, route, { 'Retry-After': '60' });
  const parsed = await parseVerifyBody(request);
  if (parsed.error) return error(parsed.status, parsed.error, origin, route);
  let session;
  let current;
  try { session = db(env); current = await state(session); }
  catch { return error(503, 'server_unavailable', origin, route); }
  const passcodeSecret = env[`PRO_PASSCODE_SLOT_${current.active_code_slot}`];
  if (typeof passcodeSecret !== 'string' || !/^[0-9]{4}$/u.test(passcodeSecret) ||
      typeof env.PRO_CREDENTIAL_PEPPER !== 'string' || env.PRO_CREDENTIAL_PEPPER.length < 32 ||
      typeof env.PRO_LOCKOUT_PEPPER !== 'string' || env.PRO_LOCKOUT_PEPPER.length < 32) {
    return error(503, 'verification_unavailable', origin, route);
  }
  const now = dependencies.now ? dependencies.now() : Date.now();
  let ipKey;
  try {
    ipKey = await proLockoutKey(ip, env.PRO_LOCKOUT_PEPPER, dependencies.cryptoImpl || crypto);
    const retryAfter = await proLockoutStatus(session, ipKey, now);
    if (retryAfter) return error(429, 'rate_limited', origin, route,
      { 'Retry-After': String(retryAfter) });
  } catch { return error(503, 'verification_unavailable', origin, route); }
  let turnstile;
  try {
    turnstile = await (dependencies.verifyProTurnstile || verifyTurnstileToken)(
      parsed.body.turnstileToken, env,
      { expectedAction: env.TURNSTILE_PRO_EXPECTED_ACTION || 'sound_cruise_pro_verify' }
    );
  } catch { return error(503, 'verification_unavailable', origin, route); }
  if (!turnstile?.ok) return error(turnstile?.unavailable ? 503 : 403,
    turnstile?.unavailable ? 'verification_unavailable' : 'turnstile_failed', origin, route);
  if (!timingSafeHexEqual(parsed.body.passcode, passcodeSecret)) {
    try {
      const recorded = await recordWrongProPasscode(session, ipKey, now);
      if (!recorded) {
        const retryAfter = await proLockoutStatus(session, ipKey, now);
        return retryAfter ? error(429, 'rate_limited', origin, route,
          { 'Retry-After': String(retryAfter) }) : error(503, 'verification_unavailable', origin, route);
      }
    } catch { return error(503, 'verification_unavailable', origin, route); }
    return error(401, 'invalid_passcode', origin, route);
  }
  try {
    const material = await tokenMaterial(env.PRO_CREDENTIAL_PEPPER, dependencies.cryptoImpl || crypto);
    material.devicePublicKey = parsed.body.devicePublicKey ? canonicalDeviceKey(parsed.body.devicePublicKey) : null;
    if (material.devicePublicKey) {
      try { await (dependencies.cryptoImpl || crypto).subtle.importKey('jwk', JSON.parse(material.devicePublicKey),
        { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']); }
      catch { return error(400, 'invalid_device_key', origin, route); }
    }
    const issued = await issueProCredentialAndReset(session, material, current, ipKey, now);
    if (!issued) {
      const retryAfter = await proLockoutStatus(session, ipKey, now);
      return retryAfter ? error(429, 'rate_limited', origin, route,
        { 'Retry-After': String(retryAfter) }) : error(409, 'policy_changed', origin, route);
    }
    return response(201, { ok: true, credential: material.token, generation: current.generation,
      ...(material.devicePublicKey ? { session: deviceSessionMetadata({ created_at: now,
        device_public_key: material.devicePublicKey, session_bound_at: now, last_validated_at: now,
        lease_expires_at: now + PRO_SESSION_LEASE_MS }, now) } : {}) }, origin, route);
  } catch { return error(503, 'server_unavailable', origin, route); }
}

async function sessionRequest(request, env, origin, route, dependencies) {
  if (typeof env.PRO_CREDENTIAL_PEPPER !== 'string' || env.PRO_CREDENTIAL_PEPPER.length < 32) {
    return error(503, 'server_unavailable', origin, route);
  }
  let parsed;
  try { parsed = await bearer(request, env.PRO_CREDENTIAL_PEPPER, dependencies.cryptoImpl || crypto); }
  catch { return error(503, 'server_unavailable', origin, route); }
  if (!parsed) return error(401, 'invalid_credential', origin, route);
  try {
    const session = db(env);
    const current = await state(session);
    const row = await credential(session, parsed);
    if (!row || row.scope !== 'global_pro' || row.revoked_at !== null) {
      return error(401, 'invalid_credential', origin, route);
    }
    if (row.generation !== current.generation) {
      return error(401, 'reauth_required', origin, route);
    }
    if (sessionInactive(row, current, dependencies.now ? dependencies.now() : Date.now())) {
      return error(401, 'reauth_required', origin, route);
    }
    return response(200, { ok: true, generation: current.generation, protocol: 3,
      deviceSessionRequired: true,
      legacyCompatibilityEnabled: current.legacy_compat_enabled === 1 &&
        (dependencies.now ? dependencies.now() : Date.now()) < current.unbound_backend_until }, origin, route);
  } catch { return error(503, 'server_unavailable', origin, route); }
}

async function revoke(request, env, origin, route, dependencies) {
  if (typeof env.PRO_CREDENTIAL_PEPPER !== 'string' || env.PRO_CREDENTIAL_PEPPER.length < 32) {
    return error(503, 'server_unavailable', origin, route);
  }
  let parsed;
  try { parsed = await bearer(request, env.PRO_CREDENTIAL_PEPPER, dependencies.cryptoImpl || crypto); }
  catch { return error(503, 'server_unavailable', origin, route); }
  if (!parsed) return error(401, 'invalid_credential', origin, route);
  try {
    const session = db(env);
    const row = await credential(session, parsed);
    if (!row || row.scope !== 'global_pro') return error(401, 'invalid_credential', origin, route);
    await session.prepare(`UPDATE pro_credentials SET revoked_at = ?
      WHERE id = ? AND verifier = ? AND revoked_at IS NULL`)
      .bind(Date.now(), parsed.id, parsed.verifier).run();
    return response(200, { ok: true }, origin, route);
  } catch { return error(503, 'server_unavailable', origin, route); }
}

async function policy(env, origin, route, dependencies) {
  try {
    const current = await state(db(env));
    const now = dependencies.now ? dependencies.now() : Date.now();
    return response(200, { ok: true, protocol: 3,
      deviceSessionRequired: true, inactiveLifetimeDays: 90, offlineGraceDays: 7,
      serverTime: now, unboundBackendUntil: current.unbound_backend_until,
      legacyCompatibilityEnabled: current.legacy_compat_enabled === 1 && now < current.unbound_backend_until }, origin, route);
  } catch { return error(503, 'server_unavailable', origin, route); }
}

async function deviceSessionRequest(request, env, origin, route, dependencies) {
  if (!env.SYNC_RATE_LIMITER?.limit) return error(503, 'server_unavailable', origin, route);
  try {
    const limited = await env.SYNC_RATE_LIMITER.limit({ key: 'pro-session:' + (request.headers.get('CF-Connecting-IP') || 'missing') });
    if (limited?.success !== true) return error(429, 'rate_limited', origin, route, { 'Retry-After': '60' });
    if (typeof env.PRO_CREDENTIAL_PEPPER !== 'string' || env.PRO_CREDENTIAL_PEPPER.length < 32) throw Error('Missing verifier');
    const parsed = await bearer(request, env.PRO_CREDENTIAL_PEPPER, dependencies.cryptoImpl || crypto);
    if (!parsed) return error(401, 'invalid_credential', origin, route);
    const session = db(env), current = await state(session), row = await credential(session, parsed);
    const now = dependencies.now ? dependencies.now() : Date.now();
    if (!row || row.scope !== 'global_pro' || row.revoked_at !== null) return error(401, 'invalid_credential', origin, route);
    if (row.generation !== current.generation || sessionInactive(row, current, now)) return error(401, 'reauth_required', origin, route);
    const read = await readBodyWithLimit(request, 4096);
    if (!read.ok) return error(read.tooLarge ? 413 : 400, 'invalid_input', origin, route);
    let body;
    try { body = JSON.parse(read.text); } catch { return error(400, 'invalid_input', origin, route); }
    const challenge = new URL(request.url).pathname.endsWith('/challenge');
    const fields = challenge ? ['publicKey'] : ['publicKey', 'challenge', 'mac', 'signature'];
    if (!body || Array.isArray(body) || Object.keys(body).length !== fields.length ||
        fields.some(field => !Object.hasOwn(body, field))) return error(400, 'invalid_input', origin, route);
    const result = challenge
      ? await createSessionChallenge(parsed, row, current, body.publicKey, env, now, dependencies.cryptoImpl || crypto)
      : await renewDeviceSession(session, parsed, row, current, body, env, now, dependencies.cryptoImpl || crypto);
    return result.body ? response(result.status, result.body, origin, route) : error(result.status, result.code, origin, route);
  } catch { return error(503, 'server_unavailable', origin, route); }
}

export async function handleProAuthRequest(request, env = {}, _ctx, dependencies = {}) {
  const url = new URL(request.url);
  const route = ROUTES[url.pathname];
  if (!route) return error(404, 'not_found');
  const origin = request.headers.get('Origin');
  const allowed = Boolean(origin && String(env.ALLOWED_ORIGINS || '').split(',').map((item) => item.trim()).includes(origin));
  if (!allowed) return error(403, 'invalid_origin');
  if (request.method === 'OPTIONS') {
    const requestedHeaders = (request.headers.get('Access-Control-Request-Headers') || '')
      .split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
    if (request.headers.get('Access-Control-Request-Method') !== route.method ||
        requestedHeaders.some((item) => !route.headers.includes(item))) return error(403, 'invalid_preflight', origin, route);
    return new Response(null, { status: 204, headers: cors(origin, route) });
  }
  if (request.method !== route.method) return error(405, 'method_not_allowed', origin, route, { Allow: `${route.method}, OPTIONS` });
  if (url.search || url.hash) return error(400, 'invalid_url', origin, route);
  if (route.method === 'POST' && !isJsonContentType(request.headers.get('Content-Type'))) {
    return error(415, 'invalid_content_type', origin, route);
  }
  if (url.pathname === '/v2/pro-auth/revoke') {
    const body = await readBodyWithLimit(request, 2);
    if (!body.ok || body.text !== '{}') return error(400, 'invalid_input', origin, route);
  }
  let result;
  if (url.pathname === '/v2/pro-auth/verify') result = await verify(request, env, origin, route, dependencies);
  else if (url.pathname === '/v2/pro-auth/session') result = await sessionRequest(request, env, origin, route, dependencies);
  else if (url.pathname === '/v2/pro-auth/revoke') result = await revoke(request, env, origin, route, dependencies);
  else if (url.pathname.startsWith('/v2/pro-auth/device-session/')) result = await deviceSessionRequest(request, env, origin, route, dependencies);
  else result = await policy(env, origin, route, dependencies);
  // Wrangler invocation logs expose route/status without application payload logging.
  return result;
}
