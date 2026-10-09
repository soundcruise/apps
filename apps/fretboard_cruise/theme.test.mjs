// Fretboard Cruise color theme (Dark / Charcoal / Gray / Light): bootstrap, settings contract,
// generated theme layer scope and local-only Cloud Sync behaviour.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = import.meta.dirname;
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const script = read('script.js');
const layer = read('theme-colors.css');
const entries = [['standard', read('standard/index.html')], ['pro', read('pro_a9f4k7q2m8z/index.html')]];
const BOOT_RE = /<script>\s*\/\/ Fretboard color theme before first paint[\s\S]*?<\/script>/;

function runBootstrap(html, value, throwOnRead = false) {
  const code = html.match(BOOT_RE)[0].replace(/<\/?script>/g, '');
  const attrs = {};
  const head = [];
  vm.runInNewContext(code, {
    JSON,
    localStorage: { getItem: (key) => { if (throwOnRead) throw new Error('blocked'); return key === 'fretboard_cruise_state' ? value : null; } },
    document: {
      documentElement: { setAttribute: (name, v) => { attrs[name] = v; } },
      head: { appendChild: (node) => head.push(node) },
      createElement: () => ({ attrs: {}, setAttribute(n, v) { this.attrs[n] = v; } })
    }
  });
  return { theme: attrs['data-theme'], meta: head[0] ? head[0].attrs.content : null };
}

const state = (settings) => JSON.stringify({ settings: { tempo: 80, ...settings } });

test('head bootstrap runs before every stylesheet and resolves only the four themes', () => {
  for (const [name, html] of entries) {
    const at = html.indexOf('// Fretboard color theme before first paint');
    assert(at > 0 && at < html.indexOf('rel="stylesheet"'), `${name}: bootstrap precedes stylesheets`);
    assert(html.indexOf('../theme-colors.css?v=') > html.lastIndexOf('rel="stylesheet" href="../theme.css'), `${name}: layer loads last`);
    const cases = [
      [null, 'dark', null], [state({}), 'dark', null], [state({ theme: 'sepia' }), 'dark', null],
      ['{broken', 'dark', null], [state({ theme: 'dark' }), 'dark', null],
      [state({ theme: 'charcoal' }), 'charcoal', '#424346'], [state({ theme: 'gray' }), 'gray', '#c8cbd0'],
      [state({ theme: 'light' }), 'light', '#f4f6f9']
    ];
    for (const [value, theme, meta] of cases) {
      const result = runBootstrap(html, value);
      assert.equal(result.theme, theme, `${name} ${value}`);
      assert.equal(result.meta, meta, `${name} meta ${theme}`);
    }
    assert.equal(runBootstrap(html, null, true).theme, 'dark', `${name}: storage error is Dark`);
  }
  assert.equal(entries[0][1].match(BOOT_RE)[0], entries[1][1].match(BOOT_RE)[0], 'Standard and Pro share one bootstrap');
});

test('settings expose カラーテーマ with four choices, previewed and reverted on cancel', () => {
  assert.match(script, /const FRETBOARD_THEMES = \['dark', 'charcoal', 'gray', 'light'\];/);
  assert.match(script, /\{ dark: 'ダーク', charcoal: 'チャコール', gray: 'グレー', light: 'ライト' \}/);
  assert.match(script, /id="settings-theme-title">カラーテーマ</);
  // Theme selection is allowed in Standard (no guardStandardSettingsMutation in its handler).
  const handler = script.slice(script.indexOf("document.querySelectorAll('.settings-theme-buttons .mode-btn')"));
  assert(!handler.slice(0, 400).includes('guardStandardSettingsMutation'), 'Standard can choose a theme');
  // Standard persists the chosen theme; cancel restores the snapshot value in both editions.
  assert.match(script, /'lastSettingsTab',\n    'theme'\n\];/);
  assert.match(script, /if \(settingsSnapshot\.theme === undefined\) delete state\.settings\.theme;/);
  // The theme is not a default setting: loading never writes it.
  const defaults = script.slice(script.indexOf('function getDefaultSettings()'), script.indexOf('function cloneSettings('));
  assert(!/theme/.test(defaults), 'theme is not injected by defaults');
  // 全てリセット returns to Dark; the local 指板の視点 reset does not touch the theme.
  assert.match(script, /state\.settings\.theme = 'dark';\n            applyFretboardTheme\('dark'\);/);
  const viewReset = script.slice(script.indexOf("if (resetCard === 'view')"), script.indexOf("if (resetCard === 'cruise-loop')"));
  assert(!/theme/.test(viewReset), 'view reset keeps the theme');
});

