(function installPortSyncController(global) {
  'use strict';
  const namespace = global.SoundCruisePortSync = global.SoundCruisePortSync || {};
  const hosts = new Map();
  let sequence = 0;
  const defaultFetch = (...args) => global.fetch(...args);
  const defaultLabel = () => 'Cruise Port';
  const defaultCanSync = () => namespace.canSync?.() === true;
  function bindingKey(config, admissionMode) {
    return JSON.stringify({ enabled: config.enabled === true, endpoint: config.endpoint?.replace(/\/$/, '') || null,
      admissionMode, lifecycle: 'explicit-owner-v1' });
  }

  function createPortSyncController({ config, accountRoot = global.SoundCruiseSyncAccount,
    syncRoot = global.SoundCruiseMultiAppSync, fetchImpl = defaultFetch,
    deviceLabel = defaultLabel, readOnly = false, canSync = defaultCanSync } = {}) {
    if (!config?.enabled || !accountRoot?.storage || !accountRoot?.AccountClient || !accountRoot?.core ||
        !syncRoot?.MultiAppSyncRuntime || !syncRoot?.dataStorage || !namespace.PortSyncAdapter) {
      return Object.freeze({ enabled: false, getCachedStatus: () => Object.freeze({ known: false, state: 'unavailable' }),
        ensure: async () => ({ ok: false, code: 'port_sync_unavailable' }), dispose() {} });
    }
    const admissionMode = config.admissionMode || (config.environment === 'production' ? 'production' : 'qa');
    const key = 'port';
    let host = hosts.get(key);
    if (!host) {
      host = createHost({ accountRoot, syncRoot,
        onDispose: () => { if (hosts.get(key) === host) hosts.delete(key); } });
      hosts.set(key, host);
    }
    if (!readOnly) host.bindOwner({ config, accountRoot, syncRoot, fetchImpl, deviceLabel, canSync, admissionMode });
    return host.acquire({ readOnly });
  }

  function createHost({ accountRoot, syncRoot, onDispose }) {
    let binding = null, config = null, fetchImpl = null, deviceLabel = null, canSync = () => false, admissionMode = null;
    function bindOwner(next) {
      const key = bindingKey(next.config, next.admissionMode);
      const references = ['accountRoot', 'syncRoot', 'fetchImpl', 'deviceLabel', 'canSync'];
      if (binding) {
        if (binding.key !== key || references.some(name => binding[name] !== next[name])) {
          const error = new Error('owner_config_mismatch'); error.code = 'owner_config_mismatch'; throw error;
        }
        return;
      }
      // A reader has no activation authority. The first owner supplies every
      // activation dependency; later owners must reuse the identical contract.
      unsubscribeAccount?.();
      ({ accountRoot, syncRoot, fetchImpl, deviceLabel, canSync, admissionMode } = next);
      config = Object.freeze({ ...next.config });
      binding = { ...next, key };
      unsubscribeAccount = accountRoot.storage.subscribeAccount?.(stop);
    }
    let generation = ++sequence;
    let runtime = null, adapter = null, store = null, identity = null, ensuring = null, ensuringResumeOnly = false;
    let active = false, disposed = false, poll = null, refs = 0, owners = 0;
    let autoGeneration = null, autoResumeCode = null, autoAssets = null;
    const autoLifecycle = [];
    let lifetime = new AbortController();
    let cached = Object.freeze({ known: false, state: 'unknown', connected: false, credentialState: 'unknown' });
    const subscriptions = new Set(), lifecycle = [];
    const unknown = () => Object.freeze({ known: false, state: 'unknown', connected: false, credentialState: 'unknown' });
    function publish(value) {
      if (disposed || JSON.stringify(cached) === JSON.stringify(value)) return;
      cached = Object.freeze(value);
      for (const listener of subscriptions) { try { listener(cached); } catch (_) {} }
      global.dispatchEvent?.(new CustomEvent('cruise-port-sync-state', { detail: cached }));
    }
    function stop() {
      generation = ++sequence;
      active = false;
      lifetime.abort();
      runtime?.dispose?.();
      runtime = null; adapter = null; store = null; identity = null; ensuring = null;
      if (poll !== null) global.clearInterval(poll);
      poll = null;
      for (const remove of lifecycle.splice(0)) remove();
      lifetime = new AbortController();
      publish(unknown());
    }
    let unsubscribeAccount = accountRoot.storage.subscribeAccount?.(stop);
    function check(epoch, accountGeneration) {
      if (disposed || epoch !== generation || accountGeneration !== accountRoot.storage.getGeneration?.()) {
        const error = new Error('account_generation_changed'); error.code = 'account_generation_changed'; throw error;
      }
      if (!canSync()) { const error = new Error('pro_required'); error.code = 'pro_required'; throw error; }
    }
    function listen(target, type, callback, removers = lifecycle) {
      target?.addEventListener?.(type, callback);
      removers.push(() => target?.removeEventListener?.(type, callback));
    }
    function bindPolicy(epoch, accountGeneration) {
      if (lifecycle.length || disposed) return;
      const resume = reason => {
        try { check(epoch, accountGeneration); } catch (_) { return; }
        if (!active || global.navigator?.onLine === false || global.document?.visibilityState === 'hidden') return;
        runtime.sync(reason).catch(() => {});
      };
      listen(global, 'focus', () => resume('focus'));
      listen(global, 'online', () => resume('online'));
      listen(global, 'offline', () => { runtime?.clearTimer?.(runtime.retryTimer); publish({ ...cached, state: 'offline', credentialState: 'stale' }); });
      listen(global.document, 'visibilitychange', () => {
        if (global.document?.visibilityState === 'hidden') runtime?.clearTimer?.(runtime.retryTimer);
        else resume('resume');
      });
      // pagehide tears down the owner; pageshow may resume only a proven connection.
      listen(global, 'pagehide', stop);
      poll = global.setInterval?.(() => resume('poll'), 60_000) ?? null;
    }
    async function activate({ resumeOnly = false } = {}) {
      const epoch = generation, accountGeneration = accountRoot.storage.getGeneration?.();
      if (!global.navigator?.locks?.request) throw new Error('sync_locks_unavailable');
      const guard = () => check(epoch, accountGeneration);
      const wait = async operation => { guard(); const value = await operation(); guard(); return value; };
      const account = await wait(() => accountRoot.storage.getAccount());
      if (!accountRoot.core.validAccountCredential(account?.accountCredential)) {
        publish({ known: true, state: 'local-only', connected: false, credentialState: 'unknown' });
        return { ok: false, code: 'account_not_configured' };
      }
      if (global.navigator?.onLine === false) {
        publish({ ...cached, state: 'offline', credentialState: 'stale' });
        return { ok: false, code: 'offline' };
      }
      const accountId = account.accountId || account.accountCredential.split('.')[1];
      const accountGuard = async () => {
        guard(); const latest = await accountRoot.storage.getAccount(); guard();
        if (latest?.accountCredential !== account.accountCredential) { stop(); throw new Error('account_generation_changed'); }
      };
      if (resumeOnly) {
        // Existing account-scoped completion, not Account confirmation or a Pro flag.
        // Never inspect/adopt the appId-only legacy DB on an automatic path.
        const pendingAccount = await wait(() => Promise.all(['getPendingStart', 'getPendingConsume', 'getPendingBridge',
          'getPendingRecovery', 'getPendingDetach', 'getPendingDelete', 'getPendingEnvironmentDetach'].map(k => accountRoot.storage[k]?.())));
        if (pendingAccount.some(Boolean)) return { ok: false, code: 'activation_required' };
        const candidate = syncRoot.dataStorage.createStore('port', { accountId, assertCurrent: guard, signal: lifetime.signal });
        const [credential, membership, migration, dataset, lastSync, inspected, pendingProvision, state] = await wait(() => Promise.all(
          ['credential', 'membership', 'migrationState', 'datasetState', 'lastSyncAt', 'legacyInspected', 'pendingProvision', 'runtimeState'].map(k => candidate.readMeta(k))));
        if (!accountRoot.core.validAppCredential(credential) || membership?.state !== 'active' ||
            migration !== 'complete' || dataset !== 'ready' || !Number.isFinite(lastSync) || lastSync <= 0 ||
            inspected !== true || pendingProvision || state === 'credential_invalid') return { ok: false, code: 'activation_required' };
        // Port localStorage is shared across Accounts. Historical completion alone
        // cannot attribute new local edits after an Account switch/reload.
        const probe = new namespace.PortSyncAdapter({ assertCurrent: accountGuard });
        const [local, shadow, outbox, conflicts] = await wait(() => Promise.all([
          probe.serializeRecords(probe.normalizeLocalSnapshot(probe.readLocalSnapshot())),
          candidate.listShadow(), candidate.listOutbox(), candidate.listConflicts()]));
        const key = r => `${r.recordType}/${r.recordId}`, deleted = r => r == null || r.deleted === true || r.deletedAt != null;
        const intents = JSON.parse(probe.storage?.getItem('cruisePort.syncDeletionIntent.v1') || '{}');
        if (Object.entries(intents).some(([k, intent]) => !outbox.some(r => key(r) === k && deleted(r) &&
            typeof intent?.generation === 'string' && r.deleteIntentGeneration === intent.generation))) {
          autoResumeCode = 'local_data_unconfirmed'; await wait(() => readLocalStatus());
          return { ok: false, code: autoResumeCode };
        }
        const localMap = new Map(local.map(r => [key(r), r])), candidates = new Map();
        for (const r of [...shadow, ...outbox, ...conflicts.map(c => c.localRecord).filter(Boolean)]) {
          const k = key(r); if (!candidates.has(k)) candidates.set(k, []); candidates.get(k).push(r);
        }
        for (const k of new Set([...localMap.keys(), ...shadow.map(key)])) {
          const current = localMap.get(k);
          if (!(candidates.get(k) || []).some(r => deleted(current) ? deleted(r) : !deleted(r) && current.payloadHash === r.payloadHash)) {
            autoResumeCode = 'local_data_unconfirmed';
            await wait(() => readLocalStatus());
            return { ok: false, code: autoResumeCode };
          }
        }
        const client = new accountRoot.AccountClient({ endpoint: config.endpoint, fetchImpl, storage: accountRoot.storage,
          core: accountRoot.core, admissionMode, qaScope: 'port', assertCurrent: guard, signal: lifetime.signal });
        const devices = await wait(() => client.devices(account.accountCredential));
        if (!(devices.devices || devices.accountDevices || []).some(row => row.revokedAt == null &&
            row.portAppDeviceIds?.includes(credential.split('.')[1]))) return { ok: false, code: 'activation_required' };
        await accountGuard();
      }
      if (identity && identity !== accountId) { stop(); return resumeOnly ? { ok: false, code: 'activation_required' } : activate(); }
      if (!runtime) {
        identity = accountId;
        store = syncRoot.dataStorage.createStore('port', { accountId, assertCurrent: guard, signal: lifetime.signal });
        adapter = new namespace.PortSyncAdapter({ assertCurrent: accountGuard });
        const client = new accountRoot.AccountClient({ endpoint: config.endpoint, fetchImpl, storage: accountRoot.storage,
          core: accountRoot.core, admissionMode, qaScope: 'port', assertCurrent: guard, signal: lifetime.signal });
        runtime = new syncRoot.MultiAppSyncRuntime({ appId: 'port', endpoint: config.endpoint, adapter, store,
          accountClient: client, accountCore: accountRoot.core, admissionMode, fetchImpl, hostLifecycle: true, assertCurrent: guard, assertCurrentAsync: accountGuard });
        runtime.identity = Object.freeze({ accountId, appId: 'port', generation: epoch });
        for (const name of ['sync', 'initializeDataset', 'resolveConflict', 'retryLegacyFailures']) {
          const original = runtime[name];
          if (original) runtime[name] = function (...args) {
            return canSync() ? original.apply(this, args) : Promise.resolve({ ok: false, code: 'pro_required' });
          };
        }
        const currentRuntime = runtime;
        const stateListener = event => {
          try { guard(); } catch (_) { return; }
          const state = event.detail?.state || 'unknown';
          publish({ ...cached, ...event.detail, state, known: true,
            connected: state !== 'credential_invalid' && cached.connected,
            credentialState: state === 'credential_invalid' ? 'revoked' : state === 'ready' ? 'usable' : cached.credentialState,
            verifiedAt: state === 'ready' ? Date.now() : cached.verifiedAt });
          if (state === 'ready' && event.detail?.reason === 'conflict_resolved') {
            Promise.resolve().then(async () => {
              guard(); const migration = await store.readMeta('migrationState'); guard();
              if (migration !== 'complete') await ensure();
            }).catch(() => {});
          }
          if (adapter.consumeRemoteApplyChanged?.()) global.dispatchEvent?.(new CustomEvent('cruise-port-cloud-data-applied', { detail: { changed: true } }));
        };
        runtime.addEventListener('statechange', stateListener);
        lifetime.signal.addEventListener('abort', () => currentRuntime.removeEventListener('statechange', stateListener), { once: true });
        if (!resumeOnly) await runtime.runExclusive(async () => {
        // A pre-host database may contain pending operations. Adopt only after the
        // authenticated Account devices response proves ownership of its AppDevice.
        const legacy = syncRoot.dataStorage.createStore('port');
        const legacyCredential = await wait(() => legacy.readMeta('credential'));
        if (!await wait(() => store.readMeta('legacyInspected'))) {
          if (accountRoot.core.validAppCredential(legacyCredential) && typeof client.devices === 'function') {
            const devices = await wait(() => client.devices(account.accountCredential));
            const rows = devices.devices || devices.accountDevices || [];
            if (rows.some(row => row.revokedAt == null && row.portAppDeviceIds?.includes(legacyCredential.split('.')[1]))) {
              for (const name of ['credential', 'qaCredential', 'membership', 'migrationState', 'datasetState', 'lastSyncAt', 'cursor', 'pendingProvision']) {
                const value = await wait(() => legacy.readMeta(name));
                if (value !== null) await wait(() => store.setMeta(name, value));
              }
              for (const op of await wait(() => legacy.listOutbox())) await wait(() => store.putOutbox(op));
              for (const record of await wait(() => legacy.listShadow())) await wait(() => store.putShadow(`${record.recordType}/${record.recordId}`, record));
              for (const conflict of await wait(() => legacy.listConflicts())) await wait(() => store.putConflict(conflict));
            }
          }
          await wait(() => store.setMeta('legacyInspected', true));
        }
        });
      }
      await runtime.runExclusive(async () => {
      let credential = await wait(() => store.readMeta('credential'));
      if (!accountRoot.core.validAppCredential(credential)) {
        if (resumeOnly) throw new Error('activation_required');
        let pending = await wait(() => store.readMeta('pendingProvision'));
        if (!pending) {
          pending = { operationId: accountRoot.core.createOperationId(), appDeviceCredential: accountRoot.core.createAppCredential().appDeviceCredential };
          await wait(() => store.setMeta('pendingProvision', pending));
        }
        const result = await wait(() => runtime.accountClient.provisionPortDevice({ accountCredential: account.accountCredential,
          ...pending, deviceLabel: deviceLabel() }));
        await accountGuard();
        const qa = admissionMode === 'qa' ? await wait(() => accountRoot.storage.getQaAdmission('port')) : null;
        await wait(() => store.setMeta('credential', pending.appDeviceCredential));
        await wait(() => store.setMeta('qaCredential', qa?.qaCredential || null));
        await wait(() => store.setMeta('membership', { id: result.membershipId, appId: 'port', state: 'active' }));
        await wait(() => store.removeMeta('pendingProvision'));
        credential = pending.appDeviceCredential;
      }
      });
      adapter.primeRemoteReferences?.(await wait(() => store.listShadow()));
      active = true;
      syncRoot.runtimes = syncRoot.runtimes || Object.create(null);
      syncRoot.runtimes.port = runtime;
      const migration = await wait(() => store.readMeta('migrationState'));
      if (resumeOnly && migration !== 'complete') throw new Error('activation_required');
      const result = await wait(() => migration === 'complete' ? runtime.sync(resumeOnly ? 'auto-resume' : 'startup') : runtime.initializeDataset());
      const verified = result?.ok === true && global.navigator?.onLine !== false;
      if (!resumeOnly && verified && autoGeneration !== null) autoGeneration = accountGeneration;
      await readLocalStatus();
      guard();
      publish({ ...cached, credentialState: verified ? 'usable' : 'stale', verifiedAt: verified ? Date.now() : null });
      bindPolicy(epoch, accountGeneration);
      return Object.freeze({ ok: result?.ok !== false, result });
    }
    function ensure({ resumeOnly = false } = {}) {
      if (disposed) return Promise.reject(new Error('runtime_disposed'));
      if (!canSync()) return Promise.resolve({ ok: false, code: 'pro_required' });
      if (ensuring) {
        if (resumeOnly || !ensuringResumeOnly) return ensuring;
        const pending = ensuring;
        return pending.catch(() => {}).then(() => { if (ensuring === pending) ensuring = null; return ensure(); });
      }
      if (!resumeOnly) autoResumeCode = null;
      const epoch = generation, accountGeneration = accountRoot.storage.getGeneration?.();
      const operation = async () => {
        check(epoch, accountGeneration);
        const account = await accountRoot.storage.getAccount(); check(epoch, accountGeneration);
        const id = account?.accountId || account?.accountCredential?.split('.')[1] || 'unconfigured';
        return global.navigator?.locks?.request
          ? global.navigator.locks.request(`sound-cruise:port:activation:${id}`, { signal: lifetime.signal }, () => activate({ resumeOnly }))
          : activate({ resumeOnly });
      };
      const task = operation(); ensuring = task; ensuringResumeOnly = resumeOnly;
      task.catch(error => {
        if (!disposed && generation === epoch) {
          const credentialState = cached.credentialState; stop();
          publish({ known: false, state: 'error', credentialState, reason: error.code || error.message, connected: false });
        }
      }).finally(() => { if (ensuring === task) ensuring = null; }).catch(() => {});
      return task;
    }
    async function resumeConnected() {
      if (disposed || !canSync()) return { ok: false, code: 'pro_required' };
      if (active) return { ok: true, code: 'already_active' };
      if (autoGeneration === null || autoGeneration !== accountRoot.storage.getGeneration?.()) return { ok: false, code: 'activation_required' };
      if (global.navigator?.onLine === false || global.document?.visibilityState === 'hidden') return { ok: false, code: 'offline' };
      // Reuse native binary/reference readiness; projected record hashes alone
      // cannot attribute pending photos, attachments or release intents.
      const assets = await autoAssets?.status?.();
      if (!assets?.known || assets.pendingCount || assets.error) {
        autoResumeCode = 'local_data_unconfirmed'; await readLocalStatus();
        return { ok: false, code: autoResumeCode };
      }
      // The Account may have changed while reading IndexedDB attachment status.
      if (autoGeneration !== accountRoot.storage.getGeneration?.()) return { ok: false, code: 'activation_required' };
      if (active) return { ok: true, code: 'already_active' };
      return ensure({ resumeOnly: true });
    }
    function bindAutoResume({ assets } = {}) {
      if (autoLifecycle.length || disposed) return;
      autoGeneration = accountRoot.storage.getGeneration?.();
      autoAssets = assets;
      const resume = () => { void resumeConnected().catch(() => {}); };
      listen(global, 'focus', resume, autoLifecycle);
      listen(global, 'online', resume, autoLifecycle);
      listen(global, 'pageshow', resume, autoLifecycle);
      listen(global.document, 'visibilitychange', resume, autoLifecycle);
      resume();
    }
    async function readLocalStatus() {
      const epoch = generation, accountGeneration = accountRoot.storage.getGeneration?.();
      try {
        const account = await accountRoot.storage.getAccount();
        if (disposed || epoch !== generation || accountGeneration !== accountRoot.storage.getGeneration?.()) return cached;
        if (!accountRoot.core.validAccountCredential(account?.accountCredential)) return Object.freeze({ known: true, state: 'local-only', connected: false, credentialState: 'unknown' });
        const localStore = store || syncRoot.dataStorage.createStore('port', { accountId: account.accountId || account.accountCredential.split('.')[1] });
        const [credential, membership, migrationState, datasetState, runtimeState, lastSyncAt, outbox, conflicts] = await Promise.all([
          ...['credential', 'membership', 'migrationState', 'datasetState', 'runtimeState', 'lastSyncAt'].map(name => localStore.readMeta(name)),
          localStore.listOutbox(), localStore.listConflicts()]);
        if (disposed || epoch !== generation || accountGeneration !== accountRoot.storage.getGeneration?.()) return cached;
        const exists = accountRoot.core.validAppCredential(credential);
        const connected = exists && membership?.state === 'active';
        const value = { known: true, state: runtimeState || 'local-only', connected,
          autoResumeCode, credentialExists: exists, membershipKnown: !!membership, credentialState: membership?.state === 'revoked' ? 'revoked' : exists && connected && active && cached.credentialState === 'usable' && Date.now() - cached.verifiedAt <= 60_000 ? 'usable' : exists ? 'stale' : 'unknown',
          verifiedAt: cached.verifiedAt || null,
          migrationState: migrationState || 'unknown', datasetState: datasetState || 'unknown', runtimeState: runtimeState || 'unknown', lastSyncAt,
          pendingCount: outbox.length, terminalCount: outbox.filter(op => op.terminalError || op.conflict).length, conflictCount: conflicts.length };
        publish(value); return cached;
      } catch (_) { return unknown(); }
    }
    async function run(name, ...args) {
      if (!canSync()) return { ok: false, code: 'pro_required' };
      if (disposed || !active || !runtime) return { ok: false, code: 'activation_required' };
      check(generation, accountRoot.storage.getGeneration?.());
      return runtime[name](...args);
    }
    function cachedStatus() {
      return cached.credentialState === 'usable' && (Date.now() - cached.verifiedAt > 60_000 || global.navigator?.onLine === false)
        ? Object.freeze({ ...cached, credentialState: 'stale' }) : cached;
    }
    function acquire({ readOnly = false } = {}) {
      refs += 1; if (!readOnly) owners += 1; let released = false; const ownSubscriptions = new Set();
      const release = () => {
        if (released) return; released = true;
        for (const listener of ownSubscriptions) subscriptions.delete(listener);
        ownSubscriptions.clear();
        if (!readOnly && --owners === 0) { stop(); for (const remove of autoLifecycle.splice(0)) remove(); }
        if (--refs === 0) { stop(); disposed = true; unsubscribeAccount?.(); subscriptions.clear(); onDispose(); }
      };
      const requireConsumer = fn => (...args) => released ? Promise.reject(new Error('consumer_released')) : fn(...args);
      const reader = Object.freeze({ enabled: true, get identity() { return runtime?.identity || null; },
        getCachedStatus: () => released ? unknown() : cachedStatus(), status: requireConsumer(readLocalStatus), readLocalStatus: requireConsumer(readLocalStatus),
        subscribe(listener) { if (released) return () => {}; ownSubscriptions.add(listener); subscriptions.add(listener);
          return () => { ownSubscriptions.delete(listener); subscriptions.delete(listener); }; }, release, dispose: release });
      if (readOnly) return reader;
      return Object.freeze({ enabled: true, get restricted() { return !canSync(); },
        get runtime() { return released ? null : runtime; }, get store() { return released ? null : store; },
        get identity() { return runtime?.identity || null; },
        getCachedStatus: () => released ? unknown() : cachedStatus(), status: requireConsumer(readLocalStatus), readLocalStatus: requireConsumer(readLocalStatus), ensure: requireConsumer(() => ensure()), bindAutoResume: requireConsumer(bindAutoResume),
        subscribe(listener) { if (released) return () => {}; ownSubscriptions.add(listener); subscriptions.add(listener);
          return () => { ownSubscriptions.delete(listener); subscriptions.delete(listener); }; },
        sync: requireConsumer((reason = 'manual') => run('sync', reason)), resume: requireConsumer(() => run('sync', 'resume')),
        retryLegacyFailures: requireConsumer(() => run('retryLegacyFailures')),
        listConflicts: requireConsumer(() => runtime?.listConflictPresentations() || []),
        resolveConflict: requireConsumer((...args) => run('resolveConflict', ...args)),
        reconcileAssetReferences: requireConsumer(async () => {
          if (!canSync()) return { ok: false, code: 'pro_required' };
          if (!active || !adapter) return false;
          const epoch = generation, accountGeneration = accountRoot.storage.getGeneration?.();
          return runtime.runExclusive(async () => {
            const current = adapter, records = await store.listShadow(); check(epoch, accountGeneration);
            return current.reconcileRemoteReferences?.(records);
          });
        }),
        clearCloudState: requireConsumer(async () => {
          const current = runtime; if (!current) return;
          try { await current.runExclusive(async scoped => { await scoped.store.clearCloudState(); }); }
          finally { if (runtime === current) stop(); }
        }), release, dispose: release
      });
    }
    return { acquire, bindOwner };
  }
  namespace.createPortSyncController = createPortSyncController;
  namespace.createPortSyncReader = options => createPortSyncController({ ...options, readOnly: true });
})(globalThis);
