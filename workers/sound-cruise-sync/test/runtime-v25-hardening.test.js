// Shared runtime v25, end to end on the real Worker (SQLite D1), the real shared runtime and the real adapters:
// 1. Port: an interrupted first migration resumes even when a record this device pushed is gone locally
//    without a deletion intent (hydrated, never deleted); a journaled deletion still tombstones.
// 2. Pitch / Fretboard / Rhythm: a whole-record "remote" choice on a settings conflict that has a field
//    plan is refused and cleared (it could never be verified), so it no longer retries on every start.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readStorageValue, acceptStorageValues } from '../../../apps/cruise-port/storage-conflict.js';
import { APPS, device, world } from './theme-compat-harness.js';

APPS.port = { current: 'cruise-port/port-sync-adapter.js', root: 'SoundCruisePortSync', name: 'PortSyncAdapter' };

const PORT = () => ({
  'cruisePort.settings': JSON.stringify({ version: 3, displaySize: 'small' }),
  'cruisePort.metronome': JSON.stringify({ version: 3, bpm: 96 }),
  'cruisePort.tuner': JSON.stringify({ version: 1, referenceHz: 442 }),
  'cruisePort.metronomePresets': JSON.stringify({ version: 1, items: [{ id: 'preset-b', name: 'B' }, { id: 'preset-a', name: 'A' }] }),
  'cruisePort.practiceCalendar': JSON.stringify({ version: 2, notes: [{ id: 'calendar-1', text: 'one' }, { id: 'calendar-2', text: 'two' }] }),
  'cruisePort.practiceMenus': JSON.stringify({ version: 3, items: [{ id: 'menu-b', name: 'B' }, { id: 'menu-a', name: 'A' }] }),
  'cruisePort.practiceProgress': JSON.stringify({ version: 2, cycleId: 'cycle-1' }),
  'cruisePort.practiceHistory': JSON.stringify({ version: 4, events: [
    { id: 'history-1', type: 'practice-completed', timestamp: '2026-09-01T00:00:00.000Z' },
    { id: 'history-2', type: 'practice-completed', timestamp: '2026-09-02T00:00:00.000Z' }] }),
  'cruisePort.gearCategories': JSON.stringify({ version: 1, categories: [{ id: 'category-b', name: 'B' }, { id: 'category-a', name: 'A' }] }),
  'cruisePort.gearList': JSON.stringify({ version: 4, items: [
    { id: 'gear-b', name: 'B', status: 'owned', order: 0 }, { id: 'gear-a', name: 'A', status: 'wishlist', order: 0 }] }),
  'cruisePort.myApps': JSON.stringify({ version: 6, items: [{ id: 'app-b', name: 'B' }, { id: 'app-a', name: 'A' }] })
});
const edit = (d, key, change) => { const value = JSON.parse(d.data.get(key)); change(value); d.data.set(key, JSON.stringify(value)); };
const without = (field, id) => (value) => { value[field] = value[field].filter((item) => item.id !== id); };
// One own record leaves local storage, for every Port record family.
const REMOVALS = {
  'settings/global': (d) => d.data.delete('cruisePort.settings'),
  'metronome_settings/default': (d) => d.data.delete('cruisePort.metronome'),
  'tuner_settings/default': (d) => d.data.delete('cruisePort.tuner'),
  'practice_cycle/current': (d) => d.data.delete('cruisePort.practiceProgress'),
  'metronome_preset/preset-a': (d) => edit(d, 'cruisePort.metronomePresets', without('items', 'preset-a')),
  'calendar_event/calendar-2': (d) => edit(d, 'cruisePort.practiceCalendar', without('notes', 'calendar-2')),
  'practice_menu/menu-a': (d) => edit(d, 'cruisePort.practiceMenus', without('items', 'menu-a')),
  'practice_history_event/history-2': (d) => edit(d, 'cruisePort.practiceHistory', without('events', 'history-2')),
  'gear_category/category-a': (d) => edit(d, 'cruisePort.gearCategories', without('categories', 'category-a')),
  'gear_item/gear-a': (d) => edit(d, 'cruisePort.gearList', without('items', 'gear-a')),
  'my_app/app-a': (d) => edit(d, 'cruisePort.myApps', without('items', 'app-a')),
  'gear_order/owned': (d) => edit(d, 'cruisePort.gearList', (value) => { value.items.forEach((item) => { item.status = 'wishlist'; }); })
};
const ORDERED = new Set(['practice_menu/menu-a', 'gear_category/category-a', 'my_app/app-a', 'gear_order/owned']);
// gear_order/<status> is derived from the items' status: with no owned item left the device cannot hold it.

