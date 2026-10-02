// Pitch settings shaped by the Standard page (only some synced fields stored) across devices, end to end on
// the real Worker (SQLite D1), the real shared runtime and the real Pitch adapter. A joining device that
// writes the same settings out in full must not fail its manifest check (409 manifest_mismatch): when its
// final record only means the same as the cloud's, the runtime attests to the cloud's own record and
// writes nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { APPS, device, world } from './theme-compat-harness.js';
import { hashRecord } from '../src/records.js';

const DEFAULTS = { instrument: 'acoustic_guitar', notationStyle: 'doremi', scaleEnabled: true, isAnswerMode: true,
  keyRandomMode: false, baseOctave: 3, keyOffset: 0, noteSpeed: 1 };
const OTHER = { instrument: 'ukulele', notationStyle: 'cde', scaleEnabled: false, isAnswerMode: false,
  keyRandomMode: true, baseOctave: 4, keyOffset: 2, noteSpeed: 1.5 };
const DEVICE_ONLY = { sustainTime: 1.5, baseHz: 440 };
// The four fields the Standard page writes; piano keeps the record meaningful.
const STANDARD = (extra = {}) => ({ instrument: 'piano', notationStyle: 'doremi', scaleEnabled: true, isAnswerMode: true, ...extra });
// What Pitch Pro writes on every settings save.
const FULL = (extra = {}) => ({ ...DEFAULTS, instrument: 'piano', ...DEVICE_ONLY, ...extra });
const pitchState = (settings, accidental) => ({ pitchTrainerSettings: JSON.stringify(settings),
  ...(accidental ? { pitchTrainerProAccidentalDisplay: accidental } : {}) });
const without = (values, key) => { const copy = { ...values }; delete copy[key]; return copy; };

// Device A creates the cloud from `cloudState`; device B joins with `localState`.
async function joinCase(cloudState, localState, { kinds = ['current', 'current'] } = {}) {
  const w = world('pitch');
  const a = device(w, kinds[0], cloudState);
  const first = await a.join();
  assert.equal(first.ok, true, `device A ${JSON.stringify(first)}`);
  const before = w.stored();
  const b = device(w, kinds[1], localState);
  const completions = [];
  const fetchB = w.fetchFor(b.deviceId);
  b.runtime.fetchImpl = async (url, init) => {
    const response = await fetchB(url, init);
    if (new URL(url).pathname === '/v1/sync/migration/complete') completions.push(response.status);
    return response;
  };
  const joined = await b.join();
  const result = { w, a, b, before, completions,
    ok: joined.ok === true, code: joined.code || null, conflicts: (await b.conflicts()).length,
    cloudWrites: (w.stored()?.revision || 0) - (before?.revision || 0) };
  if (result.ok) {
    const settled = w.stored().revision;
    for (let cycle = 0; cycle < 3; cycle += 1) {
      assert.equal((await a.sync('focus')).ok, true);
      assert.equal((await b.sync('focus')).ok, true);
    }
    result.churn = w.stored().revision - settled;
  }
  return result;
}
const outcome = (r) => r.ok ? `ok w${r.cloudWrites} churn${r.churn}` : (r.conflicts ? `conflict ${r.conflicts}` : r.code);

test('Standard-shaped cloud × full settings: joins with no cloud write and no manifest mismatch', async () => {
  const r = await joinCase(pitchState(STANDARD()), pitchState(FULL()));
  assert.equal(r.ok, true, `join must succeed: ${r.code}`);
  assert.deepEqual(r.completions, [200], 'migration/complete accepted the first time');
  assert.equal(r.cloudWrites, 0, 'cloud revision unchanged');
  assert.deepEqual(r.w.stored().values, r.before.values, 'the cloud keeps its own Standard-shaped record');
  assert.equal(await r.b.store.readMeta('migrationState'), 'complete');
  const local = JSON.parse(r.b.data.get('pitchTrainerSettings'));
  assert.deepEqual(Object.fromEntries(Object.keys(DEFAULTS).map((key) => [key, local[key]])), { ...DEFAULTS, instrument: 'piano' },
    'materialized: every synced field present with the same meaning');
  assert.equal(local.baseHz, 440, 'device-only settings stay');
  assert.equal(r.churn, 0, 'no further writes over three rounds');
  assert.equal(r.conflicts + (await r.a.conflicts()).length, 0);
  r.w.close();
});

