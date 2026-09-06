import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isJsonContentType,
  MAX_BODY_BYTES,
  readBodyWithLimit,
  validatePayload
} from '../src/validation.js';

const basePayload = {
  platform: 'ios',
  storeUrl: 'https://apps.apple.com/jp/app/example/id123456789',
  appName: 'Example App',
  requestSourceVersion: '0.9.0',
  turnstileToken: 'token'
};

test('valid iOS and Android payloads are normalized', () => {
  const ios = validatePayload(basePayload);
  assert.equal(ios.ok, true);
  assert.equal(ios.value.requestKey, 'ios:123456789');
  assert.equal(ios.value.appName, 'Example App');

  const android = validatePayload({
    ...basePayload,
    platform: 'android',
    storeUrl: 'https://play.google.com/store/apps/details?id=com.example.app&hl=ja'
  });
  assert.equal(android.ok, true);
  assert.equal(android.value.requestKey, 'android:com.example.app');
});

test('payload accepts omitted optional text and converts blank appName to null', () => {
  const payload = { ...basePayload, appName: '   ' };
  delete payload.requestSourceVersion;
  const result = validatePayload(payload);
  assert.equal(result.ok, true);
  assert.equal(result.value.appName, null);
  assert.equal(result.value.requestSourceVersion, null);
});

test('payload rejects arrays, null, unknown fields, and client-generated identity fields', () => {
  assert.equal(validatePayload(null).ok, false);
  assert.equal(validatePayload([]).ok, false);
  assert.equal(validatePayload({ ...basePayload, extra: true }).ok, false);
  assert.equal(validatePayload({ ...basePayload, requestKey: 'ios:1' }).ok, false);
  assert.equal(validatePayload({ ...basePayload, storeId: '123456789' }).ok, false);
  assert.equal(validatePayload({ ...basePayload, packageName: 'com.example.app' }).ok, false);
  assert.equal(validatePayload(JSON.parse(`{"platform":"ios","storeUrl":"https://apps.apple.com/app/id123456789","turnstileToken":"token","__proto__":{}}`)).ok, false);
});

test('payload rejects wrong platform and platform/URL mismatch', () => {
  assert.equal(validatePayload({ ...basePayload, platform: 'web' }).ok, false);
  assert.equal(validatePayload({ ...basePayload, platform: 'android' }).ok, false);
});

test('appName enforces 80 code points, control exclusion, and NFC', () => {
  assert.equal(validatePayload({ ...basePayload, appName: 'a'.repeat(80) }).ok, true);
  assert.equal(validatePayload({ ...basePayload, appName: 'a'.repeat(81) }).ok, false);
  assert.equal(validatePayload({ ...basePayload, appName: 'bad\nname' }).ok, false);
  assert.equal(validatePayload({ ...basePayload, appName: 'bad\u0085name' }).ok, false);
  assert.equal(validatePayload({ ...basePayload, appName: '\ud800' }).ok, false);

  const normalized = validatePayload({ ...basePayload, appName: ' Cafe\u0301 ' });
  assert.equal(normalized.ok, true);
  assert.equal(normalized.value.appName, 'Café');
});

test('requestSourceVersion is optional, bounded, and semver-shaped', () => {
  assert.equal(validatePayload({ ...basePayload, requestSourceVersion: '1.2.3-beta.1' }).ok, true);
  assert.equal(validatePayload({ ...basePayload, requestSourceVersion: 'dev' }).ok, false);
  assert.equal(validatePayload({ ...basePayload, requestSourceVersion: '1.2.3\n' }).ok, false);
  assert.equal(validatePayload({ ...basePayload, requestSourceVersion: `1.2.3-${'a'.repeat(30)}` }).ok, false);
  assert.equal(validatePayload({ ...basePayload, requestSourceVersion: 9 }).ok, false);
});

test('Turnstile token is required and bounded', () => {
  assert.equal(validatePayload({ ...basePayload, turnstileToken: '' }).reason, 'turnstile');
  assert.equal(validatePayload({ ...basePayload, turnstileToken: 'x'.repeat(2049) }).reason, 'turnstile');
  assert.equal(validatePayload({ ...basePayload, turnstileToken: 'bad\rtoken' }).reason, 'turnstile');
});

test('dangerous and malformed Store URL schemes are rejected', () => {
  for (const storeUrl of [
    'javascript:alert(1)',
    'data:text/html,test',
    'file:///tmp/app',
    'https://apps.apple.com/app/%69%64123456789',
    'https://play.google.com/store/apps/details?id=com.example.%0Dapp'
  ]) {
    assert.equal(validatePayload({ ...basePayload, storeUrl }).ok, false, storeUrl);
  }
});

test('JSON content type permits only application/json with optional UTF-8 charset', () => {
  assert.equal(isJsonContentType('application/json'), true);
  assert.equal(isJsonContentType('application/json; charset=utf-8'), true);
  assert.equal(isJsonContentType('Application/JSON; Charset=UTF-8'), true);
  assert.equal(isJsonContentType('text/plain'), false);
  assert.equal(isJsonContentType('application/json; charset=shift_jis'), false);
  assert.equal(isJsonContentType('application/json; boundary=x'), false);
  assert.equal(isJsonContentType(null), false);
});

test('body reader enforces Content-Length and actual byte size', async () => {
  const exact = new Request('https://example.test', {
    method: 'POST',
    body: 'x'.repeat(MAX_BODY_BYTES)
  });
  assert.equal((await readBodyWithLimit(exact)).ok, true);

  const oversized = new Request('https://example.test', {
    method: 'POST',
    body: 'x'.repeat(MAX_BODY_BYTES + 1)
  });
  assert.deepEqual(await readBodyWithLimit(oversized), { ok: false, tooLarge: true });

  const declaredOversized = new Request('https://example.test', {
    method: 'POST',
    headers: { 'Content-Length': String(MAX_BODY_BYTES + 1) },
    body: '{}'
  });
  assert.deepEqual(await readBodyWithLimit(declaredOversized), { ok: false, tooLarge: true });
});

test('body reader rejects malformed UTF-8', async () => {
  const request = new Request('https://example.test', {
    method: 'POST',
    body: new Uint8Array([0xff])
  });
  assert.deepEqual(await readBodyWithLimit(request), { ok: false, readFailed: true });
});