const portWorld = () => { const w = world('port'); w.env.SYNC_ALLOWED_APP_IDS = 'port'; return w; };
const portRow = (w, key) => w.db.raw.prepare("SELECT deleted_at FROM sync_records WHERE app_id = 'port' AND record_type || '/' || record_id = ?").get(key);
const portRevisions = (w) => w.db.raw.prepare("SELECT COALESCE(SUM(revision), 0) AS total FROM sync_records WHERE app_id = 'port'").get().total;
const datasetState = (w, appId) => w.db.raw.prepare('SELECT state FROM sync_datasets WHERE app_id = ?').get(appId).state;
const snapshotOf = (d) => JSON.stringify([...d.data.entries()].filter(([key]) => !key.includes('syncDeletionIntent')).sort());
// What the device holds as sync records (storage formatting may be normalized by an apply).
const recordsOf = async (d) => (await d.adapter.serializeRecords(d.adapter.readLocalSnapshot()))
  .map((record) => `${record.recordType}/${record.recordId}:${record.payloadHash}`).sort();

// The app's own guarded write: Port journals deletion intents from the before/after diff.
function journaled(d, change) {
  const storage = { getItem: (k) => d.data.get(k) ?? null, setItem: (k, v) => d.data.set(k, String(v)), removeItem: (k) => d.data.delete(k) };
  const keys = Object.keys(PORT());
  keys.forEach((key) => readStorageValue(storage, key));
  change(d);
  acceptStorageValues(storage, keys);
}

// Device A's first migration stops at the given point; it then resumes with the given local change.
async function interrupted(w, phase = 'before-complete') {
  const a = device(w, 'current', PORT());
  const real = a.runtime.fetchImpl;
  let pushes = 0;
  a.runtime.fetchImpl = async (url, init) => {
    const path = new URL(url).pathname;
    if (phase === 'before-push' && path === '/v1/sync/push') throw new TypeError('network down');
    if (phase === 'mid-push' && path === '/v1/sync/push' && ++pushes === 1) {
      const body = JSON.parse(init.body);
      body.operations = body.operations.slice(0, Math.ceil(body.operations.length / 2));
      await real(url, { ...init, body: JSON.stringify(body) });
      throw new TypeError('network down');
    }
    if (phase === 'before-complete' && path === '/v1/sync/migration/complete') throw new TypeError('network down');
    const response = await real(url, init);
    if (phase === 'complete-response-lost' && path === '/v1/sync/migration/complete') throw new TypeError('response lost');
    return response;
  };
  const first = await a.join();
  assert.equal(first.ok, false, `${phase}: the first migration is interrupted`);
  a.runtime.fetchImpl = real;
  return a;
}

for (const phase of ['before-push', 'mid-push', 'before-complete', 'complete-response-lost']) {
  test(`port: an interrupted first migration (${phase}) resumes unchanged`, async () => {
    const w = portWorld();
    const a = await interrupted(w, phase);
    const before = await recordsOf(a);
    const resumed = await a.runtime.initializeDataset();
    assert.equal(resumed.ok, true);
    assert.equal(resumed.recordCount, 23);
    assert.equal(datasetState(w, 'port'), 'ready');
    assert.deepEqual(await recordsOf(a), before, 'local data unchanged');
    w.close();
  });
}

