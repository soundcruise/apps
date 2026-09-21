import test from 'node:test';
import assert from 'node:assert/strict';
import { hashRecord, validateOperation } from '../src/records.js';
import { createD1SyncRepository } from '../src/sync-database.js';
import { createSqliteD1, seedIdentity } from './sqlite-d1.js';

let operationCounter = 1;
async function operation(payload, baseRevision, overrides = {}) {
  const suffix = String(operationCounter++).padStart(12, '0');
  const value = {
    operationId: `123e4567-e89b-52d3-a456-${suffix}`,
    recordType: 'chord',
    recordId: 'c1',
    schemaVersion: 1,
    baseRevision,
    payload,
    payloadHash: '',
    deleted: payload === null,
    ...overrides
  };
  value.payloadHash = await hashRecord(value);
  const checked = await validateOperation(value);
  assert.equal(checked.ok, true);
  return checked.operation;
}

test('new, update, stale conflict, duplicate retry, and tombstone are record-revision safe', async () => {
  const db = createSqliteD1();
  const identity = seedIdentity(db);
  let clock = 100;
  const repository = createD1SyncRepository(db, () => clock++);
  const first = await operation({ id: 'c1', chordName: 'C' }, 0);
  let result = await repository.applyOperation(identity, first);
  assert.equal(result.status, 'applied');
  assert.equal(result.record.revision, 1);
  assert.equal((await repository.getRecord(identity.userId, identity.appId, 'chord', 'c1')).updatedByDeviceId,
    identity.deviceId);
  result = await repository.applyOperation(identity, first);
  assert.equal(result.status, 'duplicate');
  assert.equal(result.record.revision, 1);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM sync_changes').get().count, 1);

  const changed = await operation({ id: 'c1', chordName: 'Cm' }, 1);
  result = await repository.applyOperation(identity, changed);
  assert.equal(result.status, 'applied');
  assert.equal(result.record.revision, 2);
  const stale = await operation({ id: 'c1', chordName: 'C7' }, 1);
  result = await repository.applyOperation(identity, stale);
  assert.equal(result.status, 'conflict');
  assert.equal(result.record.revision, 2);

  const deleted = await operation(null, 2);
  result = await repository.applyOperation(identity, deleted);
  assert.equal(result.status, 'applied');
  assert.equal(result.record.revision, 3);
  assert.equal(result.record.deletedAt, 103);
  assert.equal((await repository.readSnapshot(identity)).recordCount, 0);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM sync_changes').get().count, 3);
  const staleResurrection = await operation({ id: 'c1', chordName: 'C resurrected' }, 2);
  result = await repository.applyOperation(identity, staleResurrection);
  assert.equal(result.status, 'conflict');
  assert.equal(result.record.deletedAt, 103, 'a stale offline update cannot resurrect a tombstone');
  db.close();
});

test('operation ID reuse with different semantic input is invalid, never a duplicate success', async () => {
  const db = createSqliteD1();
  const identity = seedIdentity(db);
  const repository = createD1SyncRepository(db, () => 100);
  const first = await operation({ id: 'c1', chordName: 'C' }, 0);
  await repository.applyOperation(identity, first);
  const reused = await operation({ id: 'c1', chordName: 'D' }, 1, { operationId: first.operationId });
  const result = await repository.applyOperation(identity, reused);
  assert.deepEqual(result, { status: 'invalid', code: 'operation_id_reused' });
  assert.equal((await repository.getRecord(identity.userId, identity.appId, 'chord', 'c1')).revision, 1);
  db.close();
});

test('a revoke or deleting user that wins before push prevents every record mutation', async () => {
  for (const transition of ['revoke', 'delete']) {
    const db = createSqliteD1();
    const identity = seedIdentity(db);
    db.raw.prepare(`UPDATE sync_users
      SET state = 'active', recovery_version = 1, recovery_verifier = ?
      WHERE id = ?`).run('a'.repeat(64), identity.userId);
    if (transition === 'revoke') {
      db.raw.prepare('UPDATE sync_devices SET revoked_at = 99 WHERE id = ?').run(identity.deviceId);
    } else {
      db.raw.prepare("UPDATE sync_users SET state = 'deleting' WHERE id = ?").run(identity.userId);
    }
    const repository = createD1SyncRepository(db, () => 100);
    const result = await repository.applyOperation(
      identity,
      await operation({ id: 'c1', chordName: 'blocked' }, 0)
    );
    assert.deepEqual(result, { status: 'forbidden', code: 'credential_inactive' });
    assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM sync_records').get().count, 0);
    assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM sync_changes').get().count, 0);
    db.close();
  }
});

