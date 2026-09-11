import { createIdentityMaterial } from './crypto.js';
import { createProvisioningIdentity } from './database.js';
import { verifyTurnstileToken } from './turnstile.js';
import {
  isJsonContentType,
  MAX_BODY_BYTES,
  readBodyWithLimit,
  validateStartPayload
} from './validation.js';

const HEALTH_PATH = '/health';
const START_PATH = '/v1/sync/start';

function configuredOrigins(env) {
  return new Set(String(env.ALLOWED_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean));
}

function corsHeaders(origin) {
  return new Headers({
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '600',
    'Vary': 'Origin'
  });
}

function jsonResponse(status, body, origin = null, extraHeaders = null) {
  const headers = origin ? corsHeaders(origin) : new Headers({ Vary: 'Origin' });
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  if (extraHeaders) Object.entries(extraHeaders).forEach(([name, value]) => headers.set(name, value));
  return new Response(JSON.stringify(body), { status, headers });
}

function errorResponse(status, code, origin = null, extraHeaders = null) {
  return jsonResponse(status, { ok: false, code }, origin, extraHeaders);
}

async function isRateLimited(binding, key) {
  if (!binding || typeof binding.limit !== 'function') return true;
  try {
    const result = await binding.limit({ key });
    return result?.success !== true;
  } catch {
    return true;
  }
}

function requestIp(request) {
  return request.headers.get('CF-Connecting-IP') || 'missing';
}

export async function handleRequest(request, env, _ctx, dependencies = {}) {
  const url = new URL(request.url);
  if (url.pathname === HEALTH_PATH) {
    if (request.method !== 'GET') return errorResponse(405, 'method_not_allowed', null, { Allow: 'GET' });
    return jsonResponse(200, { ok: true, service: 'sound-cruise-sync', phase: 'p1' });
  }
  if (url.pathname !== START_PATH) return errorResponse(404, 'not_found');

  const origin = request.headers.get('Origin');
  const originAllowed = Boolean(origin && configuredOrigins(env).has(origin));
  if (request.method === 'OPTIONS') {
    if (!originAllowed) return errorResponse(403, 'invalid_origin');
    const requestedMethod = request.headers.get('Access-Control-Request-Method');
    const requestedHeaders = request.headers.get('Access-Control-Request-Headers') || '';
    if (requestedMethod !== 'POST' || requestedHeaders.split(',').some((header) => header.trim().toLowerCase() !== 'content-type')) {
      return errorResponse(403, 'invalid_origin', origin);
    }
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== 'POST') {
    return errorResponse(405, 'method_not_allowed', originAllowed ? origin : null, { Allow: 'POST, OPTIONS' });
  }
  if (!originAllowed) return errorResponse(403, 'invalid_origin');
  if (!isJsonContentType(request.headers.get('Content-Type'))) return errorResponse(415, 'invalid_content_type', origin);

  const ip = requestIp(request);
  if (await isRateLimited(env.START_RATE_LIMITER, `sync-start:${ip}`)) {
    return errorResponse(429, 'rate_limited', origin, { 'Retry-After': '60' });
  }

  const bodyResult = await readBodyWithLimit(request, MAX_BODY_BYTES);
  if (!bodyResult.ok) return bodyResult.tooLarge
    ? errorResponse(413, 'payload_too_large', origin)
    : errorResponse(400, 'invalid_json', origin);
  let payload;
  try { payload = JSON.parse(bodyResult.text); } catch { return errorResponse(400, 'invalid_json', origin); }
  const validation = validateStartPayload(payload, env);
  if (!validation.ok) return errorResponse(400, validation.reason === 'turnstile' ? 'turnstile_failed' : 'invalid_request', origin);

  const verify = dependencies.verifyTurnstileToken || verifyTurnstileToken;
  let turnstile;
  try {
    turnstile = await verify(validation.value.turnstileToken, env);
  } catch {
    return errorResponse(503, 'turnstile_failed', origin);
  }
  if (!turnstile.ok) return errorResponse(turnstile.unavailable ? 503 : 403, 'turnstile_failed', origin);
  if (!env.SYNC_CREDENTIAL_PEPPER || !env.SYNC_DB) return errorResponse(503, 'server_unavailable', origin);

  let material;
  try {
    const createMaterial = dependencies.createIdentityMaterial || createIdentityMaterial;
    material = await createMaterial(env.SYNC_CREDENTIAL_PEPPER);
    const provision = dependencies.createProvisioningIdentity || createProvisioningIdentity;
    await provision(env.SYNC_DB, {
      userId: material.userId,
      deviceId: material.deviceId,
      credentialVerifier: material.credentialVerifier,
      appId: validation.value.appId,
      deviceLabel: validation.value.deviceLabel,
      initialSummary: validation.value.initialSummary,
      now: Date.now()
    });
  } catch {
    return errorResponse(503, 'server_error', origin);
  }

  return jsonResponse(201, {
    ok: true,
    appId: validation.value.appId,
    syncState: 'provisioning',
    datasetState: 'initializing',
    deviceId: material.deviceId,
    deviceCredential: material.credential
  }, origin);
}
