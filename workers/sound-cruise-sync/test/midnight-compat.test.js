import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { APPS, device, world } from './theme-compat-harness.js';
import { encodeCursor, hashRecord, manifestHash } from '../src/records.js';
import { parseBodyCapabilities, preserveHiddenSettings, visibleRecordView } from '../src/sync-capabilities.js';
import { validateRecordPayload } from '../src/record-schema-registry.js';
const V1 = ['settings_theme_v1'], V2 = ['settings_theme_v2'];
const ok = result => assert.equal(result.ok, true, JSON.stringify(result));

test('five theme IDs are valid; invalid IDs/types and unrelated unknown fields remain invalid', () => {
  for (const app of Object.keys(APPS)) {
    for (const theme of ['dark','midnight','charcoal','gray','light']) {
      assert.equal(validateRecordPayload(app,'settings','settings',{id:'settings',values:{theme}}),true,app+' '+theme);
    }
    for (const theme of ['Midnight','sepia','',null,1,[],{}]) {
      assert.equal(validateRecordPayload(app,'settings','settings',{id:'settings',values:{theme}}),false,app);
    }
    assert.equal(validateRecordPayload(app,'settings','settings',{id:'settings',values:{theme:'midnight',unknown:true}}),false);
  }
});

for (const appId of Object.keys(APPS)) {
  test(`${appId}: ambiguous legacy Dark echo protects Midnight; non-theme changes still converge`, async t => {
    const w = world(appId); t.after(() => w.close());
    const old = device(w,'v1'); ok(await old.join());
    ok(await w.rawWriter(w.addDevice()).put({...w.stored().values,theme:'midnight'},V2));
    ok(await old.sync());
    old.change(s => { s.theme='dark'; s[old.item.other.field]=old.item.other.to; });
    ok(await old.sync('save')); const revision=w.stored().revision;
    ok(await old.sync()); assert.equal(w.stored().revision,revision);
    assert.equal(w.stored().values.theme,'midnight');
    assert.equal(w.stored().values[old.item.other.field],old.item.other.to);
  });
  test(`${appId}: frozen v1 accepts the projected view, changes other values and cannot erase Midnight`, async t => {
    const w = world(appId); t.after(() => w.close());
    const old = device(w, 'v1'); ok(await old.join());
    assert.deepEqual([...old.adapter.syncCapabilities], V1);
    old.change(s => { s.theme = 'gray'; }); ok(await old.sync('save'));
    const writer = w.rawWriter(w.addDevice());
    ok(await writer.put({ ...w.stored().values, theme: 'midnight' }, V2));
    const view = await writer.snapshot(V1), row = view.records.find(r => r.recordType === 'settings');
    assert.equal(row.payload.values.theme, 'dark');
    assert.equal(row.payloadHash, await hashRecord(row, webcrypto, appId));
    assert.equal(view.manifestHash, await manifestHash(view.records.filter(r => r.deletedAt == null), 1, webcrypto, appId));
    ok(await old.sync());
    old.change(s => { s[old.item.other.field] = old.item.other.to; });
    ok(await old.sync('save'));
    assert.equal(w.stored().values.theme, 'midnight', 'ordinary v1 saves cannot replace Midnight with their projected Dark');
    assert.equal(w.stored().values[old.item.other.field], old.item.other.to);
    ok(await old.sync());
    assert.equal((await old.conflicts()).length, 0);
    // A new v2 device restores both fields from the same dataset.
    const freshSeed = new Map(Object.entries(old.item.seed()));
    old.item.write(freshSeed, s => { s[old.item.other.field] = old.item.other.to; });
    const fresh = device(w, 'current', Object.fromEntries(freshSeed)); ok(await fresh.join());
    assert.equal(fresh.settings().theme, 'midnight');
    assert.equal(fresh.settings()[old.item.other.field], old.item.other.to);
    // Existing modern v1 clients can already send Midnight. The new Worker must accept
    // that write but hide Midnight from EVERY v1 reader, not infer support from the value.
    fresh.adapter.syncCapabilities = V1;
    fresh.change(s => { s.theme = 'midnight'; }); ok(await fresh.sync('save')); ok(await fresh.sync());
    assert.equal(w.stored().values.theme, 'midnight');
  });

  test(`${appId}: frozen v1's four themes still round-trip when no protected value exists`, async t => {
    const w = world(appId); t.after(() => w.close());
    const old = device(w, 'v1'); ok(await old.join());
    for (const theme of ['light', 'charcoal', 'gray', 'dark']) {
      old.change(s => { s.theme = theme; }); ok(await old.sync('save'));
      assert.equal(w.stored().values.theme, theme);
      const full = await w.rawWriter(w.addDevice()).snapshot(V2);
      assert.equal(full.records.find(r => r.recordType === 'settings').payload.values.theme, theme);
    }
  });

  test(`${appId}: theme-only tombstone projection, cursor progression, retries/CAS and v2 deletion`, async t => {
    const w = world(appId); t.after(() => w.close());
    w.db.raw.prepare("UPDATE sync_datasets SET state = 'ready'").run();
    const id = w.addDevice(), writer = w.rawWriter(id), fetch = w.fetchFor(id);
    ok(await writer.put({ theme: 'midnight' }, V2));
    const snap = await writer.snapshot(V1), row = snap.records[0];
    assert.equal(snap.recordCount, 1); assert.deepEqual(row.payload.values, { theme: 'dark' });
    const preTheme = await writer.snapshot(false); assert.equal(preTheme.recordCount, 0); assert.equal(preTheme.records[0].payload, null);
    assert.equal(row.revision, w.stored().revision);
    assert.equal(snap.manifestHash, await manifestHash(snap.records, 1, webcrypto, appId));
    const changes = await (await fetch(`https://sync.soundcruise.jp/v1/sync/changes?appId=${appId}&cursor=${encodeCursor(0)}&capabilities=${V1}`)).json();
    ok(changes); assert.equal(changes.changes[0].payload.values.theme, 'dark');
    const after = await (await fetch(`https://sync.soundcruise.jp/v1/sync/changes?appId=${appId}&cursor=${changes.nextCursor}&capabilities=${V1}`)).json();
    assert.equal(after.changes.length, 0);
    assert.equal((await writer.snapshot(V2)).records[0].payload.values.theme, 'midnight', 'fresh full view after cursor passed hidden field');
    const op = { operationId: webcrypto.randomUUID(), recordType: 'settings', recordId: 'settings', schemaVersion: 1,
      baseRevision: w.stored().revision, payload: null, deleted: true };
    op.payloadHash = await hashRecord(op, webcrypto, appId);
    const push = async operation => (await (await fetch('https://sync.soundcruise.jp/v1/sync/push', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appId, mode: 'sync', capabilities: V1, operations: [operation] }) })).json()).results[0];
    assert.equal((await push(op)).status, 'applied');
    const revision = w.stored().revision;
    assert.equal(w.stored().deleted, false); assert.equal(w.stored().values.theme, 'midnight');
    assert.equal((await push(op)).status, 'duplicate'); assert.equal(w.stored().revision, revision);
    const stale = { ...op, operationId: webcrypto.randomUUID() };
    const conflict = await push(stale); assert.equal(conflict.status, 'conflict'); assert.equal(conflict.record.payload.values.theme, 'dark');
    assert.equal(w.stored().values.theme, 'midnight');
    ok(await writer.put(null, V2)); assert.equal(w.stored().deleted, true, 'v2 intentionally deletes');
  });
}

