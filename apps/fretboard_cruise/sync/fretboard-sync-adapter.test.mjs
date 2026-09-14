import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {
  hashRecord as workerHashRecord, manifestHash as workerManifestHash,
  validateOperation as workerValidateOperation
} from '../../../workers/sound-cruise-sync/src/records.js';

const source = fs.readFileSync(path.join(import.meta.dirname, 'fretboard-sync-adapter.js'), 'utf8');
const appSource = fs.readFileSync(path.resolve(import.meta.dirname, '../script.js'), 'utf8');
const fretboardRoot = path.resolve(import.meta.dirname, '..');

function load() {
  const context = vm.createContext({ crypto, TextEncoder, structuredClone, URL, console });
  vm.runInContext(source, context);
  return context.SoundCruiseFretboardSync;
}

class MemoryStorage {
  constructor(values = {}) { this.values = new Map(Object.entries(values)); this.writes = 0; this.failAt = null; }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) {
    this.writes += 1;
    if (this.writes === this.failAt) throw new Error('synthetic_write_failure');
    this.values.set(key, String(value));
  }
  removeItem(key) { this.values.delete(key); }
}

function legacy(state) {
  return { schemaVersion: 0, values: { fretboard_cruise_state: JSON.stringify(state) } };
}

function shipped(name) {
  const match = appSource.match(new RegExp(`const ${name} = JSON\\.parse\\(\\s*'([^']*)'\\s*\\);`));
  assert(match, name);
  return JSON.parse(match[1]);
}

function builtins(api) {
  const quizStageEditorSettings = {};
  for (let stage = 1; stage <= 6; stage += 1) {
    quizStageEditorSettings[String(stage)] = { groups: structuredClone(api.BUILTIN_QUIZ_GROUPS[stage]) };
  }
  const cruiseStageRoutes = {};
  const cruiseStageRouteGroups = {};
  for (let stage = 1; stage <= 6; stage += 1) {
    cruiseStageRoutes[String(stage)] = shipped(`SHIPPED_DEFAULT_STAGE_${stage}_ROUTE_SLOTS`);
    cruiseStageRouteGroups[String(stage)] = shipped(`SHIPPED_DEFAULT_STAGE_${stage}_ROUTE_GROUP_BREAKS`);
  }
  return { cruiseStageRoutes, cruiseStageRouteGroups, quizStageEditorSettings };
}

function routeStage(id, name = 'Same name', fret = 3) {
  return {
    id, name, key: 0, capo: 0, scale: 'major', displayMode: 'solfege', doMode: 'movable', maxFret: 12,
    route: [{ stringName: 6, fret }, { stringName: 5, fret: 2 }], groupBreaks: [0, 1],
    groupNames: ['Gr.1', 'Gr.2'], groupScrollLefts: { 0: 123, 1: 456 }
  };
}

function quizStage(id, name = 'Quiz') {
  return {
    id, name, key: 2, capo: 1, scale: 'dorian', displayMode: 'note', doMode: 'fixed', maxFret: 18,
    groups: [{ name: 'Group', notes: [{ stringName: 1, fret: 5 }], scrollLeft: 321 }]
  };
}

