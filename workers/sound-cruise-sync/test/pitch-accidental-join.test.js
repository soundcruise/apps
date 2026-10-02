// Pitch ♯/♭ display (accidentalDisplay) across devices, end to end on the real Worker (SQLite D1), the real
// shared runtime and the real Pitch adapter. A device that never touched ♯/♭ has no stored value; the
// cloud may or may not carry one. Joining must neither fail its manifest check nor invent a cloud write.
import test from 'node:test';
import assert from 'node:assert/strict';
import { device, world } from './theme-compat-harness.js';

const PRO = { instrument: 'piano', notationStyle: 'cde', scaleEnabled: true, isAnswerMode: true, keyRandomMode: false,
  baseOctave: 3, keyOffset: 0, noteSpeed: 1, sustainTime: 1.5, baseHz: 440 };
const pitchState = (accidental, theme) => ({
  pitchTrainerSettings: JSON.stringify({ ...PRO, ...(theme ? { theme } : {}) }),
  ...(accidental ? { pitchTrainerProAccidentalDisplay: accidental } : {})
});
const label = (value) => value || 'missing';

// cloud: the ♯/♭ value device A put in the cloud; local: device B's own stored value before joining.
const CASES = [
  { cloud: null, local: null, expect: { ok: true, local: null, cloud: null, cloudWrites: 0 } },
  { cloud: 'sharp', local: null, expect: { ok: true, local: 'sharp', cloud: 'sharp', cloudWrites: 0 } },
  { cloud: 'flat', local: null, expect: { ok: true, local: 'flat', cloud: 'flat', cloudWrites: 0 } },
  { cloud: null, local: 'sharp', expect: { ok: true, local: 'sharp', cloud: 'sharp', cloudWrites: 1 } },
  { cloud: 'flat', local: 'sharp', expect: { ok: false, conflicts: 1 } }
];

async function joinCase({ cloud, local }, theme) {
  const w = world('pitch');
  const a = device(w, 'current', pitchState(cloud, theme));
  const first = await a.join();
  assert.equal(first.ok, true, `device A ${JSON.stringify(first)}`);
  assert.equal(w.stored().values.accidentalDisplay, cloud ?? undefined, 'device A seeded the cloud');
  const before = w.stored().revision;
  const b = device(w, 'current', pitchState(local, theme));
  const joined = await b.join();
  const result = {
    ok: joined.ok === true, code: joined.code || null,
    conflicts: (await b.conflicts()).length,
    local: b.data.get('pitchTrainerProAccidentalDisplay') ?? null,
    cloud: w.stored().values.accidentalDisplay ?? null,
    cloudWrites: w.stored().revision - before,
    others: (({ accidentalDisplay, theme: storedTheme, ...rest }) => rest)(w.stored().values),
    theme: w.stored().values.theme ?? null,
    localSettings: JSON.parse(b.data.get('pitchTrainerSettings'))
  };
  w.close();
  return result;
}

for (const testCase of CASES) {
  test(`pitch join: cloud ♯/♭ ${label(testCase.cloud)}, joining device ${label(testCase.local)}`, async () => {
    const plain = await joinCase(testCase, null);
    const themed = await joinCase(testCase, 'charcoal');
    const { expect } = testCase;
    if (expect.ok) {
      assert.equal(plain.ok, true, `join must succeed: ${JSON.stringify(plain)}`);
      assert.equal(plain.conflicts, 0);
      assert.equal(plain.local, expect.local, 'joining device ♯/♭');
      assert.equal(plain.cloud, expect.cloud, 'cloud ♯/♭');
      assert.equal(plain.cloudWrites, expect.cloudWrites, 'no cloud write unless the device holds a value the cloud lacks');
    } else {
      assert.equal(plain.ok, false);
      assert.equal(plain.conflicts, expect.conflicts, 'two different explicit values: the existing conflict rule');
    }
    for (const [key, value] of Object.entries({ instrument: 'piano', notationStyle: 'cde', scaleEnabled: true, isAnswerMode: true,
      keyRandomMode: false, baseOctave: 3, keyOffset: 0, noteSpeed: 1 })) {
      assert.equal(plain.others[key], value, `cloud keeps ${key}`);
      assert.equal(plain.localSettings[key], value, `joining device keeps ${key}`);
    }
    assert.equal(plain.localSettings.baseHz, 440, 'device-only settings stay');
    // The theme is orthogonal: the same outcome with a theme in the cloud.
    const strip = ({ theme, localSettings, ...rest }) => ({ ...rest, localSettings: (({ theme: t, ...s }) => s)(localSettings) });
    assert.deepEqual(strip(themed), strip(plain), 'identical with and without a theme');
    if (expect.ok) assert.equal(themed.theme, 'charcoal');
  });
}

