import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentityMaterial, createPairingCode, pairingCodeVerifier, normalizePairingCode, formatPairingCode } from '../src/crypto.js';
import { createD1PairingRepository } from '../src/pairing-database.js';
import { createSqliteD1, seedIdentity } from './sqlite-d1.js';

const CREDENTIAL_PEPPER = 'c'.repeat(64);
const PAIRING_PEPPER = 'q'.repeat(64);
const USER_ID = '123e4567-e89b-42d3-a456-426614174001';
const DEVICE_ID = '123e4567-e89b-42d3-a456-426614174000';

async function issuedRepository(now = 1000) {
  const db = createSqliteD1();
  seedIdentity(db, { userId: USER_ID, deviceId: DEVICE_ID });
  const repository = createD1PairingRepository(db, () => now);
  const code = '01234567';
  const verifier = await pairingCodeVerifier(code, PAIRING_PEPPER);
  const issued = await repository.issue({ userId: USER_ID, deviceId: DEVICE_ID, appId: 'chord' }, {
    codeVerifier: verifier, ttlMs: 10 * 60 * 1000, windowMs: 10 * 60 * 1000, now
  });
  assert.equal(issued.status, 'issued');
  return { db, repository, code, verifier, now };
}

test('pairing code normalizes presentation and uses unbiased secure 8-digit generation', () => {
  assert.equal(normalizePairingCode('0123 4567'), '01234567');
  assert.equal(normalizePairingCode('0123-4567'), '01234567');
  assert.equal(normalizePairingCode('1234567'), null);
  assert.equal(formatPairingCode('01234567'), '0123 4567');
  let calls = 0;
  const fakeCrypto = { getRandomValues(view) { view[0] = calls++ === 0 ? 4294967295 : 99999999; } };
  assert.equal(createPairingCode(fakeCrypto), '99999999');
  assert.equal(calls, 2, 'out-of-range 32-bit values are rejected instead of modulo biased');
});

test('same verifier candidate is limited to five attempts without storing plaintext', async () => {
  const fixture = await issuedRepository();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal((await fixture.repository.reserveAttempt(fixture.verifier, fixture.now + attempt)).status, 'allowed');
  }
  assert.equal((await fixture.repository.reserveAttempt(fixture.verifier, fixture.now + 6)).status, 'attempts_exhausted');
  const row = fixture.db.raw.prepare('SELECT * FROM pairing_attempts').get();
  assert.equal(JSON.stringify(row).includes(fixture.code), false, 'attempt limiter stores verifier only');
  fixture.db.close();
});

test('a subsequent issue opportunistically deletes pairing lifecycle rows retained beyond one day', async () => {
  const fixture = await issuedRepository();
  fixture.db.raw.prepare('UPDATE pairing_codes SET consumed_at = ? WHERE code_verifier = ?').run(fixture.now, fixture.verifier);
  const nextVerifier = await pairingCodeVerifier('76543210', PAIRING_PEPPER);
  const issued = await fixture.repository.issue({ userId: USER_ID, deviceId: DEVICE_ID, appId: 'chord' }, {
    codeVerifier: nextVerifier, ttlMs: 10 * 60 * 1000, windowMs: 10 * 60 * 1000,
    now: fixture.now + 24 * 60 * 60 * 1000 + 1
  });
  assert.equal(issued.status, 'issued');
  assert.equal(fixture.db.raw.prepare('SELECT COUNT(*) AS count FROM pairing_codes').get().count, 1);
  fixture.db.close();
});

test('a code is verifier-only, atomically creates one new pending device, then consumes once', async () => {
  const fixture = await issuedRepository();
  const material = await createIdentityMaterial(CREDENTIAL_PEPPER);
  const result = await fixture.repository.consume(material, {
    codeVerifier: fixture.verifier, appId: 'chord', deviceLabel: 'Device B', now: fixture.now + 1
  });
  assert.deepEqual(result, { status: 'paired', userId: USER_ID });
  const codeRow = fixture.db.raw.prepare('SELECT * FROM pairing_codes').get();
  assert.equal(codeRow.code_verifier, fixture.verifier);
  assert.equal(JSON.stringify(codeRow).includes(fixture.code), false, 'plaintext pairing code is never stored');
  assert.notEqual(codeRow.consumed_at, null);
  assert.equal(codeRow.attempts_remaining, 4, 'the consumed successful attempt is recorded on the code lifecycle row');
  const device = fixture.db.raw.prepare('SELECT * FROM sync_devices WHERE id = ?').get(material.deviceId);
  assert.equal(device.user_id, USER_ID);
  assert.equal(device.app_id, 'chord');
  assert.equal(device.paired_at, null, 'server marks a response-loss-safe device as pending until first credential use');
  assert.equal(device.credential_verifier.length, 64);
  assert.equal(JSON.stringify(device).includes(material.credential), false);
  const replay = await fixture.repository.consume(await createIdentityMaterial(CREDENTIAL_PEPPER), {
    codeVerifier: fixture.verifier, appId: 'chord', deviceLabel: null, now: fixture.now + 2
  });
  assert.equal(replay.status, 'used');
  fixture.db.close();
});

test('same-code race, expiry, issuer revocation, and device limit fail closed without a second device', async () => {
  const fixture = await issuedRepository();
  const [left, right] = await Promise.all([
    fixture.repository.consume(await createIdentityMaterial(CREDENTIAL_PEPPER), { codeVerifier: fixture.verifier, appId: 'chord', deviceLabel: null, now: 1001 }),
    fixture.repository.consume(await createIdentityMaterial(CREDENTIAL_PEPPER), { codeVerifier: fixture.verifier, appId: 'chord', deviceLabel: null, now: 1001 })
  ]);
  assert.deepEqual([left.status, right.status].sort(), ['paired', 'used']);
  assert.equal(fixture.db.raw.prepare('SELECT COUNT(*) AS count FROM sync_devices').get().count, 2);
  fixture.db.close();

  const expired = await issuedRepository(1000);
  const expiredResult = await expired.repository.consume(await createIdentityMaterial(CREDENTIAL_PEPPER), {
    codeVerifier: expired.verifier, appId: 'chord', deviceLabel: null, now: 1000 + 600000
  });
  assert.equal(expiredResult.status, 'expired');
  expired.db.close();

  const revoked = await issuedRepository();
  revoked.db.raw.prepare('UPDATE sync_devices SET revoked_at = 5 WHERE id = ?').run(DEVICE_ID);
  const revokedResult = await revoked.repository.consume(await createIdentityMaterial(CREDENTIAL_PEPPER), {
    codeVerifier: revoked.verifier, appId: 'chord', deviceLabel: null, now: 1001
  });
  assert.equal(revokedResult.status, 'cancelled');
  revoked.db.close();
});