function longTermState(api) {
  const generated = builtins(api);
  generated.cruiseStageRoutes['2'] = [{ stringName: 6, fret: 12 }, { stringName: 5, fret: 10 }];
  generated.cruiseStageRouteGroups['2'] = [0, 1];
  generated.quizStageEditorSettings['3'] = {
    groups: [{ notes: [{ stringName: 1, fret: 12 }], scrollLeft: 777 }]
  };
  return {
    course: 'memorize',
    memorize: { currentQuestion: { answer: 'private-runtime' }, correct: 42, combo: 8, cruiseIndex: 9 },
    visualize: { key: 9, selectedChordIndex: 4 },
    rules: { step: 4, page: 2, completedSteps: { 1: true, 2: true, 4: true }, step5ExcludedSlots: { x: true } },
    routeEditor: { draft: [{ stringName: 2, fret: 9 }], history: [{ draft: ['undo-private'] }], selectedGroupIndex: 3 },
    quizEditor: { groups: [{ notes: [{ stringName: 3, fret: 7 }], scrollLeft: 888 }], history: ['undo-private'] },
    proCustomRouteEditor: { draft: [{ stringName: 4, fret: 8 }], history: ['draft-history'], editingStageId: 'pcs_a' },
    proCustomQuizEditor: { groups: [{ notes: [{ stringName: 5, fret: 9 }] }], history: ['draft-history'] },
    quizEditorPreview: { stage: 2, groups: [{ notes: [{ stringName: 1, fret: 1 }] }] },
    settings: {
      ...generated, tempo: 96, quizTimeLimit: 6, quizQuestionLimit: 15,
      quizCountdownSound: 'hat', noteLabelMode: 'degree', cruiseLoopCount: 3,
      cruiseShowNoteNames: false, cruiseProgression: 'tap', cruiseTapBeats: 'full',
      cruiseRhythmSoundType: 'soft',
      cruiseProCustomStages: [routeStage('pcs_a'), routeStage('pcs_b', 'Same name', 5)],
      quizProCustomStages: [quizStage('pcs_q')], cruiseProCustomStage: null,
      cruiseStageClearCounts: { 1: 7, 2: 4 }, quizStageAttemptCounts: { 1: 12 },
      quizStagePerfectCounts: { 1: 3 }, cruiseStageGroupScrollLefts: { 2: { 0: 654 } },
      stringSpacing: 130, viewMode: 'custom', rotation: { x: 8, y: 9, z: 10 },
      perspective: 41, perspOriginX: 61, fretboardView: 'zoom', fretboardViewAutoOrientation: true,
      bluetoothRhythmAssistLevel: 'high', cruiseConfirmSoundTiming: 'rhythm',
      cruiseRhythmVolume: 0.11, cruiseRhythmKickVolume: 0.22,
      cruiseRhythmSnareVolume: 0.33, cruiseRhythmHatVolume: 0.44,
      lastSettingsTab: 'quiz', routeNumberingVersion: 2, neckModelVersion: 4
    },
    unknownFutureLocalField: { keep: true }
  };
}

test('field inventory classifies every major Fretboard state family before extraction', () => {
  const api = load();
  assert.deepEqual(Object.keys(api.FIELD_CLASSIFICATION).sort(), [
    'authSecurity', 'builtIn', 'deviceSpecific', 'editorDraft', 'ephemeral', 'recommended', 'required'
  ]);
  assert(api.FIELD_CLASSIFICATION.required.includes('settings.cruiseProCustomStages'));
  assert(api.FIELD_CLASSIFICATION.editorDraft.includes('proCustomQuizEditor'));
  assert(api.FIELD_CLASSIFICATION.deviceSpecific.includes('settings.cruiseStageGroupScrollLefts'));
});

test('empty, shipped defaults, UI state, device settings and unsaved drafts are not meaningful', () => {
  const api = load();
  assert.equal(api.isMeaningfulLocalData({ schemaVersion: 0, values: {} }), false);
  const state = {
    course: 'visualize', memorize: { correct: 99 }, routeEditor: { draft: [{ stringName: 1, fret: 2 }] },
    rules: { step: 2 }, settings: {
      ...builtins(api), stringSpacing: 140, fretboardView: 'zoom', bluetoothRhythmAssistLevel: 'high',
      cruiseStageGroupScrollLefts: { 1: { 0: 400 } }, cruiseProCustomStages: [], quizProCustomStages: []
    }
  };
  assert.equal(api.isMeaningfulLocalData(legacy(state)), false);
});

test('long-term state extracts deterministic typed durable records and excludes private runtime fields', () => {
  const api = load();
  const raw = legacy(longTermState(api));
  const first = api.normalizeLocalSnapshot(raw);
  assert.deepEqual(first, api.normalizeLocalSnapshot(raw));
  assert.deepEqual([...new Set(first.records.map((record) => record.recordType))].sort(), [
    'builtin_quiz_override', 'builtin_route_override', 'custom_quiz', 'custom_route',
    'progress', 'settings', 'stage_order'
  ]);
  assert.equal(first.records.filter((record) => record.recordType === 'custom_route').length, 2);
  assert.equal(first.records.filter((record) => record.recordType === 'progress').length, 4);
  const json = JSON.stringify(first);
  for (const excluded of ['private-runtime', 'undo-private', 'draft-history', 'stringSpacing',
    'bluetoothRhythmAssistLevel', 'scrollLeft', 'unknownFutureLocalField']) assert.equal(json.includes(excluded), false, excluded);
});

