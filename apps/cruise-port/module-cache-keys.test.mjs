import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { CRUISE_PORT_APP_VERSION } from './app-version.js';

// A changed ES module must be requested under a new query key by every importer; otherwise a
// browser can combine a new caller with an old cached module and fail on a missing export.
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const modules = readdirSync(new URL('.', import.meta.url)).filter((name) => name.endsWith('.js') && !name.includes('.test.'));
const imports = (source) => [...source.matchAll(/from '\.\/([a-z0-9-]+\.js)\?v=([0-9.]+)'/g)].map(([, name, key]) => ({ name, key }));
const edges = modules.flatMap((importer) => imports(read(`./${importer}`)).map((edge) => ({ importer, ...edge })));
const escaped = CRUISE_PORT_APP_VERSION.replaceAll('.', '\\.');

// 1.19.5 unifies AGM attribution in NEWS presentation; data and provider remain unchanged.
const RELEASE_MODULES = Object.freeze(['app-version.js']);
// NEWS modules are loaded with dynamic import() from practice-menu-app.js and did not change in 1.12.0.
const RELEASE_DYNAMIC_NEWS_MODULES = Object.freeze(['news-ui.js', 'news-provider.js']);
// Other modules retain the cache key of their last real change.
const UNCHANGED_KEYS = Object.freeze({
  ...Object.fromEntries(["cruise-port-capabilities.js", "pro-prompt.js", "pro-access-content.js", "tool-capabilities.js", "practice-capabilities.js", "my-apps-capabilities.js", "gear-photo-store.js", "gear-photo-workflow.js", "my-apps-icon-store.js", "my-apps-icon-workflow.js", "practice-menu-attachment-store.js", "practice-menu-pending-attachments.js", "tuner-app.js", "metronome-app.js", "sync-center-orchestrator.js", "sync-center-ui.js", "port-asset-sync.js", "sync-pro-lock.js", "ai-support-client.js", "ai-support-ui.js", "port-account-join.js"].map(name => [name, '1.19.2'])),
  'news-articles.js': '1.16.1',
  // 1.13.0 Charcoal theme modules are untouched by 1.16.0.
  'settings-store.js': '1.13.0',
  'home-display.js': '1.13.0',
  // 1.12.3 audio controllers are untouched by the theme release and keep their key.
  'tuner-audio.js': '1.12.3',
  'tuner-preview-audio.js': '1.12.3',
  'news-data.js': '1.17.0',
  'news-config.js': '1.11.1',
  'news-quality.js': '1.11.1',
  'practice-menu-sets-store.js': '1.4.2',
  'port-sync-local-validation.js': '1.4.2',
  'practice-cross-day-display.js': '1.2.1',
  'practice-menu-progress-store.js': '1.2.0',
  'practice-menu-presets.js': '1.2.0',
  'practice-menu-history-store.js': '0.70.1',
  'tool-return.js': '0.69.0',
  'practice-analytics.js': '0.59.3',
  'sync-target-name.js': '0.66.0',
  'sync-target-rename.js': '0.66.0',
  'sync-center-device-detail.js': '0.66.0',
  'sync-center-refresh.js': '0.65.0'
});

test('the release is 1.19.5', () => {
  assert.equal(CRUISE_PORT_APP_VERSION, '1.19.5');
});

