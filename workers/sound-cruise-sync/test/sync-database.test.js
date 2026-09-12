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