// [name, cloud settings, joining settings, expected] for each of the eight synced fields.
const fieldCases = (field) => {
  const marker = field === 'instrument' ? { notationStyle: 'cde' } : { instrument: 'piano' };
  const base = { ...DEFAULTS, ...marker };
  const differing = OTHER[field] === base[field] ? DEFAULTS[field] : OTHER[field];
  return [
    ['cloud missing, joining explicit default', without(base, field), base, 'ok w0 churn0'],
    ['both missing', without(base, field), without(base, field), 'ok w0 churn0'],
    ['cloud explicit default, joining missing', base, without(base, field), 'ok w0 churn0'],
    ['both explicit default', base, base, 'ok w0 churn0'],
    ['same non-default value', { ...base, [field]: OTHER[field] }, { ...base, [field]: OTHER[field] }, 'ok w0 churn0'],
    ['cloud missing, joining non-default (value only here: present wins)', without(base, field), { ...base, [field]: OTHER[field] }, 'ok w1 churn0'],
    ['cloud non-default, joining missing (value only in the cloud)', { ...base, [field]: OTHER[field] }, without(base, field), 'ok w0 churn0'],
    ['different values', { ...base, [field]: OTHER[field] }, { ...base, [field]: field === 'instrument' ? 'piano' : differing === OTHER[field] ? DEFAULTS[field] : differing }, 'conflict 1']
  ];
};
for (const field of Object.keys(DEFAULTS)) {
  test(`pitch ${field}: missing, explicit default and real differences on join`, async () => {
    for (const [name, cloud, local, expected] of fieldCases(field)) {
      const r = await joinCase(pitchState(cloud), pitchState({ ...local, ...DEVICE_ONLY }));
      assert.equal(outcome(r), expected, `${field}: ${name}`);
      r.w.close();
    }
  });
}

test('Standard-shaped shapes on both sides', async () => {
  for (const [name, cloud, local, expected] of [
    ['identical Standard shape', STANDARD(), STANDARD(), 'ok w0 churn0'],
    ['full cloud, Standard-shaped device', FULL(), STANDARD(), 'ok w0 churn0'],
    ['Standard cloud, a fresh device', STANDARD(), {}, 'ok w0 churn0'],
    ['Standard cloud, device with a different value', STANDARD(), STANDARD({ notationStyle: 'cde' }), 'conflict 1']
  ]) {
    const r = await joinCase(pitchState(cloud), pitchState(local));
    assert.equal(outcome(r), expected, name);
    r.w.close();
  }
});

// The conflict screen resolves settings field by field ('merged'); both choices must complete the join.
for (const pick of ['remote', 'local']) {
  for (const [label, local] of [['Standard-shaped', STANDARD({ notationStyle: 'cde' })], ['full', FULL({ notationStyle: 'cde' })]]) {
    test(`a real difference with a Standard-shaped cloud resolves field by field (${label} device, all "${pick}")`, async () => {
      const r = await joinCase(pitchState(STANDARD()), pitchState(local));
      assert.equal(r.ok, false);
      assert.equal(r.conflicts, 1);
      const [item] = await r.b.runtime.listConflictPresentations();
      assert.equal(JSON.stringify(item.settings.fields.map((field) => field.path)), '["/notationStyle"]');
      const resolved = await r.b.runtime.resolveConflict(item.id, 'merged', { fieldChoices: { '/notationStyle': pick } });
      assert.equal(resolved.ok, true, `resolution and resumed join: ${JSON.stringify(resolved)}`);
      assert.equal(await r.b.store.readMeta('migrationState'), 'complete');
      assert.ok(!r.completions.includes(409), `no manifest mismatch: ${r.completions}`);
      assert.equal((await r.b.conflicts()).length, 0);
      const settled = r.w.stored().revision;
      for (let cycle = 0; cycle < 3; cycle += 1) { await r.a.sync('focus'); await r.b.sync('focus'); }
      assert.equal(r.w.stored().revision, settled, 'no churn after resolving');
      const want = pick === 'remote' ? 'doremi' : 'cde';
      for (const d of [r.a, r.b]) assert.equal(JSON.parse(d.data.get('pitchTrainerSettings')).notationStyle, want);
      r.w.close();
    });
  }
}

test('♯/♭ keeps its 2.27.1 meaning with Standard-shaped settings', async () => {
  for (const [cloud, local, expected] of [
    [null, null, 'ok w0 churn0'], ['sharp', null, 'ok w0 churn0'], ['flat', null, 'ok w0 churn0'],
    [null, 'sharp', 'ok w1 churn0'], ['flat', 'sharp', 'conflict 1']
  ]) {
    const r = await joinCase(pitchState(STANDARD(), cloud), pitchState(FULL(), local));
    assert.equal(outcome(r), expected, `cloud ${cloud || 'missing'}, joining ${local || 'missing'}`);
    if (r.ok) {
      assert.equal(r.w.stored().values.accidentalDisplay, cloud || local || undefined, 'never chosen stays absent');
      assert.equal(r.b.data.get('pitchTrainerProAccidentalDisplay'), cloud || local || undefined);
    }
    r.w.close();
  }
});

test('theme with Standard-shaped settings: unchanged theme rules', async () => {
  for (const [name, cloud, local, expected, theme] of [
    ['same theme', STANDARD({ theme: 'gray' }), FULL({ theme: 'gray' }), 'ok w0 churn0', 'gray'],
    ['theme only in the cloud', STANDARD({ theme: 'gray' }), FULL(), 'ok w0 churn0', 'gray'],
    ['theme only on the device', STANDARD(), FULL({ theme: 'light' }), 'ok w1 churn0', 'light'],
    ['different themes', STANDARD({ theme: 'gray' }), FULL({ theme: 'light' }), 'conflict 1', null]
  ]) {
    const r = await joinCase(pitchState(cloud), pitchState(local));
    assert.equal(outcome(r), expected, name);
    if (theme) {
      assert.equal(r.w.stored().values.theme, theme);
      for (const d of [r.a, r.b]) assert.equal(JSON.parse(d.data.get('pitchTrainerSettings')).theme, theme, name);
    }
    // Clients without settings_theme_v1 still never see a theme.
    const legacyView = await r.w.rawWriter(r.a.deviceId).snapshot(false);
    assert.equal('theme' in (legacyView.records[0]?.payload?.values || {}), false);
    r.w.close();
  }
});

