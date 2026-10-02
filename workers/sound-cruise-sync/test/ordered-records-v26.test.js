// Ordered records (stage / preset lists) in Pitch, Fretboard and Rhythm, end to end on the real Worker
// (SQLite D1), the real shared runtime and the real adapters. An order record must name every live item of
// its kind exactly once and nothing else, on every device and in the cloud, through: an interrupted first
// migration, a rejoin holding some of the same items, two devices adding at once, a real reorder conflict
// resolved either way, ordinary sync, and a cloud left inconsistent by an older client.
import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { device, world } from './theme-compat-harness.js';
import { hashRecord } from '../src/records.js';

const ITEMS = ['a', 'b', 'c', 'd', 'e'];
const melody = (id, legacyId) => ({ recordType: 'melody_stage', recordId: id, schemaVersion: 1, payload: { id, legacyId, name: `M${legacyId}`,
  pool: [{ note: 'C', octaveOffset: 0 }, { note: 'D', octaveOffset: 1 }], count: 4, is2Octave: true, isPianoLayout: true, answerMethod: 'note', description: 'QA' } });
const chordStage = (id, legacyId) => ({ recordType: 'chord_stage', recordId: id, schemaVersion: 1, payload: { id, legacyId, name: `C${legacyId}`,
  chordRefs: ['builtin:chord:c', 'builtin:chord:g'], count: 4, proQuestionMode: 'chords', description: 'QA' } });
const route = (id, name) => ({ id, name, key: 0, capo: 0, scale: 'major', displayMode: 'solfege', doMode: 'movable', maxFret: 12,
  route: [{ stringName: 6, fret: 3 }, { stringName: 5, fret: 2 }], groupBreaks: [0, 1], groupNames: ['Gr.1', 'Gr.2'], groupScrollLefts: { 0: 1, 1: 2 } });
const quiz = (id, name) => ({ id, name, key: 2, capo: 1, scale: 'dorian', displayMode: 'note', doMode: 'fixed', maxFret: 18,
  groups: [{ name: 'G', notes: [{ stringName: 1, fret: 5 }], scrollLeft: 1 }] });
const rStage = (id, title) => ({ version: 1, id, title, description: 'synthetic', grid: 'eighth', timeSignature: '4/4', patternBars: 1, bars: 8,
  bpm: 96, zoom: 1, clickMode: 'downbeat', rhythmFeel: 'straight',
  pattern: Array.from({ length: 8 }, (_v, i) => ({ hit: i % 3 !== 1, dir: i % 2 ? 'up' : 'down', type: i % 3 === 1 ? 'rest' : 'hit' })) });
const createPreset = (id, n) => ({ id, stageN: 2, name: `P${n}`, pattern: ['hit', 'rest'], dirs: ['down', null], patternBars: 1, bpm: 90 + n,
  bars: 4, zoom: 1, balance: 60, createdAt: 10 + n, updatedAt: 20 + n });
const customPreset = (id, n) => ({ id, name: `U${n}`, settings: rStage(`rcs_${id}`, `S${n}`), balance: 65, createdAt: 12 + n, updatedAt: 22 + n });

// Pitch stores stages as slots; build the device's storage through the adapter from records in list order.
async function pitchValues(type, ids) {
  const w = world('pitch');
  const tmp = device(w, 'current', { pitchTrainerSettings: JSON.stringify({ instrument: 'piano' }) });
  const base = tmp.adapter.normalizeLocalSnapshot(tmp.adapter.readLocalSnapshot()).records;
  const make = type === 'melody_stage' ? (x) => melody(`legacy:melody-stage:${7101 + ITEMS.indexOf(x)}`, 7101 + ITEMS.indexOf(x))
    : (x) => chordStage(`legacy:chord-stage:${8101 + ITEMS.indexOf(x)}`, 8101 + ITEMS.indexOf(x));
  const stages = ids.map(make);
  const category = type === 'melody_stage' ? 'melody' : 'chord';
  const records = [...base, ...stages];
  if (stages.length) records.push({ recordType: 'stage_order', recordId: category, schemaVersion: 1,
    payload: { id: category, category, stageRefs: stages.map((r) => r.recordId) } });
  await tmp.adapter.applyRemoteSnapshot({ appId: 'pitch', schemaVersion: 1, records });
  const values = Object.fromEntries(tmp.data);
  w.close();
  return values;
}

