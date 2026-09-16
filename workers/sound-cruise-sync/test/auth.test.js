import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticateDevice, isRetiredLegacyDeviceCredential } from '../src/auth.js';
import { hmacVerifier } from '../src/crypto.js';
import { createSqliteD1, seedIdentity } from './sqlite-d1.js';

const PEPPER = 'p'.repeat(64);
const DEVICE_ID = '123e4567-e89b-42d3-a456-426614174000';
const CREDENTIAL = `scd1.${DEVICE_ID}.${'A'.repeat(43)}`;

test('device credential resolves only its server-side user and app identity', async () => {
  const db = createSqliteD1();
  const verifier = await hmacVerifier(CREDENTIAL, PEPPER);
  const seeded = seedIdentity(db, { deviceId: DEVICE_ID, verifier });
  const identity = await authenticateDevice(db, `Bearer ${CREDENTIAL}`, 'chord', PEPPER);
  assert.deepEqual(identity, seeded);
  assert.equal(await authenticateDevice(db, `Bearer ${CREDENTIAL}`, 'pitch', PEPPER), null, 'cross-app credential use is rejected');
  assert.equal(await authenticateDevice(db, `Bearer scd1.${DEVICE_ID}.${'B'.repeat(43)}`, 'chord', PEPPER), null);
  assert.equal(await authenticateDevice(db, 'Bearer malformed', 'chord', PEPPER), null);
  db.close();
});

test('revoked or deleted identities cannot read or write through device auth', async () => {
  const db = createSqliteD1();
  const verifier = await hmacVerifier(CREDENTIAL, PEPPER);
  seedIdentity(db, { deviceId: DEVICE_ID, verifier });
  db.raw.prepare('UPDATE sync_devices SET revoked_at = 1 WHERE id = ?').run(DEVICE_ID);
  assert.equal(await authenticateDevice(db, `Bearer ${CREDENTIAL}`, 'chord', PEPPER), null);
  db.raw.prepare('UPDATE sync_devices SET revoked_at = NULL WHERE id = ?').run(DEVICE_ID);
  db.raw.prepare(`
    UPDATE sync_users SET state = 'deleted', recovery_version = 1, recovery_verifier = 'retired'
  `).run();
  assert.equal(await authenticateDevice(db, `Bearer ${CREDENTIAL}`, 'chord', PEPPER), null);
  db.close();
});

test('only an exact retired Legacy credential is eligible for identity replacement', async () => {
  const db = createSqliteD1();
  const verifier = await hmacVerifier(CREDENTIAL, PEPPER);
  const seeded = seedIdentity(db, { deviceId: DEVICE_ID, verifier });
  const authorization = `Bearer ${CREDENTIAL}`;

  assert.equal(await isRetiredLegacyDeviceCredential(db, authorization, 'chord', PEPPER), false,
    'an active Legacy credential is never replaceable');
  db.raw.prepare('UPDATE sync_devices SET revoked_at = 1 WHERE id = ?').run(DEVICE_ID);
  assert.equal(await isRetiredLegacyDeviceCredential(db, authorization, 'chord', PEPPER), true,
    'the server can confirm an exact revoked Legacy device');
  assert.equal(await isRetiredLegacyDeviceCredential(
    db, `Bearer scd1.${DEVICE_ID}.${'B'.repeat(43)}`, 'chord', PEPPER
  ), false, 'a wrong verifier is unknown, not retired');
  assert.equal(await isRetiredLegacyDeviceCredential(
    db, `Bearer scd1.${crypto.randomUUID()}.${'B'.repeat(43)}`, 'chord', PEPPER
  ), false, 'an unknown device is not retired');
  assert.equal(await isRetiredLegacyDeviceCredential(db, authorization, 'pitch', PEPPER), false,
    'a cross-app credential is not retired for Chord replacement');

  const accountId = crypto.randomUUID();
  const membershipId = crypto.randomUUID();
  db.raw.prepare(`
    INSERT INTO sync_accounts (
      id, state, recovery_version, recovery_verifier, generation,
      created_at, updated_at, recovery_created_at, recovery_rotated_at,
      admission_provenance
    ) VALUES (?, 'active', 1, ?, 1, 1, 1, 1, 1, 'production')
  `).run(accountId, 'e'.repeat(64));
  db.raw.prepare(`
    INSERT INTO sync_account_memberships (
      id, account_id, app_id, state, sync_user_id, recovery_mode,
      generation, created_at, updated_at, activated_at
    ) VALUES (?, ?, 'chord', 'active', ?, 'account', 1, 1, 1, 1)
  `).run(membershipId, accountId, seeded.userId);
  db.raw.prepare(`
    INSERT INTO sync_account_managed_users (
      sync_user_id, account_id, membership_id, app_id, created_at
    ) VALUES (?, ?, ?, 'chord', 1)
  `).run(seeded.userId, accountId, membershipId);
  assert.equal(await isRetiredLegacyDeviceCredential(db, authorization, 'chord', PEPPER), false,
    'a revoked Account-managed or cross-account identity is never classified as retired Legacy');
  db.close();
});
