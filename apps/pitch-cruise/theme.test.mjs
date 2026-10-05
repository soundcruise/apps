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

function loadSyncApi() {
  const events = [];
  const context = vm.createContext({ crypto, TextEncoder, structuredClone, URL, console,
    Event: class { constructor(type) { this.type = type; } }, dispatchEvent(event) { events.push(event.type); } });
  vm.runInContext(read('sync/pitch-sync-adapter.js'), context);
  return { api: context.SoundCruisePitchSync, events };
}
function memory(settings) {
  const values = new Map([['pitchTrainerSettings', JSON.stringify(settings)]]);
  return { values, storage: { getItem: (k) => (values.has(k) ? values.get(k) : null), setItem: (k, v) => values.set(k, String(v)), removeItem: (k) => values.delete(k) },
    settings: () => JSON.parse(values.get('pitchTrainerSettings')) };
}
const remoteSettings = (values) => ({ appId: 'pitch', schemaVersion: 1, records: [{
  recordType: 'settings', recordId: 'settings', schemaVersion: 1, payload: { id: 'settings', values } }] });

test('theme writer: out of LOCAL_ONLY_SETTINGS; explicit theme sent, unset never sent, mirror stands in', () => {
  const { api } = loadSyncApi();
  assert(!api.LOCAL_ONLY_SETTINGS.includes('theme'), 'theme is no longer device-only');
  assert.deepEqual([...api.LOCAL_ONLY_SETTINGS], ['baseHz', 'sustainTime']);
  assert.deepEqual([...api.SYNC_OPTIONAL_SETTINGS], ['theme']);
  assert.deepEqual([...api.SYNC_CAPABILITIES], ['settings_theme_v1']);
  assert(!api.SYNC_SETTINGS.includes('theme'), 'theme has no default, so it stays out of the DEFAULT_SETTINGS rebuild');
  assert.deepEqual([...new api.PitchSyncAdapter({ storage: memory({}).storage }).syncCapabilities], ['settings_theme_v1']);
  const sent = (settings) => api.normalizeLocalSnapshot(api.readLocalSnapshot(memory(settings).storage))
    .records.find((record) => record.recordType === 'settings')?.payload.values;
  const base = { instrument: 'piano', notationStyle: 'cde' };
  assert.equal(sent({ ...base, theme: 'charcoal' }).theme, 'charcoal');
  assert.equal(sent({ ...base, theme: 'dark' }).theme, 'dark', 'an explicit Dark (after reset) is sent');
  assert.equal(sent(base).theme, undefined, 'unset is never sent as dark');
  assert.equal(sent({ ...base, themeCloudMirror: 'light' }).theme, 'light', 'mirror stands in for an unset theme');
  assert.equal(sent({ ...base, theme: 'gray', themeCloudMirror: 'light' }).theme, 'gray');
  assert.equal(sent({ ...base, theme: 'sepia' }).theme, undefined);
  assert.equal(sent({ ...base, theme: 'gray', baseHz: 442, sustainTime: 2 }).baseHz, undefined, 'baseHz / sustainTime stay device-only');
  for (const theme of ['dark', 'charcoal', 'gray', 'light']) api.validateSnapshot(remoteSettings({ notationStyle: 'letter', theme }));
  assert.throws(() => api.validateSnapshot(remoteSettings({ notationStyle: 'letter', theme: 'sepia' })));
});

test('theme writer: a received theme becomes the device theme; a missing one never clears it', async () => {
  const { api, events } = loadSyncApi();
  const device = memory({ theme: 'charcoal', notationStyle: 'cde', baseHz: 442, sustainTime: 2 });
  const adapter = new api.PitchSyncAdapter({ storage: device.storage });
  await adapter.applyRemoteSnapshot(remoteSettings({ notationStyle: 'letter', theme: 'light' }));
  assert.equal(device.settings().theme, 'light');
  assert.equal(device.settings().themeCloudMirror, undefined);
  assert.equal(device.settings().baseHz, 442, 'device-only settings are kept');
  assert.ok(events.includes('sound-cruise-pitch-sync-applied'), 'the open app reloads its settings (and theme)');
  const mirrored = memory({ notationStyle: 'cde', themeCloudMirror: 'gray' });
  await new api.PitchSyncAdapter({ storage: mirrored.storage }).applyRemoteSnapshot(remoteSettings({ notationStyle: 'cde', theme: 'gray' }));
  assert.equal(mirrored.settings().theme, 'gray', 'the mirror is adopted as the explicit theme');
  assert.equal(mirrored.settings().themeCloudMirror, undefined, 'and retired');
  const merged = api.mergeSnapshots(remoteSettings({ notationStyle: 'letter' }), remoteSettings({ notationStyle: 'letter', theme: 'gray' }));
  assert.equal(merged.conflicts.length, 0);
  assert.equal(merged.snapshot.records.find((r) => r.recordType === 'settings').payload.values.theme, 'gray');
  assert.match(script, /function pitchThemeOf\(settings\)/);
  assert.match(script, /applyPitchTheme\(pitchThemeOf\(s\)\);/, 'load / post-sync reload shows the device theme');
});

