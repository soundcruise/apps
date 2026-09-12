import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createIdentityMaterial, hmacVerifier, parseDeviceCredential, timingSafeHexEqual,
  RECOVERY_ALPHABET, RECOVERY_CODE_LENGTH, createRecoveryClaim, createRecoveryCode,
  formatRecoveryCode, normalizeRecoveryCode, recoveryClaimVerifier, recoveryCodeVerifier,
  createDeleteIntent, deleteIntentVerifier
} from '../src/crypto.js';

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

test('Recovery Code has an explicit Crockford alphabet and exactly 100 bits of secure entropy', async () => {
  assert.equal(RECOVERY_ALPHABET, '0123456789ABCDEFGHJKMNPQRSTVWXYZ');
  assert.equal(RECOVERY_ALPHABET.length, 32);
  assert.equal(RECOVERY_CODE_LENGTH * Math.log2(RECOVERY_ALPHABET.length), 100);
  let calls = 0;
  const deterministic = {
    getRandomValues(bytes) { calls += 1; for (let index = 0; index < bytes.length; index += 1) bytes[index] = index; return bytes; }
  };
  const code = createRecoveryCode(deterministic);
  assert.equal(calls, 1);
  assert.equal(code.length, 20);
  assert.equal(code, '0123456789ABCDEFGHJK');
  assert.equal(formatRecoveryCode(code), '0123-4567-89AB-CDEF-GHJK');
  assert.equal(normalizeRecoveryCode('0123 4567-89ab-cdef-ghjk'), code);
  for (const ambiguous of ['I', 'L', 'O', 'U']) assert.equal(RECOVERY_ALPHABET.includes(ambiguous), false);
  assert.equal(normalizeRecoveryCode('I'.repeat(20)), null);
  assert.throws(() => createRecoveryCode({}), /Secure random/);
  assert.match(await recoveryCodeVerifier(code, PEPPER), /^[0-9a-f]{64}$/);
});

test('Recovery claim is opaque, short-lived material with verifier-only server representation', async () => {
  const claim = await createRecoveryClaim(PEPPER);
  assert.match(claim.claimToken, /^scr1\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/);
  const parsed = await recoveryClaimVerifier(claim.claimToken, PEPPER);
  assert.equal(parsed.claimId, claim.claimId);
  assert.equal(parsed.claimVerifier, claim.claimVerifier);
  assert.equal(claim.claimVerifier.includes(claim.claimToken), false);
  await assert.rejects(recoveryClaimVerifier('bad', PEPPER), /Invalid recovery claim/);
});

test('account deletion intent is opaque, verifier-only, and rejects malformed material', async () => {
  const intent = await createDeleteIntent(PEPPER);
  assert.match(intent.intentToken, /^sdi1\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/);
  const parsed = await deleteIntentVerifier(intent.intentToken, PEPPER);
  assert.equal(parsed.intentId, intent.intentId);
  assert.equal(parsed.intentVerifier, intent.intentVerifier);
  assert.equal(intent.intentVerifier.includes(intent.intentToken), false);
  await assert.rejects(deleteIntentVerifier('bad', PEPPER), /Invalid delete intent/);
});
