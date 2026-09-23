import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {
  hashRecord as workerHashRecord, manifestHash as workerManifestHash,
  validateOperation as workerValidateOperation
} from '../../../workers/sound-cruise-sync/src/records.js';

const source = fs.readFileSync(path.join(import.meta.dirname, 'pitch-sync-adapter.js'), 'utf8');
const pitchRoot = path.resolve(import.meta.dirname, '..');

function load() {
  const context = vm.createContext({ crypto, TextEncoder, structuredClone, URL, console });
  vm.runInContext(source, context);
  return context.SoundCruisePitchSync;
}

class MemoryStorage {
  constructor(values = {}) {
    this.values = new Map(Object.entries(values));
    this.failAt = null;
    this.writes = 0;
  }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) {
    this.writes += 1;
    if (this.writes === this.failAt) throw new Error('synthetic_write_failure');
    this.values.set(key, String(value));
  }
  removeItem(key) { this.values.delete(key); }
}

function defaultData(api, base = 1000) {
  const chordIds = new Map(api.BUILTIN_CHORDS.map((chord, index) => [chord.key, base + index]));
  return {
    customChords: api.BUILTIN_CHORDS.map((chord) => ({
      id: chordIds.get(chord.key), name: chord.name, root: chord.root,
      third: chord.third, fifth: chord.fifth, seventh: chord.seventh,
      tensions: [], inversion: chord.inversion, isActive: true
    })),
    customProgressions: api.BUILTIN_PROGRESSIONS.map((progression, index) => ({
      id: base + 100 + index, name: progression.name,
      chords: progression.chordRefs.map((ref) => chordIds.get(ref)), isActive: true
    }))
  };
}

function richLegacy(api) {
  const data = defaultData(api);
  data.customChords.push({
    id: 2001, name: 'QA maj7', root: '0', third: '4', fifth: '7', seventh: '11',
    tensions: ['14'], inversion: '0', isActive: true
  });
  data.customProgressions.push({ id: 2101, name: 'QA progression', chords: [2001, 1004], isActive: true });
  return {
    pitchTrainerProData: JSON.stringify(data),
    pitchTrainerSettings: JSON.stringify({
      instrument: 'piano', notationStyle: 'letter', scaleEnabled: false,
      isAnswerMode: true, keyRandomMode: true, baseOctave: 4, keyOffset: 2,
      noteSpeed: 1.5, baseHz: 442, sustainTime: 0.8
    }),
    pitchTrainerProAccidentalDisplay: 'flat',
    pitchTrainerStagingProMelodySlots: JSON.stringify({
      slots: [{ id: 5001, name: 'QA melody', config: {
        pool: ['C', 'D'], count: 2, is2Octave: false, isPianoLayout: true,
        answerMethod: 'note', description: 'synthetic fixture'
      } }], order: [5001]
    }),
    pitchTrainerStagingProChordSlots: JSON.stringify({
      slots: [{ id: 5101, name: 'QA chord', config: {
        poolChordIds: [2001, 1004], count: 4, proQuestionMode: 'chords', description: ''
      } }], order: [5101]
    }),
    pitchTrainerTestModeEnabled: 'true',
    pitchTrainerTestModeResults: JSON.stringify({
      melody: { 'stage-1': { clearCount: 2, lastClearedAt: '2026-01-01T00:00:00.000Z' },
        'custom-5001': { clearCount: 3, lastClearedAt: '2026-01-02T00:00:00.000Z' } },
      chord: { 'custom-5101': { clearCount: 1, lastClearedAt: '2026-01-03T00:00:00.000Z' } }
    })
  };
}

test('fresh/empty and generated built-ins are not meaningful cloud data', () => {
  const api = load();
  assert.equal(api.isMeaningfulLocalData({ schemaVersion: 0, values: {} }), false);
  assert.equal(api.isMeaningfulLocalData({
    schemaVersion: 0, values: { pitchTrainerProData: JSON.stringify(defaultData(api)) }
  }), false);
  assert.equal(api.isMeaningfulLocalData({
    schemaVersion: 0,
    values: { pitchTrainerSettings: JSON.stringify({ baseHz: 442, sustainTime: 0.9 }) }
  }), false, 'device-only audio settings never trigger migration');
});

