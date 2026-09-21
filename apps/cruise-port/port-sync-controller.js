(function installPortSyncController(global) {
  'use strict';

  const namespace = global.SoundCruisePortSync = global.SoundCruisePortSync || {};

  function createPortSyncController({
    config,
    accountRoot = global.SoundCruiseSyncAccount,
    syncRoot = global.SoundCruiseMultiAppSync,
    fetchImpl = global.fetch?.bind(global),
    deviceLabel = () => 'Cruise Port'
  } = {}) {
    if (!config?.enabled || !accountRoot?.AccountClient || !accountRoot?.core ||
        !accountRoot?.storage || !syncRoot?.MultiAppSyncRuntime || !syncRoot?.dataStorage ||
        typeof namespace.PortSyncAdapter !== 'function') {
      return Object.freeze({ enabled: false, ensure: async () => ({ ok: false, code: 'port_sync_unavailable' }) });
    }
    const admissionMode = config.admissionMode || (config.environment === 'production' ? 'production' : 'qa');
    const store = syncRoot.dataStorage.createStore('port');
    const client = new accountRoot.AccountClient({
      endpoint: config.endpoint, fetchImpl, storage: accountRoot.storage, core: accountRoot.core,
      admissionMode, qaScope: 'port'
    });
    const adapter = new namespace.PortSyncAdapter();
    const runtime = new syncRoot.MultiAppSyncRuntime({
      appId: 'port', endpoint: config.endpoint,
      adapter, store, accountClient: client,
      accountCore: accountRoot.core, admissionMode, fetchImpl
    });
    syncRoot.runtimes = syncRoot.runtimes || Object.create(null);
    syncRoot.runtimes.port = runtime;
    let ensuring = null;
    let pollId = null;

    function emit(state, detail = {}) {
      global.dispatchEvent?.(new CustomEvent('cruise-port-sync-state', {
        detail: Object.freeze({ state, ...detail })
      }));
    }
    runtime.addEventListener('statechange', (event) => {
      const state = event.detail?.state || 'unknown';
      emit(state, event.detail);
      if (state === 'ready' && adapter.consumeRemoteApplyChanged?.()) {
        global.dispatchEvent?.(new CustomEvent('cruise-port-cloud-data-applied', {
          detail: Object.freeze({ changed: true })
        }));
      }
    });

    async function provision(account) {
      let pending = await store.readMeta('pendingProvision');
      if (!pending) {
        const material = accountRoot.core.createAppCredential();
        pending = {
          operationId: accountRoot.core.createOperationId(),
          appDeviceCredential: material.appDeviceCredential
        };
        await store.setMeta('pendingProvision', pending);
      }
      const result = await client.provisionPortDevice({
        accountCredential: account.accountCredential,
        appDeviceCredential: pending.appDeviceCredential,
        operationId: pending.operationId,
        deviceLabel: deviceLabel()
      });
      const qa = admissionMode === 'qa' ? await accountRoot.storage.getQaAdmission('port') : null;
      await store.setMeta('credential', pending.appDeviceCredential);
      await store.setMeta('qaCredential', qa?.qaCredential || null);
      await store.setMeta('membership', { id: result.membershipId, appId: 'port', state: 'active' });
      await store.removeMeta('pendingProvision');
      return result;
    }

    async function doEnsure() {
      const account = await accountRoot.storage.getAccount();
      if (!accountRoot.core.validAccountCredential(account?.accountCredential)) {
        return Object.freeze({ ok: false, code: 'account_not_configured' });
      }
      let credential = await store.readMeta('credential');
      if (!accountRoot.core.validAppCredential(credential)) {
        await provision(account);
        credential = await store.readMeta('credential');
      }
      if (!accountRoot.core.validAppCredential(credential)) throw new Error('port_app_credential_required');
      adapter.primeRemoteReferences?.(await store.listShadow?.() || []);
      const migrationState = await store.readMeta('migrationState');
      const result = migrationState === 'complete'
        ? await runtime.sync('startup')
        : await runtime.initializeDataset();
      runtime.bindLifecycle();
      if (!pollId && typeof global.setInterval === 'function') {
        pollId = global.setInterval(() => {
          if (global.document?.visibilityState === 'visible' && global.navigator?.onLine !== false) {
            runtime.sync('poll').catch(() => {});
          }
        }, 60_000);
      }
      return Object.freeze({ ok: result?.ok !== false, result });
    }

    function ensure() {
      if (ensuring) return ensuring;
      ensuring = doEnsure().finally(() => { ensuring = null; });
      return ensuring;
    }
    async function clearCloudState() {
      await store.clearCloudState();
      adapter.primeRemoteReferences?.([]);
      if (pollId) global.clearInterval(pollId);
      pollId = null;
      emit('not_connected');
    }

    async function status() {
      try {
        const [membership, migrationState, datasetState, runtimeState, lastSyncAt, outbox, conflicts] = await Promise.all([
          store.readMeta('membership'),
          store.readMeta('migrationState'),
          store.readMeta('datasetState'),
          store.readMeta('runtimeState'),
          store.readMeta('lastSyncAt'),
          store.listOutbox(),
          store.listConflicts()
        ]);
        return Object.freeze({
          known: true,
          connected: membership?.state === 'active',
          migrationState: migrationState || 'unknown',
          datasetState: datasetState || 'unknown',
          runtimeState: runtimeState || 'unknown',
          lastSyncAt: lastSyncAt != null && Number.isFinite(Number(lastSyncAt)) ? Number(lastSyncAt) : null,
          pendingCount: Array.isArray(outbox) ? outbox.length : 0,
          conflictCount: Array.isArray(conflicts) ? conflicts.length : 0
        });
      } catch (_) {
        return Object.freeze({ known: false, connected: false, pendingCount: 0, conflictCount: 0 });
      }
    }

    return Object.freeze({
      enabled: true, ensure, clearCloudState, status,
      reconcileAssetReferences: async () => adapter.reconcileRemoteReferences?.(await store.listShadow?.() || []) === true,
      sync: (reason = 'manual') => runtime.sync(reason),
      listConflicts: () => runtime.listConflictPresentations(),
      resolveConflict: (id, choice) => runtime.resolveConflict(id, choice),
      runtime, store
    });
  }

  namespace.createPortSyncController = createPortSyncController;
})(globalThis);