for (const kind of ['old', 'reader']) {
  test(`an older ${kind} client: its Standard-shaped cloud is joined by the fixed release, and it is never worse off`, async () => {
    const sharp = (settings) => pitchState(settings, 'sharp');
    const r = await joinCase(sharp(STANDARD()), sharp(FULL()), { kinds: [kind, 'current'] });
    assert.equal(outcome(r), 'ok w0 churn0', `${kind} creates, current joins`);
    r.w.close();
    // The fixed release writes nothing, so an older device joining later sees exactly the cloud it would
    // have seen without it: the same outcome as when only older devices exist.
    const later = async (withFixed) => {
      const w = world('pitch');
      const first = device(w, kind, sharp(STANDARD()));
      assert.equal((await first.join()).ok, true);
      if (withFixed) assert.equal((await device(w, 'current', sharp(FULL())).join()).ok, true);
      const joined = await device(w, kind, sharp(FULL())).join();
      const result = { ok: joined.ok === true, code: joined.code || null, cloud: JSON.stringify(w.stored()) };
      w.close();
      return result;
    };
    assert.deepEqual(await later(true), await later(false));
  });

  test(`three devices with an older ${kind} client converge without churn`, async () => {
    const w = world('pitch');
    const creator = device(w, 'current', pitchState(STANDARD(), 'sharp'));
    const older = device(w, kind, pitchState({}, 'sharp'));
    assert.equal((await creator.join()).ok, true);
    assert.equal((await older.join()).ok, true);
    const fixed = device(w, 'current', pitchState(FULL(), 'sharp'));
    const joined = await fixed.join();
    assert.equal(joined.ok, true, `fixed release joins ${JSON.stringify(joined)}`);
    const all = [creator, older, fixed];
    for (const [d, instrument] of [[fixed, 'ukulele'], [older, 'piano'], [fixed, 'acoustic_guitar'], [older, 'ukulele']]) {
      d.change((s) => { s.instrument = instrument; });
      assert.equal((await d.sync('save')).ok, true, `${instrument} saved`);
      for (const x of all) assert.equal((await x.sync('focus')).ok, true);
    }
    const settled = w.stored().revision;
    for (let cycle = 0; cycle < 3; cycle += 1) for (const x of all) await x.sync('focus');
    assert.equal(w.stored().revision, settled, 'no churn');
    assert.deepEqual(all.map((d) => JSON.parse(d.data.get('pitchTrainerSettings')).instrument), ['ukulele', 'ukulele', 'ukulele']);
    let conflicts = 0;
    for (const d of all) conflicts += (await d.conflicts()).length;
    assert.equal(conflicts, 0);
    w.close();
  });
}

// Adapters without semantic equality keep their exact join behavior: a canonical cloud joins with no
// write, and a cloud holding explicit defaults is still normalized once.
for (const app of ['fretboard', 'rhythm']) {
  test(`${app} joins exactly as before (no semantic equality, nothing adopted)`, async () => {
    const item = APPS[app];
    const adapterProbe = device(world(app), 'current', item.seed());
    assert.equal(typeof adapterProbe.adapter.sameRecordForSync, 'undefined');
    const canonical = world(app);
    const a = device(canonical, 'current', item.seed());
    await a.join();
    const rev = canonical.stored().revision;
    assert.equal((await device(canonical, 'current', item.seed()).join()).ok, true);
    assert.equal(canonical.stored().revision, rev, 'canonical cloud: no write');
    canonical.close();

    const w = world(app);
    const creator = device(w, 'current', item.seed());
    await creator.join();
    const explicit = { ...item.read(creator.data), [item.other.field]: item.other.from,
      ...(app === 'fretboard' ? { quizTimeLimit: 4 } : { inputMode: 'tap' }) };
    const op = { operationId: webcrypto.randomUUID(), recordType: 'settings', recordId: 'settings', schemaVersion: 1,
      baseRevision: w.stored().revision, payload: { id: 'settings', values: explicit }, payloadHash: '', deleted: false };
    op.payloadHash = await hashRecord({ ...op }, webcrypto, app);
    const pushed = await (await w.fetchFor(creator.deviceId)('https://sync.soundcruise.jp/v1/sync/push', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId: app, mode: 'sync', operations: [op], capabilities: ['settings_theme_v1'] }) })).json();
    assert.equal(pushed.results[0].status, 'applied');
    const before = w.stored().revision;
    assert.equal((await device(w, 'current', item.seed()).join()).ok, true);
    assert.equal(w.stored().revision - before, 1, 'explicit defaults normalized once, as before');
    w.close();
  });
}
