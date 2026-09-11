import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentityMaterial, hmacVerifier, parseDeviceCredential, timingSafeHexEqual } from '../src/crypto.js';

const PEPPER = 'p'.repeat(64);

test('device credential uses an opaque UUID selector and 256-bit secret', async () => {
  const material = await createIdentityMaterial(PEPPER);
  const parsed = parseDeviceCredential(material.credential);
  assert(parsed);
  assert.equal(parsed.deviceId, material.deviceId);
  assert.equal(parsed.secret.length, 43);
  assert.match(material.credentialVerifier, /^[0-9a-f]{64}$/);
  assert.equal(material.credential.includes(material.userId), false);
});

test('only a keyed verifier is stable and different credentials do not collide', async () => {
  const first = await createIdentityMaterial(PEPPER);
  const second = await createIdentityMaterial(PEPPER);
  assert.notEqual(first.credential, second.credential);
  assert.notEqual(first.credentialVerifier, second.credentialVerifier);
  assert.equal(await hmacVerifier(first.credential, PEPPER), first.credentialVerifier);
  assert.equal(first.credentialVerifier.includes(first.credential.split('.')[2]), false);
});

test('credential parsing and constant-time comparison reject malformed values', () => {
  assert.equal(parseDeviceCredential('scd1.bad.secret'), null);
  assert.equal(parseDeviceCredential('scd2.123e4567-e89b-42d3-a456-426614174000.' + 'A'.repeat(43)), null);
  assert.equal(timingSafeHexEqual('abcd', 'abcd'), true);
  assert.equal(timingSafeHexEqual('abcd', 'abce'), false);
  assert.equal(timingSafeHexEqual('abcd', 'abc'), false);
});

test('short or missing pepper fails closed', async () => {
  await assert.rejects(createIdentityMaterial('short'), /pepper/i);
});
