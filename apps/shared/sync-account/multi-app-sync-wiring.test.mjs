import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('../../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

const apps = [
  ['pitch', 'apps/pitch-cruise/standard/index.html', 'apps/pitch-cruise/pro_x9v7q2m8/index.html', 'apps/pitch-cruise/script.js'],
  ['rhythm', 'apps/rhythm-cruise/standard/index.html', 'apps/rhythm-cruise/pro_r4m8k7n2q9x/index.html', 'apps/rhythm-cruise/script.js'],
  ['fretboard', 'apps/fretboard_cruise/standard/index.html', 'apps/fretboard_cruise/pro_a9f4k7q2m8z/index.html', 'apps/fretboard_cruise/script.js']
];

test('shared multi-app runtime is wired only into Pro editions and production remains disabled', () => {
  for (const [appId, standardPath, proPath] of apps) {
    const standard = read(standardPath);
    const pro = read(proPath);
    assert.equal(standard.includes('multi-app-sync-runtime.js'), false, `${appId} Standard`);
    assert.equal(pro.includes('multi-app-sync-runtime.js'), true, `${appId} Pro runtime`);
    assert.equal(pro.includes('multi-app-sync-bootstrap.js'), true, `${appId} Pro bootstrap`);
    assert.equal(pro.includes(`data-sync-app-id="${appId}"`), true, `${appId} namespace`);
    assert.equal(pro.includes('__SOUND_CRUISE_MULTI_APP_SYNC__'), false, `${appId} production feature OFF`);
  }
  assert.equal(read('apps/cruise-port/index.html').includes('__SOUND_CRUISE_SYNC_CENTER__'), false);
  assert.equal(read('apps/cruise-port/pro_9a3943176561/index.html').includes('__SOUND_CRUISE_SYNC_CENTER__'), false);
  const bootstrap = read('apps/shared/sync-account/multi-app-sync-bootstrap.js');
  const chord = read('apps/chord-cruise/js/sync/sync-account-orchestration.js');
  for (const source of [bootstrap, chord]) {
    assert.match(source, /hostname === 'soundcruise\.jp'/);
    assert.match(source, /get\('sound-cruise-qa'\) === '1'/);
  }
});

test('durable save hooks use the shared no-op notifier without monkeypatching storage', () => {
  for (const [appId, , , scriptPath] of apps) {
    const source = read(scriptPath);
    assert.equal(source.includes('notifyLocalSave'), true, `${appId} save hook`);
    assert.equal(/Storage\.prototype|localStorage\.setItem\s*=|sessionStorage\.setItem\s*=/.test(source), false,
      `${appId} storage monkeypatch`);
  }
});

test('data-plane persistence is app-namespaced and rejects Account and transient secrets', () => {
  const source = read('apps/shared/sync-account/multi-app-sync-db.js');
  assert.match(source, /sound-cruise-sync-data-\$\{appId\}/);
  assert.match(source, /sca1\\\./);
  assert.match(source, /sch1\\\./);
  assert.match(source, /cross_plane_secret_persistence_blocked/);
});

test('Port and target apps use separate QA credential namespaces', () => {
  const storage = read('apps/shared/sync-account/sync-account-db.js');
  assert.match(storage, /qaSlot\(scope, appId\)/);
  assert.match(storage, /`app:\$\{appId\}`/);
  assert.match(read('apps/cruise-port/sync-center-orchestrator.js'), /getQaAdmission\('port'\)/);
  assert.match(read('apps/shared/sync-account/multi-app-sync-bootstrap.js'), /qaScope: 'app', qaAppId: config\.appId/);
  assert.match(read('apps/chord-cruise/js/sync/sync-account-orchestration.js'), /qaScope: 'app', qaAppId: 'chord'/);
});

test('Chord account orchestration selects bridge mode for an existing credential', () => {
  const source = read('apps/chord-cruise/js/sync/sync-account-orchestration.js');
  assert.match(source, /consumeMode:\s*'existing_chord'/);
  assert.match(source, /ChordAccountBridgeClient/);
  assert.match(source, /consumeMode:\s*'new_app'/);
  assert.equal(read('apps/chord-cruise/standard/index.html').includes('sync-account-orchestration.js'), false);
});
