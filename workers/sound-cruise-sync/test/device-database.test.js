import test from 'node:test';
import assert from 'node:assert/strict';
import { createD1DeviceRepository } from '../src/device-database.js';
import { createD1CleanupRepository } from '../src/cleanup-database.js';
import { createSqliteD1, seedIdentity } from './sqlite-d1.js';

const USER_ID = '123e4567-e89b-42d3-a456-426614174001';
const DEVICE_A = '123e4567-e89b-42d3-a456-426614174000';
const DEVICE_B = '123e4567-e89b-42d3-a456-426614174002';
const OTHER_USER = '123e4567-e89b-42d3-a456-426614174003';
const OTHER_DEVICE = '123e4567-e89b-42d3-a456-426614174004';
const INTENT = '123e4567-e89b-42d3-a456-426614174005';

function activeIdentity(db) {
  seedIdentity(db, { userId: USER_ID, deviceId: DEVICE_A });
  db.raw.prepare("UPDATE sync_users SET state = 'active', recovery_version = 1, recovery_verifier = 'r' WHERE id = ?").run(USER_ID);
  db.raw.prepare(`INSERT INTO sync_devices (id,user_id,app_id,credential_version,credential_verifier,label,last_cursor,created_at,last_seen_at,revoked_at,pairing_pending_at,paired_at)
    VALUES (?, ?, 'chord', 1, 'b', 'Mac Safari', 0, 2, 2, NULL, NULL, 2)`).run(DEVICE_B, USER_ID);
  return { userId: USER_ID, deviceId: DEVICE_A, appId: 'chord' };
}

test('device list identifies only the caller current device and does not expose verifier material', async () => {
  const db = createSqliteD1();
  const identity = activeIdentity(db);
  const devices = await createD1DeviceRepository(db, () => 100).list(identity);
  assert.equal(devices.length, 2);
  assert.equal(devices.filter((device) => device.isCurrent).length, 1);
  assert.equal(devices.find((device) => device.deviceId === DEVICE_A).isCurrent, true);
  assert.equal(JSON.stringify(devices).includes('credential_verifier'), false);
  db.close();
});

test('revoke is idempotent, cancels issuer pairing, and rejects cross-user device identifiers', async () => {
  const db = createSqliteD1();
  const identity = activeIdentity(db);
  db.raw.prepare(`INSERT INTO pairing_codes (code_verifier,user_id,created_by_device_id,target_app_id,attempts_remaining,created_at,expires_at,consumed_at,cancelled_at)
    VALUES ('pair-b', ?, ?, 'chord', 5, 1, 999999, NULL, NULL)`).run(USER_ID, DEVICE_B);
  db.raw.prepare("INSERT INTO sync_users (id,state,recovery_version,recovery_verifier,created_at,updated_at) VALUES (?, 'active', 1, 'other', 1, 1)").run(OTHER_USER);
  db.raw.prepare(`INSERT INTO sync_devices (id,user_id,app_id,credential_version,credential_verifier,label,last_cursor,created_at,last_seen_at,revoked_at)
    VALUES (?, ?, 'chord', 1, 'other-device', NULL, 0, 1, 1, NULL)`).run(OTHER_DEVICE, OTHER_USER);
  const repository = createD1DeviceRepository(db, () => 100);
  assert.deepEqual(await repository.revoke(identity, DEVICE_B), { status: 'revoked', deviceId: DEVICE_B, isCurrent: false, pairingCancelled: true });
  assert.equal(db.raw.prepare('SELECT revoked_at FROM sync_devices WHERE id = ?').get(DEVICE_B).revoked_at, 100);
  assert.equal(db.raw.prepare("SELECT cancelled_at FROM pairing_codes WHERE code_verifier = 'pair-b'").get().cancelled_at, 100);
  assert.equal((await repository.revoke(identity, OTHER_DEVICE)).status, 'not_found');
  assert.equal(db.raw.prepare('SELECT revoked_at FROM sync_devices WHERE id = ?').get(OTHER_DEVICE).revoked_at, null);
  assert.equal((await repository.revoke(identity, DEVICE_B)).status, 'revoked');
  db.close();
});

