import assert from 'node:assert/strict';
import test from 'node:test';

import { verifyTurnstileToken } from '../src/turnstile.js';

const env = {
  TURNSTILE_SECRET_KEY: 'test-secret',
  TURNSTILE_EXPECTED_HOSTNAME: 'soundcruise.jp',
  TURNSTILE_EXPECTED_ACTION: 'app_request'
};

function jsonFetch(body, status = 200) {
  return async () => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

test('valid Turnstile verification accepts matching hostname and action', async () => {
  let sentBody;
  const result = await verifyTurnstileToken('client-token', env, {
    fetchImpl: async (_url, options) => {
      sentBody = JSON.parse(options.body);
      return Response.json({ success: true, hostname: 'soundcruise.jp', action: 'app_request' });
    }
  });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(Object.keys(sentBody).sort(), ['response', 'secret']);
  assert.equal(sentBody.response, 'client-token');
  assert.equal(Object.hasOwn(sentBody, 'remoteip'), false);
});

test('invalid, reused, hostname-mismatched, and action-mismatched tokens fail closed', async () => {
  assert.deepEqual(await verifyTurnstileToken('token', env, {
    fetchImpl: jsonFetch({ success: false, 'error-codes': ['timeout-or-duplicate'] })
  }), { ok: false });
  assert.deepEqual(await verifyTurnstileToken('token', env, {
    fetchImpl: jsonFetch({ success: true, hostname: 'evil.example', action: 'app_request' })
  }), { ok: false });
  assert.deepEqual(await verifyTurnstileToken('token', env, {
    fetchImpl: jsonFetch({ success: true, hostname: 'soundcruise.jp', action: 'wrong' })
  }), { ok: false });
});

test('missing secret, server failure, malformed response, and timeout are unavailable', async () => {
  assert.deepEqual(await verifyTurnstileToken('token', {}, { fetchImpl: jsonFetch({ success: true }) }), {
    ok: false,
    unavailable: true
  });
  assert.deepEqual(await verifyTurnstileToken('token', env, { fetchImpl: jsonFetch({}, 500) }), {
    ok: false,
    unavailable: true
  });
  assert.deepEqual(await verifyTurnstileToken('token', env, {
    fetchImpl: async () => new Response('not-json')
  }), { ok: false, unavailable: true });

  const timeoutResult = await verifyTurnstileToken('token', env, {
    timeoutMs: 5,
    fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })
  });
  assert.deepEqual(timeoutResult, { ok: false, unavailable: true });
});