test('shipped payloads are omitted while saved official edits become stable built-in overrides', () => {
  const api = load();
  const state = { settings: { ...builtins(api), cruiseProCustomStages: [], quizProCustomStages: [] } };
  assert.equal(api.normalizeLocalSnapshot(legacy(state)).records.length, 0);
  state.settings.cruiseStageRoutes['1'][0].fret = 4;
  state.settings.quizStageEditorSettings['1'].groups[0].notes[0].fret = 2;
  const snapshot = api.normalizeLocalSnapshot(legacy(state));
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot.records.map((record) => record.recordId))), [
    'builtin:quiz-stage:1', 'builtin:route-stage:1'
  ]);
});

test('existing IDs survive rename and same-name stages remain distinct', () => {
  const api = load();
  const state = { settings: { cruiseProCustomStages: [routeStage('pcs_a'), routeStage('pcs_b')], quizProCustomStages: [] } };
  const before = api.normalizeLocalSnapshot(legacy(state));
  state.settings.cruiseProCustomStages[0].name = 'Renamed';
  const after = api.normalizeLocalSnapshot(legacy(state));
  const beforeIds = before.records.filter((record) => record.recordType === 'custom_route').map((record) => record.recordId);
  const afterIds = after.records.filter((record) => record.recordType === 'custom_route').map((record) => record.recordId);
  assert.deepEqual(beforeIds, afterIds);
  assert.notEqual(beforeIds[0], beforeIds[1]);
});

test('legacy singular custom route migrates deterministically without duplicating its array copy', () => {
  const api = load();
  const singular = routeStage('pcs_legacy', 'Legacy route');
  const singularOnly = api.normalizeLocalSnapshot(legacy({ settings: {
    cruiseProCustomStage: singular, cruiseProCustomStages: [], quizProCustomStages: []
  } }));
  assert.equal(singularOnly.records.filter((record) => record.recordType === 'custom_route').length, 1);
  assert.equal(singularOnly.records.find((record) => record.recordType === 'custom_route').recordId,
    'legacy:route-stage:pcs_legacy');

  const alreadyMigrated = api.normalizeLocalSnapshot(legacy({ settings: {
    cruiseProCustomStage: singular, cruiseProCustomStages: [structuredClone(singular)], quizProCustomStages: []
  } }));
  assert.equal(alreadyMigrated.records.filter((record) => record.recordType === 'custom_route').length, 1);
  assert.deepEqual(alreadyMigrated, api.normalizeLocalSnapshot(legacy({ settings: {
    cruiseProCustomStage: singular, cruiseProCustomStages: [structuredClone(singular)], quizProCustomStages: []
  } })));
});

test('missing and duplicate legacy IDs receive stable distinct IDs that survive apply round-trip', async () => {
  const api = load();
  const first = routeStage(null, 'Same legacy route');
  const second = structuredClone(first);
  second.groupScrollLefts = { 0: 777 };
  const duplicateIdA = quizStage('pcs_duplicate', 'Duplicate legacy quiz');
  const duplicateIdB = structuredClone(duplicateIdA);
  duplicateIdB.groups[0].scrollLeft = 888;
  const state = { settings: {
    cruiseProCustomStage: null, cruiseProCustomStages: [first, second],
    quizProCustomStages: [duplicateIdA, duplicateIdB]
  } };
  const snapshot = api.normalizeLocalSnapshot(legacy(state));
  const routeRecords = snapshot.records.filter((record) => record.recordType === 'custom_route');
  const quizRecords = snapshot.records.filter((record) => record.recordType === 'custom_quiz');
  assert.equal(new Set(routeRecords.map((record) => record.recordId)).size, 2);
  assert.equal(new Set(quizRecords.map((record) => record.recordId)).size, 2);
  assert.deepEqual(snapshot, api.normalizeLocalSnapshot(legacy(structuredClone(state))));

  const storage = new MemoryStorage({ fretboard_cruise_state: JSON.stringify(state) });
  await new api.FretboardSyncAdapter({ storage }).applyRemoteSnapshot(snapshot);
  const applied = JSON.parse(storage.getItem('fretboard_cruise_state'));
  assert.equal(applied.settings.cruiseProCustomStages[1].groupScrollLefts['0'], 777);
  assert.equal(applied.settings.quizProCustomStages[1].groups[0].scrollLeft, 888);
  assert.equal(await api.computeManifest(api.readLocalSnapshot(storage)), await api.computeManifest(snapshot));
});

