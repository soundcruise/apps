import test from 'node:test';
import assert from 'node:assert/strict';
import { createD1RecoveryRepository } from '../src/recovery-database.js';
import { createSqliteD1 } from './sqlite-d1.js';

const USER = '123e4567-e89b-42d3-a456-426614174001';
const DEVICE_A = '123e4567-e89b-42d3-a456-426614174010';
const DEVICE_B = '123e4567-e89b-42d3-a456-426614174011';
const DEVICE_R = '123e4567-e89b-42d3-a456-426614174020';
const CURRENT = 'a'.repeat(64);
const NEXT = 'b'.repeat(64);

function fixture() {
  const db = createSqliteD1();
  db.raw.prepare(`
    INSERT INTO sync_users (
      id,state,recovery_version,recovery_verifier,created_at,updated_at,recovery_created_at,recovery_rotated_at
    ) VALUES (?, 'active', 1, ?, 1, 1, 1, 1)
  `).run(USER, CURRENT);
  for (const [id, verifier, pending] of [[DEVICE_A, '1'.repeat(64), null], [DEVICE_B, '2'.repeat(64), 500]]) {
    db.raw.prepare(`
      INSERT INTO sync_devices (
        id,user_id,app_id,credential_version,credential_verifier,label,last_cursor,
        created_at,last_seen_at,revoked_at,pairing_pending_at,paired_at
      ) VALUES (?, ?, 'chord', 1, ?, NULL, 0, 1, 1, NULL, ?, ?)
    `).run(id, USER, verifier, pending, pending == null ? 1 : null);
  }
  db.raw.prepare(`
    INSERT INTO sync_datasets (
      user_id,app_id,state,schema_version,record_count,manifest_hash,min_change_seq,initialized_at,updated_at,last_change_seq
    ) VALUES (?, 'chord', 'ready', 1, 6, ?, 0, 1, 9000, 0)
  `).run(USER, '0'.repeat(64));
  for (const [type, id] of [
    ['chord', 'c1'], ['chord', 'c2'], ['chord', 'c3'], ['folder', 'f1'],
    ['library_order', 'order'], ['settings', 'settings']
  ]) {
    db.raw.prepare(`
      INSERT INTO sync_records (
        user_id,app_id,record_type,record_id,payload_json,payload_hash,revision,
        updated_at,deleted_at,updated_by_device_id,last_operation_id
      ) VALUES (?, 'chord', ?, ?, ?, ?, 1, 9000, NULL, ?, ?)
    `).run(USER, type, id, JSON.stringify({ id, chordName: type === 'chord' ? 'private-' + id : undefined }),
      'a'.repeat(64), DEVICE_A, 'operation-' + id);
  }
  db.raw.prepare(`
    INSERT INTO pairing_codes (
      code_verifier,user_id,created_by_device_id,target_app_id,attempts_remaining,created_at,expires_at,consumed_at,cancelled_at
    ) VALUES (?, ?, ?, 'chord', 5, 1, 999999, NULL, NULL)
  `).run('3'.repeat(64), USER, DEVICE_A);
  return { db, repository: createD1RecoveryRepository(db, () => 1000) };
}

async function prepare(repository, overrides = {}) {
  return repository.prepare({
    currentRecoveryVerifier: CURRENT,
    claimId: '123e4567-e89b-42d3-a456-426614174030',
    claimVerifier: '4'.repeat(64),
    appId: 'chord',
    nextRecoveryVerifier: NEXT,
    nextDeviceId: DEVICE_R,
    nextCredentialVerifier: '5'.repeat(64),
    deviceLabel: 'Recovery iPhone',
    now: 1000,
    ...overrides
  });
}

test('candidate verifier attempts are bounded without storing Recovery Code plaintext', async () => {
  const { db, repository } = fixture();
  for (let index = 0; index < 5; index += 1) assert.equal((await repository.reserveAttempt('9'.repeat(64), 1000)).status, 'allowed');
  assert.equal((await repository.reserveAttempt('9'.repeat(64), 1000)).status, 'attempts_exhausted');
  const row = db.raw.prepare('SELECT * FROM recovery_attempts').get();
  assert.equal(row.recovery_verifier, '9'.repeat(64));
  assert.equal(row.attempts, 5);
  assert.equal(JSON.stringify(row).includes('0123-4567'), false);
  db.close();
});

