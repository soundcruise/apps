import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeCursor, encodeCursor, hashRecord, manifestHash, validateOperation } from '../src/records.js';

const ID = '123e4567-e89b-52d3-a456-426614174000';

async function operation(overrides = {}) {
  const value = {
    operationId: ID,
    recordType: 'chord',
    recordId: 'c1',
    schemaVersion: 1,
    baseRevision: 0,
    payload: { id: 'c1', chordName: 'C', updatedAt: 'ignored', unknown: { b: 2, a: 1 } },
    payloadHash: '',
    deleted: false,
    ...overrides
  };
  value.payloadHash = await hashRecord(value);
  return value;
}

test('record validation canonicalizes payload and independently verifies its hash', async () => {
  const input = await operation();
  const result = await validateOperation(input);
  assert.equal(result.ok, true);
  assert.deepEqual(result.operation.payload.unknown, { a: 1, b: 2 });
  const tampered = { ...input, payload: { ...input.payload, chordName: 'Cm' } };
  assert.deepEqual(await validateOperation(tampered), { ok: false, code: 'hash_mismatch' });
});

test('tombstones have a deterministic null-payload hash and reject payload resurrection', async () => {
  const tombstone = await operation({ payload: null, deleted: true, baseRevision: 2 });
  assert.equal((await validateOperation(tombstone)).ok, true);
  const invalid = { ...tombstone, payload: { id: 'c1' } };
  assert.deepEqual(await validateOperation(invalid), { ok: false, code: 'invalid_tombstone' });
});

test('cursor is opaque, bounded, and reapply-safe', () => {
  const cursor = encodeCursor(12345);
  assert.equal(cursor, 'scc1.MTIzNDU');
  assert.equal(decodeCursor(cursor), 12345);
  assert.equal(decodeCursor(null), 0);
  assert.equal(decodeCursor('12345'), null);
  assert.equal(decodeCursor('scc1.bm90LWEtbnVtYmVy'), null);
});

test('manifest excludes tombstones and is stable across ordering', async () => {
  const records = [
    { recordType: 'chord', recordId: 'b', payloadHash: 'b'.repeat(64), deletedAt: null },
    { recordType: 'chord', recordId: 'gone', payloadHash: 'c'.repeat(64), deletedAt: 1 },
    { recordType: 'folder', recordId: 'a', payloadHash: 'a'.repeat(64), deletedAt: null }
  ];
  assert.equal(await manifestHash(records), await manifestHash(records.slice().reverse()));
});