test('dataset bootstrap is idempotent and restricted to Account-managed app identities', async () => {
  const db = createSqliteD1();
  const managed = seedIdentity(db, {
    userId: 'managed-user', deviceId: 'managed-device', appId: 'pitch', verifier: 'a'.repeat(64)
  });
  db.raw.prepare('DELETE FROM sync_datasets WHERE user_id = ?').run(managed.userId);
  db.raw.prepare(`
    INSERT INTO sync_accounts (id, state, generation, recovery_version, recovery_verifier, created_at, updated_at)
    VALUES ('account', 'active', 1, 1, ?, 1, 1)
  `).run('a'.repeat(64));
  db.raw.prepare(`
    INSERT INTO sync_account_memberships (id, account_id, app_id, state, sync_user_id,
      recovery_mode, generation, created_at, activated_at, updated_at, deleted_at)
    VALUES ('membership', 'account', 'pitch', 'active', ?, 'account', 1, 1, 1, 1, NULL)
  `).run(managed.userId);
  db.raw.prepare(`
    INSERT INTO sync_account_managed_users (sync_user_id, account_id, membership_id, app_id, created_at)
    VALUES (?, 'account', 'membership', 'pitch', 1)
  `).run(managed.userId);
  const repository = createD1SyncRepository(db, () => 100);
  const summary = { schemaVersion: 1, recordCount: 0, manifestHash: '0'.repeat(64) };
  let result = await repository.bootstrapDataset(managed, summary);
  assert.equal(result.status, 'ready');
  assert.equal(result.alreadyCreated, false);
  result = await repository.bootstrapDataset(managed, summary);
  assert.equal(result.alreadyCreated, true);

  const legacy = seedIdentity(db, {
    userId: 'legacy-user', deviceId: 'legacy-device', appId: 'rhythm', verifier: 'b'.repeat(64)
  });
  db.raw.prepare('DELETE FROM sync_datasets WHERE user_id = ?').run(legacy.userId);
  assert.equal((await repository.bootstrapDataset(legacy, summary)).status, 'forbidden');
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM sync_datasets WHERE user_id = ?').get(legacy.userId).count, 0);
  db.close();
});

test('a missing record rejects a nonzero base revision without creating data', async () => {
  const db = createSqliteD1();
  const identity = seedIdentity(db);
  const repository = createD1SyncRepository(db, () => 100);
  const staleCreate = await operation({ id: 'c1', chordName: 'C' }, 4);
  const result = await repository.applyOperation(identity, staleCreate);
  assert.equal(result.status, 'conflict');
  assert.equal(result.record, null);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM sync_records').get().count, 0);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM sync_changes').get().count, 0);
  db.close();
});

test('a failed D1 batch rolls back the record write and change log together', async () => {
  const db = createSqliteD1();
  const identity = seedIdentity(db);
  const repository = createD1SyncRepository(db, () => 100);
  db.raw.exec('DROP TABLE sync_changes');
  await assert.rejects(repository.applyOperation(identity, await operation({ id: 'c1', chordName: 'C' }, 0)));
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM sync_records').get().count, 0);
  db.close();
});

test('changes pagination and migration manifest completion use one consistent watermark', async () => {
  const db = createSqliteD1();
  const identity = seedIdentity(db);
  const repository = createD1SyncRepository(db, () => 100);
  await repository.applyOperation(identity, await operation({ id: 'c1', chordName: 'C' }, 0));
  const page = await repository.listChanges(identity, 0, 1);
  assert.equal(page.changes.length, 1);
  assert.equal(page.hasMore, false);
  const snapshot = await repository.readSnapshot(identity);
  let result = await repository.completeMigration(identity, { recordCount: 2, manifestHash: snapshot.manifestHash });
  assert.equal(result.status, 'mismatch');
  result = await repository.completeMigration(identity, { recordCount: 1, manifestHash: snapshot.manifestHash });
  assert.equal(result.status, 'ready');
  assert.equal((await repository.getDataset(identity.userId, identity.appId)).state, 'ready');
  result = await repository.completeMigration(identity, { recordCount: 1, manifestHash: snapshot.manifestHash });
  assert.equal(result.status, 'ready', 'migration completion is idempotent');
  db.close();
});

test('Pitch records use the same revision-safe data plane with an app-specific manifest', async () => {
  const db = createSqliteD1();
  const identity = seedIdentity(db, {
    userId: '123e4567-e89b-42d3-a456-426614174099',
    deviceId: '123e4567-e89b-42d3-a456-426614174098', appId: 'pitch'
  });
  const repository = createD1SyncRepository(db, () => 100);
  const value = {
    operationId: '123e4567-e89b-52d3-a456-426614174097',
    recordType: 'settings', recordId: 'settings', schemaVersion: 1, baseRevision: 0,
    payload: { id: 'settings', values: { notationStyle: 'letter' } }, payloadHash: '', deleted: false
  };
  value.payloadHash = await hashRecord(value, crypto, 'pitch');
  const checked = await validateOperation(value, crypto, 'pitch');
  assert.equal(checked.ok, true);
  assert.equal((await repository.applyOperation(identity, checked.operation)).status, 'applied');
  const snapshot = await repository.readSnapshot(identity);
  assert.equal(snapshot.recordCount, 1);
  assert.equal(snapshot.manifestHash, await (await import('../src/records.js')).manifestHash(snapshot.records, 1, crypto, 'pitch'));
  db.close();
});