test('applyFretboardTheme sets data-theme and the theme-color meta only for non-Dark themes', () => {
  const start = script.indexOf('const FRETBOARD_THEMES');
  const end = script.indexOf('applyFretboardTheme(fretboardThemeOf(state.settings));');
  const metas = [];
  const doc = {
    documentElement: { attrs: {}, setAttribute(n, v) { this.attrs[n] = v; } },
    head: { appendChild: (m) => metas.push(m) },
    querySelector: () => metas.find((m) => !m.removed) || null,
    createElement: () => ({ attrs: {}, setAttribute(n, v) { this.attrs[n] = v; }, remove() { this.removed = true; } })
  };
  const ctx = vm.createContext({ document: doc });
  vm.runInContext(script.slice(start, end) + '\nthis.applyFretboardTheme = applyFretboardTheme; this.resolveFretboardTheme = resolveFretboardTheme; this.fretboardThemeOf = fretboardThemeOf;', ctx);
  ctx.applyFretboardTheme('charcoal');
  assert.equal(doc.documentElement.attrs['data-theme'], 'charcoal');
  assert.equal(metas[0].attrs.content, '#424346');
  ctx.applyFretboardTheme('light');
  assert.equal(metas.filter((m) => !m.removed).length, 1);
  assert.equal(metas[0].attrs.content, '#f4f6f9');
  ctx.applyFretboardTheme('dark');
  assert.equal(doc.documentElement.attrs['data-theme'], 'dark');
  assert(metas[0].removed, 'Dark removes the meta');
  for (const bad of [undefined, null, 'sepia', 3, 'Dark']) assert.equal(ctx.resolveFretboardTheme(bad), 'dark');
  assert.equal(ctx.fretboardThemeOf({ theme: 'gray', themeCloudMirror: 'light' }), 'gray');
  assert.equal(ctx.fretboardThemeOf({ themeCloudMirror: 'light' }), 'light', 'an unset theme shows the kept cloud theme');
  assert.equal(ctx.fretboardThemeOf({ theme: 'sepia' }), undefined);
  assert.equal(ctx.fretboardThemeOf(undefined), undefined);
});