// app, how a device holds a list of items (in that order), and how to read the order back.
const TYPES = {
  melody_stage: { app: 'pitch', order: ['stage_order', 'melody', 'stageRefs'], seed: (ids) => pitchValues('melody_stage', ids),
    list: (d) => (JSON.parse(d.data.get('pitchTrainerStagingProMelodySlots') || '{"order":[]}').order || []).map((id) => ITEMS[Number(id) - 7101]) },
  chord_stage: { app: 'pitch', order: ['stage_order', 'chord', 'stageRefs'], seed: (ids) => pitchValues('chord_stage', ids),
    list: (d) => (JSON.parse(d.data.get('pitchTrainerStagingProChordSlots') || '{"order":[]}').order || []).map((id) => ITEMS[Number(id) - 8101]) },
  custom_route: { app: 'fretboard', order: ['stage_order', 'route', 'stageRefs'],
    seed: async (ids) => ({ fretboard_cruise_state: JSON.stringify({ settings: { tempo: 96, cruiseProCustomStages: ids.map((x) => route(`pcs_${x}`, x)) } }) }),
    list: (d) => JSON.parse(d.data.get('fretboard_cruise_state')).settings.cruiseProCustomStages.map((s) => s.id.slice(4)) },
  custom_quiz: { app: 'fretboard', order: ['stage_order', 'quiz', 'stageRefs'],
    seed: async (ids) => ({ fretboard_cruise_state: JSON.stringify({ settings: { tempo: 96, quizProCustomStages: ids.map((x) => quiz(`pcq_${x}`, x)) } }) }),
    list: (d) => JSON.parse(d.data.get('fretboard_cruise_state')).settings.quizProCustomStages.map((s) => s.id.slice(4)) },
  custom_stage: { app: 'rhythm', order: ['stage_order', 'stages', 'stageRefs'],
    seed: async (ids) => ({ rhythmCruiseSettings: JSON.stringify({ tapLayout: 'ud', rhythmProCustomStages: ids.map((x) => rStage(`rcs_${x}`, x)) }),
      rhythmProCustomStageSamplesSeeded: '1' }),
    list: (d) => JSON.parse(d.data.get('rhythmCruiseSettings')).rhythmProCustomStages.filter((s) => s.id.startsWith('rcs_')).map((s) => s.id.slice(4)) },
  create_preset: { app: 'rhythm', order: ['preset_order', 'create', 'presetRefs'],
    seed: async (ids) => ({ rhythmCruiseSettings: JSON.stringify({ tapLayout: 'ud' }), 'rhythmCruiseCreatePresets:v1': JSON.stringify(ids.map((x) => createPreset(`rcpreset_${x}`, ITEMS.indexOf(x)))) }),
    list: (d) => JSON.parse(d.data.get('rhythmCruiseCreatePresets:v1') || '[]').map((s) => s.id.slice(9)) },
  custom_preset: { app: 'rhythm', order: ['preset_order', 'custom', 'presetRefs'],
    seed: async (ids) => ({ rhythmCruiseSettings: JSON.stringify({ tapLayout: 'ud' }), 'rhythmCruiseCustomPresets:v1': JSON.stringify(ids.map((x) => customPreset(`rccust_${x}`, ITEMS.indexOf(x)))) }),
    list: (d) => JSON.parse(d.data.get('rhythmCruiseCustomPresets:v1') || '[]').map((s) => s.id.slice(7)) }
};
const RHYTHM_SAMPLES = ['builtin:stage-sample:triplet', 'builtin:stage-sample:shuffle8', 'builtin:stage-sample:shuffle16'];

