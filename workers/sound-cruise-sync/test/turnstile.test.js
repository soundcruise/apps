import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyTurnstileToken } from '../src/turnstile.js';

const env = {
  TURNSTILE_SECRET_KEY: 'secret',
  TURNSTILE_EXPECTED_HOSTNAME: 'soundcruise.jp',
  TURNSTILE_EXPECTED_ACTION: 'sound_cruise_sync_start'
};

test('matching Turnstile result succeeds without exposing the token', async () => {
  let sent;
  const result = await verifyTurnstileToken('private-token', env, {
    fetchImpl: async (_url, options) => {
      sent = JSON.parse(options.body);
      return { ok: true, json: async () => ({ success: true, hostname: 'soundcruise.jp', action: 'sound_cruise_sync_start' }) };
    }
  });
  assert.deepEqual(result, { ok: true });
  assert.equal(sent.response, 'private-token');
});

test('missing secret, mismatch, malformed response, server failure, and timeout fail closed', async () => {
  assert.deepEqual(await verifyTurnstileToken('token', {}), { ok: false, unavailable: true });
  assert.deepEqual(await verifyTurnstileToken('token', env, {
    fetchImpl: async () => ({ ok: true, json: async () => ({ success: true, hostname: 'evil.example', action: 'sound_cruise_sync_start' }) })
  }), { ok: false });
  assert.deepEqual(await verifyTurnstileToken('token', env, {
    fetchImpl: async () => ({ ok: true, json: async () => { throw new Error('bad json'); } })
  }), { ok: false, unavailable: true });
  assert.deepEqual(await verifyTurnstileToken('token', env, {
    fetchImpl: async () => ({ ok: false, status: 500 })
  }), { ok: false, unavailable: true });
  assert.deepEqual(await verifyTurnstileToken('token', env, {
    timeoutMs: 5,
    fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('aborted')));
    })
  }), { ok: false, unavailable: true });
});
