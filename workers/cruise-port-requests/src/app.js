import { upsertAppRequest } from './database.js';
import { verifyTurnstileToken } from './turnstile.js';
import {
  isJsonContentType,
  MAX_BODY_BYTES,
  readBodyWithLimit,
  validatePayload
} from './validation.js';

const API_PATH = '/v1/app-requests';

function allowedOrigins(env) {
  return new Set(
    String(env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
  );
}

function corsHeaders(origin) {
  const headers = new Headers({
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '600',
    'Vary': 'Origin'
  });
  return headers;
}

function jsonResponse(status, body, origin = null, extraHeaders = null) {
  const headers = origin ? corsHeaders(origin) : new Headers({ Vary: 'Origin' });
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  if (extraHeaders) {
    for (const [name, value] of Object.entries(extraHeaders)) headers.set(name, value);
  }
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
  if (url.pathname !== API_PATH) return errorResponse(404, 'not_found');

  const origin = request.headers.get('Origin');
  const originAllowed = Boolean(origin && allowedOrigins(env).has(origin));

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
  if (!isJsonContentType(request.headers.get('Content-Type'))) {
    return errorResponse(415, 'invalid_content_type', origin);
  }

  const ip = requestIp(request);
  if (await isRateLimited(env.IP_RATE_LIMITER, `ip:${ip}`)) {
    return errorResponse(429, 'rate_limited', origin, { 'Retry-After': '60' });
  }

  const bodyResult = await readBodyWithLimit(request, MAX_BODY_BYTES);
  if (!bodyResult.ok) {
    return bodyResult.tooLarge
      ? errorResponse(413, 'payload_too_large', origin)
      : errorResponse(400, 'invalid_json', origin);
  }

  let payload;
  try {
    payload = JSON.parse(bodyResult.text);
  } catch {
    return errorResponse(400, 'invalid_json', origin);
  }

  const validation = validatePayload(payload);
  if (!validation.ok) {
    return errorResponse(400, validation.reason === 'turnstile' ? 'turnstile_failed' : 'invalid_request', origin);
  }

  const requestData = validation.value;
  if (await isRateLimited(env.IP_REQUEST_RATE_LIMITER, `ip-request:${ip}:${requestData.requestKey}`)) {
    return errorResponse(429, 'rate_limited', origin, { 'Retry-After': '60' });
  }

  const verify = dependencies.verifyTurnstileToken || verifyTurnstileToken;
  const turnstileResult = await verify(requestData.turnstileToken, env);
  if (!turnstileResult.ok) {
    return errorResponse(turnstileResult.unavailable ? 503 : 403, 'turnstile_failed', origin);
  }

  try {
    const upsert = dependencies.upsertAppRequest || upsertAppRequest;
    const result = await upsert(env.REQUESTS_DB, requestData);
    if (!result || result.request_key !== requestData.requestKey) throw new Error('Unexpected D1 result');
  } catch {
    return errorResponse(503, 'server_error', origin);
  }

  return jsonResponse(200, { ok: true, requestKey: requestData.requestKey }, origin);
}
