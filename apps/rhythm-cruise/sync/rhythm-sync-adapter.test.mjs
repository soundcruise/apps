import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {
  hashRecord as workerHashRecord, manifestHash as workerManifestHash,
  validateOperation as workerValidateOperation
} from '../../../workers/sound-cruise-sync/src/records.js';

const source = fs.readFileSync(path.join(import.meta.dirname, 'rhythm-sync-adapter.js'), 'utf8');
const rhythmRoot = path.resolve(import.meta.dirname, '..');

function load() {
  const context = vm.createContext({ crypto, TextEncoder, structuredClone, URL, console });
  vm.runInContext(source, context);
  return context.SoundCruiseRhythmSync;
}

class MemoryStorage {
  constructor(values = {}) {
    this.values = new Map(Object.entries(values));
    this.writes = 0;
    this.failAt = null;
  }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) {
    this.writes += 1;
    if (this.writes === this.failAt) throw new Error('synthetic_write_failure');
    this.values.set(key, String(value));
  }
  removeItem(key) { this.values.delete(key); }
}

function sampleStages(api) {
  return api.BUILTIN_SAMPLE_STAGES.map((sample) => ({
    version: 1, id: sample.legacyId, title: sample.title, description: sample.description,
    grid: sample.grid, timeSignature: sample.timeSignature, patternBars: sample.patternBars,
    bars: sample.bars, bpm: sample.bpm, zoom: 1, clickMode: sample.clickMode,
    rhythmFeel: sample.rhythmFeel, pattern: structuredClone(sample.pattern)
  }));
}

function customStage(id = 'rcs_custom_a', title = 'QA stage') {
  return {
    version: 1, id, title, description: 'synthetic', grid: 'eighth', timeSignature: '4/4',
    patternBars: 1, bars: 8, bpm: 96, zoom: 1.4, clickMode: 'downbeat', rhythmFeel: 'straight',
    pattern: Array.from({ length: 8 }, (_value, index) => ({
      hit: index % 3 !== 1, dir: index % 2 ? 'up' : 'down', type: index % 3 === 1 ? 'rest' : 'hit'
    }))
  };
}

function richLegacy(api) {
  const stage = customStage();
  return {
    rhythmCruiseSettings: JSON.stringify({
      threshold: 0.08, inputType: 'headphone', headphoneType: 'bluetooth',
      headphoneOffsetBluetoothMs: 180, androidBluetoothMicOffsetMs: -320,
      micProfiles: { bluetooth: { threshold: 0.08 } }, clickVolume: 35,
      lastCalibrationDelayMs: 190, tapHeight: 320, bars: 16, strokeDetectMode: 'chord',
      tapLayout: 'ud', tapUnified: false, inputMode: 'stroke', judgePreset: 'strict',
      rhythmProCustomStages: [...sampleStages(api), stage]
    }),
    'rhythmCruiseCreatePresets:v1': JSON.stringify([
      { id: 'rcpreset_a', stageN: 2, name: 'Same name', pattern: ['hit', 'rest'], dirs: ['down', null],
        patternBars: 1, bpm: 90, bars: 4, zoom: 1.5, balance: 60, createdAt: 10, updatedAt: 20 },
      { id: 'rcpreset_b', stageN: 2, name: 'Same name', pattern: ['hit', 'tie'], dirs: ['down', 'up'],
        patternBars: 1, bpm: 100, bars: 4, zoom: 1.2, balance: 40, createdAt: 11, updatedAt: 21 }
    ]),
    'rhythmCruiseCustomPresets:v1': JSON.stringify([
      { id: 'rccustpreset_a', name: 'Editor preset', settings: stage, balance: 65, createdAt: 12, updatedAt: 22 }
    ]),
    'rhythmCruiseStagePrefs:v1': JSON.stringify({ builtin: {
      1: { bpm: 92, bars: 6, zoom: 1.5 }, 2: { bpm: 70, bars: 4, zoom: 1.3 }
    } }),
    'rhythmCruiseClickSettings:v1': JSON.stringify({ range: 'alternateBars', beats: 'beats13', offbeat: true }),
    rhythmProCustomStageSamplesSeeded: '1',
    soundcruise_rhythm_mic_presets: JSON.stringify([{ id: 'preset_private', settings: { threshold: 0.1 } }]),
    soundcruise_rhythm_tap_presets: JSON.stringify([{ id: 'tap_private', tapOffsetMs: 210 }]),
    'rhythmCruiseVexZoom:v1': JSON.stringify({ create: 1.6, editor: 1.5, stage: 1.4 }),
    'rhythmCruiseResultHistory:v1': JSON.stringify([{ id: 'rh_private', summary: { score: 99 } }])
  };
}