// ── Information pages ─────────────────────────────────────────────────────────────────────
// Normal information pages follow the app theme with the same bootstrap and a page-group layer.
// Their content is untouched: removing the bootstrap and the layer link gives the original file.
// Pro acquisition / gate pages stay Dark and are byte-identical.
const INFO_PAGES = {
  'info.html': ['./theme-colors-info.css?v=', 'b38c454af96965c95d0b6ce478bc4a1148138031c2cd8de4733c57ecaa5f453b'],
  'terms.html': ['./theme-colors-legal.css?v=', '361bae4b2b9ba118f98df148496551e53cb89e25fd25fed3178d938cd1a77949'],
  'privacy.html': ['./theme-colors-legal.css?v=', '953330b55617ed4d91eae1b48b10bfb5e228bed41d78768822b8ff60283706f5'],
  'recommended-videos.html': ['./theme-colors-videos.css?v=', '19fbc867c6f070be8e7c7e46f159b9cb057c49cf45263f2b63d487d1ea08221e']
};
const DARK_PAGES = {
  'pro-access.html': 'c64ee4ee0ba8e2db5c9029b79b8cf83d4a6fefc7754c70295794c4389c6ba4a2',
  'iphone-safari-guide.html': 'f6f8ddc844f38cb1efa04097a0865a2e5ee4d46daa89bb0da69213c3d99a5da9',
  'pro_x9v7q2m8/troubleshoot.html': 'ec5d88580d54bce79fa686864ec88098d61d00e4fa7f7ac3582d77af1aa9598b'
};
const sha256 = async (text) => (await import('node:crypto')).createHash('sha256').update(text).digest('hex');

test('information pages follow the theme with the app bootstrap; content is unchanged', async () => {
  const appBoot = pages[0][1].match(BOOT_RE)[0];
  for (const [file, [layer, originalHash]] of Object.entries(INFO_PAGES)) {
    const html = read(file);
    const boot = html.match(BOOT_RE);
    assert.ok(boot, file);
    assert.equal(boot[0].replace(/\n\s+/g, '\n'), appBoot.replace(/\n\s+/g, '\n'), `${file}: same bootstrap as the app`);
    assert.ok(html.indexOf(boot[0]) < html.indexOf('rel="stylesheet"'), `${file}: bootstrap before any stylesheet`);
    const link = html.match(/\n *<link rel="stylesheet" href="(\.\/theme-colors-[a-z]+\.css)\?v=([\d.]+)">/);
    assert.ok(link && (link[1] + '?v=') === layer, `${file}: loads ${layer}`);
    assert.ok(html.indexOf(link[0]) > html.lastIndexOf('</style>') || !html.includes('</style>'), `${file}: layer after the page styles`);
    for (const [value, theme, meta] of [[null, 'dark', null], ['{oops', 'dark', null], [saved({ theme: 'sepia' }), 'dark', null],
      [saved({ theme: 'dark' }), 'dark', null], [saved({ theme: 'charcoal' }), 'charcoal', '#424346'],
      [saved({ theme: 'gray' }), 'gray', '#c8cbd0'], [saved({ theme: 'light' }), 'light', '#f5f6f6']]) {
      assert.deepEqual(runBootstrap(html, value), { theme, meta }, `${file} ${value}`);
    }
    assert.equal(runBootstrap(html, null, true).theme, 'dark', `${file}: storage error is Dark`);
    const original = html.replace(new RegExp('\\n *' + BOOT_RE.source), '').replace(link[0], '');
    assert.equal(await sha256(original), originalHash, `${file}: text, links and navigation unchanged`);
    const css = read(layer.slice(2, -3));
    for (const block of css.replace(/\/\*[\s\S]*?\*\//g, '').split('}').map((b) => b.trim().replace(/^@media[^{]*\{\s*/, '')).filter((b) => b.includes('{') && !b.startsWith('@keyframes') && !/^(from|to|\d)/.test(b))) {
      for (const sel of block.slice(0, block.indexOf('{')).split(/,\n/)) {
        assert.match(sel.trim(), SCOPE_RE, `${layer}: ${sel.trim().slice(0, 80)}`);
      }
    }
  }
  for (const [file, hash] of Object.entries(DARK_PAGES)) {
    assert.equal(await sha256(read(file).replace('pro-gate.css?v=9', 'pro-gate.css?v=6')), hash, `${file}: Pro acquisition / shared help page stays Dark`);
  }
});