test('pitch ♯/♭: explicit choices round-trip between two devices without conflicts', async () => {
  const w = world('pitch');
  const a = device(w, 'current', pitchState(null));
  const b = device(w, 'current', pitchState(null));
  assert.equal((await a.join()).ok, true);
  assert.equal((await b.join()).ok, true);
  for (const [from, to, value] of [[a, b, 'flat'], [b, a, 'sharp'], [a, b, 'flat']]) {
    from.data.set('pitchTrainerProAccidentalDisplay', value);
    assert.equal((await from.sync('save')).ok, true);
    assert.equal(w.stored().values.accidentalDisplay, value);
    assert.equal((await to.sync('focus')).ok, true);
    assert.equal(to.data.get('pitchTrainerProAccidentalDisplay'), value, `${value} arrives`);
  }
  assert.equal((await a.conflicts()).length + (await b.conflicts()).length, 0);
  w.close();
});

test('pitch ♯/♭: untouched devices never write a value, while other settings and the theme sync', async () => {
  const w = world('pitch');
  const a = device(w, 'current', pitchState(null));
  const b = device(w, 'current', pitchState(null));
  await a.join(); await b.join();
  const change = (d, mutate) => { const s = JSON.parse(d.data.get('pitchTrainerSettings')); mutate(s); d.data.set('pitchTrainerSettings', JSON.stringify(s)); };
  change(a, (s) => { s.instrument = 'ukulele'; s.theme = 'gray'; });
  assert.equal((await a.sync('save')).ok, true);
  const afterWrite = w.stored().revision;
  for (let cycle = 0; cycle < 3; cycle += 1) {
    assert.equal((await b.sync('focus')).ok, true);
    assert.equal((await a.sync('focus')).ok, true);
  }
  assert.equal(w.stored().revision, afterWrite, 'no churn: settling cycles write nothing');
  assert.equal(w.stored().values.accidentalDisplay, undefined, 'never chosen stays absent in the cloud');
  assert.equal(b.data.get('pitchTrainerProAccidentalDisplay'), undefined, 'and on the device (shown as ♯)');
  assert.equal(JSON.parse(b.data.get('pitchTrainerSettings')).instrument, 'ukulele');
  assert.equal(JSON.parse(b.data.get('pitchTrainerSettings')).theme, 'gray');
  assert.equal((await a.conflicts()).length + (await b.conflicts()).length, 0);
  w.close();
});

test('pitch ♯/♭: a "sharp" left by an older release is synced once as an explicit value, then settles', async () => {
  const w = world('pitch');
  const a = device(w, 'current', pitchState(null));
  const b = device(w, 'current', pitchState(null));
  await a.join(); await b.join();
  // Releases up to 2.27.0 stored 'sharp' on every Cloud Sync apply even when the cloud had no value.
  b.data.set('pitchTrainerProAccidentalDisplay', 'sharp');
  const before = w.stored().revision;
  assert.equal((await b.sync('focus')).ok, true);
  assert.equal(w.stored().values.accidentalDisplay, 'sharp');
  assert.equal(w.stored().revision, before + 1, 'one settings write');
  for (let cycle = 0; cycle < 3; cycle += 1) {
    assert.equal((await a.sync('focus')).ok, true);
    assert.equal((await b.sync('focus')).ok, true);
  }
  assert.equal(w.stored().revision, before + 1, 'then no further writes');
  assert.equal(a.data.get('pitchTrainerProAccidentalDisplay'), 'sharp');
  assert.equal((await a.conflicts()).length + (await b.conflicts()).length, 0);
  w.close();
});

for (const kind of ['old', 'reader']) {
  test(`pitch ♯/♭: an installed ${kind} client keeps syncing beside the fixed release`, async () => {
    const w = world('pitch');
    const o = device(w, kind, pitchState(null));
    assert.equal((await o.join()).ok, true, `${kind} creates the cloud`);
    const a = device(w, 'current', pitchState(null, 'light'));
    const joined = await a.join();
    assert.equal(joined.ok, true, `fixed release joins ${JSON.stringify(joined)}`);
    assert.equal((await a.sync('save')).ok, true);
    const s = JSON.parse(o.data.get('pitchTrainerSettings')); s.instrument = 'ukulele'; o.data.set('pitchTrainerSettings', JSON.stringify(s));
    assert.equal((await o.sync('save')).ok, true, `${kind} push`);
    assert.equal((await a.sync('focus')).ok, true);
    assert.equal(JSON.parse(a.data.get('pitchTrainerSettings')).instrument, 'ukulele');
    assert.equal(w.stored().values.theme, 'light', 'cloud theme kept');
    assert.equal(JSON.parse(a.data.get('pitchTrainerSettings')).theme, 'light');
    assert.equal((await a.conflicts()).length + (await o.conflicts()).length, 0);
    w.close();
  });

  // A fresh join *by an older release* still runs that release's own code; the fix cannot change it.
  // Its outcome must be the same whether the cloud was written by the fixed release or by an older one.
  test(`pitch ♯/♭: a fresh ${kind} join behaves exactly as before the fix`, async () => {
    const outcome = async (firstKind) => {
      const w = world('pitch');
      const first = device(w, firstKind, pitchState(null));
      assert.equal((await first.join()).ok, true);
      const late = device(w, kind, pitchState(null));
      const r = await late.join();
      const result = { ok: r.ok === true, code: r.code || null, conflicts: (await late.conflicts()).length,
        cloud: JSON.stringify(w.stored().values) };
      w.close();
      return result;
    };
    assert.deepEqual(await outcome('current'), await outcome(kind));
  });
}
