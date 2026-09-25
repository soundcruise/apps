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

// Modules whose code changed in this release (0.69.5): app-version.js and ai-support-ui.js (keyboard
// scrolling, disclosure button). Their only importer is practice-menu-app.js, which both entry HTMLs load.
const RELEASE_MODULES = Object.freeze(['app-version.js', 'ai-support-ui.js']);
// Unchanged in 0.69.5, so they keep their earlier keys rather than being bumped for no reason.
const UNCHANGED_KEYS = Object.freeze({
  'sync-center-ui.js': '0.69.0',
  'ai-support-client.js': '0.69.0',
  'tuner-app.js': '0.69.0',
  'tuner-preview-audio.js': '0.69.0',
  'tool-return.js': '0.69.0',
  'sync-target-name.js': '0.66.0',
  'sync-target-rename.js': '0.66.0',
  'sync-center-controller.js': '0.66.0',
  'sync-center-device-detail.js': '0.66.0',
  'sync-center-orchestrator.js': '0.66.0',
  'sync-center-navigation.js': '0.66.0',
  'sync-center-refresh.js': '0.65.0'
});

test('the release is 0.69.5', () => {
  assert.equal(CRUISE_PORT_APP_VERSION, '0.69.5');
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

test('the exact release edges: entry → app → UI, unchanged modules keep their keys', () => {
  const key = (importer, name) => edges.find((edge) => edge.importer === importer && edge.name === name)?.key;
  for (const name of ['app-version.js', 'ai-support-ui.js']) {
    assert.equal(key('practice-menu-app.js', name), '0.69.5', name);
  }
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
    for (const stale of ['0.61.0', '0.62.0', '0.63.0', '0.64.0', '0.65.0', '0.66.0', '0.67.0', '0.68.0', '0.69.0', '0.69.1', '0.69.2', '0.69.3', '0.69.4', '0.59.3', '1.1.8']) {
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