// The invariant, checked without the adapter's own reconcile: the order names each live item once, nothing else.
function assertConsistent(type, records, where) {
  const [orderType, orderId, field] = TYPES[type].order;
  const live = records.filter((r) => r.deletedAt == null && r.deleted !== true);
  const items = live.filter((r) => r.recordType === type && !r.payload?.builtinKey).map((r) => r.recordId);
  const order = live.find((r) => r.recordType === orderType && r.recordId === orderId);
  const samples = type === 'custom_stage' ? RHYTHM_SAMPLES : [];
  const refs = order ? order.payload[field] : samples;
  assert.equal(new Set(refs).size, refs.length, `${where}: no duplicate in the order`);
  for (const ref of refs) assert.ok(items.includes(ref) || samples.includes(ref), `${where}: ${ref} exists (no dangling id)`);
  for (const item of items) assert.ok(refs.includes(item), `${where}: ${item} is listed (no orphan)`);
}
const cloudRecords = (w) => w.db.raw.prepare('SELECT record_type, record_id, payload_json, deleted_at FROM sync_records WHERE app_id = ?').all(w.appId)
  .map((row) => ({ recordType: row.record_type, recordId: row.record_id, deletedAt: row.deleted_at, payload: row.payload_json ? JSON.parse(row.payload_json) : null }));
const revisions = (w) => w.db.raw.prepare('SELECT COALESCE(SUM(revision), 0) AS total FROM sync_records WHERE app_id = ?').get(w.appId).total;
async function assertEverywhere(type, w, devices) {
  assertConsistent(type, cloudRecords(w), 'cloud');
  for (const [index, d] of devices.entries()) {
    assertConsistent(type, await d.adapter.serializeRecords(d.adapter.readLocalSnapshot()), `device ${index + 1}`);
  }
}
async function settle(w, devices, label) {
  for (const d of devices) assert.equal((await d.sync('focus')).ok, true, `${label}: sync`);
  const stable = revisions(w);
  for (let round = 0; round < 3; round += 1) for (const d of devices) assert.equal((await d.sync('focus')).ok, true, `${label}: round ${round}`);
  assert.equal(revisions(w), stable, `${label}: writes settle to 0`);
  for (const d of devices) assert.equal((await d.conflicts()).length, 0, `${label}: no conflicts`);
}
const holdList = async (d, cfg, ids) => { for (const [key, value] of Object.entries(await cfg.seed(ids))) d.data.set(key, value); };

