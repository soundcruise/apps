// settings_theme_v1: the per-field capability that hides a settings theme from clients that cannot
// validate it and keeps the stored theme when such a client writes settings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { encodeCursor, hashRecord } from '../src/records.js';
import {
  parseBodyCapabilities, parseQueryCapabilities, preserveHiddenSettings, visibleRecordView, visibleRecordViews
} from '../src/sync-capabilities.js';
import { world } from './theme-compat-harness.js';

const CAP = 'settings_theme_v1';
const capable = new Set([CAP]);
const settings = (values, extra = {}) => ({ recordType: 'settings', recordId: 'settings', schemaVersion: 1, revision: 4,
  payload: values ? { id: 'settings', values } : null, payloadHash: 'x', deletedAt: values ? null : 9, ...extra });

test('settings_theme_v1 is accepted for Pitch / Fretboard / Rhythm only', () => {
  for (const appId of ['pitch', 'fretboard', 'rhythm']) {
    assert.deepEqual([...parseBodyCapabilities([CAP], appId)], [CAP], appId);
    const url = new URL(`https://sync.soundcruise.jp/v1/sync/snapshot?appId=${appId}&capabilities=${CAP}`);
    assert.deepEqual([...parseQueryCapabilities(url, appId)], [CAP], appId);
  }
  for (const appId of ['port', 'chord']) assert.deepEqual([...parseBodyCapabilities([CAP], appId)], [], appId);
});

test('views: capable clients see everything; others get the record without theme and a matching hash', async () => {
  for (const appId of ['pitch', 'fretboard', 'rhythm']) {
    const record = settings({ tempo: 90, theme: 'gray' });
    assert.equal(await visibleRecordView(appId, record, capable), record, 'capable: unchanged object');
    const view = await visibleRecordView(appId, record);
    assert.deepEqual(view.payload.values, { tempo: 90 });
    assert.equal(view.payloadHash, await hashRecord(view, webcrypto, appId));
    assert.equal(view.revision, 4, 'revision is unchanged');
    const only = await visibleRecordView(appId, settings({ theme: 'light' }));
    assert.equal(only.payload, null);
    assert.ok(only.deletedAt != null, 'a theme-only record is shown as removed');
    assert.equal(only.payloadHash, await hashRecord({ ...only, payload: null }, webcrypto, appId));
    const plain = settings({ tempo: 90 });
    assert.equal(await visibleRecordView(appId, plain), plain, 'no theme: unchanged object');
    const tomb = settings(null);
    assert.equal(await visibleRecordView(appId, tomb), tomb, 'tombstones pass through');
    const other = { ...settings({ theme: 'x' }), recordType: 'custom_chord', recordId: 'c' };
    assert.equal(await visibleRecordView(appId, other), other, 'other record types are untouched');
  }
  for (const appId of ['port', 'chord']) {
    const record = settings({ theme: 'gray', displaySize: 'standard' });
    assert.equal(await visibleRecordView(appId, record), record, `${appId}: no field gate`);
  }
  const list = [settings({ theme: 'gray', tempo: 1 }), settings(null, { recordId: 'z' })];
  const views = await visibleRecordViews('fretboard', list);
  assert.equal(views.length, 2);
  assert.deepEqual(views[0].payload.values, { tempo: 1 });
});

test('writes from non-capable clients keep the stored theme only at the exact base revision', async () => {
  const appId = 'rhythm';
  const current = settings({ tapLayout: 'ud', theme: 'charcoal' });
  const op = (values, baseRevision = 4) => ({ operationId: 'o', recordType: 'settings', recordId: 'settings', schemaVersion: 1,
    baseRevision, payload: values ? { id: 'settings', values } : null, payloadHash: 'client', deleted: !values, operationHash: 'h' });
  let next = await preserveHiddenSettings(appId, op({ tapLayout: 'lr' }), current);
  assert.deepEqual(next.payload.values, { tapLayout: 'lr', theme: 'charcoal' });
  assert.equal(next.payloadHash, await hashRecord(next, webcrypto, appId));
  assert.equal(next.operationHash, 'h', 'operation identity (retry detection) is unchanged');
  next = await preserveHiddenSettings(appId, op(null), current);
  assert.equal(next.deleted, false, 'a reset (delete) keeps a theme-only record');
  assert.deepEqual(next.payload, { id: 'settings', values: { theme: 'charcoal' } });
  const stale = op({ tapLayout: 'lr' }, 3);
  assert.equal(await preserveHiddenSettings(appId, stale, current), stale, 'stale base: left to the normal conflict');
  const fromCapable = op({ tapLayout: 'lr' });
  assert.equal(await preserveHiddenSettings(appId, fromCapable, current, capable), fromCapable, 'capable writers decide themselves');
  const noTheme = op({ tapLayout: 'lr' });
  assert.equal(await preserveHiddenSettings(appId, noTheme, settings({ tapLayout: 'ud' })), noTheme);
  for (const appId of ['chord', 'port']) {
    const untouched = op({ displaySize: 'standard' });
    assert.equal(await preserveHiddenSettings(appId, untouched, current), untouched, `${appId}: no field gate`);
  }
});

test('the changes feed and push results follow the same view', async () => {
  const w = world('fretboard');
  w.db.raw.prepare("UPDATE sync_datasets SET state = 'ready'").run();
  const writer = w.rawWriter(w.addDevice());
  const put = await writer.put({ tempo: 88, theme: 'gray' });
  assert.equal(put.results[0].record.payload.values.theme, 'gray');
  const reader = w.addDevice();
  const fetch = w.fetchFor(reader);
  const cursor = encodeCursor(0);
  const changes = await (await fetch(`https://sync.soundcruise.jp/v1/sync/changes?appId=fretboard&cursor=${cursor}`)).json();
  assert.equal(changes.ok, true, JSON.stringify(changes));
  const change = changes.changes.find((item) => item.recordType === 'settings');
  assert.deepEqual(change.payload.values, { tempo: 88 });
  assert.equal(change.payloadHash, await hashRecord(change, webcrypto, 'fretboard'));
  const capableChanges = await (await fetch(`https://sync.soundcruise.jp/v1/sync/changes?appId=fretboard&cursor=${cursor}&capabilities=${CAP}`)).json();
  assert.equal(capableChanges.ok, true);
  assert.equal(capableChanges.changes.find((item) => item.recordType === 'settings').payload.values.theme, 'gray');
  // A stale write from a non-capable client conflicts, and the conflict record it receives has no theme.
  const op = { operationId: webcrypto.randomUUID(), recordType: 'settings', recordId: 'settings', schemaVersion: 1,
    baseRevision: 0, payload: { id: 'settings', values: { tempo: 120 } }, payloadHash: '', deleted: false };
  op.payloadHash = await hashRecord({ ...op }, webcrypto, 'fretboard');
  const pushed = await (await fetch('https://sync.soundcruise.jp/v1/sync/push', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appId: 'fretboard', mode: 'sync', operations: [op] }) })).json();
  assert.equal(pushed.results[0].status, 'conflict');
  assert.deepEqual(pushed.results[0].record.payload.values, { tempo: 88 });
  assert.equal(pushed.results[0].record.payloadHash, await hashRecord(pushed.results[0].record, webcrypto, 'fretboard'));
  assert.equal(w.stored().values.theme, 'gray');
  w.close();
});
