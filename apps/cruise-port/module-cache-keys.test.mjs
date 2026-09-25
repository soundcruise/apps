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

// Modules whose code changed in this release (Cloud Sync UX1, 0.65.0), plus the unchanged modules
// that import sync-center-controller and therefore changed their import line.
// sync-center-refresh.js gained createSnapshotMismatchRetry: a new caller with a cached old copy
// would fail to link, so it must move to the release key with the others.
const RELEASE_MODULES = Object.freeze([
  'app-version.js',
  'sync-center-controller.js',
  'sync-center-device-detail.js',
  'sync-center-ui.js',
  'sync-center-refresh.js',
  'sync-center-navigation.js',
  'sync-center-orchestrator.js'
]);

test('the release is 0.65.0', () => {
  assert.equal(CRUISE_PORT_APP_VERSION, '0.65.0');
});

test('both Port entries load the current practice-menu-app and style.css', () => {
  for (const html of [read('./index.html'), read('./pro_9a3943176561/index.html')]) {
    assert.match(html, new RegExp(`practice-menu-app\\.js\\?v=${escaped}"`));
    assert.match(html, new RegExp(`style\\.css\\?v=${escaped}"`));
  }
});

test('every import of a module changed in this release uses the release key', () => {
  for (const name of RELEASE_MODULES) {
    const incoming = edges.filter((edge) => edge.name === name);
    assert.ok(incoming.length > 0, `${name} is imported`);
    for (const edge of incoming) assert.equal(edge.key, CRUISE_PORT_APP_VERSION, `${edge.importer} → ${name}`);
  }
});

test('the exact release edges: entry → app → controller / UI → detail', () => {
  const key = (importer, name) => edges.find((edge) => edge.importer === importer && edge.name === name)?.key;
  assert.equal(key('practice-menu-app.js', 'sync-center-controller.js'), '0.65.0');
  assert.equal(key('practice-menu-app.js', 'sync-center-ui.js'), '0.65.0');
  assert.equal(key('practice-menu-app.js', 'sync-center-refresh.js'), '0.65.0');
  assert.equal(key('practice-menu-app.js', 'sync-center-navigation.js'), '0.65.0');
  assert.equal(key('practice-menu-app.js', 'sync-center-orchestrator.js'), '0.65.0');
  assert.equal(key('practice-menu-app.js', 'app-version.js'), '0.65.0');
  assert.equal(key('sync-center-ui.js', 'sync-center-controller.js'), '0.65.0');
  assert.equal(key('sync-center-ui.js', 'sync-center-device-detail.js'), '0.65.0');
  assert.equal(key('sync-center-navigation.js', 'sync-center-controller.js'), '0.65.0');
  assert.equal(key('sync-center-orchestrator.js', 'sync-center-controller.js'), '0.65.0');
});

test('a module that imports a release-keyed module is itself fetched under the release key', () => {
  // Otherwise its cached copy keeps pointing at the old child URL.
  for (const edge of edges.filter((item) => item.key === CRUISE_PORT_APP_VERSION)) {
    if (edge.importer === 'practice-menu-app.js') continue; // loaded by both entry HTMLs, checked above
    for (const parent of edges.filter((item) => item.name === edge.importer)) {
      assert.equal(parent.key, CRUISE_PORT_APP_VERSION, `${parent.importer} → ${edge.importer} (imports ${edge.name})`);
    }
  }
});

test('no module changed in this release is still requested under an earlier key', () => {
  const sources = modules.map((name) => read(`./${name}`)).join('\n');
  for (const name of RELEASE_MODULES) {
    for (const stale of ['0.61.0', '0.62.0', '0.63.0', '0.64.0']) {
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
  for (const name of [...RELEASE_MODULES, 'sync-center-refresh.js', 'cruise-app-links.js']) {
    assert.equal(keys.get(name)?.size, 1, `${name} is imported under ${[...(keys.get(name) || [])].join(', ')}`);
  }
});
