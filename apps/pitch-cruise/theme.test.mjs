// Pitch Cruise color theme (Dark / Charcoal / Gray / Light): bootstrap, settings contract,
// generated theme layers and local-only Cloud Sync behaviour.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = import.meta.dirname;
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const script = read('script.js');
const pages = [
  ['standard', read('standard/index.html'), '../theme-colors.css?v='],
  ['pro', read('pro_x9v7q2m8/index.html'), '../theme-colors.css?v='],
  ['beta', read('beta/index.html'), '../theme-colors-beta.css?v=']
];
const BOOT_RE = /<script>\s*\/\/ Pitch color theme before first paint[\s\S]*?<\/script>/;
const SCOPE_RE = /^:root(\[data-theme="(charcoal|gray|light)"\]|:is\((\[data-theme="(charcoal|gray|light)"\](, )?)+\))/;

function runBootstrap(html, value, throwOnRead = false) {
  const code = html.match(BOOT_RE)[0].replace(/<\/?script>/g, '');
  const attrs = {};
  const head = [];
  vm.runInNewContext(code, {
    JSON,
    localStorage: { getItem: (key) => { if (throwOnRead) throw new Error('blocked'); return key === 'pitchTrainerSettings' ? value : null; } },
    document: {
      documentElement: { setAttribute: (name, v) => { attrs[name] = v; } },
      head: { appendChild: (node) => head.push(node) },
      createElement: () => ({ attrs: {}, setAttribute(n, v) { this.attrs[n] = v; } })
    }
  });
  return { theme: attrs['data-theme'], meta: head[0] ? head[0].attrs.content : null };
}

const saved = (extra) => JSON.stringify({ instrument: 'piano', notationStyle: 'doremi', ...extra });

