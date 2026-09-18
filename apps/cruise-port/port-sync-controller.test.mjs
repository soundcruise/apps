import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('./port-sync-controller.js', import.meta.url), 'utf8');

function harness({ failFirst = false } = {}) {
  const meta = new Map();
  const calls = [];
  const events = [];
  let adapter = null;
  let failures = failFirst ? 1 : 0;
  class Client {
    constructor() { this.admissionMode = 'production'; }
    async provisionPortDevice(value) {
      calls.push(value);
      if (failures-- > 0) throw new Error('network_error');
      return { membershipId: 'membership-port', appId: 'port', membershipState: 'active' };
    }
  }
  class Runtime extends EventTarget {
    constructor(options) { super(); this.initialized = 0; this.synced = 0; this.adapter = options.adapter; }
    async initializeDataset() { this.initialized += 1; return { ok: true }; }
    async sync() { this.synced += 1; return { ok: true }; }
    bindLifecycle() {}
    listConflictPresentations() { return []; }
    resolveConflict() { return { ok: true }; }
  }
  const store = {
    readMeta: async (key) => meta.get(key) ?? null,
    setMeta: async (key, value) => meta.set(key, structuredClone(value)),
    removeMeta: async (key) => meta.delete(key),
    clearCloudState: async () => meta.clear()
  };
  const context = {
    EventTarget, CustomEvent, structuredClone,
    setInterval: () => 1, clearInterval() {}, dispatchEvent: (event) => events.push(event),
    document: { visibilityState: 'visible' }, navigator: { onLine: true },
    SoundCruisePortSync: { PortSyncAdapter: class {
      constructor() { adapter = this; this.changed = false; }
      consumeRemoteApplyChanged() { const changed = this.changed; this.changed = false; return changed; }
    } },
    SoundCruiseSyncAccount: {
      AccountClient: Client,
      storage: {
        getAccount: async () => ({ accountCredential: 'sca1.account.secret' }),
        getQaAdmission: async () => null
      },
      core: {
        validAccountCredential: (value) => value?.startsWith('sca1.'),
        validAppCredential: (value) => value?.startsWith('scd1.'),
        createAppCredential: () => ({ appDeviceCredential: 'scd1.port.secret' }),
        createOperationId: () => 'operation-stable'
      }
    },
    SoundCruiseMultiAppSync: {
      dataStorage: { createStore: () => store }, MultiAppSyncRuntime: Runtime
    }
  };
  context.globalThis = context;
  vm.runInNewContext(source, context);
  const controller = context.SoundCruisePortSync.createPortSyncController({
    config: { enabled: true, environment: 'production', endpoint: 'https://sync.example' }
  });
  return { controller, calls, meta, events, adapter };
}

test('Port controller provisions once, initializes once and then resumes normal sync', async () => {
  const { controller, calls, meta } = harness();
  const [first, concurrent] = await Promise.all([controller.ensure(), controller.ensure()]);
  assert.equal(first.ok, true);
  assert.equal(concurrent.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(meta.get('credential'), 'scd1.port.secret');
  assert.equal(meta.get('membership').appId, 'port');
  assert.equal(controller.runtime.initialized, 1);
  await meta.set('migrationState', 'complete');
  assert.equal((await controller.ensure()).ok, true);
  assert.equal(calls.length, 1);
  assert.equal(controller.runtime.synced, 1);
});

test('Port provisioning response loss reuses the exact operation and credential', async () => {
  const { controller, calls, meta } = harness({ failFirst: true });
  await assert.rejects(controller.ensure(), /network_error/u);
  assert.equal(meta.get('pendingProvision').operationId, 'operation-stable');
  assert.equal(meta.get('pendingProvision').appDeviceCredential, 'scd1.port.secret');
  assert.equal((await controller.ensure()).ok, true);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], calls[0]);
  assert.equal(meta.has('pendingProvision'), false);
});

test('Port detach clears only cloud binding state', async () => {
  const { controller, meta } = harness();
  meta.set('credential', 'scd1.port.secret');
  meta.set('migrationState', 'complete');
  await controller.clearCloudState();
  assert.equal(meta.size, 0);
});

test('Port controller announces a changed hydrate only after runtime reaches ready', () => {
  const { controller, events, adapter } = harness();
  adapter.changed = true;
  controller.runtime.dispatchEvent(new CustomEvent('statechange', { detail: { state: 'syncing' } }));
  assert.equal(events.some((event) => event.type === 'cruise-port-cloud-data-applied'), false);
  controller.runtime.dispatchEvent(new CustomEvent('statechange', { detail: { state: 'ready' } }));
  assert.equal(events.filter((event) => event.type === 'cruise-port-cloud-data-applied').length, 1);
  controller.runtime.dispatchEvent(new CustomEvent('statechange', { detail: { state: 'ready' } }));
  assert.equal(events.filter((event) => event.type === 'cruise-port-cloud-data-applied').length, 1);
});