for (const [type, cfg] of Object.entries(TYPES)) {
  test(`${type}: an interrupted first migration resumes when an own item is gone locally`, async () => {
    const w = world(cfg.app);
    const a = device(w, 'current', await cfg.seed(['a', 'b']));
    const real = a.runtime.fetchImpl;
    a.runtime.fetchImpl = async (url, init) => {
      if (new URL(url).pathname === '/v1/sync/migration/complete') throw new TypeError('network down');
      return real(url, init);
    };
    assert.equal((await a.join()).ok, false);
    a.runtime.fetchImpl = real;
    await holdList(a, cfg, ['a']);
    const before = revisions(w);
    const resumed = await a.runtime.initializeDataset();
    assert.equal(resumed.ok, true, JSON.stringify(resumed));
    assert.equal(revisions(w), before, 'no cloud write');
    assert.deepEqual(cfg.list(a), ['a', 'b'], 'the cloud item is back, in the cloud order');
    await assertEverywhere(type, w, [a]);
    await settle(w, [a], 'resume');
    w.close();
  });

  test(`${type}: a device holding some of the same items rejoins without an ordering conflict`, async () => {
    const w = world(cfg.app);
    const a = device(w, 'current', await cfg.seed(['a', 'b'])); await a.join();
    const b = device(w, 'current', await cfg.seed(['a']));
    const before = revisions(w);
    const joined = await b.join();
    assert.equal(joined.ok, true, JSON.stringify(joined));
    assert.equal(revisions(w), before, 'no cloud write');
    assert.deepEqual(cfg.list(b), ['a', 'b']);
    await assertEverywhere(type, w, [a, b]);
    await settle(w, [a, b], 'rejoin');
    w.close();
  });

  test(`${type}: two devices adding at once keep both items without a conflict`, async () => {
    const w = world(cfg.app);
    const a = device(w, 'current', await cfg.seed(['a'])); await a.join();
    const b = device(w, 'current', await cfg.seed(['a'])); await b.join();
    await holdList(a, cfg, ['a', 'b']);
    assert.equal((await a.sync('save')).ok, true);
    await holdList(b, cfg, ['a', 'c']);
    assert.equal((await b.sync('save')).ok, true, 'merged three-way, no conflict');
    assert.equal((await a.sync('focus')).ok, true);
    assert.deepEqual(cfg.list(a), ['a', 'b', 'c']);
    assert.deepEqual(cfg.list(b), ['a', 'b', 'c']);
    await assertEverywhere(type, w, [a, b]);
    await settle(w, [a, b], 'simultaneous add');
    w.close();
  });

  for (const pick of ['local', 'remote']) {
    test(`${type}: a real reorder conflict with additions resolved with "${pick}" keeps every item`, async () => {
      const w = world(cfg.app);
      const a = device(w, 'current', await cfg.seed(['a', 'b', 'c'])); await a.join();
      const b = device(w, 'current', await cfg.seed(['a', 'b', 'c'])); await b.join();
      await holdList(a, cfg, ['c', 'b', 'a', 'd']);
      assert.equal((await a.sync('save')).ok, true);
      await holdList(b, cfg, ['b', 'a', 'c', 'e']);
      assert.equal((await b.sync('save')).code, 'conflict', 'contradicting reorders are a choice');
      const [conflict] = await b.conflicts();
      assert.equal(conflict.recordType, cfg.order[0]);
      const resolved = await b.runtime.resolveConflict(conflict.id, pick);
      assert.equal(resolved.ok, true, JSON.stringify(resolved));
      await assertEverywhere(type, w, [a, b]);
      await settle(w, [a, b], `resolve ${pick}`);
      for (const d of [a, b]) assert.deepEqual([...cfg.list(d)].sort(), ['a', 'b', 'c', 'd', 'e'], 'no item lost');
      assert.deepEqual(cfg.list(a), cfg.list(b), 'both devices show one order');
      const shared = cfg.list(a).filter((x) => ['a', 'b', 'c'].includes(x));
      assert.deepEqual(shared, pick === 'local' ? ['b', 'a', 'c'] : ['c', 'b', 'a'], 'the chosen side orders the shared items');
      await assertEverywhere(type, w, [a, b]);
      w.close();
    });
  }

  test(`${type}: ordinary sync of additions, reorders and deletions is unchanged`, async () => {
    const w = world(cfg.app);
    const a = device(w, 'current', await cfg.seed(['a'])); await a.join();
    const b = device(w, 'current', await cfg.seed(['a'])); await b.join();
    for (const [actor, other, ids] of [[a, b, ['a', 'b']], [a, b, ['b', 'a']], [b, a, ['b', 'a', 'c']], [b, a, ['c', 'a']]]) {
      await holdList(actor, cfg, ids);
      assert.equal((await actor.sync('save')).ok, true);
      assert.equal((await other.sync('focus')).ok, true);
      assert.deepEqual(cfg.list(other), ids);
      await assertEverywhere(type, w, [a, b]);
    }
    await settle(w, [a, b], 'ordinary sync');
    w.close();
  });

  test(`${type}: a cloud order left inconsistent by an older client heals on the next syncs`, async () => {
    const w = world(cfg.app);
    const a = device(w, 'current', await cfg.seed(['a', 'b'])); await a.join();
    const b = device(w, 'current', await cfg.seed(['a', 'b'])); await b.join();
    const [orderType, orderId, field] = cfg.order;
    const cloud = cloudRecords(w);
    const order = cloud.find((r) => r.recordType === orderType && r.recordId === orderId && !r.deletedAt);
    // The older client's "this device" choice: an order naming an item the cloud never received, and leaving b out.
    const listed = order.payload[field].filter((ref) => !ref.includes('b') && !ref.endsWith('7102') && !ref.endsWith('8102'));
    const dangling = order.payload[field][0].replace(/a$|7101$|8101$/, (m) => ({ a: 'z', 7101: '7199', 8101: '8199' })[m]);
    const payload = { ...order.payload, [field]: [...listed, dangling] };
    const revision = w.db.raw.prepare('SELECT revision FROM sync_records WHERE app_id = ? AND record_type = ? AND record_id = ?').get(w.appId, orderType, orderId).revision;
    const op = { operationId: webcrypto.randomUUID(), recordType: orderType, recordId: orderId, schemaVersion: 1, baseRevision: revision,
      payload, payloadHash: '', deleted: false };
    op.payloadHash = await hashRecord({ ...op }, webcrypto, w.appId);
    const pushed = await (await w.fetchFor(a.deviceId)('https://sync.soundcruise.jp/v1/sync/push', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId: w.appId, mode: 'sync', operations: [op], capabilities: ['settings_theme_v1'] }) })).json();
    assert.equal(pushed.results[0].status, 'applied');
    assert.throws(() => assertConsistent(type, cloudRecords(w), 'cloud'), 'the cloud starts inconsistent');
    for (let round = 0; round < 2; round += 1) for (const d of [b, a]) assert.equal((await d.sync('focus')).ok, true, 'devices keep syncing');
    if (type === 'melody_stage') {
      // Pitch's existing data-repair design: a melody order naming a missing stage is shown for an explicit
      // repair (never deleted on a guess); the order is not rewritten until the user confirms it.
      for (const d of [a, b]) {
        const [repair] = await d.conflicts();
        assert.equal(repair?.reason, 'pitch_stage_dependency_inconsistent');
        const [item] = await d.runtime.listConflictPresentations();
        assert.equal((await d.runtime.resolveConflict(repair.id, item.recovery.allowedChoices[0])).ok, true, 'the repair completes');
      }
      for (const d of [b, a]) assert.equal((await d.sync('focus')).ok, true);
    }
    await assertEverywhere(type, w, [a, b]);
    for (const d of [a, b]) assert.deepEqual([...cfg.list(d)].sort(), ['a', 'b'], 'nothing deleted, nothing invented');
    await settle(w, [a, b], 'heal');
    w.close();
  });
}