test('both Port entries load the release practice-menu-app and the current style.css', () => {
  for (const html of [read('./index.html'), read('./pro_9a3943176561/index.html')]) {
    assert.match(html, new RegExp(`(?:practice-menu-app|pro-app-boot)\\.js\\?v=${escaped}"`), 'the entry moves, so no user keeps the 0.70.1 app');
    assert.match(html, /news-article\.css\?v=1\.16\.0"/, 'article-only styles have their own key');
    assert.match(html, /style\.css\?v=1\.19\.4"/, 'NEWS label styles get a new cache key');
    assert.match(html, /sync-account-core\.js\?v=7"/, 'shared credential helper uses a new cache key');
  }
});

test('every app entry loads the new shared credential helper cache key', () => {
  for (const path of ['./index.html', './pro_9a3943176561/index.html',
    '../pitch-cruise/pro_x9v7q2m8/index.html', '../fretboard_cruise/pro_a9f4k7q2m8z/index.html',
    '../rhythm-cruise/pro_r4m8k7n2q9x/index.html', '../chord-cruise/pro_k7m4q9v2x8/index.html']) {
    assert.match(read(path), /sync-account-core\.js\?v=7"/, path);
  }
});

test('every import of a module changed in this release uses the release key', () => {
  for (const name of RELEASE_MODULES) {
    const incoming = edges.filter((edge) => edge.name === name);
    assert.ok(incoming.length > 0, `${name} is imported`);
    for (const edge of incoming) assert.equal(edge.key, CRUISE_PORT_APP_VERSION, `${edge.importer} → ${name}`);
  }
});

test('the exact release edges: entry → app → UI, unchanged modules keep their keys', () => {
  const key = (importer, name) => edges.find((edge) => edge.importer === importer && edge.name === name)?.key;
  assert.equal(key('practice-menu-app.js', 'app-version.js'), '1.19.5');
  assert.equal(key('practice-menu-app.js', 'tuner-app.js'), '1.19.2');
  assert.equal(key('tuner-app.js', 'tuner-audio.js'), '1.12.3');
  assert.equal(key('tuner-app.js', 'tuner-preview-audio.js'), '1.12.3');
  assert.equal(key('practice-menu-app.js', 'settings-store.js'), '1.13.0');
  assert.equal(key('practice-menu-app.js', 'home-display.js'), '1.13.0');
  assert.equal(key('home-display.js', 'settings-store.js'), '1.13.0');
  assert.equal(key('practice-menu-app.js', 'practice-menu-sets-store.js'), '1.4.2');
  assert.equal(key('port-sync-local-validation.js', 'practice-menu-sets-store.js'), '1.4.2');
  assert.equal(key('practice-menu-app.js', 'practice-menu-presets.js'), '1.2.0', 'name suggestions are a separate module');
  assert.equal(key('practice-menu-app.js', 'sync-center-ui.js'), '1.19.2');
  assert.equal(key('practice-menu-app.js', 'sync-center-controller.js'), '1.1.3');
  assert.equal(key('practice-menu-app.js', 'sync-center-orchestrator.js'), '1.19.2');
  for (const name of ['sync-center-navigation.js']) {
    assert.equal(key('practice-menu-app.js', name), '1.1.3');
  }
  assert.equal(key('practice-menu-app.js', 'practice-menu-history-store.js'), '0.70.1');
  assert.equal(key('ai-support-ui.js', 'ai-support-client.js'), '1.19.2');
  assert.equal(key('port-sync-local-validation.js', 'practice-menu-history-store.js'), '0.70.1');
  assert.equal(key('practice-menu-app.js', 'port-sync-local-validation.js'), '1.4.2');
  for (const [name, expected] of Object.entries(UNCHANGED_KEYS)) {
    const incoming = edges.filter((edge) => edge.name === name);
    assert.ok(incoming.length > 0, `${name} is imported`);
    assert.ok(incoming.every((edge) => edge.key === expected), `${name} stays at ${expected}`);
  }
});

test('new N1 modules are never requested without a version key', () => {
  const sources = [...modules.map((name) => read(`./${name}`)), read('./index.html'), read('./pro_9a3943176561/index.html')].join('\n');
  for (const name of ['sync-target-name.js', 'sync-target-rename.js']) {
    const references = sources.match(new RegExp(`${name.replace('.', '\\.')}[^'"\\s]*`, 'g')) || [];
    assert.ok(references.length > 0, `${name} is referenced`);
    for (const reference of references) assert.equal(reference, `${name}?v=0.66.0`, reference);
  }
});

test('a module that imports a release-keyed module is itself fetched under the release key', () => {
  // Otherwise its cached copy keeps pointing at the old child URL.
  for (const edge of edges.filter((item) => RELEASE_MODULES.includes(item.name))) {
    if (edge.importer === 'practice-menu-app.js') continue; // loaded by both entry HTMLs, checked above
    for (const parent of edges.filter((item) => item.name === edge.importer)) {
      assert.equal(parent.key, CRUISE_PORT_APP_VERSION, `${parent.importer} → ${edge.importer} (imports ${edge.name})`);
    }
  }
});

test('no module changed in this release is still requested under an earlier key', () => {
  const sources = modules.map((name) => read(`./${name}`)).join('\n');
  for (const name of RELEASE_MODULES) {
    for (const stale of ['0.61.0', '0.62.0', '0.63.0', '0.64.0', '0.65.0', '0.66.0', '0.67.0', '0.68.0', '0.69.0', '0.69.1', '0.69.2', '0.69.3', '0.69.4', '0.69.5', '0.70.0', '0.70.1', '0.60.0', '0.59.3', '1.0.0', '1.0.1', '1.1.0', '1.1.1', '1.1.5', '1.1.8', '1.3.0', '1.4.0', '1.4.1', '1.4.2', '1.4.3', '1.11.1', '0.25.0', '1.12.0', '1.12.1', '1.13.0', '1.15.0', '1.16.0', '1.16.1']) {
      assert.equal(sources.includes(`${name}?v=${stale}`), false, `${name}?v=${stale}`);
    }
  }
});

test('Sync Center and launch modules have exactly one public URL each', () => {
  const keys = new Map();
  for (const edge of edges) {
    if (!keys.has(edge.name)) keys.set(edge.name, new Set());
    keys.get(edge.name).add(edge.key);
  }
  for (const name of [...RELEASE_MODULES, ...Object.keys(UNCHANGED_KEYS).slice(0, 5), 'sync-center-refresh.js', 'cruise-app-links.js']) {
    assert.equal(keys.get(name)?.size, 1, `${name} is imported under ${[...(keys.get(name) || [])].join(', ')}`);
  }
});

test('unchanged NEWS dynamic modules retain their prior revision key', () => {
  const app = read('./practice-menu-app.js');
  for (const name of RELEASE_DYNAMIC_NEWS_MODULES) {
    const expectedKey = name === 'news-ui.js' ? '1.19.5' : '1.19.2';
    assert.match(app, new RegExp(`import\\('\\./${name.replace('.', '\\.')}\\?v=${expectedKey.replaceAll('.', '\\.')}'\\)`), name);
  }
  for (const name of ['news-ui.js', 'news-provider.js']) {
    assert.match(read(`./${name}`), /data\/news-beta\.js\?v=1\.3\.0'/, `${name} keeps the unchanged fixture key`);
  }
  assert.ok(edges.filter((edge) => edge.name === 'my-apps-known-apps.js').every((edge) => edge.key === '1.3.0'));
  assert.ok(edges.filter((edge) => edge.name === 'practice-menu-navigation.js').every((edge) => edge.key === '1.3.0'));
});