test('legacy snapshot becomes typed records with stable IDs and excludes local-only audio settings', async () => {
  const api = load();
  const raw = { schemaVersion: 0, values: richLegacy(api) };
  const first = api.normalizeLocalSnapshot(raw);
  const second = api.normalizeLocalSnapshot(raw);
  assert.deepEqual(first, second);
  assert.equal(api.isMeaningfulLocalData(raw), true);
  assert.deepEqual([...new Set(first.records.map((record) => record.recordType))].sort(), [
    'chord_stage', 'custom_chord', 'custom_progression', 'melody_stage',
    'progress', 'settings', 'stage_order'
  ]);
  const settings = first.records.find((record) => record.recordType === 'settings').payload.values;
  assert.equal(settings.baseHz, undefined);
  assert.equal(settings.sustainTime, undefined);
  assert.equal(settings.instrument, 'piano');
  assert.equal(first.records.some((record) => record.payload?.name === 'C'), false, 'built-in content is not serialized');
  const serialized = await api.serializeRecords(first);
  assert(serialized.every((record) => /^[0-9a-f]{64}$/.test(record.payloadHash)));
  for (const record of serialized) {
    const checked = await workerValidateOperation({
      operationId: '123e4567-e89b-52d3-a456-426614174000',
      ...record, baseRevision: 0, deleted: false
    }, crypto, 'pitch');
    assert.equal(checked.ok, true, `${record.recordType}/${record.recordId} matches the Worker registry`);
  }
  assert.equal(await api.computeManifest(first), await api.computeManifest(api.deserializeRecords(serialized.reverse())));
  assert.equal(serialized[0].payloadHash, await workerHashRecord(serialized[0], crypto, 'pitch'));
  assert.equal(await api.computeManifest(first), await workerManifestHash(serialized.map((record) => ({
    ...record, deletedAt: null
  })), 1, crypto, 'pitch'));
});

test('two-octave melody pool survives local to cloud to local without string coercion', async () => {
  const api = load();
  const android = new MemoryStorage(richLegacy(api));
  const iphone = new MemoryStorage(richLegacy(api));
  const androidStage = JSON.parse(android.getItem('pitchTrainerStagingProMelodySlots'));
  androidStage.slots[0].config.count = 5;
  android.setItem('pitchTrainerStagingProMelodySlots', JSON.stringify(androidStage));
  const original = api.normalizeLocalSnapshot({ schemaVersion: 0, values: Object.fromEntries(android.values) });
  const originalCloud = api.deserializeRecords(JSON.parse(JSON.stringify(await api.serializeRecords(original))));
  await new api.PitchSyncAdapter({ storage: iphone }).applyRemoteSnapshot(originalCloud);
  const initial = JSON.parse(iphone.getItem('pitchTrainerStagingProMelodySlots'));
  assert.equal(initial.slots[0].id, 5001);
  assert.equal(initial.slots[0].config.is2Octave, false);
  assert.equal(initial.slots[0].config.count, 5);
  assert.deepEqual(initial.slots[0].config.pool, ['C', 'D']);

  const melody = JSON.parse(iphone.getItem('pitchTrainerStagingProMelodySlots'));
  const pool = [{ note: 'C', octaveOffset: 0 }, { note: 'C#', octaveOffset: 1 }, 'D'];
  melody.slots[0].config = { ...melody.slots[0].config, pool, count: 6, is2Octave: true };
  iphone.setItem('pitchTrainerStagingProMelodySlots', JSON.stringify(melody));
  const local = api.normalizeLocalSnapshot({ schemaVersion: 0, values: Object.fromEntries(iphone.values) });
  const record = local.records.find((entry) => entry.recordType === 'melody_stage');
  assert.deepEqual(JSON.parse(JSON.stringify(record.payload.pool)), pool);
  const serialized = await api.serializeRecords(local);
  const wire = serialized.find((entry) => entry.recordType === 'melody_stage');
  assert.deepEqual(JSON.parse(JSON.stringify(wire.payload.pool)), pool);
  assert.equal((await workerValidateOperation({
    operationId: '123e4567-e89b-52d3-a456-426614174000',
    ...wire, baseRevision: 0, deleted: false
  }, crypto, 'pitch')).ok, true);
  const cloud = api.deserializeRecords(JSON.parse(JSON.stringify(serialized)));
  await new api.PitchSyncAdapter({ storage: android }).applyRemoteSnapshot(cloud);
  const returnedSlot = JSON.parse(android.getItem('pitchTrainerStagingProMelodySlots')).slots[0];
  const received = returnedSlot.config;
  assert.equal(returnedSlot.id, 5001);
  assert.equal(returnedSlot.name, 'QA melody');
  assert.deepEqual(received.pool, pool);
  assert.equal(received.count, 6);
  assert.equal(received.is2Octave, true);
  assert.equal(received.isPianoLayout, true);
  assert.equal(received.answerMethod, 'note');
  assert.equal(JSON.stringify(received).includes('[object Object]'), false);
  assert.equal(await api.computeManifest(api.normalizeLocalSnapshot({ schemaVersion: 0,
    values: Object.fromEntries(android.values) })), await api.computeManifest(cloud));
});

