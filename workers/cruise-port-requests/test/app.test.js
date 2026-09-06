import assert from 'node:assert/strict';
import test from 'node:test';

import { handleRequest } from '../src/app.js';

const endpoint = 'https://worker.example/v1/app-requests';
const allowedOrigin = 'https://soundcruise.jp';
const validPayload = {
  platform: 'ios',
  storeUrl: 'https://apps.apple.com/jp/app/example/id123456789',
  appName: 'Example',
  requestSourceVersion: '0.9.0',
  turnstileToken: 'token'
};

function permissiveLimiter() {
  return { limit: async () => ({ success: true }) };
}

function baseEnv(overrides = {}) {
  return {
    ALLOWED_ORIGINS: allowedOrigin,
    IP_RATE_LIMITER: permissiveLimiter(),
    IP_REQUEST_RATE_LIMITER: permissiveLimiter(),
    REQUESTS_DB: {},
    ...overrides
  };
}

function request({
  method = 'POST',
  origin = allowedOrigin,
  contentType = 'application/json',
  payload = validPayload,
  ip = '192.0.2.1',
  path = '/v1/app-requests',
  headers = {}
} = {}) {
  const allHeaders = { ...headers };
  if (origin !== null) allHeaders.Origin = origin;
  if (contentType !== null) allHeaders['Content-Type'] = contentType;
  if (ip !== null) allHeaders['CF-Connecting-IP'] = ip;
  const options = { method, headers: allHeaders };
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    options.body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  }
  return new Request(`https://worker.example${path}`, options);
}

const dependencies = {
  verifyTurnstileToken: async () => ({ ok: true }),
  upsertAppRequest: async (_database, data) => ({ request_key: data.requestKey })
};

async function responseJson(response) {
  return { response, body: await response.json() };
}

test('valid request returns the stable success contract without count', async () => {
  const { response, body } = await responseJson(await handleRequest(request(), baseEnv(), null, dependencies));
  assert.equal(response.status, 200);
  assert.deepEqual(body, { ok: true, requestKey: 'ios:123456789' });
  assert.equal(Object.hasOwn(body, 'count'), false);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), allowedOrigin);
  assert.equal(response.headers.get('Vary'), 'Origin');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('unknown route and unsupported method use minimal errors', async () => {
  assert.equal((await handleRequest(request({ path: '/v1/admin/requests' }), baseEnv(), null, dependencies)).status, 404);
  const methodResponse = await handleRequest(request({ method: 'GET' }), baseEnv(), null, dependencies);
  assert.equal(methodResponse.status, 405);
  assert.equal(methodResponse.headers.get('Allow'), 'POST, OPTIONS');
});

test('Origin checks reject evil, lookalike, and missing values', async () => {
  for (const origin of ['https://evil.example', 'https://soundcruise.jp.evil.example', null]) {
    const { response, body } = await responseJson(await handleRequest(request({ origin }), baseEnv(), null, dependencies));
    assert.equal(response.status, 403);
    assert.equal(body.code, 'invalid_origin');
    assert.equal(response.headers.has('Access-Control-Allow-Origin'), false);
    assert.equal(response.headers.get('Vary'), 'Origin');
  }
});

test('production configuration does not permit localhost', async () => {
  const response = await handleRequest(request({ origin: 'http://127.0.0.1:4173' }), baseEnv(), null, dependencies);
  assert.equal(response.status, 403);
});

test('OPTIONS allows only the exact production Origin and minimal headers', async () => {
  const preflight = request({
    method: 'OPTIONS',
    contentType: null,
    headers: {
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type'
    }
  });
  const response = await handleRequest(preflight, baseEnv(), null, dependencies);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), allowedOrigin);
  assert.equal(response.headers.get('Access-Control-Allow-Methods'), 'POST, OPTIONS');
  assert.equal(response.headers.get('Access-Control-Allow-Headers'), 'Content-Type');
  assert.equal(response.headers.get('Vary'), 'Origin');
  assert.equal(response.headers.has('Access-Control-Allow-Credentials'), false);

  const evil = request({
    method: 'OPTIONS',
    origin: 'https://evil.example',
    contentType: null,
    headers: { 'Access-Control-Request-Method': 'POST' }
  });
  assert.equal((await handleRequest(evil, baseEnv(), null, dependencies)).status, 403);
});

