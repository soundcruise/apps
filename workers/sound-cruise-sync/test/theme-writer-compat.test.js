// Theme writer backward compatibility, end to end: the real Worker (SQLite-backed D1), the real shared
// sync runtime and the real app sync adapters (see theme-compat-harness.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { hashRecord, manifestHash } from '../src/records.js';
import { APPS, device, world } from './theme-compat-harness.js';

for (const appId of Object.keys(APPS)) {
  test(`${appId}: an old client keeps syncing while the cloud stores a theme, and never erases it`, async () => {
    const w = world(appId);
    const item = APPS[appId];
    const old = device(w, 'old');
    let result = await old.join();
    assert.equal(result.ok, true, `old join ${JSON.stringify(result)}`);
    const writerId = w.addDevice();
    const writer = w.rawWriter(writerId);
    const base = w.stored().values;
    const put = await writer.put({ ...base, theme: 'charcoal' });
    assert.equal(put.results?.[0]?.status, 'applied', JSON.stringify(put));
    assert.equal(put.results[0].record.payload.values.theme, 'charcoal', 'a capable client sees what it wrote');

    // The old client sees the record without theme, with a matching hash and manifest.
    const oldView = await writer.snapshot(false);
    const oldSettings = oldView.records.find((record) => record.recordType === 'settings');
    assert.equal(oldSettings.payload.values.theme, undefined);
    assert.equal(oldSettings.payloadHash, await hashRecord(oldSettings, webcrypto, appId));
    assert.equal(oldView.manifestHash, await manifestHash(oldView.records.filter((record) => record.deletedAt == null), 1, webcrypto, appId));

    result = await old.sync('focus');
    assert.equal(result.ok, true, `old pull ${JSON.stringify(result)}`);
    assert.equal((await old.conflicts()).length, 0);
    assert.equal(item.theme(old.settings()), undefined, 'the old client never stores theme');

    // The old client changes an unrelated setting: it applies, and the cloud theme survives.
    old.change((settings) => { settings[item.other.field] = item.other.to; });
    result = await old.sync('save');
    assert.equal(result.ok, true, `old push ${JSON.stringify(result)}`);
    assert.equal((await old.conflicts()).length, 0);
    assert.equal(w.stored().values[item.other.field], item.other.to);
    assert.equal(w.stored().values.theme, 'charcoal', 'cloud theme preserved by the Worker');
    result = await old.sync('focus');
    assert.equal(result.ok, true, 'old client converges on the next cycle');
    assert.equal((await old.conflicts()).length, 0);
    const capable = await writer.snapshot(true);
    const full = capable.records.find((record) => record.recordType === 'settings');
    assert.equal(full.payload.values.theme, 'charcoal');
    assert.equal(full.payload.values[item.other.field], item.other.to);
    assert.equal(full.payloadHash, await hashRecord(full, webcrypto, appId), 'stored hash matches stored payload');

    // A fresh old device (same non-theme settings as the cloud) joins the dataset that carries theme.
    const lateSeed = new Map(Object.entries(item.seed()));
    item.write(lateSeed, (settings) => { settings[item.other.field] = item.other.to; });
    const late = device(w, 'old', Object.fromEntries(lateSeed));
    result = await late.join();
    assert.equal(result.ok, true, `fresh old join ${JSON.stringify(result)}`);
    assert.equal((await late.conflicts()).length, 0);
    assert.equal(late.settings()[item.other.field], item.other.to, 'unrelated settings still arrive');
    assert.equal(w.stored().values.theme, 'charcoal');
    w.close();
  });

  test(`${appId}: a theme-only settings record is invisible to old clients and survives their resets`, async () => {
    const w = world(appId);
    const item = APPS[appId];
    const writer = w.rawWriter(w.addDevice());
    w.db.raw.prepare("UPDATE sync_datasets SET state = 'ready'").run();
    // Writer device with only a theme (all other settings at defaults).
    const first = await writer.put({ theme: 'light' });
    assert.equal(first.results?.[0]?.status, 'applied', JSON.stringify(first));
    const oldView = await writer.snapshot(false);
    const hidden = oldView.records.find((record) => record.recordType === 'settings');
    assert.ok(hidden.deletedAt != null && hidden.payload === null, 'shown as removed to old clients');
    assert.equal(oldView.recordCount, 0);

    const old = device(w, 'old', item.empty());
    let result = await old.join();
    assert.equal(result.ok, true, `old join ${JSON.stringify(result)}`);
    assert.equal(w.stored().values.theme, 'light');
    old.change((settings) => { settings[item.other.field] = item.other.to; });
    result = await old.sync('save');
    assert.equal(result.ok, true, `old creates settings ${JSON.stringify(result)}`);
    assert.deepEqual({ theme: w.stored().values.theme, other: w.stored().values[item.other.field] }, { theme: 'light', other: item.other.to });
    old.change((settings) => { delete settings[item.other.field]; });
    result = await old.sync('save');
    assert.equal(result.ok, true, `old resets settings ${JSON.stringify(result)}`);
    assert.equal(w.stored().deleted, false, 'a reset on an old client never deletes the theme');
    assert.equal(w.stored().values.theme, 'light');
    result = await old.sync('focus');
    assert.equal(result.ok, true);
    assert.equal((await old.conflicts()).length, 0);
    w.close();
  });
}

// The decisive property: for an old client, a cloud theme is indistinguishable from no theme at all.
// The same scenario runs twice (writer with and without theme); every observable old-client outcome
// and every non-theme cloud value must be identical.
for (const kind of ['old', 'reader']) for (const appId of Object.keys(APPS)) {
  test(`${appId}: ${kind} client outcomes are identical with and without a cloud theme`, async () => {
    const item = APPS[appId];
    const run = async (theme) => {
      const w = world(appId);
      const old = device(w, kind);
      const trace = [];
      const record = async (label, result) => trace.push([label, result.ok, result.code || null,
        (await old.conflicts()).length, JSON.stringify(old.settings())]);
      await record('join', await old.join());
      const writer = w.rawWriter(w.addDevice());
      const base = w.stored().values;
      await writer.put(theme ? { ...base, theme } : { ...base });
      await record('pull', await old.sync('focus'));
      old.change((settings) => { settings[item.other.field] = item.other.to; });
      await record('push', await old.sync('save'));
      await record('settle', await old.sync('focus'));
      const lateSeed = new Map(Object.entries(item.seed()));
      item.write(lateSeed, (settings) => { settings[item.other.field] = item.other.to; });
      const late = device(w, kind, Object.fromEntries(lateSeed));
      const joined = await late.join();
      trace.push(['late-join', joined.ok, joined.code || null, (await late.conflicts()).length, JSON.stringify(late.settings())]);
      const { theme: storedTheme, ...rest } = w.stored().values;
      w.close();
      return { trace, cloud: JSON.stringify(rest), storedTheme };
    };
    const without = await run(null);
    const withTheme = await run('gray');
    assert.deepEqual(withTheme.trace, without.trace, 'every old-client step behaves the same');
    assert.equal(withTheme.cloud, without.cloud, 'non-theme cloud settings are the same');
    assert.equal(withTheme.storedTheme, 'gray', 'and the cloud theme survives');
    assert.ok(without.trace.every(([, ok]) => ok === true), JSON.stringify(without.trace));
  });
}