test('empty, generated samples, device calibration and bounded session history are not meaningful cloud data', () => {
  const api = load();
  assert.equal(api.isMeaningfulLocalData({ schemaVersion: 0, values: {} }), false);
  assert.equal(api.isMeaningfulLocalData({ schemaVersion: 0, values: {
    rhythmCruiseSettings: JSON.stringify({ rhythmProCustomStages: sampleStages(api) }),
    rhythmProCustomStageSamplesSeeded: '1'
  } }), false);
  assert.equal(api.isMeaningfulLocalData({ schemaVersion: 0, values: {
    rhythmCruiseSettings: JSON.stringify({ threshold: 0.08, bluetoothMicOffsetMs: -200, clickVolume: 20 }),
    soundcruise_rhythm_mic_presets: '[{"id":"device"}]',
    'rhythmCruiseResultHistory:v1': '[{"id":"session"}]'
  } }), false);
});

test('legacy Rhythm data becomes deterministic typed records and Worker-compatible hashes', async () => {
  const api = load();
  const raw = { schemaVersion: 0, values: richLegacy(api) };
  const first = api.normalizeLocalSnapshot(raw);
  assert.deepEqual(first, api.normalizeLocalSnapshot(raw));
  assert.equal(api.isMeaningfulLocalData(raw), true);
  assert.deepEqual([...new Set(first.records.map((record) => record.recordType))].sort(), [
    'builtin_stage_preferences', 'create_preset', 'custom_preset', 'custom_stage',
    'preset_order', 'settings', 'stage_order'
  ]);
  const settings = first.records.find((record) => record.recordType === 'settings').payload.values;
  assert.deepEqual(JSON.parse(JSON.stringify(settings)), {
    tapLayout: 'ud', tapUnified: false, inputMode: 'stroke', judgePreset: 'strict',
    clickRange: 'alternateBars', clickBeats: 'beats13', clickOffbeat: true
  });
  assert.equal(JSON.stringify(first).includes('threshold'), false);
  assert.equal(JSON.stringify(first).includes('Calibration'), false);
  const serialized = await api.serializeRecords(first);
  for (const record of serialized) {
    const checked = await workerValidateOperation({
      operationId: '123e4567-e89b-52d3-a456-426614174000',
      ...record, baseRevision: 0, deleted: false
    }, crypto, 'rhythm');
    assert.equal(checked.ok, true, `${record.recordType}/${record.recordId}: ${JSON.stringify(checked)}`);
  }
  assert.equal(serialized[0].payloadHash, await workerHashRecord(serialized[0], crypto, 'rhythm'));
  assert.equal(await api.computeManifest(first), await workerManifestHash(serialized.map((record) => ({
    ...record, deletedAt: null
  })), 1, crypto, 'rhythm'));
});

test('same-name presets remain distinct because stable IDs never use display names', () => {
  const api = load();
  const snapshot = api.normalizeLocalSnapshot({ schemaVersion: 0, values: richLegacy(api) });
  const presets = snapshot.records.filter((record) => record.recordType === 'create_preset');
  assert.equal(presets.length, 2);
  assert.equal(presets[0].payload.name, presets[1].payload.name);
  assert.notEqual(presets[0].recordId, presets[1].recordId);
});

test('generated sample stages are excluded while an edited sample becomes a stable override', () => {
  const api = load();
  const stages = sampleStages(api);
  stages[0].bpm = 88;
  const first = api.normalizeLocalSnapshot({ schemaVersion: 0, values: {
    rhythmCruiseSettings: JSON.stringify({ rhythmProCustomStages: stages }), rhythmProCustomStageSamplesSeeded: '1'
  } });
  const override = first.records.find((record) => record.recordType === 'custom_stage');
  assert.equal(override.recordId, 'builtin:stage-override:triplet');
  assert.equal(override.payload.builtinKey, 'builtin:stage-sample:triplet');
  assert.deepEqual(first, api.normalizeLocalSnapshot({ schemaVersion: 0, values: {
    rhythmCruiseSettings: JSON.stringify({ rhythmProCustomStages: stages }), rhythmProCustomStageSamplesSeeded: '1'
  } }));
});