for (const [key, remove] of Object.entries(REMOVALS)) {
  test(`port resume: ${key} gone locally without a deletion intent is hydrated, never deleted`, async () => {
    const w = portWorld();
    const a = await interrupted(w);
    const original = await a.adapter.serializeRecords(a.adapter.readLocalSnapshot());
    remove(a);
    const resumed = await a.runtime.initializeDataset();
    assert.equal(resumed.ok, true, `no manifest mismatch: ${JSON.stringify(resumed)}`);
    assert.equal(datasetState(w, 'port'), 'ready');
    assert.equal(await a.store.readMeta('migrationState'), 'complete');
    assert.equal(portRow(w, key).deleted_at, null, 'the cloud record stays live');
    const local = new Set((await a.adapter.serializeRecords(a.adapter.readLocalSnapshot())).map((r) => `${r.recordType}/${r.recordId}`));
    const derived = key === 'gear_order/owned';
    if (!derived) {
      assert.ok(local.has(key), 'the record is back on the device');
      for (const record of original) assert.ok(local.has(`${record.recordType}/${record.recordId}`), `nothing lost: ${record.recordType}/${record.recordId}`);
    }
    // Order families re-derive their order once on the next sync; after that nothing moves.
    const settle = portRevisions(w);
    assert.equal((await a.sync('focus')).ok, true);
    const firstWrites = portRevisions(w) - settle;
    assert.ok(firstWrites <= (ORDERED.has(key) ? 1 : 0), `${key}: at most the one order write, got ${firstWrites}`);
    if (derived) {
      // The ordinary steady-state rule for an absence without intent: ask (never delete silently).
      const [conflict] = await a.conflicts();
      assert.equal(`${conflict.kind}/${conflict.recordKey}`, 'ambiguous_delete/gear_order/owned');
      assert.equal((await a.runtime.resolveConflict(conflict.id, 'local')).ok, true, 'the user confirms the deletion');
    }
    const stable = portRevisions(w);
    for (let cycle = 0; cycle < 3; cycle += 1) assert.equal((await a.sync('focus')).ok, true);
    assert.equal(portRevisions(w), stable, 'no further writes');
    assert.equal((await a.conflicts()).length, 0);
    w.close();
  });

  test(`port resume: ${key} deleted by the app (journaled) is still tombstoned`, async () => {
    const w = portWorld();
    const a = await interrupted(w);
    journaled(a, remove);
    const resumed = await a.runtime.initializeDataset();
    assert.equal(resumed.ok, true, JSON.stringify(resumed));
    assert.notEqual(portRow(w, key).deleted_at, null, 'explicit deletion reaches the cloud');
    const local = new Set((await a.adapter.serializeRecords(a.adapter.readLocalSnapshot())).map((r) => `${r.recordType}/${r.recordId}`));
    assert.equal(local.has(key), false, 'not revived on the device');
    w.close();
  });
}

test('port resume: repeated resumes and later syncs settle, and another device sees the hydrated record', async () => {
  const w = portWorld();
  const a = await interrupted(w);
  REMOVALS['metronome_preset/preset-a'](a);
  assert.equal((await a.runtime.initializeDataset()).ok, true);
  assert.equal((await a.sync('save')).ok, true, 'normal sync is available again');
  const b = device(w, 'current', { 'cruisePort.practiceCalendar': JSON.stringify({ version: 2, notes: [{ id: 'calendar-1', text: 'one' }, { id: 'calendar-2', text: 'two' }] }) });
  assert.equal((await b.join()).ok, true);
  assert.deepEqual(JSON.parse(b.data.get('cruisePort.metronomePresets')).items.map((item) => item.id), ['preset-b', 'preset-a']);
  w.close();
});

// ---- D': whole-record "remote" on settings that have a field plan ----
const STANDARD = (extra = {}) => ({ instrument: 'piano', notationStyle: 'doremi', scaleEnabled: true, isAnswerMode: true, ...extra });
const ALL_PITCH = (extra = {}) => ({ ...STANDARD(), keyRandomMode: false, baseOctave: 3, keyOffset: 0, noteSpeed: 1, ...extra });
const pitchState = (settings) => ({ pitchTrainerSettings: JSON.stringify(settings) });

// A settings conflict on device b of the given app; `shape` picks the cloud/device difference.
async function settingsConflict(appId, shape) {
  const item = APPS[appId];
  const w = world(appId);
  if (shape === 'standard') {
    const a = device(w, 'current', pitchState(STANDARD())); await a.join();
    const b = device(w, 'current', pitchState(ALL_PITCH({ notationStyle: 'cde' })));
    assert.equal((await b.join()).code, 'merge_conflict');
    return { w, a, b, item };
  }
  const a = device(w, 'current', item.seed()); await a.join();
  const b = device(w, 'current', item.seed()); await b.join();
  const { field, to } = item.other;
  b.change((settings) => { if (shape === 'theme') settings.theme = 'light'; settings[field] = to; });
  a.change((settings) => { settings[field] = appId === 'pitch' ? 'acoustic_guitar' : appId === 'fretboard' ? 140 : 'easy'; });
  await a.sync('save');
  assert.equal((await b.sync('save')).code, 'conflict');
  return { w, a, b, item };
}