test('melody pool validation rejects malformed entries before serialization or remote write', async () => {
  const api = load();
  const malformed = [
    '[object Object]', { note: 'C' }, { note: 'C', octaveOffset: -1 },
    { note: 'C', octaveOffset: 2 }, { note: 'H', octaveOffset: 0 },
    { note: 'C', octaveOffset: '1' }, { note: 'C', octaveOffset: 1, extra: true },
    { note: { nested: 'C' }, octaveOffset: 0 }, null, []
  ];
  for (const bad of malformed) {
    const values = richLegacy(api);
    const melody = JSON.parse(values.pitchTrainerStagingProMelodySlots);
    melody.slots[0].config.pool = [bad];
    values.pitchTrainerStagingProMelodySlots = JSON.stringify(melody);
    assert.throws(() => api.normalizeLocalSnapshot({ schemaVersion: 0, values }), /melody_pool_invalid|record_shape_invalid/);

    const valid = api.normalizeLocalSnapshot({ schemaVersion: 0, values: richLegacy(api) });
    valid.records.find((entry) => entry.recordType === 'melody_stage').payload.pool = [bad];
    const storage = new MemoryStorage(richLegacy(api));
    await assert.rejects(new api.PitchSyncAdapter({ storage }).applyRemoteSnapshot(valid), /pitch_record_invalid/);
    assert.equal(storage.writes, 0);
  }
});

test('two-octave stage conflicts retain typed pool and do not silently merge unrelated edits', () => {
  const api = load();
  const base = api.normalizeLocalSnapshot({ schemaVersion: 0, values: richLegacy(api) });
  const left = structuredClone(base);
  const right = structuredClone(base);
  const leftStage = left.records.find((entry) => entry.recordType === 'melody_stage');
  const rightStage = right.records.find((entry) => entry.recordType === 'melody_stage');
  leftStage.payload.pool = [{ note: 'C', octaveOffset: 0 }, { note: 'D', octaveOffset: 1 }];
  leftStage.payload.is2Octave = true;
  rightStage.payload.count = 6;
  const result = api.mergeSnapshots(left, right);
  assert(result.conflicts.some((entry) => entry.recordKey.startsWith('melody_stage/') && entry.reason === 'semantic_conflict'));
  assert.deepEqual(JSON.parse(JSON.stringify(leftStage.payload.pool)), [{ note: 'C', octaveOffset: 0 }, { note: 'D', octaveOffset: 1 }]);
  assert.equal(rightStage.payload.count, 6);
  assert.equal(JSON.stringify(result).includes('[object Object]'), false);
});