test('malformed JSON, future schema and dangling order references fail closed', () => {
  const api = load();
  assert.throws(() => api.normalizeLocalSnapshot({ schemaVersion: 0, values: { rhythmCruiseSettings: '{' } }), /json_invalid/);
  assert.throws(() => api.normalizeLocalSnapshot({ schemaVersion: 2, values: {} }), /future_version/);
  assert.throws(() => api.validateSnapshot({ appId: 'rhythm', schemaVersion: 1, records: [{
    recordType: 'stage_order', recordId: 'stages', schemaVersion: 1,
    payload: { id: 'stages', stageRefs: ['legacy:stage:missing'] }
  }] }), /reference_invalid/);
  const overlong = `legacy:stage:${'x'.repeat(188)}`;
  const { id: _legacyId, ...stage } = customStage();
  assert.throws(() => api.validateSnapshot({ appId: 'rhythm', schemaVersion: 1, records: [{
    recordType: 'custom_stage', recordId: overlong, schemaVersion: 1,
    payload: { id: overlong, legacyId: 'x', ...stage }
  }] }), /record_invalid/);
});

test('settings merge is field-level and overlapping disagreement is explicit conflict', () => {
  const api = load();
  const snapshot = (values) => ({ appId: 'rhythm', schemaVersion: 1, records: [{
    recordType: 'settings', recordId: 'settings', schemaVersion: 1, payload: { id: 'settings', values }
  }] });
  let merged = api.mergeSnapshots(snapshot({ tapLayout: 'ud' }), snapshot({ judgePreset: 'strict' }));
  assert.equal(merged.conflicts.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(merged.snapshot.records[0].payload.values)), { tapLayout: 'ud', judgePreset: 'strict' });
  merged = api.mergeSnapshots(snapshot({ judgePreset: 'easy' }), snapshot({ judgePreset: 'strict' }));
  assert.deepEqual(JSON.parse(JSON.stringify(merged.conflicts)), [
    { recordKey: 'settings/settings', field: 'judgePreset', reason: 'settings_field_conflict' }
  ]);
});

test('timestamp-only preset differences merge, but semantic edits and overlapping ordering conflict', () => {
  const api = load();
  const base = api.normalizeLocalSnapshot({ schemaVersion: 0, values: richLegacy(api) });
  const timestamps = structuredClone(base);
  timestamps.records.find((record) => record.recordType === 'create_preset').payload.updatedAt = 99;
  assert.equal(api.mergeSnapshots(base, timestamps).conflicts.length, 0);
  const changed = structuredClone(base);
  changed.records.find((record) => record.recordType === 'custom_stage' && !record.payload.builtinKey).payload.bpm = 130;
  assert(api.mergeSnapshots(base, changed).conflicts.some((entry) => entry.reason === 'semantic_conflict'));
  const reordered = structuredClone(base);
  reordered.records.find((record) => record.recordType === 'stage_order').payload.stageRefs.reverse();
  assert(api.mergeSnapshots(base, reordered).conflicts.some((entry) => entry.reason === 'ordering_conflict'));
});

test('empty/cloud and cloud/empty migration merge retain the meaningful side', () => {
  const api = load();
  const empty = { appId: 'rhythm', schemaVersion: 1, records: [] };
  const rich = api.normalizeLocalSnapshot({ schemaVersion: 0, values: richLegacy(api) });
  for (const result of [api.mergeSnapshots(empty, rich), api.mergeSnapshots(rich, empty)]) {
    assert.equal(result.conflicts.length, 0);
    assert.equal(result.snapshot.records.length, rich.records.length);
  }
});

test('remote apply preserves every device-specific key and local latency while round-tripping manifest', async () => {
  const api = load();
  const target = richLegacy(api);
  const storage = new MemoryStorage({ ...target, soundCruiseProAuth: 'must-survive' });
  const snapshot = api.normalizeLocalSnapshot({ schemaVersion: 0, values: richLegacy(api) });
  const backups = [];
  const result = await new api.RhythmSyncAdapter({
    storage, backupStore: { async save(value) { backups.push(value); } }
  }).applyRemoteSnapshot(snapshot);
  assert.equal(result.ok, true);
  assert.equal(backups.length, 1);
  const appliedSettings = JSON.parse(storage.getItem('rhythmCruiseSettings'));
  assert.equal(appliedSettings.androidBluetoothMicOffsetMs, -320);
  assert.equal(appliedSettings.threshold, 0.08);
  assert.equal(storage.getItem('soundcruise_rhythm_mic_presets'), target.soundcruise_rhythm_mic_presets);
  assert.equal(storage.getItem('soundcruise_rhythm_tap_presets'), target.soundcruise_rhythm_tap_presets);
  assert.equal(storage.getItem('rhythmCruiseResultHistory:v1'), target['rhythmCruiseResultHistory:v1']);
  assert.equal(storage.getItem('soundCruiseProAuth'), 'must-survive');
  assert.equal(JSON.stringify(backups).includes('soundCruiseProAuth'), false);
  assert.equal(await api.computeManifest(api.normalizeLocalSnapshot(api.readLocalSnapshot(storage))),
    await api.computeManifest(snapshot));
});