for (const [appId, shape] of [['pitch', 'standard'], ['pitch', 'theme'], ['fretboard', 'theme'], ['rhythm', 'theme'],
  ['pitch', 'plain'], ['fretboard', 'plain'], ['rhythm', 'plain']]) {
  test(`${appId} settings (${shape}): whole-record remote is refused and cleared; the field screen still resolves`, async () => {
    const { w, b } = await settingsConflict(appId, shape);
    const [conflict] = await b.conflicts();
    const before = snapshotOf(b);
    const revision = w.stored().revision;
    let backups = 0;
    const backup = b.runtime.backupSnapshot.bind(b.runtime);
    b.runtime.backupSnapshot = async (...args) => { backups += 1; return backup(...args); };
    // A choice saved by an older screen, resumed at start / online.
    await b.store.putConflict({ ...conflict, resolution: { choice: 'remote', status: 'pending', startedAt: 1 } });
    const resumed = await b.runtime.resumeConflictResolutions();
    assert.equal(resumed.ok, false);
    assert.equal(resumed.code, 'settings_field_choice_required');
    const [kept] = await b.conflicts();
    assert.equal(kept.resolution, null, 'the stale choice is cleared');
    assert.equal(kept.state, 'attention');
    assert.equal((await b.runtime.resumeConflictResolutions()).ok, true, 'nothing left to retry');
    assert.equal((await b.runtime.resolveConflict(conflict.id, 'remote')).code, 'settings_field_choice_required');
    assert.equal(backups, 0, 'the device was never touched');
    assert.equal(snapshotOf(b), before);
    assert.equal(w.stored().revision, revision, 'no cloud write');
    const [item] = await b.runtime.listConflictPresentations();
    const choices = Object.fromEntries(item.settings.fields.map((field) => [field.path, 'remote']));
    assert.equal((await b.runtime.resolveConflict(conflict.id, 'merged', { fieldChoices: choices })).ok, true);
    assert.equal((await b.conflicts()).length, 0);
    w.close();
  });
}

for (const appId of ['pitch', 'fretboard', 'rhythm']) {
  test(`${appId} settings: whole-record local and mixed field choices work as before`, async () => {
    const local = await settingsConflict(appId, 'theme');
    const [conflict] = await local.b.conflicts();
    assert.equal((await local.b.runtime.resolveConflict(conflict.id, 'local')).ok, true);
    const { field, to } = local.item.other;
    for (let cycle = 0; cycle < 2; cycle += 1) { await local.a.sync('focus'); await local.b.sync('focus'); }
    assert.equal(local.item.read(local.a.data)[field], to, 'this device wins everywhere');
    local.w.close();

    const mixed = await settingsConflict(appId, 'theme');
    const [item] = await mixed.b.runtime.listConflictPresentations();
    const choices = Object.fromEntries(item.settings.fields.map((entry, index) => [entry.path, index % 2 ? 'remote' : 'local']));
    assert.equal((await mixed.b.runtime.resolveConflict(item.id, 'merged', { fieldChoices: choices })).ok, true);
    assert.equal(mixed.item.theme(mixed.item.read(mixed.b.data)), 'light', 'a device-only theme is kept');
    mixed.w.close();
  });
}

test('non-settings records and Port settings keep whole-record remote', async () => {
  // Rhythm built-in stage preference (no field plan): whole-record cloud.
  const w = world('rhythm');
  const seed = () => ({ rhythmCruiseSettings: JSON.stringify({ tapLayout: 'ud' }), 'rhythmCruiseStagePrefs:v1': JSON.stringify({ builtin: { 1: { bpm: 90, bars: 4 } } }) });
  const a = device(w, 'current', seed()); await a.join();
  const b = device(w, 'current', seed()); await b.join();
  a.data.set('rhythmCruiseStagePrefs:v1', JSON.stringify({ builtin: { 1: { bpm: 120, bars: 4 } } })); await a.sync('save');
  b.data.set('rhythmCruiseStagePrefs:v1', JSON.stringify({ builtin: { 1: { bpm: 130, bars: 4 } } })); await b.sync('save');
  const [conflict] = await b.conflicts();
  assert.equal(conflict.recordType, 'builtin_stage_preferences');
  assert.equal((await b.runtime.resolveConflict(conflict.id, 'remote')).ok, true);
  assert.equal(JSON.parse(b.data.get('rhythmCruiseStagePrefs:v1')).builtin[1].bpm, 120);
  w.close();

  // Port settings (no field plan in Port): whole-record cloud replaces the object.
  const p = portWorld();
  const pa = device(p, 'current', { 'cruisePort.settings': JSON.stringify({ displaySize: 'standard' }) }); await pa.join();
  const pb = device(p, 'current', { 'cruisePort.settings': JSON.stringify({ displaySize: 'standard' }) }); await pb.join();
  pa.data.set('cruisePort.settings', JSON.stringify({ displaySize: 'large' })); await pa.sync('save');
  pb.data.set('cruisePort.settings', JSON.stringify({ displaySize: 'small', theme: 'light' })); await pb.sync('save');
  const [portConflict] = await pb.conflicts();
  assert.equal((await pb.runtime.resolveConflict(portConflict.id, 'remote')).ok, true);
  assert.deepEqual(JSON.parse(pb.data.get('cruisePort.settings')), { displaySize: 'large' });
  p.close();
});