test('a stale Pitch editor save restores missing synced chords and progressions before pushing', async () => {
  const api = load();
  const values = richLegacy(api);
  const shadow = await api.serializeRecords(api.normalizeLocalSnapshot({ schemaVersion: 0, values }));
  const stale = JSON.parse(values.pitchTrainerProData);
  stale.customChords = stale.customChords.filter((chord) => chord.id !== 2001);
  stale.customChords.push({ id: 3001, name: 'V2QA', root: '0', third: '4', fifth: '7',
    seventh: 'null', tensions: [], inversion: '0', isActive: true });
  stale.customProgressions = stale.customProgressions.filter((progression) => progression.id !== 2101);
  const storage = new MemoryStorage({ ...values, pitchTrainerProData: JSON.stringify(stale) });
  const backups = [];
  const adapter = new api.PitchSyncAdapter({ storage, backupStore: { async save(value) { backups.push(value); } } });
  assert.throws(() => adapter.normalizeLocalSnapshot(), /pitch_legacy_chord_stage_reference_invalid/);
  await assert.rejects(adapter.repairMissingLegacyReferences([]), /pitch_legacy_repair_unavailable/);
  assert.equal(storage.getItem('pitchTrainerProData'), JSON.stringify(stale));
  assert.equal(await adapter.repairMissingLegacyReferences(shadow), true);
  const repaired = JSON.parse(storage.getItem('pitchTrainerProData'));
  assert(repaired.customChords.some((chord) => chord.id === 2001 && chord.name === 'QA maj7'));
  assert(repaired.customChords.some((chord) => chord.id === 3001 && chord.name === 'V2QA'));
  assert(repaired.customProgressions.some((progression) => progression.id === 2101));
  assert.equal(backups.length, 1);
  assert.equal(adapter.normalizeLocalSnapshot().records.some((record) => record.payload?.name === 'V2QA'), true);
  assert.equal(await adapter.repairMissingLegacyReferences(shadow), false);
});

test('a user-created duplicate of a built-in shape is not mistaken for generated built-in content', () => {
  const api = load();
  const data = defaultData(api);
  data.customChords.push({ ...data.customChords[0], id: 9999, name: 'C' });
  const snapshot = api.normalizeLocalSnapshot({
    schemaVersion: 0, values: { pitchTrainerProData: JSON.stringify(data) }
  });
  const custom = snapshot.records.filter((record) => record.recordType === 'custom_chord');
  assert.equal(custom.length, 1);
  assert.equal(custom[0].payload.legacyId, 9999);
});

test('conflict presentation exposes only bounded user-facing Pitch fields', () => {
  const api = load();
  const result = api.getConflictPresentation({
    localRecord: { recordType: 'custom_progression', recordId: 'private-id', payloadHash: 'private-hash', payload: { name: 'QA progression', chordRefs: ['a', 'b'] } },
    remoteRecord: { recordType: 'custom_progression', recordId: 'private-id', revision: 3, payload: { name: 'QA progression', chordRefs: ['a', 'b', 'c'] } }
  });
  const plain = JSON.parse(JSON.stringify(result));
  assert.equal(plain.name, 'QA progression');
  assert.deepEqual(plain.fields.find((field) => field.label === 'コード数'), { label: 'コード数', local: '2', remote: '3' });
  assert.doesNotMatch(JSON.stringify(plain), /private-id|private-hash|revision|payload/i);
});

test('an edited generated built-in is a stable override and round-trips without duplicate defaults', async () => {
  const api = load();
  const sourceData = defaultData(api, 1000);
  sourceData.customChords[0].name = 'Edited C';
  const snapshot = api.normalizeLocalSnapshot({
    schemaVersion: 0, values: { pitchTrainerProData: JSON.stringify(sourceData) }
  });
  const override = snapshot.records.find((record) => record.recordType === 'custom_chord');
  assert.equal(override.payload.builtinKey, 'builtin:chord:c');
  const targetStorage = new MemoryStorage({
    pitchTrainerProData: JSON.stringify(defaultData(api, 3000))
  });
  await new api.PitchSyncAdapter({ storage: targetStorage }).applyRemoteSnapshot(snapshot);
  const applied = JSON.parse(targetStorage.getItem('pitchTrainerProData'));
  assert.equal(applied.customChords.length, 6);
  assert.equal(applied.customChords[0].name, 'Edited C');
  assert.equal(await api.computeManifest(api.normalizeLocalSnapshot({ schemaVersion: 0, values: Object.fromEntries(targetStorage.values) })),
    await api.computeManifest(snapshot));
});