test('mid-write failure and manifest mismatch roll back all managed keys', async () => {
  const api = load();
  const original = richLegacy(api);
  const snapshot = api.normalizeLocalSnapshot({ schemaVersion: 0, values: original });
  for (const mode of ['write', 'manifest']) {
    const storage = new MemoryStorage(original);
    const before = new Map(storage.values);
    if (mode === 'write') storage.failAt = 3;
    const adapter = new api.RhythmSyncAdapter({ storage });
    await assert.rejects(adapter.applyRemoteSnapshot(snapshot, mode === 'manifest' ? {
      afterWrite() { storage.setItem('rhythmCruiseClickSettings:v1', '{}'); }
    } : {}));
    assert.deepEqual([...storage.values], [...before]);
  }
});

test('validation fails before backup or any local write', async () => {
  const api = load();
  const storage = new MemoryStorage();
  let backups = 0;
  await assert.rejects(new api.RhythmSyncAdapter({
    storage, backupStore: { async save() { backups += 1; } }
  }).applyRemoteSnapshot({ appId: 'rhythm', schemaVersion: 1, records: [{
    recordType: 'custom_stage', recordId: 'bad', schemaVersion: 1, payload: { id: 'bad' }
  }] }), /record_invalid/);
  assert.equal(backups, 0);
  assert.equal(storage.writes, 0);
});

test('backup scope contains only managed Rhythm data and never credentials or excluded device data', async () => {
  const api = load();
  const storage = new MemoryStorage({ ...richLegacy(api), deviceCredential: 'scd1.secret', soundCruiseProAuth: 'auth' });
  const backups = [];
  await new api.RhythmSyncAdapter({ storage, backupStore: { async save(value) { backups.push(value); } } }).createBackup();
  assert.equal(backups[0].appId, 'rhythm');
  assert.deepEqual(Object.keys(backups[0].values).sort(), [...api.MANAGED_KEYS].sort());
  assert.equal(JSON.stringify(backups).includes('deviceCredential'), false);
  assert.equal(JSON.stringify(backups).includes('mic_presets'), false);
});

test('only active Rhythm membership plus Rhythm app credential can create retry-stable migration plan', async () => {
  const api = load();
  const storage = new MemoryStorage(richLegacy(api));
  const adapter = new api.RhythmSyncAdapter({ storage });
  const valid = { membership: { appId: 'rhythm', state: 'active' },
    appCredential: { appId: 'rhythm', credential: 'scd1.opaque' } };
  const first = await adapter.createInitialMigrationPlan(valid);
  const second = await adapter.createInitialMigrationPlan(valid);
  assert.deepEqual(first, second);
  assert.equal(first.meaningful, true);
  assert.throws(() => adapter.assertDataPlaneContext({ ...valid, membership: { appId: 'rhythm', state: 'pending' } }), /inactive/);
  assert.throws(() => adapter.assertDataPlaneContext({ ...valid, appCredential: { appId: 'pitch', credential: 'scd1.opaque' } }), /required/);
  assert.throws(() => adapter.assertDataPlaneContext({ membership: valid.membership, accountCredential: 'sca1.opaque' }), /required/);
});

test('M9 wires Rhythm data plane only into Pro while production admission stays Chord-only', () => {
  const standard = fs.readFileSync(path.join(rhythmRoot, 'standard', 'index.html'), 'utf8');
  assert.equal(standard.includes('rhythm-sync-adapter.js'), false);
  assert.equal(standard.includes('sync-app-backup.js'), false);
  const pro = fs.readFileSync(path.join(rhythmRoot, 'pro_r4m8k7n2q9x', 'index.html'), 'utf8');
  assert.equal(pro.includes('rhythm-sync-adapter.js'), true);
  assert.equal(pro.includes('multi-app-sync-runtime.js'), true);
  assert.equal(pro.includes('__SOUND_CRUISE_MULTI_APP_SYNC__'), false);
  const config = fs.readFileSync(path.resolve(import.meta.dirname, '../../../workers/sound-cruise-sync/wrangler.jsonc'), 'utf8');
  assert.match(config, /"SYNC_ALLOWED_APP_IDS"\s*:\s*"chord"/u);
  assert.equal(config.includes('chord,rhythm'), false);
});