test('Rhythm records use the shared revision-safe data plane with a Rhythm-scoped manifest', async () => {
  const db = createSqliteD1();
  const identity = seedIdentity(db, {
    userId: '123e4567-e89b-42d3-a456-426614174089',
    deviceId: '123e4567-e89b-42d3-a456-426614174088', appId: 'rhythm'
  });
  const repository = createD1SyncRepository(db, () => 100);
  const value = {
    operationId: '123e4567-e89b-52d3-a456-426614174087',
    recordType: 'settings', recordId: 'settings', schemaVersion: 1, baseRevision: 0,
    payload: { id: 'settings', values: { judgePreset: 'strict' } }, payloadHash: '', deleted: false
  };
  value.payloadHash = await hashRecord(value, crypto, 'rhythm');
  const checked = await validateOperation(value, crypto, 'rhythm');
  assert.equal(checked.ok, true);
  assert.equal((await repository.applyOperation(identity, checked.operation)).status, 'applied');
  assert.equal((await repository.applyOperation(identity, checked.operation)).status, 'duplicate');
  const snapshot = await repository.readSnapshot(identity);
  assert.equal(snapshot.recordCount, 1);
  assert.equal(snapshot.manifestHash,
    await (await import('../src/records.js')).manifestHash(snapshot.records, 1, crypto, 'rhythm'));
  assert.notEqual(snapshot.manifestHash,
    await (await import('../src/records.js')).manifestHash(snapshot.records, 1, crypto, 'pitch'));
  db.close();
});

test('Fretboard records use the shared revision-safe data plane with a Fretboard-scoped manifest', async () => {
  const db = createSqliteD1();
  const identity = seedIdentity(db, {
    userId: '123e4567-e89b-42d3-a456-426614174079',
    deviceId: '123e4567-e89b-42d3-a456-426614174078', appId: 'fretboard'
  });
  const repository = createD1SyncRepository(db, () => 100);
  const value = {
    operationId: '123e4567-e89b-52d3-a456-426614174077',
    recordType: 'settings', recordId: 'settings', schemaVersion: 1, baseRevision: 0,
    payload: { id: 'settings', values: { tempo: 96 } }, payloadHash: '', deleted: false
  };
  value.payloadHash = await hashRecord(value, crypto, 'fretboard');
  const checked = await validateOperation(value, crypto, 'fretboard');
  assert.equal(checked.ok, true);
  assert.equal((await repository.applyOperation(identity, checked.operation)).status, 'applied');
  assert.equal((await repository.applyOperation(identity, checked.operation)).status, 'duplicate');
  const snapshot = await repository.readSnapshot(identity);
  assert.equal(snapshot.recordCount, 1);
  assert.equal(snapshot.manifestHash,
    await (await import('../src/records.js')).manifestHash(snapshot.records, 1, crypto, 'fretboard'));
  assert.notEqual(snapshot.manifestHash,
    await (await import('../src/records.js')).manifestHash(snapshot.records, 1, crypto, 'rhythm'));
  db.close();
});

test('Port records use the shared revision-safe data plane with a Port-scoped manifest', async () => {
  const db = createSqliteD1();
  const identity = seedIdentity(db, {
    userId: '123e4567-e89b-42d3-a456-426614174069',
    deviceId: '123e4567-e89b-42d3-a456-426614174068', appId: 'port'
  });
  const repository = createD1SyncRepository(db, () => 100);
  const value = {
    operationId: '123e4567-e89b-52d3-a456-426614174067',
    recordType: 'settings', recordId: 'global', schemaVersion: 1, baseRevision: 0,
    payload: { id: 'global', value: { displaySize: 'small' } }, payloadHash: '', deleted: false
  };
  value.payloadHash = await hashRecord(value, crypto, 'port');
  const checked = await validateOperation(value, crypto, 'port');
  assert.equal(checked.ok, true);
  assert.equal((await repository.applyOperation(identity, checked.operation)).status, 'applied');
  assert.equal((await repository.applyOperation(identity, checked.operation)).status, 'duplicate');
  const snapshot = await repository.readSnapshot(identity);
  assert.equal(snapshot.recordCount, 1);
  assert.equal(snapshot.manifestHash,
    await (await import('../src/records.js')).manifestHash(snapshot.records, 1, crypto, 'port'));
  assert.notEqual(snapshot.manifestHash,
    await (await import('../src/records.js')).manifestHash(snapshot.records, 1, crypto, 'fretboard'));
  db.close();
});
