import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const root = new URL('../../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

function loadBootstrapStateResolver() {
  const context = {
    URL, URLSearchParams,
    document: { readyState: 'loading', addEventListener() {} },
    location: { hostname: 'example.test', search: '', hash: '', pathname: '/' },
    SoundCruiseMultiAppSync: {},
    SoundCruiseSyncAccount: { core: {} }
  };
  context.globalThis = context;
  vm.runInNewContext(read('apps/shared/sync-account/multi-app-sync-bootstrap.js'), context);
  return context.SoundCruiseMultiAppSync.resolveStartupState;
}

function restoredRuntime({ credential = 'scd1.valid', qaCredential = 'scq1.valid' } = {}) {
  return {
    appId: 'fretboard',
    credential: async () => credential,
    qaCredential: async () => qaCredential
  };
}

function restoredStore({ migrationState = 'complete', fail = false } = {}) {
  return {
    readMeta: async (key) => {
      if (fail) throw new Error('idb_read_failed');
      return key === 'migrationState' ? migrationState : null;
    },
    async setMeta() {}
  };
}

const validRestoreCore = {
  validAppCredential: (value) => value === 'scd1.valid',
  validQaCredential: (value) => value === 'scq1.valid'
};

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
    assert.equal(pro.includes('multi-app-conflict-ui.js'), true, `${appId} Pro conflict UI`);
    assert.equal(pro.includes('multi-app-sync-bootstrap.js'), true, `${appId} Pro bootstrap`);
    assert(pro.indexOf('multi-app-sync-runtime.js') < pro.indexOf('multi-app-conflict-ui.js'), `${appId} runtime precedes conflict UI`);
    assert(pro.indexOf('multi-app-conflict-ui.js') < pro.indexOf('multi-app-sync-bootstrap.js'), `${appId} conflict UI precedes bootstrap`);
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

test('connected startup resumes a persisted resolution before normal sync', () => {
  const bootstrap = read('apps/shared/sync-account/multi-app-sync-bootstrap.js');
  assert.match(bootstrap, /resumeConflictResolutions\(\)\.then\(\(\) => runtime\.sync\('startup'\)\)/);
  assert.match(bootstrap, /installConflictResolutionUi/);
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

test('Chord retains a committed new-app Join candidate for same-device promotion and hydrate retry', () => {
  const source = read('apps/chord-cruise/js/sync/sync-account-orchestration.js');
  const client = read('apps/chord-cruise/js/sync/sync-client.js');
  assert.match(source, /resumeNewAppConsume/);
  assert.match(source, /accountJoinCommitted/);
  assert.match(source, /同期の設定を再開/);
  assert.match(source, /confirmConsumePersisted\(\)/);
  assert.match(client, /requiresMerge: true/);
  assert.match(client, /datasetState === 'ready'/);
  assert.match(client, /syncState', value: 'paired_pending'/);
  assert.doesNotMatch(client, /datasetState === 'ready'[\s\S]{0,250}beginInitialMigration\(\)/,
    'a ready existing dataset cannot be re-run as B initial migration');
});

test('completed Account-managed Chord containers suppress the Join entry across reloads', () => {
  const source = read('apps/chord-cruise/js/sync/sync-account-orchestration.js');
  const completeGuard = source.indexOf("accountManagedSetup === true && migrationState === 'complete' && existing?.credential");
  const restoringGuard = source.indexOf("accountManagedSetup === true && migrationState !== 'complete' && existing?.credential");
  const genericJoin = source.lastIndexOf('installJoinEntry();');
  assert(completeGuard >= 0, 'a completed Account-managed credential is authoritative over generic Join UI');
  assert(restoringGuard > completeGuard, 'the completed guard runs before the restoring/pending branch');
  assert(genericJoin > restoringGuard, 'the generic Join entry remains only as the final unconnected fallback');
  const completedBranch = source.slice(completeGuard, restoringGuard);
  assert.match(completedBranch, /ensurePairingUi\(\)/, 'runtime restoring loads and refreshes existing Sync UI instead of exposing Join');
  assert.match(completedBranch, /removeJoinEntry\(\)/, 'a completed Account-managed environment removes stale Join UI');
  assert.match(completedBranch, /return;/, 'completed B cannot fall through to generic Join installation');
  const restoringBranch = source.slice(restoringGuard, genericJoin);
  assert.match(restoringBranch, /resumeAccountManagedHydrate\(\)/,
    'paired_pending resumes the same Account-managed device without another Join');
  assert.doesNotMatch(restoringBranch, /installJoinEntry/,
    'paired_pending never falls back to Join-code input');
});

test('all four app Join inputs use the shared transient-secret lifecycle', () => {
  const bootstrap = read('apps/shared/sync-account/multi-app-sync-bootstrap.js');
  const chord = read('apps/chord-cruise/js/sync/sync-account-orchestration.js');
  assert.match(bootstrap, /data-sync-sensitive="join-code-input"/);
  assert.match(bootstrap, /createSensitiveInputController\(joinInput\)/);
  assert.match(bootstrap, /joinSecret\?\.take\(\)/);
  assert.match(bootstrap, /joinSecret\?\.resolve\(\)/);
  assert.match(bootstrap, /joinSecret\?\.reject\(reason\)/);
  assert.match(bootstrap, /joinField\.remove\(\)/);
  assert.match(chord, /data-sync-sensitive', 'join-code-input'/);
  assert.match(chord, /createSensitiveInputController\(input\)/);
  assert.match(chord, /joinSecret\.take\(\)/);
  assert.match(chord, /joinSecret\.resolve\(\)/);
  assert.match(chord, /joinSecret\.reject\(reason\)/);
  assert.match(chord, /input\.remove\(\)/);
});

test('app Join entry is mounted at document level so app settings cannot hide it', () => {
  const bootstrap = read('apps/shared/sync-account/multi-app-sync-bootstrap.js');
  const css = read('apps/shared/sync-account/multi-app-sync.css');
  assert.match(bootstrap, /document\.body\.append\(button\)/);
  assert.match(css, /\.sound-cruise-sync-join-entry\s*\{\s*position: fixed;/);
  assert.match(css, /\.sound-cruise-sync-restore-attention\s*\{\s*position: fixed;/);
});

test('Join lifecycle messages distinguish a cancelled code from a generic sync failure', () => {
  const bootstrap = read('apps/shared/sync-account/multi-app-sync-bootstrap.js');
  const portUi = read('apps/cruise-port/sync-center-ui.js');
  assert.match(bootstrap, /app_join_cancelled/);
  assert.match(bootstrap, /接続コードは取り消されました/);
  assert.match(portUi, /コードを取り消す/);
  assert.match(portUi, /使えなくなります/);
});

test('connected containers resolve before an incidental handoff can select setup UI', async () => {
  const resolveStartupState = loadBootstrapStateResolver();
  let pendingResumeCalls = 0;
  const result = await resolveStartupState(
    restoredRuntime(), restoredStore(),
    { resumePendingConsume: async () => { pendingResumeCalls += 1; return { status: 'none' }; } },
    validRestoreCore
  );
  assert.equal(result.state, 'connected');
  assert.equal(pendingResumeCalls, 0);
  const bootstrap = read('apps/shared/sync-account/multi-app-sync-bootstrap.js');
  assert.match(bootstrap, /restored\.state === 'connected'[\s\S]*?handoffToken = null[\s\S]*?return;[\s\S]*?if \(!handoffToken\)/);
});

test('delayed credential restore never falls through to not-connected', async () => {
  const resolveStartupState = loadBootstrapStateResolver();
  let releaseCredential;
  const credential = new Promise((resolve) => { releaseCredential = resolve; });
  const resultPromise = resolveStartupState({
    appId: 'fretboard', credential: async () => credential, qaCredential: async () => 'scq1.valid'
  }, restoredStore(), { resumePendingConsume: async () => ({ status: 'none' }) }, validRestoreCore);
  releaseCredential('scd1.valid');
  assert.equal((await resultPromise).state, 'connected');
});

test('stale Join metadata cannot override an existing connected app credential', async (t) => {
  const resolveStartupState = loadBootstrapStateResolver();
  for (const staleState of ['consumed', 'expired', 'cancelled']) {
    await t.test(staleState, async () => {
      let pendingResumeCalls = 0;
      const result = await resolveStartupState(
        restoredRuntime(), restoredStore(),
        { resumePendingConsume: async () => { pendingResumeCalls += 1; return { status: staleState }; } },
        validRestoreCore
      );
      assert.equal(result.state, 'connected');
      assert.equal(pendingResumeCalls, 0);
    });
  }
});

test('bootstrap state distinguishes unconnected, migration-pending, and storage-read failure safely', async () => {
  const resolveStartupState = loadBootstrapStateResolver();
  const noPending = { resumePendingConsume: async () => ({ status: 'none' }) };
  assert.equal((await resolveStartupState(
    restoredRuntime({ credential: null, qaCredential: null }), restoredStore(), noPending, validRestoreCore
  )).state, 'not_connected');
  assert.equal((await resolveStartupState(
    restoredRuntime(), restoredStore({ migrationState: 'not_started' }), noPending, validRestoreCore
  )).state, 'migration_pending');
  assert.equal((await resolveStartupState(
    restoredRuntime(), restoredStore({ fail: true }), noPending, validRestoreCore
  )).state, 'restore_error');
});
