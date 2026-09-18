import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('./port-sync-controller.js', import.meta.url), 'utf8');

function harness({ failFirst = false } = {}) {
  const meta = new Map();
  const calls = [];
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
    constructor() { super(); this.initialized = 0; this.synced = 0; }
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
    setInterval: () => 1, clearInterval() {}, dispatchEvent() {},
    document: { visibilityState: 'visible' }, navigator: { onLine: true },
    SoundCruisePortSync: { PortSyncAdapter: class {} },
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
  return { controller, calls, meta };
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
