import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { normalizeSettings, loadSettings, saveSettings, SETTINGS_STORAGE_KEY as KEY, MIDNIGHT_STORAGE_KEY as SIDE, MIDNIGHT_PENDING_KEY as PENDING } from './settings-store.js';
import { usesPortRepository, readPortStore, writePortStore, registerPortRepository } from './port-dataset-storage.js?v=1.24.24';
import { PortDatasetRepository, PORT_DATASET_KEYS } from './port-dataset-repository.js?v=1.24.24';
import { readStorageValue, assertStorageUnchanged, acceptStorageValues } from './storage-conflict.js?v=0.59.3';
const oldSource = fs.readFileSync(new URL('tests/midnight-fixtures/settings-store.js.fixture', import.meta.url), 'utf8');
function oldCode() {
  const c = { usesPortRepository, readPortStore, writePortStore, readStorageValue, assertStorageUnchanged, acceptStorageValues };
  vm.runInNewContext(oldSource.replace(/^import .*;\n/gm, '').replace(/export /g, ''), c);
  return c;
}
function store(initial = { version: 3, fontSize: 'medium', theme: 'light' }) {
  const data = new Map([[KEY, JSON.stringify(normalizeSettings(initial))]]);
  const handle = () => ({ getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) });
  return { data, handle };
}
const select = (storage, theme) => saveSettings({ ...loadSettings(storage).settings, theme }, storage, { themeChanged: true });

test('new Midnight -> frozen old Port font-only save -> restart restores Midnight without Cloud Sync fields', () => {
  const s = store(), modern = s.handle(), old = s.handle(), legacy = oldCode();
  assert.equal(select(modern, 'midnight').ok, true);
  assert.equal(JSON.parse(s.data.get(KEY)).theme, 'light', 'old supported theme remains its local fallback');
  assert.equal(legacy.loadSettings(old).settings.theme, 'light');
  assert.equal(legacy.saveSettings({ ...legacy.loadSettings(old).settings, fontSize: 'large' }, old).ok, true);
  assert.equal(loadSettings(s.handle()).settings.theme, 'midnight');
  assert.equal(loadSettings(s.handle()).settings.fontSize, 'large');
  assert.equal(PORT_DATASET_KEYS.includes(SIDE), false, 'not synchronized or added to dataset protocol');
});

test('explicit old different theme wins; old selection of the unchanged fallback is indistinguishable', () => {
  const s = store(), legacy = oldCode();
  select(s.handle(), 'midnight');
  const old = s.handle(); legacy.loadSettings(old);
  legacy.saveSettings({ ...legacy.loadSettings(old).settings, theme: 'gray' }, old);
  assert.equal(loadSettings(s.handle()).settings.theme, 'gray');
  select(s.handle(), 'midnight'); // fallback is now Gray
  const again = s.handle(); legacy.loadSettings(again);
  legacy.saveSettings({ ...legacy.loadSettings(again).settings, theme: 'gray' }, again);
  assert.equal(loadSettings(s.handle()).settings.theme, 'midnight', 'same-value old taps emit no distinguishable intent');
  assert.equal(select(s.handle(), 'gray').ok, true, 'new explicit same-fallback tap clears the override');
  assert.equal(s.data.has(SIDE), false);
  assert.equal(loadSettings(s.handle()).settings.theme, 'gray');
});

test('old pre-opened tab cannot erase the separate choice; stale new tab is refused', () => {
  const s = store(), old = s.handle(), stale = s.handle(), legacy = oldCode();
  const priorOld = legacy.loadSettings(old).settings, priorNew = loadSettings(stale).settings;
  select(s.handle(), 'midnight');
  assert.equal(legacy.saveSettings({ ...priorOld, fontSize: 'small' }, old).ok, true);
  const before = new Map(s.data);
  assert.equal(saveSettings({ ...priorNew, fontSize: 'large' }, stale).ok, false);
  assert.deepEqual(s.data, before);
  assert.equal(loadSettings(s.handle()).settings.theme, 'midnight');
});

test('repository-backed new/old writes preserve choice, share existing CAS, reset explicitly exits Midnight', async () => {
  const s = store(), modern = s.handle(), old = s.handle();
  const locks = { request: async (_name, _options, fn) => fn() };
  for (const handle of [modern, old]) registerPortRepository(handle, new PortDatasetRepository({ storage: handle, locks }));
  assert.equal((await select(modern, 'midnight')).ok, true);
  const legacy = oldCode(), before = legacy.loadSettings(old).settings;
  assert.equal((await legacy.saveSettings({ ...before, fontSize: 'large' }, old)).ok, true);
  assert.equal(loadSettings(modern).settings.theme, 'midnight');
  assert.equal(loadSettings(modern).settings.fontSize, 'large');
  assert.equal((await select(modern, 'dark')).ok, true);
  assert.equal(loadSettings(modern).settings.theme, 'dark');
  assert.equal(s.data.has(SIDE), false);
});