test('generated layer only applies under Charcoal / Gray / Light and keeps objects in Dark', () => {
  const scope = ':root:is([data-theme="charcoal"], [data-theme="gray"], [data-theme="light"])';
  const body = layer.replace(/\/\*[\s\S]*?\*\//g, '');
  let depth = 0;
  let selector = '';
  for (const ch of body) {
    if (ch === '{') {
      const sel = selector.trim();
      if (depth === 0 || !sel.startsWith('@')) {
        if (!/^@(media|supports|keyframes)/.test(sel) && !/^((from|to|\d+(\.\d+)?%)\s*,?\s*)+$/.test(sel)) {
          for (const part of sel.split(/,\s*(?![^()]*\))/)) {
            assert(part.trim().startsWith(scope) || /^:root(\[data-theme="(charcoal|gray|light)"\]|:is\((\[data-theme="(charcoal|gray|light)"\](, )?)+\))/.test(part.trim()),
              `layer selector is theme-scoped: ${part.trim().slice(0, 120)}`);
          }
        }
      }
      depth += 1;
      selector = '';
    } else if (ch === '}') {
      depth -= 1;
      selector = '';
    } else if (ch === ';' && depth > 0) {
      selector = '';
    } else {
      selector += ch;
    }
  }
  assert(!/data-theme="dark"|prefers-color-scheme/.test(layer), 'Dark and OS theme never appear in the layer');
  // Fretboard objects are mirrored with their Dark literals (identity) and object roots keep Dark ink.
  assert.match(layer, /\.projected-fret-wire \{\n    stroke: #bcbcbc;/);
  assert.match(layer, /\.neck-face,\n.*\.projected-fretboard-svg \{\n    color: #f0f6fc;/);
  assert.match(layer, /--fretboard-wood|\.fret-column::after \{\n    background-image: var\(--fret-wire\)/);
  assert(!/--root-color:|--third-color:|--fifth-color:|--seventh-color:/.test(layer), 'degree colors are never themed');
  for (const theme of ['charcoal', 'gray', 'light']) assert(layer.includes(`:root[data-theme="${theme}"] {`), theme);
});

function loadAdapter() {
  const context = vm.createContext({ crypto, TextEncoder, structuredClone, URL, console, Event: class {}, dispatchEvent() {} });
  vm.runInContext(read('sync/fretboard-sync-adapter.js'), context);
  return context.SoundCruiseFretboardSync;
}
function memoryStorage(settings) {
  const values = new Map([['fretboard_cruise_state', JSON.stringify({ settings })]]);
  return { values, storage: { getItem: (k) => (values.has(k) ? values.get(k) : null), setItem: (k, v) => values.set(k, String(v)), removeItem: (k) => values.delete(k) },
    settings: () => JSON.parse(values.get('fretboard_cruise_state')).settings };
}
const remoteSettings = (values) => ({ appId: 'fretboard', schemaVersion: 1, records: [{
  recordType: 'settings', recordId: 'settings', schemaVersion: 1, payload: { id: 'settings', values } }] });

test('theme writer: an explicit theme is sent, an unset one never is, a reader-first mirror stands in', () => {
  const api = loadAdapter();
  assert.deepEqual([...api.SYNC_CAPABILITIES], ['settings_theme_v1']);
  assert.deepEqual([...api.SYNC_OPTIONAL_SETTINGS], ['theme']);
  assert(!api.SYNC_SETTINGS.includes('theme'), 'theme has no default, so it stays out of the default-filled list');
  assert.deepEqual([...new api.FretboardSyncAdapter({ storage: memoryStorage({}).storage }).syncCapabilities], ['settings_theme_v1']);
  const sent = (settings) => api.normalizeLocalSnapshot(api.readLocalSnapshot(memoryStorage(settings).storage))
    .records.find((record) => record.recordType === 'settings')?.payload.values;
  assert.equal(sent({ theme: 'charcoal', tempo: 96 }).theme, 'charcoal');
  assert.equal(sent({ theme: 'dark', tempo: 96 }).theme, 'dark', 'an explicit Dark (e.g. after reset) is sent');
  assert.equal(sent({ tempo: 96 }).theme, undefined, 'unset is never sent as dark');
  assert.equal(sent({ tempo: 96, themeCloudMirror: 'light' }).theme, 'light', 'mirror stands in for an unset theme');
  assert.equal(sent({ theme: 'gray', tempo: 96, themeCloudMirror: 'light' }).theme, 'gray', 'the explicit choice wins');
  assert.equal(sent({ theme: 'sepia', tempo: 96 }).theme, undefined, 'invalid values are never sent');
  assert.deepEqual({ ...sent({ theme: 'gray' }) }, { theme: 'gray' }, 'a theme-only settings record');
  assert.equal(sent({}), undefined, 'nothing to send: no settings record');
  for (const theme of ['dark', 'charcoal', 'gray', 'light']) api.validateSnapshot(remoteSettings({ tempo: 90, theme }));
  assert.throws(() => api.validateSnapshot(remoteSettings({ tempo: 90, theme: 'sepia' })));
});

test('theme writer: a received theme becomes the device theme; a missing one never clears it', async () => {
  const api = loadAdapter();
  const device = memoryStorage({ theme: 'charcoal', tempo: 96 });
  const adapter = new api.FretboardSyncAdapter({ storage: device.storage });
  await adapter.applyRemoteSnapshot(remoteSettings({ tempo: 90, theme: 'light' }));
  assert.equal(device.settings().theme, 'light');
  assert.equal(device.settings().themeCloudMirror, undefined);
  // A settings record without theme (e.g. an older client changed tempo) merges into one that keeps the
  // device theme, and applying the merge result changes only tempo.
  const local = api.normalizeLocalSnapshot(api.readLocalSnapshot(device.storage));
  const kept = api.mergeSnapshots(local, remoteSettings({ tempo: 91 }));
  assert.equal(kept.conflicts.length, 1, 'tempo differs on both sides: a settings field decision');
  const values = { ...local.records.find((r) => r.recordType === 'settings').payload.values, tempo: 91 };
  await adapter.applyRemoteSnapshot(remoteSettings(values));
  assert.equal(device.settings().theme, 'light', 'the device theme is kept');
  assert.equal(device.settings().tempo, 91, 'other settings still apply');
  const mirrored = memoryStorage({ tempo: 96, themeCloudMirror: 'gray' });
  await new api.FretboardSyncAdapter({ storage: mirrored.storage }).applyRemoteSnapshot(remoteSettings({ tempo: 96, theme: 'gray' }));
  assert.equal(mirrored.settings().theme, 'gray', 'the mirror is adopted as the explicit theme');
  assert.equal(mirrored.settings().themeCloudMirror, undefined, 'and retired');
  const merged = api.mergeSnapshots(remoteSettings({ tempo: 90 }), remoteSettings({ tempo: 90, theme: 'gray' }));
  assert.equal(merged.conflicts.length, 0);
  assert.equal(merged.snapshot.records.find((r) => r.recordType === 'settings').payload.values.theme, 'gray');
  assert.match(script, /function fretboardThemeOf\(settings\)/);
  assert.equal((script.match(/applyFretboardTheme\(fretboardThemeOf\(state\.settings\)\)/g) || []).length, 2, 'load and post-sync apply use the device theme');
});

// ── Information pages ─────────────────────────────────────────────────────────────────────
// Normal information pages follow the app theme with the same bootstrap and a page-group layer.
// Content is pinned to the approved baseline, including the shared Cruise series section.
// Pro acquisition / gate pages stay Dark and are byte-identical. The fretboard itself is not involved.
const SCOPE_RE = /^:root(\[data-theme="(charcoal|gray|light)"\]|:is\((\[data-theme="(charcoal|gray|light)"\](, )?)+\))/;
const INFO_PAGES = {
  'info.html': ['./theme-colors-info.css?v=', '4cd693c4c32b40becb79bffc94b91d5be278d007aeb59327072cc7a63d6d65f2'],
  'terms.html': ['./theme-colors-legal.css?v=', 'c14cff4fe2ac7e1e20be2c48c19955817a27d6282d0661f403f3f6493bd70d7d'],
  'privacy.html': ['./theme-colors-legal.css?v=', '6a8daf899225d393885f6dcd4a765c76d1b84a91cef6ddaefcc1312f92e1a9dc'],
  'apps.html': ['./theme-colors-apps.css?v=', '045b0f297d2e313dbf5b9435ff46020a92a88041e73ed9b7c650eb291c81a19b']
};
const DARK_PAGES = {
  'pro-access.html': '5c496092202ba3d961939d5b12db9a442b1dbc6fc06548662ab66b3c05877930',
  'iphone-safari-guide.html': 'f6f8ddc844f38cb1efa04097a0865a2e5ee4d46daa89bb0da69213c3d99a5da9',
  'pro_a9f4k7q2m8z/troubleshoot.html': 'ec5d88580d54bce79fa686864ec88098d61d00e4fa7f7ac3582d77af1aa9598b'
};
const sha256 = async (text) => (await import('node:crypto')).createHash('sha256').update(text).digest('hex');

test('information pages follow the theme with the app bootstrap; content is unchanged', async () => {
  const appBoot = entries[0][1].match(BOOT_RE)[0];
  for (const [file, [layerHref, originalHash]] of Object.entries(INFO_PAGES)) {
    const html = read(file);
    const boot = html.match(BOOT_RE);
    assert.ok(boot, file);
    assert.equal(boot[0].replace(/\n\s+/g, '\n'), appBoot.replace(/\n\s+/g, '\n'), `${file}: same bootstrap as the app`);
    assert.ok(html.indexOf(boot[0]) < html.indexOf('rel="stylesheet"'), `${file}: bootstrap before any stylesheet`);
    const link = html.match(/\n *<link rel="stylesheet" href="(\.\/theme-colors-[a-z]+\.css)\?v=([\d.]+)">/);
    assert.ok(link && (link[1] + '?v=') === layerHref, `${file}: loads ${layerHref}`);
    assert.ok(html.indexOf(link[0]) > html.lastIndexOf('</style>'), `${file}: layer after the page styles`);
    for (const [value, theme, meta] of [[null, 'dark', null], ['{broken', 'dark', null], [state({ theme: 'sepia' }), 'dark', null],
      [state({ theme: 'dark' }), 'dark', null], [state({ theme: 'charcoal' }), 'charcoal', '#424346'],
      [state({ theme: 'gray' }), 'gray', '#c8cbd0'], [state({ theme: 'light' }), 'light', '#f4f6f9']]) {
      assert.deepEqual(runBootstrap(html, value), { theme, meta }, `${file} ${value}`);
    }
    assert.equal(runBootstrap(html, null, true).theme, 'dark', `${file}: storage error is Dark`);
    const original = html.replace(new RegExp('\\n *' + BOOT_RE.source), '').replace(link[0], '');
    assert.equal(await sha256(original), originalHash, `${file}: text, links and navigation unchanged`);
    const css = read(layerHref.slice(2, -3));
    assert.doesNotMatch(css, /\.neck-|\.note-marker|\.fret-wire|\.string-line/, `${layerHref}: no fretboard object rules`);
    for (const block of css.replace(/\/\*[\s\S]*?\*\//g, '').split('}').map((b) => b.trim().replace(/^@media[^{]*\{\s*/, '')).filter((b) => b.includes('{') && !b.startsWith('@keyframes') && !/^(from|to|\d)/.test(b))) {
      for (const sel of block.slice(0, block.indexOf('{')).split(/,\n/)) {
        assert.match(sel.trim(), SCOPE_RE, `${layerHref}: ${sel.trim().slice(0, 80)}`);
      }
    }
  }
  for (const [file, hash] of Object.entries(DARK_PAGES)) {
    assert.equal(await sha256(read(file).replace('pro-gate.css?v=9', 'pro-gate.css?v=6')), hash, `${file}: Pro acquisition / shared help page stays Dark`);
  }
});