for (const [type, kinds] of [['melody_stage', ['old', 'reader']], ['custom_route', ['old', 'reader']], ['custom_stage', ['old', 'reader']]]) {
  for (const kind of kinds) {
    test(`${type}: an installed ${kind} client and the new release share one list`, async () => {
      const cfg = TYPES[type];
      // old creates, new joins holding part of it; then each adds in turn.
      const w = world(cfg.app);
      const older = device(w, kind, await cfg.seed(['a', 'b'])); assert.equal((await older.join()).ok, true);
      const fresh = device(w, 'current', await cfg.seed(['a'])); assert.equal((await fresh.join()).ok, true);
      assert.deepEqual(cfg.list(fresh), ['a', 'b']);
      await holdList(fresh, cfg, ['a', 'b', 'c']); assert.equal((await fresh.sync('save')).ok, true);
      assert.equal((await older.sync('focus')).ok, true); assert.deepEqual(cfg.list(older), ['a', 'b', 'c']);
      await holdList(older, cfg, ['c', 'a', 'b', 'd']); assert.equal((await older.sync('save')).ok, true);
      assert.equal((await fresh.sync('focus')).ok, true); assert.deepEqual(cfg.list(fresh), ['c', 'a', 'b', 'd']);
      // Both add at once; the new release pushes second and merges.
      await holdList(older, cfg, ['c', 'a', 'b', 'd', 'e']); assert.equal((await older.sync('save')).ok, true);
      await holdList(fresh, cfg, ['a', 'c', 'b', 'd']); assert.equal((await fresh.sync('save')).ok, true, 'a reorder merged with the older add');
      assert.equal((await older.sync('focus')).ok, true);
      assert.deepEqual([...cfg.list(older)].sort(), ['a', 'b', 'c', 'd', 'e']);
      assert.deepEqual(cfg.list(older), cfg.list(fresh));
      await assertEverywhere(type, w, [older, fresh]);
      await settle(w, [older, fresh], `${kind} + new`);
      w.close();

      // new creates, old joins.
      const w2 = world(cfg.app);
      const creator = device(w2, 'current', await cfg.seed(['a', 'b'])); assert.equal((await creator.join()).ok, true);
      const joiner = device(w2, kind, await cfg.seed(['c'])); assert.equal((await joiner.join()).ok, true);
      assert.equal((await creator.sync('focus')).ok, true);
      assert.deepEqual([...cfg.list(creator)].sort(), ['a', 'b', 'c']);
      await assertEverywhere(type, w2, [creator, joiner]);
      w2.close();
    });
  }
}