test('account deletion is a one-time intent, revokes every device, and retains the dataset until purge', async () => {
  const db = createSqliteD1();
  const identity = activeIdentity(db);
  const repository = createD1DeviceRepository(db, () => 100);
  const issued = await repository.createDeleteIntent(identity, { intentId: INTENT, intentVerifier: 'intent-verifier', now: 100 });
  assert.deepEqual(issued, { status: 'issued', expiresAt: 100 + repository.DELETE_INTENT_TTL_MS });
  const deleted = await repository.deleteAccount(identity, { intentId: INTENT, intentVerifier: 'intent-verifier', now: 200 });
  assert.equal(deleted.status, 'deleted');
  assert.equal(db.raw.prepare('SELECT state FROM sync_users WHERE id = ?').get(USER_ID).state, 'deleting');
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM sync_devices WHERE user_id = ? AND revoked_at IS NULL').get(USER_ID).count, 0);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM sync_datasets WHERE user_id = ?').get(USER_ID).count, 1, 'logical deletion keeps data through grace');
  assert.equal((await repository.deleteAccount(identity, { intentId: INTENT, intentVerifier: 'intent-verifier', now: 201 })).status, 'deleted');
  assert.equal((await repository.resolveDeletedIntent({ intentId: INTENT, intentVerifier: 'intent-verifier', appId: 'chord' })).status, 'deleted');
  db.close();
});

test('an expired delete intent leaves the account and every active device unchanged', async () => {
  const db = createSqliteD1();
  const identity = activeIdentity(db);
  const repository = createD1DeviceRepository(db, () => 100);
  await repository.createDeleteIntent(identity, { intentId: INTENT, intentVerifier: 'intent-verifier', now: 100 });
  const result = await repository.deleteAccount(identity, {
    intentId: INTENT,
    intentVerifier: 'intent-verifier',
    now: 100 + repository.DELETE_INTENT_TTL_MS
  });
  assert.equal(result.status, 'expired');
  assert.equal(db.raw.prepare('SELECT state FROM sync_users WHERE id = ?').get(USER_ID).state, 'active');
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM sync_devices WHERE user_id = ? AND revoked_at IS NULL').get(USER_ID).count, 2);
  db.close();
});

test('cleanup is bounded and advances a dataset watermark before deleting old change rows', async () => {
  const db = createSqliteD1();
  const identity = activeIdentity(db);
  db.raw.prepare("UPDATE sync_datasets SET state = 'ready', min_change_seq = 0 WHERE user_id = ? AND app_id = 'chord'").run(identity.userId);
  db.raw.prepare(`INSERT INTO sync_changes (user_id,app_id,record_type,record_id,revision,operation_id,operation_hash,payload_json,payload_hash,deleted_at,changed_at,schema_version)
    VALUES (?, 'chord', 'chord', 'old', 1, 'op-old', 'h', '{}', 'h', NULL, 1, 1)`).run(identity.userId);
  db.raw.prepare(`INSERT INTO sync_changes (user_id,app_id,record_type,record_id,revision,operation_id,operation_hash,payload_json,payload_hash,deleted_at,changed_at,schema_version)
    VALUES (?, 'chord', 'chord', 'new', 1, 'op-new', 'h', '{}', 'h', NULL, 9999999999999, 1)`).run(identity.userId);
  const result = await createD1CleanupRepository(db, () => 100 * 24 * 60 * 60 * 1000).cleanup();
  assert.equal(result.changes, 1);
  assert.equal(db.raw.prepare("SELECT COUNT(*) AS count FROM sync_changes WHERE operation_id = 'op-old'").get().count, 0);
  assert.equal(db.raw.prepare('SELECT min_change_seq FROM sync_datasets WHERE user_id = ? AND app_id = ?').get(identity.userId, 'chord').min_change_seq, 1);
  assert.equal(db.raw.prepare("SELECT COUNT(*) AS count FROM sync_changes WHERE operation_id = 'op-new'").get().count, 1);
  db.close();
});
