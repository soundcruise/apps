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

test('Pitch registry accepts typed Pitch payloads while Chord remains unchanged and app-isolated', async () => {
  const pitch = {
    operationId: ID,
    recordType: 'custom_chord',
    recordId: 'legacy:chord:2001',
    schemaVersion: 1,
    baseRevision: 0,
    payload: {
      id: 'legacy:chord:2001', legacyId: 2001, name: 'QA', root: '0', third: '4',
      fifth: '7', seventh: '11', tensions: [], inversion: '0', isActive: true
    },
    payloadHash: '',
    deleted: false
  };
  pitch.payloadHash = await hashRecord(pitch, crypto, 'pitch');
  assert.equal((await validateOperation(pitch, crypto, 'pitch')).ok, true);
  assert.equal((await validateOperation(pitch, crypto, 'chord')).ok, false);
  const wrongPitchType = { ...pitch, recordType: 'folder' };
  wrongPitchType.payloadHash = await hashRecord(wrongPitchType, crypto, 'pitch');
  assert.equal((await validateOperation(wrongPitchType, crypto, 'pitch')).ok, false);

  const chord = await operation();
  assert.equal((await validateOperation(chord)).ok, true);
  assert.notEqual(
    await manifestHash([{ ...pitch, deletedAt: null }], 1, crypto, 'pitch'),
    await manifestHash([{ ...pitch, deletedAt: null }], 1, crypto, 'chord')
  );
});

test('Pitch payload validation fails closed for bad references, settings and progress', async () => {
  const cases = [
    {
      recordType: 'custom_progression', recordId: 'legacy:progression:1',
      payload: { id: 'legacy:progression:1', legacyId: 1, name: 'x', chordRefs: ['not-a-reference'], isActive: true }
    },
    {
      recordType: 'settings', recordId: 'settings',
      payload: { id: 'settings', values: { baseHz: 442 } }
    },
    {
      recordType: 'progress', recordId: 'melody:builtin:melody:stage-1',
      payload: { id: 'melody:builtin:melody:stage-1', category: 'melody', stageRef: 'builtin:melody:stage-1', clearCount: -1, lastClearedAt: null }
    }
  ];
  for (const entry of cases) {
    const input = {
      operationId: ID, schemaVersion: 1, baseRevision: 0,
      payloadHash: '', deleted: false, ...entry
    };
    input.payloadHash = await hashRecord(input, crypto, 'pitch');
    assert.equal((await validateOperation(input, crypto, 'pitch')).ok, false);
  }
});