test('Chord flat settings retain four legacy themes; Midnight is projected and preserved until v2', async () => {
  const record = { recordType: 'settings', recordId: 'default', schemaVersion: 1, revision: 5,
    deletedAt: null, payload: { theme: 'midnight', accidentalDisplay: 'sharp' } };
  assert.deepEqual([...parseBodyCapabilities(V2, 'chord')], V2);
  const view = await visibleRecordView('chord', record);
  assert.deepEqual(view.payload, { theme: 'dark', accidentalDisplay: 'sharp' });
  assert.equal(view.payloadHash, await hashRecord(view, webcrypto, 'chord'));
  assert.equal(await visibleRecordView('chord', record, new Set(V2)), record);
  for (const theme of ['dark', 'charcoal', 'gray', 'light']) {
    const legacy = { ...record, payload: { theme } }; assert.equal(await visibleRecordView('chord', legacy), legacy);
  }
  for (const deleted of [true, false]) {
    const op = { recordType: 'settings', recordId: 'default', schemaVersion: 1, baseRevision: 5,
      deleted, payload: deleted ? null : { theme: 'light', accidentalDisplay: 'flat' }, operationHash: 'identity' };
    op.payloadHash = await hashRecord(op, webcrypto, 'chord');
    const kept = await preserveHiddenSettings('chord', op, record);
    assert.equal(kept.deleted, false); assert.equal(kept.payload.theme, deleted ? 'midnight' : 'light');
    assert.equal(kept.payloadHash, await hashRecord(kept, webcrypto, 'chord'));
    assert.equal(kept.operationHash, 'identity');
    assert.equal(await preserveHiddenSettings('chord', op, record, new Set(V2)), op);
  }
});