test('OPTIONS rejects unexpected method and headers', async () => {
  for (const headers of [
    { 'Access-Control-Request-Method': 'DELETE', 'Access-Control-Request-Headers': 'content-type' },
    { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type, authorization' }
  ]) {
    const response = await handleRequest(request({ method: 'OPTIONS', contentType: null, headers }), baseEnv(), null, dependencies);
    assert.equal(response.status, 403);
  }
});

test('invalid content type, oversized body, and invalid JSON have distinct contracts', async () => {
  let result = await responseJson(await handleRequest(request({ contentType: 'text/plain' }), baseEnv(), null, dependencies));
  assert.equal(result.response.status, 415);
  assert.equal(result.body.code, 'invalid_content_type');

  result = await responseJson(await handleRequest(request({ payload: 'x'.repeat(2049) }), baseEnv(), null, dependencies));
  assert.equal(result.response.status, 413);
  assert.equal(result.body.code, 'payload_too_large');

  result = await responseJson(await handleRequest(request({ payload: '{' }), baseEnv(), null, dependencies));
  assert.equal(result.response.status, 400);
  assert.equal(result.body.code, 'invalid_json');
});

test('payload errors do not reach Turnstile or D1', async () => {
  let verified = false;
  let stored = false;
  const response = await handleRequest(
    request({ payload: { ...validPayload, requestKey: 'ios:123456789' } }),
    baseEnv(),
    null,
    {
      verifyTurnstileToken: async () => { verified = true; return { ok: true }; },
      upsertAppRequest: async () => { stored = true; return {}; }
    }
  );
  assert.equal(response.status, 400);
  assert.equal(verified, false);
  assert.equal(stored, false);
});

test('missing, invalid, and unavailable Turnstile validation fail closed', async () => {
  let result = await responseJson(await handleRequest(
    request({ payload: { ...validPayload, turnstileToken: '' } }),
    baseEnv(),
    null,
    dependencies
  ));
  assert.equal(result.response.status, 400);
  assert.equal(result.body.code, 'turnstile_failed');

  result = await responseJson(await handleRequest(request(), baseEnv(), null, {
    ...dependencies,
    verifyTurnstileToken: async () => ({ ok: false })
  }));
  assert.equal(result.response.status, 403);
  assert.equal(result.body.code, 'turnstile_failed');

  result = await responseJson(await handleRequest(request(), baseEnv(), null, {
    ...dependencies,
    verifyTurnstileToken: async () => ({ ok: false, unavailable: true })
  }));
  assert.equal(result.response.status, 503);
  assert.equal(result.body.code, 'turnstile_failed');
});

test('gross IP limiter runs before body parsing and Turnstile', async () => {
  let verified = false;
  const response = await handleRequest(
    request({ payload: '{' }),
    baseEnv({ IP_RATE_LIMITER: { limit: async () => ({ success: false }) } }),
    null,
    { ...dependencies, verifyTurnstileToken: async () => { verified = true; return { ok: true }; } }
  );
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('Retry-After'), '60');
  assert.equal(verified, false);
});

test('IP plus request key limiter runs after Store parsing and before Turnstile', async () => {
  let rateKey;
  let verified = false;
  const response = await handleRequest(
    request(),
    baseEnv({
      IP_REQUEST_RATE_LIMITER: {
        limit: async ({ key }) => {
          rateKey = key;
          return { success: false };
        }
      }
    }),
    null,
    { ...dependencies, verifyTurnstileToken: async () => { verified = true; return { ok: true }; } }
  );
  assert.equal(response.status, 429);
  assert.equal(rateKey, 'ip-request:192.0.2.1:ios:123456789');
  assert.equal(verified, false);
});

test('rate limiting separates different request keys and IPs', async () => {
  const counts = new Map();
  const perKeyLimiter = {
    async limit({ key }) {
      const count = (counts.get(key) || 0) + 1;
      counts.set(key, count);
      return { success: count <= 3 };
    }
  };
  const env = baseEnv({ IP_REQUEST_RATE_LIMITER: perKeyLimiter });

  for (let index = 0; index < 3; index += 1) {
    assert.equal((await handleRequest(request(), env, null, dependencies)).status, 200);
  }
  assert.equal((await handleRequest(request(), env, null, dependencies)).status, 429);
  assert.equal((await handleRequest(request({
    payload: { ...validPayload, storeUrl: 'https://apps.apple.com/app/id987654321' }
  }), env, null, dependencies)).status, 200);
  assert.equal((await handleRequest(request({ ip: '192.0.2.2' }), env, null, dependencies)).status, 200);
});

test('limiter failure and D1 failure fail closed without internal details', async () => {
  let result = await responseJson(await handleRequest(
    request(),
    baseEnv({ IP_RATE_LIMITER: { limit: async () => { throw new Error('internal limiter detail'); } } }),
    null,
    dependencies
  ));
  assert.equal(result.response.status, 429);
  assert.deepEqual(result.body, { ok: false, code: 'rate_limited' });

  result = await responseJson(await handleRequest(request(), baseEnv(), null, {
    ...dependencies,
    upsertAppRequest: async () => { throw new Error('SQL and secret detail'); }
  }));
  assert.equal(result.response.status, 503);
  assert.deepEqual(result.body, { ok: false, code: 'server_error' });
});