test('partial legacy works while malformed JSON, future schema and dangling references fail closed', () => {
  const api = load();
  assert.equal(api.isMeaningfulLocalData(legacy({ settings: { tempo: 80 } })), true);
  assert.throws(() => api.normalizeLocalSnapshot({ schemaVersion: 0, values: { fretboard_cruise_state: '{' } }), /json_invalid/);
  assert.throws(() => api.normalizeLocalSnapshot({ schemaVersion: 2, values: {} }), /future_version/);
  assert.throws(() => api.normalizeLocalSnapshot(legacy({ settings: { cruiseProCustomStages: {} } })), /custom_route_invalid/);
  assert.throws(() => api.validateSnapshot({ appId: 'fretboard', schemaVersion: 1, records: [{
    recordType: 'stage_order', recordId: 'route', schemaVersion: 1,
    payload: { id: 'route', category: 'route', stageRefs: ['legacy:route-stage:missing'] }
  }] }), /reference_invalid/);
  for (const record of [
    { recordType: 'settings', recordId: 'settings', schemaVersion: 1,
      payload: { id: 'settings', values: {} } },
    { recordType: 'stage_order', recordId: 'route', schemaVersion: 1,
      payload: { id: 'route', category: 'route', stageRefs: [] } },
    { recordType: 'progress', recordId: 'rules', schemaVersion: 1,
      payload: { id: 'rules', category: 'rules', completedSteps: [] } },
    { recordType: 'progress', recordId: 'route:builtin:route-stage:1', schemaVersion: 1,
      payload: { id: 'route:builtin:route-stage:1', category: 'route',
        stageRef: 'builtin:route-stage:1', clearCount: 0 } }
  ]) {
    assert.throws(() => api.validateSnapshot({ appId: 'fretboard', schemaVersion: 1, records: [record] }),
      /record_invalid/);
  }
});

test('serialization and manifest are deterministic and Worker-compatible', async () => {
  const api = load();
  const snapshot = api.normalizeLocalSnapshot(legacy(longTermState(api)));
  const serialized = await api.serializeRecords(snapshot);
  for (const record of serialized) {
    const checked = await workerValidateOperation({
      operationId: '123e4567-e89b-52d3-a456-426614174000', ...record,
      baseRevision: 0, deleted: false
    }, crypto, 'fretboard');
    assert.equal(checked.ok, true, `${record.recordType}/${record.recordId}: ${JSON.stringify(checked)}`);
  }
  assert.equal(serialized[0].payloadHash, await workerHashRecord(serialized[0], crypto, 'fretboard'));
  assert.equal(await api.computeManifest(snapshot), await workerManifestHash(serialized.map((record) => ({
    ...record, deletedAt: null
  })), 1, crypto, 'fretboard'));
  assert.equal(await api.computeManifest(snapshot), await api.computeManifest({ ...snapshot, records: snapshot.records.slice().reverse() }));
});

test('settings merge is field-level and overlapping disagreement is explicit', () => {
  const api = load();
  const snapshot = (values) => ({ appId: 'fretboard', schemaVersion: 1, records: [{
    recordType: 'settings', recordId: 'settings', schemaVersion: 1, payload: { id: 'settings', values }
  }] });
  let result = api.mergeSnapshots(snapshot({ tempo: 90 }), snapshot({ quizTimeLimit: 8 }));
  assert.equal(result.conflicts.length, 0);
  result = api.mergeSnapshots(snapshot({ tempo: 90 }), snapshot({ tempo: 100 }));
  assert.deepEqual(JSON.parse(JSON.stringify(result.conflicts)), [
    { recordKey: 'settings/settings', field: 'tempo', reason: 'settings_field_conflict' }
  ]);
});

test('progress uses maxima and rule completion union rather than clock-based LWW', () => {
  const api = load();
  const route = (count) => ({ appId: 'fretboard', schemaVersion: 1, records: [
    { recordType: 'progress', recordId: 'route:builtin:route-stage:1', schemaVersion: 1,
      payload: { id: 'route:builtin:route-stage:1', category: 'route', stageRef: 'builtin:route-stage:1', clearCount: count } },
    { recordType: 'progress', recordId: 'rules', schemaVersion: 1,
      payload: { id: 'rules', category: 'rules', completedSteps: count > 2 ? [1, 3] : [1, 2] } }
  ] });
  const result = api.mergeSnapshots(route(2), route(5));
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.snapshot.records.find((record) => record.recordId.startsWith('route:')).payload.clearCount, 5);
  assert.deepEqual(JSON.parse(JSON.stringify(result.snapshot.records.find((record) => record.recordId === 'rules').payload.completedSteps)), [1, 2, 3]);
});