test('recovery commit atomically rotates, revokes all devices and pairing, and creates only the recovery device', async () => {
  const { db, repository } = fixture();
  assert.equal((await repository.reserveAttempt(CURRENT, 1000)).status, 'allowed');
  const prepared = await prepare(repository);
  assert.deepEqual(prepared, {
    status: 'prepared', expiresAt: 601000,
    summary: { appId: 'chord', recordCount: 6, chordCount: 3, folderCount: 1, updatedAt: 9000, activeDeviceCount: 2 }
  });
  assert.equal(JSON.stringify(prepared).includes('private-c'), false, 'summary never includes Chord payload or name');
  assert.equal(db.raw.prepare('SELECT recovery_version FROM sync_users WHERE id = ?').get(USER).recovery_version, 1,
    'prepare alone never rotates Recovery credentials');
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM sync_devices WHERE user_id = ? AND revoked_at IS NULL').get(USER).count, 2,
    'prepare alone never revokes devices');
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM recovery_attempts').get().count, 0, 'valid candidate attempt is cleared');
  const claim = db.raw.prepare('SELECT * FROM recovery_claims').get();
  assert.equal(claim.claim_verifier, '4'.repeat(64));
  assert.equal(claim.next_recovery_verifier, NEXT);
  assert.equal(JSON.stringify(claim).includes('recovery-code-plaintext'), false);

  const committed = await repository.commit({
    claimId: claim.claim_id, claimVerifier: claim.claim_verifier, appId: 'chord', now: 1100
  });
  assert.deepEqual(committed, { status: 'recovered', userId: USER, deviceId: DEVICE_R, recoveryVersion: 2 });
  const user = db.raw.prepare('SELECT * FROM sync_users WHERE id = ?').get(USER);
  assert.equal(user.recovery_version, 2);
  assert.equal(user.recovery_verifier, NEXT);
  assert.equal(user.recovery_rotated_at, 1100);
  const oldDevices = db.raw.prepare('SELECT * FROM sync_devices WHERE id IN (?, ?) ORDER BY id').all(DEVICE_A, DEVICE_B);
  assert(oldDevices.every((device) => device.revoked_at === 1100), 'active and pending devices are revoked');
  const active = db.raw.prepare('SELECT * FROM sync_devices WHERE user_id = ? AND revoked_at IS NULL').all(USER);
  assert.deepEqual(active.map((device) => device.id), [DEVICE_R]);
  assert.equal(active[0].paired_at, 1100);
  assert.equal(db.raw.prepare('SELECT cancelled_at FROM pairing_codes').get().cancelled_at, 1100);
  assert.equal(db.raw.prepare('SELECT committed_at FROM recovery_claims WHERE claim_id = ?').get(claim.claim_id).committed_at, 1100);
  assert.deepEqual(await repository.commit({ claimId: claim.claim_id, claimVerifier: claim.claim_verifier, appId: 'chord', now: 1200 }), {
    status: 'recovered', userId: USER, deviceId: DEVICE_R, recoveryVersion: 2, alreadyRecovered: true
  });
  assert.equal((await prepare(repository, {
    claimId: '123e4567-e89b-42d3-a456-426614174032',
    claimVerifier: '6'.repeat(64),
    nextRecoveryVerifier: 'c'.repeat(64),
    nextDeviceId: '123e4567-e89b-42d3-a456-426614174022',
    nextCredentialVerifier: '7'.repeat(64)
  })).status, 'invalid', 'the old Recovery verifier cannot be reused');
  assert.equal((await prepare(repository, {
    currentRecoveryVerifier: NEXT,
    claimId: '123e4567-e89b-42d3-a456-426614174033',
    claimVerifier: '8'.repeat(64),
    nextRecoveryVerifier: 'd'.repeat(64),
    nextDeviceId: '123e4567-e89b-42d3-a456-426614174023',
    nextCredentialVerifier: '9'.repeat(64)
  })).status, 'prepared', 'the rotated Recovery verifier can recover again');
  db.close();
});

test('parallel claims are compare-and-swap safe and only one active recovery device survives', async () => {
  const { db, repository } = fixture();
  await prepare(repository);
  await prepare(repository, {
    claimId: '123e4567-e89b-42d3-a456-426614174031',
    claimVerifier: '6'.repeat(64),
    nextRecoveryVerifier: 'c'.repeat(64),
    nextDeviceId: '123e4567-e89b-42d3-a456-426614174021',
    nextCredentialVerifier: '7'.repeat(64)
  });
  const [first, second] = await Promise.all([
    repository.commit({ claimId: '123e4567-e89b-42d3-a456-426614174030', claimVerifier: '4'.repeat(64), appId: 'chord', now: 1100 }),
    repository.commit({ claimId: '123e4567-e89b-42d3-a456-426614174031', claimVerifier: '6'.repeat(64), appId: 'chord', now: 1100 })
  ]);
  assert.deepEqual([first.status, second.status].sort(), ['invalid', 'recovered']);
  assert.equal(db.raw.prepare('SELECT recovery_version FROM sync_users WHERE id = ?').get(USER).recovery_version, 2);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM sync_devices WHERE user_id = ? AND revoked_at IS NULL').get(USER).count, 1);
  db.close();
});

test('cross-app, expired, deleted and regeneration paths fail closed or rotate without revoking devices', async () => {
  const { db, repository } = fixture();
  assert.equal((await prepare(repository, { appId: 'pitch' })).status, 'invalid');
  await prepare(repository);
  assert.equal((await repository.commit({
    claimId: '123e4567-e89b-42d3-a456-426614174030', claimVerifier: '4'.repeat(64), appId: 'chord', now: 700000
  })).status, 'invalid');
  const rotated = await repository.regenerate({ userId: USER, appId: 'chord', deviceId: DEVICE_A }, 'd'.repeat(64), 2000);
  assert.deepEqual(rotated, { status: 'rotated', recoveryVersion: 2 });
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM sync_devices WHERE user_id = ? AND revoked_at IS NULL').get(USER).count, 2);
  db.raw.prepare("UPDATE sync_users SET state='deleted', deleted_at=3000").run();
  assert.equal((await prepare(repository, { currentRecoveryVerifier: 'd'.repeat(64), claimId: '123e4567-e89b-42d3-a456-426614174032' })).status, 'invalid');
  db.close();
});