test('overlay failures report unsaved choice and do not destroy an existing selection', () => {
  const s = store(), good = s.handle(); select(good, 'midnight');
  const bad = s.handle(); loadSettings(bad);
  bad.removeItem = () => { throw Error('quota/private mode'); };
  assert.equal(saveSettings({ ...loadSettings(bad).settings, theme: 'light' }, bad, { themeChanged: true }).ok, false);
  assert.equal(JSON.parse(s.data.get(SIDE)).theme, 'midnight');
});

for (const repository of [false, true]) {
  test(`failed writes/cleanup keep the prior theme across restart and ordinary saves (repository=${repository})`, async () => {
    for (const failure of ['base', 'overlay', 'journal-cleanup']) {
      const s = store(), good = s.handle(); await select(good, 'midnight');
      const bad = s.handle();
      if (repository) registerPortRepository(bad, new PortDatasetRepository({storage:bad,
        locks:{request:async(_n,_o,fn)=>fn()}}));
      loadSettings(bad);
      const set = bad.setItem, remove = bad.removeItem;
      // After the durable journal, simulate persistent storage failures. Recovery must
      // not depend on compensating writes succeeding.
      let failed = false;
      bad.setItem = (k,v) => {
        if (failed || failure === 'base' && k === KEY) { failed = true; throw Error('quota'); }
        return set(k,v);
      };
      bad.removeItem = k => {
        if (failed || failure === 'overlay' && k === SIDE || failure === 'journal-cleanup' && k === PENDING) {
          failed = true; throw Error('storage blocked');
        }
        return remove(k);
      };
      assert.equal((await select(bad, 'gray')).ok, false, failure);
      assert.equal(loadSettings(s.handle()).settings.theme, 'midnight', failure + ': restart');
      const retry = s.handle();
      const font = await saveSettings({...loadSettings(retry).settings,fontSize:'large'},retry);
      assert.equal(font.ok,true); assert.equal(loadSettings(s.handle()).settings.theme,'midnight');
      assert.equal((await select(retry,'gray')).ok,true);
      assert.equal(loadSettings(s.handle()).settings.theme,'gray'); assert.equal(s.data.has(PENDING),false);
      assert.equal(PORT_DATASET_KEYS.includes(PENDING),false);
    }
  });
}

test('journal allocation failure changes neither settings nor the selected theme', () => {
  const s = store(), storage = s.handle(); select(storage, 'midnight');
  const before = new Map(s.data); const write = storage.setItem;
  storage.setItem = (key,value) => { if(key === PENDING) throw Error('quota'); return write(key,value); };
  assert.equal(select(storage,'gray').ok,false); assert.deepEqual(s.data,before);
  assert.equal(loadSettings(s.handle()).settings.theme,'midnight');
});

test('Port Midnight tokens exactly reuse the existing Studio Port projection (read-only source)', () => {
  const studio = fs.readFileSync(new URL('../cruise-studio/js/core/port-frame-theme.js',import.meta.url),'utf8');
  const css = fs.readFileSync(new URL('style.css',import.meta.url),'utf8');
  const original=studio.match(/var css = '[^']*\{([^}]+)\}'/)[1];
  const actual=css.match(/:root\[data-theme="midnight"\]\s*\{([^}]+)\}/)[1];
  const tokens=s=>Object.fromEntries([...s.matchAll(/(--port-[\w-]+):\s*([^;]+);/g)].map(m=>[m[1],m[2].trim()]));
  assert.deepEqual(tokens(actual),tokens(original));
});

test('both startup bootstraps restore overlay before stylesheet; invalid overlay keeps ordinary theme', () => {
  for (const path of ['index.html', 'pro_9a3943176561/index.html']) {
    const html = fs.readFileSync(new URL(path, import.meta.url), 'utf8');
    const source = html.match(/<script>\s*\/\/ Port color theme[\s\S]*?<\/script>/)[0].replace(/<\/?script>/g, '');
    assert.ok(html.indexOf(source) < html.indexOf('<link rel="stylesheet"'));
    const s = store(); select(s.handle(), 'midnight');
    const run = () => { const attrs = {}, meta = {}; vm.runInNewContext(source, { localStorage: s.handle(), document: {
      documentElement: { setAttribute(k,v) { attrs[k] = v; } }, querySelector: () => ({ setAttribute(k,v) { meta[k] = v; } }) } }); return { attrs, meta }; };
    assert.equal(run().attrs['data-theme'], 'midnight'); assert.equal(run().meta.content, '#10151c');
    s.data.set(KEY,JSON.stringify({...JSON.parse(s.data.get(KEY)),theme:'gray'}));
    s.data.set(PENDING,JSON.stringify({version:1,beforeTheme:'midnight',baseTheme:'light',nextBaseTheme:'gray'}));
    assert.equal(run().attrs['data-theme'],'midnight','failed transaction restored before first paint');
    s.data.delete(PENDING); s.data.set(KEY,JSON.stringify({...JSON.parse(s.data.get(KEY)),theme:'light'}));
    s.data.set(SIDE, '{bad json'); assert.equal(run().attrs['data-theme'], 'light');
  }
});