test('different edits to one custom item conflict and compatible/disagreeing orders are detected', () => {
  const api = load();
  const base = api.normalizeLocalSnapshot(legacy({ settings: {
    cruiseProCustomStages: [routeStage('pcs_a'), routeStage('pcs_b')], quizProCustomStages: []
  } }));
  const changed = structuredClone(base);
  changed.records.find((record) => record.recordType === 'custom_route').payload.route[0].fret = 11;
  assert(api.mergeSnapshots(base, changed).conflicts.some((entry) => entry.reason === 'semantic_conflict'));
  const reordered = structuredClone(base);
  reordered.records.find((record) => record.recordType === 'stage_order').payload.stageRefs.reverse();
  assert(api.mergeSnapshots(base, reordered).conflicts.some((entry) => entry.reason === 'ordering_conflict'));
});

test('empty/cloud migration merge retains the meaningful side', () => {
  const api = load();
  const empty = { appId: 'fretboard', schemaVersion: 1, records: [] };
  const rich = api.normalizeLocalSnapshot(legacy(longTermState(api)));
  for (const result of [api.mergeSnapshots(empty, rich), api.mergeSnapshots(rich, empty)]) {
    assert.equal(result.conflicts.length, 0);
    assert.equal(result.snapshot.records.length, rich.records.length);
  }
});

test('remote apply replaces only durable slices and preserves local UI, drafts, unknown fields and device values', async () => {
  const api = load();
  const local = longTermState(api);
  const remote = longTermState(api);
  remote.settings.tempo = 120;
  remote.settings.cruiseProCustomStages = [routeStage('pcs_remote', 'Remote')];
  remote.routeEditor.draft = [{ stringName: 1, fret: 24 }];
  const storage = new MemoryStorage({ fretboard_cruise_state: JSON.stringify(local), soundCruiseProAuth: 'must-survive' });
  const snapshot = api.normalizeLocalSnapshot(legacy(remote));
  const backups = [];
  const result = await new api.FretboardSyncAdapter({ storage, backupStore: { async save(value) { backups.push(value); } } })
    .applyRemoteSnapshot(snapshot);
  assert.equal(result.ok, true);
  const applied = JSON.parse(storage.getItem('fretboard_cruise_state'));
  assert.equal(applied.settings.tempo, 120);
  assert.equal(applied.settings.stringSpacing, 130);
  assert.deepEqual(applied.routeEditor, local.routeEditor);
  assert.deepEqual(applied.memorize, local.memorize);
  assert.deepEqual(applied.unknownFutureLocalField, { keep: true });
  assert.equal(applied.settings.cruiseStageGroupScrollLefts['2']['0'], 654);
  assert.equal(applied.settings.quizStageEditorSettings['3'].groups[0].scrollLeft, 777);
  assert.equal(applied.settings.cruiseProCustomStages[0].id, 'pcs_remote');
  assert.equal(storage.getItem('soundCruiseProAuth'), 'must-survive');
  assert.equal(JSON.stringify(backups).includes('soundCruiseProAuth'), false);
  assert.equal(await api.computeManifest(api.readLocalSnapshot(storage)), await api.computeManifest(snapshot));
});

test('remote omission clears durable content while local-only state and quiz scroll positions survive', async () => {
  const api = load();
  const local = longTermState(api);
  const storage = new MemoryStorage({ fretboard_cruise_state: JSON.stringify(local) });
  await new api.FretboardSyncAdapter({ storage }).applyRemoteSnapshot({ appId: 'fretboard', schemaVersion: 1, records: [] });
  const applied = JSON.parse(storage.getItem('fretboard_cruise_state'));
  assert.deepEqual(applied.settings.cruiseProCustomStages, []);
  assert.deepEqual(applied.settings.quizProCustomStages, []);
  assert.deepEqual(applied.settings.cruiseStageRoutes, {});
  assert.equal(applied.settings.quizStageEditorSettings['3'].groups[0].scrollLeft, 777);
  assert.deepEqual(applied.proCustomRouteEditor, local.proCustomRouteEditor);
  assert.equal(api.isMeaningfulLocalData(api.readLocalSnapshot(storage)), false);
});