test('every page bootstraps the theme before stylesheets and loads its theme layer last', () => {
  for (const [name, html, layer] of pages) {
    const at = html.indexOf('// Pitch color theme before first paint');
    assert(at > 0 && at < html.indexOf('rel="stylesheet"'), `${name}: bootstrap precedes stylesheets`);
    const links = [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map((m) => m[0]).filter((l) => !l.includes('fonts.googleapis.com'));
    assert(links.at(-1).includes(layer), `${name}: theme layer is the last local stylesheet`);
    assert(html.includes('<meta name="theme-color" content="#121212">'), `${name}: Dark theme-color meta unchanged`);
    for (const [value, theme, meta] of [
      [null, 'dark', null], [saved({}), 'dark', null], [saved({ theme: 'sepia' }), 'dark', null], ['{bad', 'dark', null],
      [saved({ theme: 'dark' }), 'dark', null], [saved({ theme: 'charcoal' }), 'charcoal', '#424346'],
      [saved({ theme: 'gray' }), 'gray', '#c8cbd0'], [saved({ theme: 'light' }), 'light', '#f5f6f6']
    ]) {
      const result = runBootstrap(html, value);
      assert.equal(result.theme, theme, `${name} ${value}`);
      assert.equal(result.meta, meta, `${name} meta`);
    }
    assert.equal(runBootstrap(html, null, true).theme, 'dark');
    assert.equal(html.match(BOOT_RE)[0], pages[0][1].match(BOOT_RE)[0], `${name}: same bootstrap`);
    const item = html.slice(html.indexOf('<h2>設定</h2>'), html.indexOf('<label>音名表記</label>'));
    const buttons = [...item.matchAll(/data-theme-choice="([a-z]+)" aria-pressed="(true|false)">([^<]+)</g)].map((m) => [m[1], m[2], m[3]]);
    assert.deepEqual(buttons, [['dark', 'true', 'ダーク'], ['charcoal', 'false', 'チャコール'], ['gray', 'false', 'グレー'], ['light', 'false', 'ライト']],
      `${name}: カラーテーマ leads the settings modal`);
  }
});

test('settings keep the theme explicitly, preview it, revert on cancel and reset to Dark', () => {
  assert.match(script, /const PITCH_THEMES = \['dark', 'charcoal', 'gray', 'light'\];/);
  assert.match(script, /if \(this\.theme !== undefined\) data\.theme = this\.theme;/, 'saveSettings keeps an explicit theme only');
  assert.match(script, /isAnswerMode: this\.isAnswerMode,\n            theme: this\.theme\n        \};/, 'snapshot carries the theme');
  assert.match(script, /if \(Object\.prototype\.hasOwnProperty\.call\(s, 'theme'\)\) \{\n                this\.theme = s\.theme;/, 'cancel restores the theme');
  assert.match(script, /\/\/ カラーテーマもダークへ戻す\n        this\.theme = 'dark';/, 'reset returns to Dark');
  const load = script.slice(script.indexOf('    loadSettings() {'), script.indexOf('    saveSettings() {'));
  assert(!/data\.theme|theme = 'dark'/.test(load), 'loading never writes or defaults a stored theme');
});

test('applyPitchTheme toggles data-theme and an extra theme-color meta ahead of the Dark one', () => {
  const start = script.indexOf('const PITCH_THEMES');
  const end = script.indexOf('function notifyPitchSyncSave');
  const nodes = [];
  const darkMeta = { name: 'dark', attrs: { content: '#121212' } };
  const doc = {
    documentElement: { attrs: {}, setAttribute(n, v) { this.attrs[n] = v; } },
    head: {
      insertBefore: (m, ref) => { nodes.splice(ref ? nodes.indexOf(ref) : nodes.length, 0, m); },
      querySelector: () => darkMeta
    },
    querySelector: (sel) => (sel.includes('data-pitch-theme-color') ? nodes.find((n) => n !== darkMeta && !n.removed) || null : null),
    querySelectorAll: () => [],
    createElement: () => ({ attrs: {}, setAttribute(n, v) { this.attrs[n] = v; }, remove() { this.removed = true; nodes.splice(nodes.indexOf(this), 1); } })
  };
  nodes.push(darkMeta);
  const ctx = vm.createContext({ document: doc });
  vm.runInContext(script.slice(start, end) + '\nthis.applyPitchTheme = applyPitchTheme; this.resolvePitchTheme = resolvePitchTheme;', ctx);
  ctx.applyPitchTheme('gray');
  assert.equal(doc.documentElement.attrs['data-theme'], 'gray');
  assert.equal(nodes[0].attrs.content, '#c8cbd0', 'theme meta precedes the Dark meta');
  ctx.applyPitchTheme('dark');
  assert.deepEqual(nodes, [darkMeta], 'Dark leaves only the original meta');
  for (const bad of [undefined, 'Light', 'sepia', 0]) assert.equal(ctx.resolvePitchTheme(bad), 'dark');
});

test('theme layers are scoped to Charcoal / Gray / Light and keep keys and feedback colors', () => {
  for (const file of ['theme-colors.css', 'theme-colors-beta.css']) {
    const layer = read(file);
    const body = layer.replace(/\/\*[\s\S]*?\*\//g, '');
    let depth = 0;
    let selector = '';
    for (const ch of body) {
      if (ch === '{') {
        const sel = selector.trim();
        if (!/^@(media|supports|keyframes)/.test(sel) && !/^((from|to|\d+(\.\d+)?%)\s*,?\s*)+$/.test(sel)) {
          for (const part of sel.split(/,\s*(?![^()]*\))/)) {
            const p = part.trim();
            assert(p.startsWith(':root:is([data-theme="charcoal"], [data-theme="gray"], [data-theme="light"])') || SCOPE_RE.test(p), `${file}: ${p.slice(0, 100)}`);
          }
        }
        depth += 1;
        selector = '';
      } else if (ch === '}') { depth -= 1; selector = ''; } else if (ch === ';' && depth > 0) { selector = ''; } else { selector += ch; }
    }
    assert(!/data-theme="dark"|prefers-color-scheme/.test(layer), `${file}: no Dark / OS theme`);
    assert(!/--white-key-color:|--black-key-color:|--key-active-color:|--tm-red:/.test(layer), `${file}: key and test-mode colors are never themed`);
  }
  assert(!read('theme-colors-beta.css').includes('pro-theme.css'), 'beta layer never mirrors pro-theme.css (beta does not load it)');
});

test('theme is local-only: listed in LOCAL_ONLY_SETTINGS, never sent, kept by remote apply', async () => {
  const source = read('sync/pitch-sync-adapter.js');
  const context = vm.createContext({ crypto, TextEncoder, structuredClone, URL, console, Event: class {}, dispatchEvent() {} });
  vm.runInContext(source, context);
  const api = context.SoundCruisePitchSync;
  assert(api.LOCAL_ONLY_SETTINGS.includes('theme'));
  assert(!api.SYNC_SETTINGS.includes('theme'));
  const values = new Map([['pitchTrainerSettings', saved({ theme: 'light', scaleEnabled: false })]]);
  const storage = { getItem: (k) => (values.has(k) ? values.get(k) : null), setItem: (k, v) => values.set(k, String(v)), removeItem: (k) => values.delete(k) };
  const snapshot = api.readLocalSnapshot(storage);
  assert(!JSON.stringify(api.normalizeLocalSnapshot(snapshot)).includes('"theme"'), 'theme never enters the sync snapshot');
  await new api.PitchSyncAdapter({ storage }).applyRemoteSnapshot({ appId: 'pitch', schemaVersion: 1, records: [] });
  assert.equal(JSON.parse(values.get('pitchTrainerSettings')).theme, 'light', 'remote apply keeps the local theme');
});

test('reader-first: received theme values are accepted, never sent, never deleted, local theme kept', async () => {
  const source = read('sync/pitch-sync-adapter.js');
  const context = vm.createContext({ crypto, TextEncoder, structuredClone, URL, console, Event: class {}, dispatchEvent() {} });
  vm.runInContext(source, context);
  const api = context.SoundCruisePitchSync;
  assert(!api.SYNC_SETTINGS.includes('theme'), 'theme is not in the send list');
  const remote = (values) => ({ appId: 'pitch', schemaVersion: 1, records: [{
    recordType: 'settings', recordId: 'settings', schemaVersion: 1, payload: { id: 'settings', values } }] });
  for (const theme of ['dark', 'charcoal', 'gray', 'light']) api.validateSnapshot(remote({ notationStyle: 'letter', theme }));
  assert.throws(() => api.validateSnapshot(remote({ notationStyle: 'letter', theme: 'sepia' })));
  // local (no theme in its snapshot) + remote theme → the remote theme survives the merge, no conflict
  const merged = api.mergeSnapshots(remote({ notationStyle: 'letter' }), remote({ notationStyle: 'letter', theme: 'gray' }));
  assert.equal(merged.conflicts.length, 0);
  assert.equal(merged.snapshot.records.find((r) => r.recordType === 'settings').payload.values.theme, 'gray');
  // applying a received theme does not error and keeps this device's local theme
  const values = new Map([['pitchTrainerSettings', JSON.stringify({ theme: 'charcoal', notationStyle: 'cde' })]]);
  const storage = { getItem: (k) => (values.has(k) ? values.get(k) : null), setItem: (k, v) => values.set(k, String(v)), removeItem: (k) => values.delete(k) };
  assert(!JSON.stringify(api.normalizeLocalSnapshot(api.readLocalSnapshot(storage))).includes('"theme"'), 'local snapshot never carries theme');
  const adapter = new api.PitchSyncAdapter({ storage });
  await adapter.applyRemoteSnapshot(remote({ notationStyle: 'letter', theme: 'light' }));  // no apply / manifest mismatch
  const after = JSON.parse(values.get('pitchTrainerSettings'));
  assert.equal(after.theme, 'charcoal', 'the device theme is kept');
  assert.equal(after.themeCloudMirror, 'light', 'the received theme is mirrored verbatim');
  const echoed = api.normalizeLocalSnapshot(api.readLocalSnapshot(storage)).records.find((r) => r.recordType === 'settings');
  assert.equal(echoed.payload.values.theme, 'light', 'local snapshot echoes only the cloud value');
  // changing the device theme never changes what sync sees
  const raw = JSON.parse(values.get('pitchTrainerSettings'));
  (raw.settings || raw).theme = 'gray';
  values.set('pitchTrainerSettings', JSON.stringify(raw));
  assert.equal(api.normalizeLocalSnapshot(api.readLocalSnapshot(storage)).records.find((r) => r.recordType === 'settings').payload.values.theme, 'light');
  // a cloud payload without theme clears the mirror (still no error)
  await adapter.applyRemoteSnapshot(remote({ notationStyle: 'letter' }));
  assert.equal(JSON.parse(values.get('pitchTrainerSettings')).themeCloudMirror, undefined);
  assert.equal(JSON.parse(values.get('pitchTrainerSettings')).theme, 'gray');
});