test('malformed JSON, future schema and dangling references fail closed', () => {
  const api = load();
  assert.throws(() => api.normalizeLocalSnapshot({ schemaVersion: 0, values: { pitchTrainerProData: '{' } }), /json_invalid/);
  assert.throws(() => api.normalizeLocalSnapshot({ schemaVersion: 2, values: {} }), /future_version/);
  const snapshot = { appId: 'pitch', schemaVersion: 1, records: [{
    recordType: 'custom_progression', recordId: 'legacy:progression:1', schemaVersion: 1,
    payload: { id: 'legacy:progression:1', legacyId: 1, name: 'bad',
      chordRefs: ['legacy:chord:missing', 'builtin:chord:c'], isActive: true }
  }] };
  assert.throws(() => api.validateSnapshot(snapshot), /reference_invalid/);
});

test('settings merge is field-level while overlapping disagreement is explicit conflict', () => {
  const api = load();
  const snapshot = (values) => ({ appId: 'pitch', schemaVersion: 1, records: [{
    recordType: 'settings', recordId: 'settings', schemaVersion: 1,
    payload: { id: 'settings', values }
  }] });
  let merged = api.mergeSnapshots(snapshot({ notationStyle: 'letter' }), snapshot({ scaleEnabled: false }));
  assert.equal(merged.conflicts.length, 0);
  assert.equal(JSON.stringify(merged.snapshot.records[0].payload.values), JSON.stringify({ notationStyle: 'letter', scaleEnabled: false }));
  merged = api.mergeSnapshots(snapshot({ notationStyle: 'letter' }), snapshot({ notationStyle: 'doremi' }));
  assert.equal(JSON.stringify(merged.conflicts), JSON.stringify([
    { recordKey: 'settings/settings', field: 'notationStyle', reason: 'settings_field_conflict' }
  ]));
});

test('progress merge uses semantic maximum count and latest completion, never sums retries', () => {
  const api = load();
  const snapshot = (count, date) => ({ appId: 'pitch', schemaVersion: 1, records: [{
    recordType: 'progress', recordId: 'melody:builtin:melody:stage-1', schemaVersion: 1,
    payload: { id: 'melody:builtin:melody:stage-1', category: 'melody',
      stageRef: 'builtin:melody:stage-1', clearCount: count, lastClearedAt: date }
  }] });
  const merged = api.mergeSnapshots(snapshot(3, '2026-01-03T00:00:00.000Z'), snapshot(2, '2026-01-04T00:00:00.000Z'));
  assert.equal(merged.conflicts.length, 0);
  assert.equal(merged.snapshot.records[0].payload.clearCount, 3);
  assert.equal(merged.snapshot.records[0].payload.lastClearedAt, '2026-01-04T00:00:00.000Z');
});

test('same stable ID with different custom content and overlapping order are semantic conflicts', () => {
  const api = load();
  const base = api.normalizeLocalSnapshot({ schemaVersion: 0, values: richLegacy(api) });
  const changed = structuredClone(base);
  changed.records.find((record) => record.recordType === 'custom_chord').payload.name = 'conflicting edit';
  assert(api.mergeSnapshots(base, changed).conflicts.some((conflict) => conflict.reason === 'semantic_conflict'));
  const changedOrder = structuredClone(base);
  changedOrder.records.find((record) => record.recordType === 'stage_order' && record.payload.category === 'melody').payload.stageRefs.reverse();
  // One-item order remains equal; add another stage through a duplicate fixture for a real order conflict.
  assert.equal(api.mergeSnapshots(base, changedOrder).conflicts.filter((entry) => entry.reason === 'ordering_conflict').length, 0);
});

