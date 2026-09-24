import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { CRUISE_PORT_APP_VERSION } from './app-version.js';

// A changed ES module must be requested under a new query key by every importer; otherwise a
// browser can combine a new caller with an old cached module and fail on a missing export.
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const modules = readdirSync(new URL('.', import.meta.url)).filter((name) => name.endsWith('.js') && !name.includes('.test.'));
const imports = (source) => [...source.matchAll(/from '\.\/([a-z0-9-]+\.js)\?v=([0-9.]+)'/g)].map(([, name, key]) => ({ name, key }));

test('both Port entries load the current release of practice-menu-app', () => {
  for (const html of [read('./index.html'), read('./pro_9a3943176561/index.html')]) {
    assert.match(html, new RegExp(`practice-menu-app\\.js\\?v=${CRUISE_PORT_APP_VERSION.replaceAll('.', '\\.')}"`));
  }
});

test('modules changed in this release are requested under the release key', () => {
  const appEdges = imports(read('./practice-menu-app.js'));
  // Changed in this release: app-version (version) and sync-center-ui (detach confirmation copy).
  for (const name of ['app-version.js', 'sync-center-ui.js']) {
    assert.equal(appEdges.find((edge) => edge.name === name)?.key, CRUISE_PORT_APP_VERSION, name);
  }
});

test('every Sync Center module is requested under exactly one key by all of its importers', () => {
  const byModule = new Map();
  for (const importer of ['practice-menu-app.js', 'sync-center-ui.js', 'sync-center-orchestrator.js', 'sync-center-navigation.js']) {
    for (const edge of imports(read(`./${importer}`))) {
      if (!edge.name.startsWith('sync-center-')) continue;
      if (!byModule.has(edge.name)) byModule.set(edge.name, new Set());
      byModule.get(edge.name).add(edge.key);
    }
  }
  for (const name of ['sync-center-ui.js', 'sync-center-controller.js', 'sync-center-refresh.js',
    'sync-center-orchestrator.js', 'sync-center-navigation.js']) {
    assert.equal(byModule.get(name)?.size, 1, `${name}: ${[...(byModule.get(name) || [])].join(', ')}`);
  }
});

test('Sync Center and launch modules have exactly one public URL each', () => {
  const keys = new Map();
  for (const name of modules) {
    for (const edge of imports(read(`./${name}`))) {
      if (!keys.has(edge.name)) keys.set(edge.name, new Set());
      keys.get(edge.name).add(edge.key);
    }
  }
  for (const name of ['sync-center-controller.js', 'sync-center-ui.js', 'sync-center-refresh.js',
    'sync-center-orchestrator.js', 'sync-center-navigation.js', 'cruise-app-links.js', 'app-version.js']) {
    assert.equal(keys.get(name)?.size, 1, `${name} is imported under ${[...(keys.get(name) || [])].join(', ')}`);
  }
});
