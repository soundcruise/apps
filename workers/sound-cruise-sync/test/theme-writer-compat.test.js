// Theme writer backward compatibility, end to end: the real Worker (SQLite-backed D1), the real shared
// sync runtime and the real app sync adapters (see theme-compat-harness.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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

// ── Writer clients (current adapters that declare settings_theme_v1) ──────────────────────────────────
const isWriter = (appId) => fs.readFileSync(new URL(`../../../apps/${APPS[appId].current}`, import.meta.url), 'utf8')
  .includes("'settings_theme_v1'");
const themeOf = (d) => APPS[d.item ? Object.keys(APPS).find((id) => APPS[id] === d.item) : 'pitch'].theme(d.settings());
const setTheme = (d, theme) => d.change((settings) => { settings.theme = theme; });

for (const appId of Object.keys(APPS)) {
  const skip = isWriter(appId) ? false : 'writer not enabled for this app yet';
  test(`${appId} writer: two devices round-trip all four themes without conflicts`, { skip }, async () => {
    const w = world(appId);
    const a = device(w, 'current');
    const b = device(w, 'current');
    assert.equal((await a.join()).ok, true);
    assert.equal((await b.join()).ok, true);
    assert.equal(w.stored().values.theme, undefined, 'no theme chosen: none is sent');
    const step = async (from, to, theme) => {
      setTheme(from, theme);
      assert.equal((await from.sync('save')).ok, true, `push ${theme}`);
      assert.equal(w.stored().values.theme, theme);
      assert.equal((await to.sync('focus')).ok, true, `pull ${theme}`);
      assert.equal(themeOf(to), theme, `${theme} arrives`);
      assert.equal((await a.conflicts()).length + (await b.conflicts()).length, 0, `no conflicts at ${theme}`);
    };
    await step(a, b, 'light');
    await step(b, a, 'charcoal');
    await step(a, b, 'gray');
    await step(a, b, 'dark');
    w.close();
  });

  test(`${appId} writer: an unset device adopts the cloud theme and never sends dark for it`, { skip }, async () => {
    const w = world(appId);
    const item = APPS[appId];
    const a = device(w, 'current');
    await a.join();
    setTheme(a, 'light');
    await a.sync('save');
    const b = device(w, 'current');   // fresh device, theme never chosen
    assert.equal((await b.join()).ok, true);
    assert.equal(themeOf(b), 'light', 'adopted as the device theme');
    b.change((settings) => { settings[item.other.field] = item.other.to; });
    assert.equal((await b.sync('save')).ok, true);
    assert.equal(w.stored().values.theme, 'light', 'still light after the unset device wrote settings');
    assert.equal(w.stored().values[item.other.field], item.other.to);
    assert.equal((await b.conflicts()).length, 0);
    w.close();
  });

  test(`${appId} writer: theme and unrelated settings changed on different devices both survive`, { skip }, async () => {
    const w = world(appId);
    const item = APPS[appId];
    const a = device(w, 'current');
    const b = device(w, 'current');
    await a.join(); await b.join();
    setTheme(a, 'charcoal');                                              // A: theme
    b.change((settings) => { settings[item.other.field] = item.other.to; }); // B: another field, same time
    assert.equal((await a.sync('save')).ok, true);
    assert.equal((await b.sync('save')).ok, true);
    assert.equal((await a.sync('focus')).ok, true);
    assert.equal(w.stored().values.theme, 'charcoal');
    assert.equal(w.stored().values[item.other.field], item.other.to);
    assert.equal(themeOf(b), 'charcoal');
    assert.equal(a.settings()[item.other.field], item.other.to);
    assert.equal((await a.conflicts()).length + (await b.conflicts()).length, 0, 'field merge, no dialog');
    // Same theme chosen on both devices at once: no conflict either.
    setTheme(a, 'gray'); setTheme(b, 'gray');
    assert.equal((await a.sync('save')).ok, true);
    assert.equal((await b.sync('save')).ok, true);
    assert.equal((await a.conflicts()).length + (await b.conflicts()).length, 0);
    assert.equal(w.stored().values.theme, 'gray');
    w.close();
  });

  for (const kind of ['old', 'reader']) {
    test(`${appId} writer + ${kind} client: the ${kind} client syncs, its writes keep the theme, writers keep theirs`, { skip }, async () => {
      const w = world(appId);
      const item = APPS[appId];
      const a = device(w, 'current');
      await a.join();
      setTheme(a, 'charcoal');
      assert.equal((await a.sync('save')).ok, true);
      const o = device(w, kind, (() => { const m = new Map(Object.entries(item.seed())); return Object.fromEntries(m); })());
      const joined = await o.join();
      assert.equal(joined.ok, true, `${kind} join ${JSON.stringify(joined)}`);
      assert.equal((await o.conflicts()).length, 0);
      o.change((settings) => { settings[item.other.field] = item.other.to; });
      assert.equal((await o.sync('save')).ok, true, `${kind} push`);
      assert.equal(w.stored().values.theme, 'charcoal', `${kind} client never erases the theme`);
      assert.equal((await a.sync('focus')).ok, true);
      assert.equal(themeOf(a), 'charcoal', 'writer keeps its theme');
      assert.equal(a.settings()[item.other.field], item.other.to, `writer receives the ${kind} client's change`);
      setTheme(a, 'light');
      assert.equal((await a.sync('save')).ok, true);
      assert.equal((await o.sync('focus')).ok, true, `${kind} client keeps syncing after a new theme`);
      assert.equal((await o.conflicts()).length + (await a.conflicts()).length, 0);
      assert.equal(w.stored().values.theme, 'light');
      w.close();
    });
  }
}