test('empty/cloud and local/empty merge retain the meaningful side without conflict', () => {
  const api = load();
  const empty = { appId: 'pitch', schemaVersion: 1, records: [] };
  const rich = api.normalizeLocalSnapshot({ schemaVersion: 0, values: richLegacy(api) });
  for (const merged of [api.mergeSnapshots(empty, rich), api.mergeSnapshots(rich, empty)]) {
    assert.equal(merged.conflicts.length, 0);
    assert.equal(merged.snapshot.records.length, rich.records.length);
  }
});

test('overlapping stage order and mismatched progress identity stop as conflicts', () => {
  const api = load();
  const stage = (id, legacyId) => ({
    recordType: 'melody_stage', recordId: id, schemaVersion: 1,
    payload: { id, legacyId, name: id, pool: ['C'], count: 1, is2Octave: false,
      isPianoLayout: true, answerMethod: 'note', description: '' }
  });
  const ordered = (refs) => ({ appId: 'pitch', schemaVersion: 1, records: [
    stage('legacy:melody-stage:5001', 5001), stage('legacy:melody-stage:5002', 5002),
    { recordType: 'stage_order', recordId: 'melody', schemaVersion: 1,
      payload: { id: 'melody', category: 'melody', stageRefs: refs } }
  ] });
  const leftRefs = ['legacy:melody-stage:5001', 'legacy:melody-stage:5002'];
  const rightRefs = [...leftRefs].reverse();
  assert(api.mergeSnapshots(ordered(leftRefs), ordered(rightRefs)).conflicts.some((entry) => entry.reason === 'ordering_conflict'));

  const progress = (category, stageRef) => ({ appId: 'pitch', schemaVersion: 1, records: [{
    recordType: 'progress', recordId: 'shared-progress-key', schemaVersion: 1,
    payload: { id: 'shared-progress-key', category, stageRef, clearCount: 1, lastClearedAt: null }
  }] });
  assert(api.mergeSnapshots(progress('melody', 'builtin:melody:stage-1'),
    progress('chord', 'builtin:chord:stage-101')).conflicts.some((entry) => entry.reason === 'semantic_conflict'));
});

test('remote apply backs up first, preserves local-only settings/auth, and verifies round trip manifest', async () => {
  const api = load();
  const storage = new MemoryStorage({
    ...richLegacy(api),
    soundCruiseProAuth: 'must-survive',
    soundCruiseSyncCredential: 'must-not-be-backed-up'
  });
  const snapshot = api.normalizeLocalSnapshot({ schemaVersion: 0, values: richLegacy(api) });
  const backups = [];
  const adapter = new api.PitchSyncAdapter({ storage, backupStore: { async save(value) { backups.push(value); } } });
  const result = await adapter.applyRemoteSnapshot(snapshot);
  assert.equal(result.ok, true);
  assert.equal(backups.length, 1);
  assert.equal(JSON.stringify(backups).includes('soundCruiseProAuth'), false);
  assert.equal(JSON.parse(storage.getItem('pitchTrainerSettings')).baseHz, 442);
  assert.equal(storage.getItem('soundCruiseProAuth'), 'must-survive');
});

test('mid-write failure and post-write manifest mismatch fully roll back every managed key', async () => {
  const api = load();
  const original = richLegacy(api);
  const snapshot = api.normalizeLocalSnapshot({ schemaVersion: 0, values: original });
  const storage = new MemoryStorage(original);
  storage.failAt = 3;
  const adapter = new api.PitchSyncAdapter({ storage });
  await assert.rejects(adapter.applyRemoteSnapshot(snapshot), /synthetic_write_failure/);
  for (const [key, value] of Object.entries(original)) assert.equal(storage.getItem(key), value);

  const storage2 = new MemoryStorage(original);
  const adapter2 = new api.PitchSyncAdapter({ storage: storage2 });
  await assert.rejects(adapter2.applyRemoteSnapshot(snapshot, {
    afterWrite() { storage2.setItem('pitchTrainerTestModeEnabled', 'false'); }
  }), /manifest_mismatch/);
  for (const [key, value] of Object.entries(original)) assert.equal(storage2.getItem(key), value);
});