test('write failure and verification mismatch restore the exact giant legacy state', async () => {
  const api = load();
  const original = JSON.stringify(longTermState(api));
  const snapshot = api.normalizeLocalSnapshot(legacy(longTermState(api)));
  for (const mode of ['write', 'manifest']) {
    const storage = new MemoryStorage({ fretboard_cruise_state: original });
    if (mode === 'write') storage.failAt = 1;
    await assert.rejects(new api.FretboardSyncAdapter({ storage }).applyRemoteSnapshot(snapshot, mode === 'manifest' ? {
      afterWrite() {
        const changed = JSON.parse(storage.getItem('fretboard_cruise_state'));
        changed.settings.tempo = 199;
        storage.setItem('fretboard_cruise_state', JSON.stringify(changed));
      }
    } : {}));
    assert.equal(storage.getItem('fretboard_cruise_state'), original);
  }
});

test('invalid remote fails before backup or local write', async () => {
  const api = load();
  const storage = new MemoryStorage();
  let backups = 0;
  await assert.rejects(new api.FretboardSyncAdapter({
    storage, backupStore: { async save() { backups += 1; } }
  }).applyRemoteSnapshot({ appId: 'fretboard', schemaVersion: 1, records: [{
    recordType: 'custom_route', recordId: 'bad', schemaVersion: 1, payload: { id: 'bad' }
  }] }), /record_invalid/);
  assert.equal(backups, 0);
  assert.equal(storage.writes, 0);
});

test('backup is Fretboard-namespaced, exact and excludes credentials stored outside app state', async () => {
  const api = load();
  const original = JSON.stringify(longTermState(api));
  const storage = new MemoryStorage({ fretboard_cruise_state: original, deviceCredential: 'scd1.secret', soundCruiseProAuth: 'auth' });
  const backups = [];
  const adapter = new api.FretboardSyncAdapter({ storage, backupStore: { async save(value) { backups.push(value); } } });
  const backup = await adapter.createBackup();
  assert.equal(backups[0].appId, 'fretboard');
  assert.deepEqual(Object.keys(backups[0].values), ['fretboard_cruise_state']);
  assert.equal(JSON.stringify(backups).includes('deviceCredential'), false);
  storage.setItem('fretboard_cruise_state', '{}');
  await adapter.restoreBackup(backup);
  assert.equal(storage.getItem('fretboard_cruise_state'), original);
});

test('only active Fretboard membership and Fretboard app credential authorize migration planning', async () => {
  const api = load();
  const adapter = new api.FretboardSyncAdapter({ storage: new MemoryStorage({
    fretboard_cruise_state: JSON.stringify(longTermState(api))
  }) });
  const valid = { membership: { appId: 'fretboard', state: 'active' },
    appCredential: { appId: 'fretboard', credential: 'scd1.opaque' } };
  assert.deepEqual(await adapter.createInitialMigrationPlan(valid), await adapter.createInitialMigrationPlan(valid));
  assert.throws(() => adapter.assertDataPlaneContext({ ...valid, membership: { appId: 'fretboard', state: 'pending' } }), /inactive/);
  assert.throws(() => adapter.assertDataPlaneContext({ ...valid, appCredential: { appId: 'rhythm', credential: 'scd1.opaque' } }), /required/);
  assert.throws(() => adapter.assertDataPlaneContext({ membership: valid.membership, accountCredential: 'sca1.opaque' }), /required/);
});

test('M7 adapter is absent from shipped Fretboard HTML and production admission remains Chord-only', () => {
  for (const edition of ['standard', 'pro_a9f4k7q2m8z']) {
    const html = fs.readFileSync(path.join(fretboardRoot, edition, 'index.html'), 'utf8');
    assert.equal(html.includes('fretboard-sync-adapter.js'), false);
    assert.equal(html.includes('sync-app-backup.js'), false);
  }
  const config = fs.readFileSync(path.resolve(import.meta.dirname, '../../../workers/sound-cruise-sync/wrangler.jsonc'), 'utf8');
  assert.match(config, /"SYNC_ALLOWED_APP_IDS"\s*:\s*"chord"/u);
  assert.equal(config.includes('chord,fretboard'), false);
});
