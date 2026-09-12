import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticateDevice } from '../src/auth.js';
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