test('validation failure happens before backup or any local write', async () => {
  const api = load();
  const storage = new MemoryStorage(richLegacy(api));
  let backups = 0;
  const adapter = new api.PitchSyncAdapter({
    storage, backupStore: { async save() { backups += 1; } }
  });
  await assert.rejects(adapter.applyRemoteSnapshot({ appId: 'pitch', schemaVersion: 2, records: [] }), /future_or_invalid/);
  assert.equal(storage.writes, 0);
  assert.equal(backups, 0);
});

test('backup and restore are scoped to durable Pitch data and never credentials', async () => {
  const api = load();
  const original = { ...richLegacy(api), pitchTrainerProData: null, soundCruiseProAuth: 'auth' };
  const storage = new MemoryStorage(original);
  const backup = await api.createBackup(storage);
  assert.deepEqual(Object.keys(backup.values).sort(), [...api.MANAGED_KEYS].sort());
  storage.setItem('pitchTrainerSettings', '{}');
  await api.restoreBackup(storage, backup);
  assert.equal(storage.getItem('pitchTrainerProData'), null);
  assert.equal(storage.getItem('soundCruiseProAuth'), 'auth');
});

test('Pitch apply rechecks local data after its asynchronous backup', async () => {
  const api = load();
  const storage = new MemoryStorage(richLegacy(api));
  const adapter = new api.PitchSyncAdapter({ storage, backupStore: { async save() {
    storage.setItem('pitchTrainerProAccidentalDisplay', 'sharp');
  } } });
  const previous = adapter.readLocalSnapshot();
  await assert.rejects(adapter.applyRemoteSnapshot(previous, { expectedSnapshot: previous }),
    (error) => error.code === 'local_changed_during_apply');
  assert.equal(storage.getItem('pitchTrainerProAccidentalDisplay'), 'sharp');
});

test('active Pitch membership plus Pitch app credential is the only data-plane authority', async () => {
  const api = load();
  const storage = new MemoryStorage(richLegacy(api));
  const adapter = new api.PitchSyncAdapter({ storage });
  const context = {
    membership: { appId: 'pitch', state: 'active' },
    appCredential: { appId: 'pitch', credential: 'scd1.device.secret' },
    accountCredential: 'sca1.account.secret'
  };
  assert.equal(adapter.assertDataPlaneContext(context), true);
  const first = await adapter.createInitialMigrationPlan(context);
  const retry = await adapter.createInitialMigrationPlan(context);
  assert.equal(first.manifestHash, retry.manifestHash);
  assert.equal(first.recordCount, retry.recordCount);
  assert.throws(() => adapter.assertDataPlaneContext({
    membership: { appId: 'pitch', state: 'active' }, accountCredential: 'sca1.account.secret'
  }), /app_credential_required/);
  assert.throws(() => adapter.assertDataPlaneContext({
    membership: { appId: 'chord', state: 'active' },
    appCredential: { appId: 'chord', credential: 'scd1.device.secret' }
  }), /membership_inactive/);
});

test('M9 wires Pitch data plane only into Pro while production admission stays Chord-only', () => {
  for (const edition of ['standard', 'beta']) {
    const html = fs.readFileSync(path.join(pitchRoot, edition, 'index.html'), 'utf8');
    assert.equal(html.includes('pitch-sync-adapter'), false);
    assert.equal(html.includes('sync-app-backup'), false);
  }
  const pro = fs.readFileSync(path.join(pitchRoot, 'pro_x9v7q2m8', 'index.html'), 'utf8');
  assert.equal(pro.includes('pitch-sync-adapter'), true);
  assert.equal(pro.includes('multi-app-sync-runtime'), true);
  assert.equal(pro.includes('__SOUND_CRUISE_MULTI_APP_SYNC__'), false);
  const config = fs.readFileSync(path.resolve(import.meta.dirname, '../../../workers/sound-cruise-sync/wrangler.jsonc'), 'utf8');
  assert.match(config, /"SYNC_ALLOWED_APP_IDS"\s*:\s*"chord"/u);
  assert.doesNotMatch(config, /"SYNC_ALLOWED_APP_IDS"\s*:\s*"[^"]*pitch/u);
});
