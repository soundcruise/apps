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

test('Rhythm registry accepts every typed payload and remains isolated from Chord and Pitch', async () => {
  const stage = {
    title: 'QA', description: '', grid: 'eighth', timeSignature: '4/4', patternBars: 1,
    bars: 4, bpm: 90, clickMode: 'all', rhythmFeel: 'straight',
    pattern: [{ hit: true, dir: 'down', type: 'hit' }]
  };
  const cases = [
    ['settings', 'settings', { id: 'settings', values: { tapLayout: 'ud', clickOffbeat: true } }],
    ['custom_stage', 'legacy:stage:one', { id: 'legacy:stage:one', legacyId: 'one', ...stage }],
    ['create_preset', 'legacy:create-preset:one', {
      id: 'legacy:create-preset:one', legacyId: 'one', name: 'QA', stageN: 1,
      pattern: ['hit'], dirs: ['down'], patternBars: 1, bpm: 90, bars: 4,
      balance: 50, createdAt: 1, updatedAt: 2
    }],
    ['custom_preset', 'legacy:custom-preset:one', {
      id: 'legacy:custom-preset:one', legacyId: 'one', name: 'QA', settings: stage,
      balance: 50, createdAt: 1, updatedAt: 2
    }],
    ['stage_order', 'stages', { id: 'stages', stageRefs: ['legacy:stage:one'] }],
    ['preset_order', 'create', {
      id: 'create', category: 'create', presetRefs: ['legacy:create-preset:one']
    }],
    ['builtin_stage_preferences', 'builtin:stage:1', {
      id: 'builtin:stage:1', builtinStageRef: 'builtin:stage:1', bpm: 92, bars: 6
    }]
  ];
  for (const [recordType, recordId, payload] of cases) {
    const input = {
      operationId: ID, recordType, recordId, schemaVersion: 1,
      baseRevision: 0, payload, payloadHash: '', deleted: false
    };
    input.payloadHash = await hashRecord(input, crypto, 'rhythm');
    assert.equal((await validateOperation(input, crypto, 'rhythm')).ok, true, recordType);
    assert.equal((await validateOperation(input, crypto, 'chord')).ok, false, `${recordType} is not Chord`);
    assert.equal((await validateOperation(input, crypto, 'pitch')).ok, false, `${recordType} is not Pitch`);
  }
});

test('Rhythm validation rejects local-only settings, unknown types and invalid references', async () => {
  const cases = [
    ['settings', 'settings', { id: 'settings', values: { bluetoothMicOffsetMs: 120 } }],
    ['progress', 'legacy:progress:one', { id: 'legacy:progress:one', clearCount: 1 }],
    ['stage_order', 'stages', { id: 'stages', stageRefs: ['not-a-reference'] }],
    ['builtin_stage_preferences', 'builtin:stage:9', {
      id: 'builtin:stage:9', builtinStageRef: 'builtin:stage:9', bpm: 80, bars: 4
    }]
  ];
  for (const [recordType, recordId, payload] of cases) {
    const input = {
      operationId: ID, recordType, recordId, schemaVersion: 1,
      baseRevision: 0, payload, payloadHash: '', deleted: false
    };
    input.payloadHash = await hashRecord(input, crypto, 'rhythm');
    assert.equal((await validateOperation(input, crypto, 'rhythm')).ok, false, recordType);
  }
});

test('Fretboard registry accepts every typed payload and remains isolated from prior apps', async () => {
  const common = {
    name: 'QA', key: 0, capo: 0, scale: 'major', displayMode: 'solfege',
    doMode: 'movable', maxFret: 12
  };
  const cases = [
    ['settings', 'settings', { id: 'settings', values: { tempo: 96, noteLabelMode: 'degree' } }],
    ['custom_route', 'legacy:route-stage:one', {
      id: 'legacy:route-stage:one', legacyId: 'one', ...common,
      route: [{ stringName: 6, fret: 3 }], groupBreaks: [0], groupNames: ['Gr.1']
    }],
    ['custom_quiz', 'legacy:quiz-stage:one', {
      id: 'legacy:quiz-stage:one', legacyId: 'one', ...common,
      groups: [{ name: 'Gr.1', notes: [{ stringName: 1, fret: 12 }] }]
    }],
    ['builtin_route_override', 'builtin:route-stage:1', {
      id: 'builtin:route-stage:1', builtinStageRef: 'builtin:route-stage:1',
      route: [{ stringName: 6, fret: 3 }], groupBreaks: [0]
    }],
    ['builtin_quiz_override', 'builtin:quiz-stage:1', {
      id: 'builtin:quiz-stage:1', builtinStageRef: 'builtin:quiz-stage:1',
      groups: [{ notes: [{ stringName: 1, fret: 3 }] }]
    }],
    ['stage_order', 'route', {
      id: 'route', category: 'route', stageRefs: ['legacy:route-stage:one']
    }],
    ['progress', 'route:builtin:route-stage:1', {
      id: 'route:builtin:route-stage:1', category: 'route',
      stageRef: 'builtin:route-stage:1', clearCount: 7
    }]
  ];
  for (const [recordType, recordId, payload] of cases) {
    const input = {
      operationId: ID, recordType, recordId, schemaVersion: 1,
      baseRevision: 0, payload, payloadHash: '', deleted: false
    };
    input.payloadHash = await hashRecord(input, crypto, 'fretboard');
    assert.equal((await validateOperation(input, crypto, 'fretboard')).ok, true, recordType);
    for (const appId of ['chord', 'pitch', 'rhythm']) {
      assert.equal((await validateOperation(input, crypto, appId)).ok, false, `${recordType} is not ${appId}`);
    }
  }
});

test('Fretboard validation rejects drafts, device settings, bad graph values and unknown types', async () => {
  const cases = [
    ['settings', 'settings', { id: 'settings', values: { stringSpacing: 140 } }],
    ['custom_route', 'legacy:route-stage:one', {
      id: 'legacy:route-stage:one', legacyId: 'one', name: 'QA', key: 0, capo: 0,
      scale: 'major', displayMode: 'solfege', doMode: 'movable', maxFret: 12,
      route: [{ stringName: 7, fret: 3 }], groupBreaks: [0], groupNames: ['Gr.1']
    }],
    ['stage_order', 'route', { id: 'route', category: 'route', stageRefs: ['not-a-reference'] }],
    ['progress', 'quiz:builtin:quiz-stage:1', {
      id: 'quiz:builtin:quiz-stage:1', category: 'quiz', stageRef: 'builtin:quiz-stage:1'
    }],
    ['editor_draft', 'draft', { id: 'draft', value: {} }]
  ];
  for (const [recordType, recordId, payload] of cases) {
    const input = {
      operationId: ID, recordType, recordId, schemaVersion: 1,
      baseRevision: 0, payload, payloadHash: '', deleted: false
    };
    input.payloadHash = await hashRecord(input, crypto, 'fretboard');
    assert.equal((await validateOperation(input, crypto, 'fretboard')).ok, false, recordType);
  }
});