test('reference integrity: Pitch progress and chord references stay valid around merged stage orders', async () => {
  const w = world('pitch');
  const a = device(w, 'current', await TYPES.melody_stage.seed(['a'])); await a.join();
  const b = device(w, 'current', await TYPES.melody_stage.seed(['a'])); await b.join();
  await holdList(a, TYPES.melody_stage, ['a', 'b']); assert.equal((await a.sync('save')).ok, true);
  await holdList(b, TYPES.melody_stage, ['a', 'c']); assert.equal((await b.sync('save')).ok, true);
  assert.equal((await a.sync('focus')).ok, true);
  for (const d of [a, b]) {
    const records = await d.adapter.serializeRecords(d.adapter.readLocalSnapshot());
    assert.doesNotThrow(() => d.adapter.deserializeRecords(records), 'every progress / chord reference resolves');
  }
  w.close();
});

test('reconcile is a no-op on every consistent list an app stores (no needless writes)', async () => {
  const strip = (records) => records.map(({ payloadHash, ...record }) => record);
  for (const [type, cfg] of Object.entries(TYPES)) {
    for (const ids of [[], ['a'], ['c', 'a', 'b'], ['e', 'd', 'c', 'b', 'a']]) {
      const w = world(cfg.app);
      const d = device(w, 'current', await cfg.seed(ids));
      const records = await d.adapter.serializeRecords(d.adapter.readLocalSnapshot());
      const reconciled = d.adapter.reconcileOrderRecords({ appId: cfg.app, records }, { remoteRecords: [] }).records;
      assert.deepEqual(strip(reconciled), strip(records), `${type} ${ids.join('')}`);
      assertConsistent(type, records, `${type} ${ids.join('')}`);
      w.close();
    }
  }
  // A Rhythm device whose built-in samples were never seeded stores an order without them, which its own
  // apply cannot reproduce (the samples are always materialized). Reconcile gives exactly what the apply
  // produces, so such a device can take remote changes again.
  const w = world('rhythm');
  const d = device(w, 'current', { rhythmCruiseSettings: JSON.stringify({ tapLayout: 'ud', rhythmProCustomStages: [rStage('rcs_x', 'x')] }) });
  const records = await d.adapter.serializeRecords(d.adapter.readLocalSnapshot());
  const reconciled = d.adapter.reconcileOrderRecords({ appId: 'rhythm', records }, {}).records;
  await d.adapter.applyRemoteSnapshot(d.adapter.deserializeRecords(reconciled));
  assert.deepEqual(strip(await d.adapter.serializeRecords(d.adapter.readLocalSnapshot())), strip(d.adapter.deserializeRecords(reconciled).records));
  w.close();
});
