(function installMultiAppSyncRuntime(global) {
  'use strict';

  const root = global.SoundCruiseMultiAppSync = global.SoundCruiseMultiAppSync || {};
  const ACCOUNT_APPS = Object.freeze(['pitch', 'rhythm', 'fretboard']);
  const PAUSE_CODES = new Set(['sync_write_paused', 'sync_read_paused', 'rollout_control_unavailable']);
  const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

  function keyOf(record) { return `${record.recordType}/${record.recordId}`; }
  function isDeleted(record) { return record?.deletedAt != null || record?.deleted === true; }
  function sameRecord(left, right) {
    if (!left && !right) return true;
    if (!left && isDeleted(right)) return true;
    if (!right && isDeleted(left)) return true;
    if (!left || !right || isDeleted(left) !== isDeleted(right)) return false;
    return isDeleted(left) || left.payloadHash === right.payloadHash;
  }
  function mapRecords(records) { return new Map((records || []).map((record) => [keyOf(record), record])); }
  function clone(value) { return value == null ? value : structuredClone(value); }
  function canonicalJson(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  async function sha256(value) {
    const digest = await global.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  class MultiAppSyncError extends Error {
    constructor(code, status = 0) { super(code); this.name = 'MultiAppSyncError'; this.code = code; this.status = status; }
  }

  class MultiAppSyncRuntime extends EventTarget {
    constructor(options) {
      super();
      if (!options || !ACCOUNT_APPS.includes(options.appId)) throw new Error('multi_app_runtime_app_invalid');
      if (!options.endpoint?.startsWith('https://') && !/^http:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(options.endpoint || '')) {
        throw new Error('multi_app_runtime_endpoint_invalid');
      }
      if (!options.adapter || !options.store || !options.accountClient || !options.accountCore) {
        throw new Error('multi_app_runtime_dependency_missing');
      }
      this.appId = options.appId;
      this.endpoint = options.endpoint.replace(/\/$/, '');
      this.adapter = options.adapter;
      this.store = options.store;
      this.accountClient = options.accountClient;
      this.accountCore = options.accountCore;
      this.fetchImpl = options.fetchImpl || global.fetch.bind(global);
      this.now = options.now || Date.now;
      this.randomOperationId = options.randomOperationId || (() => this.accountCore.createOperationId());
      this.running = null;
      this.lifecycleBound = false;
    }

    setState(state, detail = {}) {
      this.store.setMeta('runtimeState', state).catch(() => {});
      this.dispatchEvent(new CustomEvent('statechange', { detail: Object.freeze({ state, ...detail }) }));
    }

    async credential() { return this.store.readMeta('credential'); }
    async qaCredential() { return this.store.readMeta('qaCredential'); }
    async membership() { return this.store.readMeta('membership'); }

    async request(method, path, body) {
      const credential = await this.credential();
      const qaCredential = await this.qaCredential();
      if (!this.accountCore.validAppCredential(credential)) throw new MultiAppSyncError('app_auth_required', 401);
      if (!this.accountCore.validQaCredential(qaCredential)) throw new MultiAppSyncError('qa_admission_required', 403);
      const headers = new Headers({ Accept: 'application/json', Authorization: `Bearer ${credential}` });
      headers.set('X-Sound-Cruise-QA-Authorization', `Bearer ${qaCredential}`);
      if (body) headers.set('Content-Type', 'application/json');
      const response = await this.fetchImpl(`${this.endpoint}${path}`, {
        method, headers, body: body ? JSON.stringify(body) : undefined,
        credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer'
      });
      let payload = null;
      try { payload = await response.json(); } catch (_) { /* handled below */ }
      if (!response.ok || payload?.ok !== true) {
        const code = payload?.code || 'invalid_response';
        if (response.status === 401) await this.store.setMeta('runtimeState', 'credential_invalid');
        if (PAUSE_CODES.has(code)) await this.store.setMeta('runtimeState', 'paused');
        throw new MultiAppSyncError(code, response.status);
      }
      return payload;
    }

    async consumeHandoff(handoffToken, deviceLabel = null) {
      this.setState('connecting');
      const result = await this.accountClient.consumeHandoff({
        handoffToken, appId: this.appId, deviceLabel, consumeMode: 'new_app',
        preservePending: true
      });
      if (result.consumeMode !== 'new_app' || !this.accountCore.validAppCredential(result.appDeviceCredential)) {
        throw new MultiAppSyncError('handoff_consume_invalid');
      }
      await this.store.setMeta('credential', result.appDeviceCredential);
      await this.store.setMeta('qaCredential', result.qaCredential);
      await this.store.setMeta('membership', {
        id: result.membershipId, appId: this.appId, state: result.membershipState || 'active'
      });
      if (typeof this.accountClient.confirmConsumePersisted === 'function') {
        await this.accountClient.confirmConsumePersisted();
      }
      return this.initializeDataset();
    }

    async serverSnapshot() {
      return this.request('GET', `/v1/sync/snapshot?appId=${encodeURIComponent(this.appId)}`);
    }

    async localRecords() {
      const snapshot = this.adapter.normalizeLocalSnapshot(this.adapter.readLocalSnapshot());
      return { snapshot, records: await this.adapter.serializeRecords(snapshot) };
    }

    async bootstrap(local) {
      return this.request('POST', '/v1/sync/bootstrap', {
        appId: this.appId,
        schemaVersion: local.snapshot.schemaVersion,
        recordCount: local.records.length,
        manifestHash: await this.adapter.computeManifest(local.snapshot)
      });
    }

    async operationFor(record, baseRevision, deleted = false) {
      const payloadHash = deleted ? await sha256(canonicalJson({
        appId: this.appId,
        payload: null,
        recordId: record.recordId,
        recordType: record.recordType,
        schemaVersion: record.schemaVersion
      })) : record.payloadHash;
      return Object.freeze({
        operationId: this.randomOperationId(),
        recordType: record.recordType,
        recordId: record.recordId,
        schemaVersion: record.schemaVersion,
        baseRevision: Number(baseRevision || 0),
        payload: deleted ? null : clone(record.payload),
        payloadHash,
        deleted,
        attempts: 0,
        nextRetryAt: 0,
        createdAt: this.now()
      });
    }

    async queueDiff(localRecords, remoteRecords, shadowRecords, { migration = false } = {}) {
      const local = mapRecords(localRecords);
      const remote = mapRecords(remoteRecords);
      const shadow = mapRecords(shadowRecords);
      const pending = await this.store.listOutbox();
      const pendingKeys = new Set(pending.map((item) => `${keyOf(item)}:${item.deleted === true}`));
      for (const recordKey of new Set([...local.keys(), ...shadow.keys()])) {
        const current = local.get(recordKey);
        const previous = shadow.get(recordKey);
        if (sameRecord(current, previous)) continue;
        const deleted = !current;
        if (!migration && !previous && deleted) continue;
        const source = current || previous;
        const pendingKey = `${recordKey}:${deleted}`;
        if (pendingKeys.has(pendingKey)) continue;
        const operation = await this.operationFor(source, remote.get(recordKey)?.revision || previous?.revision || 0, deleted);
        await this.store.putOutbox({ ...operation, migration });
      }
    }

    async flushOutbox({ migration = false, force = false } = {}) {
      const now = this.now();
      const operations = (await this.store.listOutbox()).filter((item) =>
        item.migration === migration && !item.conflict && !item.terminalError && (force || !item.nextRetryAt || item.nextRetryAt <= now)
      ).slice(0, 100);
      if (!operations.length) return { ok: true, sent: 0, conflict: 0 };
      let payload;
      try {
        payload = await this.request('POST', '/v1/sync/push', {
          appId: this.appId,
          mode: migration ? 'migration' : 'sync',
          operations: operations.map(({ operationId, recordType, recordId, schemaVersion, baseRevision, payload, payloadHash, deleted }) =>
            ({ operationId, recordType, recordId, schemaVersion, baseRevision, payload, payloadHash, deleted }))
        });
      } catch (error) {
        for (const operation of operations) {
          const attempts = Number(operation.attempts || 0) + 1;
          const retryable = error instanceof MultiAppSyncError && (RETRYABLE_STATUS.has(error.status) || PAUSE_CODES.has(error.code));
          await this.store.putOutbox({
            ...operation, attempts,
            nextRetryAt: retryable ? now + Math.min(300000, 1000 * (2 ** Math.min(attempts, 8))) : 0,
            ...(retryable ? {} : { terminalError: error.code || 'push_failed' })
          });
        }
        throw error;
      }
      let conflicts = 0;
      for (const result of payload.results || []) {
        const operation = operations.find((item) => item.operationId === result.operationId);
        if (!operation) throw new MultiAppSyncError('invalid_response');
        if (['applied', 'duplicate'].includes(result.status)) await this.store.deleteOutbox(operation.operationId);
        else if (result.status === 'conflict') {
          conflicts += 1;
          const conflict = { id: this.randomOperationId(), kind: 'push', recordKey: keyOf(operation), createdAt: now };
          await this.store.putConflict(conflict);
          await this.store.putOutbox({ ...operation, conflict: true });
        } else await this.store.putOutbox({ ...operation, terminalError: result.code || 'invalid' });
      }
      if (conflicts) this.setState('attention', { reason: 'conflict' });
      return { ok: conflicts === 0, sent: operations.length, conflict: conflicts };
    }

    async replaceShadow(records, cursor = null) {
      for (const record of records) await this.store.putShadow(keyOf(record), clone(record));
      await this.store.setMeta('shadowKeys', records.map(keyOf));
      if (cursor) await this.store.setMeta('cursor', cursor);
    }

    async initializeDataset() {
      const membership = await this.membership();
      this.adapter.assertDataPlaneContext({
        membership: membership || { appId: this.appId, state: 'active' },
        appCredential: { appId: this.appId, credential: await this.credential() }
      });
      this.setState('initializing');
      const local = await this.localRecords();
      await this.bootstrap(local);
      const remote = await this.serverSnapshot();
      const remoteLive = (remote.records || []).filter((record) => !isDeleted(record));
      const remoteSnapshot = this.adapter.deserializeRecords(remoteLive);
      let finalSnapshot = local.snapshot;
      if (!local.records.length && remoteLive.length) {
        finalSnapshot = remoteSnapshot;
        await this.adapter.applyRemoteSnapshot(finalSnapshot);
      } else if (local.records.length && remoteLive.length) {
        const merged = this.adapter.mergeSnapshots(local.snapshot, remoteSnapshot);
        if (merged.conflicts.length) {
          for (const item of merged.conflicts) await this.store.putConflict({
            id: this.randomOperationId(), kind: 'initial_merge', recordKey: item.recordKey, reason: item.reason, createdAt: this.now()
          });
          this.setState('attention', { reason: 'conflict' });
          return Object.freeze({ ok: false, code: 'merge_conflict', conflicts: merged.conflicts.length });
        }
        finalSnapshot = merged.snapshot;
        await this.adapter.applyRemoteSnapshot(finalSnapshot);
      }
      const finalRecords = await this.adapter.serializeRecords(finalSnapshot);
      await this.queueDiff(finalRecords, remote.records || [], remote.records || [], { migration: true });
      await this.flushOutbox({ migration: true, force: true });
      const finalManifest = await this.adapter.computeManifest(finalSnapshot);
      const completed = await this.request('POST', '/v1/sync/migration/complete', {
        appId: this.appId, schemaVersion: finalSnapshot.schemaVersion,
        recordCount: finalRecords.length, manifestHash: finalManifest
      });
      if (completed.datasetState !== 'ready' || completed.manifestHash !== finalManifest) {
        throw new MultiAppSyncError('manifest_mismatch');
      }
      const authoritative = await this.serverSnapshot();
      await this.replaceShadow(authoritative.records || [], authoritative.cursor);
      await this.store.setMeta('migrationState', 'complete');
      await this.store.setMeta('datasetState', 'ready');
      await this.store.setMeta('lastSyncAt', this.now());
      this.setState('ready');
      this.bindLifecycle();
      return Object.freeze({ ok: true, recordCount: authoritative.recordCount, manifestHash: authoritative.manifestHash });
    }

    async sync(reason = 'manual') {
      if (this.running) return this.running;
      this.running = this.performSync(reason).finally(() => { this.running = null; });
      return this.running;
    }

    async performSync(reason) {
      if (await this.store.readMeta('migrationState') !== 'complete') return { ok: false, code: 'migration_required' };
      if (global.navigator?.onLine === false) return { ok: false, code: 'offline' };
      this.setState('syncing', { reason });
      const [local, remote, shadowRecords] = await Promise.all([
        this.localRecords(), this.serverSnapshot(), this.store.listShadow()
      ]);
      const localMap = mapRecords(local.records);
      const remoteMap = mapRecords(remote.records || []);
      const shadowMap = mapRecords(shadowRecords);
      const conflictKeys = [];
      for (const recordKey of new Set([...localMap.keys(), ...remoteMap.keys(), ...shadowMap.keys()])) {
        const localRecord = localMap.get(recordKey);
        const remoteRecord = remoteMap.get(recordKey);
        const shadowRecord = shadowMap.get(recordKey);
        if (!sameRecord(localRecord, shadowRecord) && !sameRecord(remoteRecord, shadowRecord) && !sameRecord(localRecord, remoteRecord)) {
          conflictKeys.push(recordKey);
        }
      }
      if (conflictKeys.length) {
        for (const recordKey of conflictKeys) await this.store.putConflict({
          id: this.randomOperationId(), kind: 'pull', recordKey, createdAt: this.now()
        });
        this.setState('attention', { reason: 'conflict' });
        return { ok: false, code: 'conflict', conflicts: conflictKeys.length };
      }
      await this.queueDiff(local.records, remote.records || [], shadowRecords);
      await this.flushOutbox();
      const afterPush = await this.serverSnapshot();
      const localAfterPush = await this.localRecords();
      const afterMap = mapRecords(afterPush.records || []);
      const shadowBefore = mapRecords(shadowRecords);
      const remoteChanged = [...afterMap.keys()].some((recordKey) =>
        !sameRecord(afterMap.get(recordKey), shadowBefore.get(recordKey)) && sameRecord(localMap.get(recordKey), shadowBefore.get(recordKey))
      ) || [...shadowBefore.keys()].some((recordKey) => !afterMap.has(recordKey) && localMap.has(recordKey));
      if (remoteChanged) {
        const live = (afterPush.records || []).filter((record) => !isDeleted(record));
        await this.adapter.applyRemoteSnapshot(this.adapter.deserializeRecords(live));
      }
      await this.replaceShadow(afterPush.records || [], afterPush.cursor);
      await this.store.setMeta('lastSyncAt', this.now());
      this.setState('ready', { reason, recordCount: localAfterPush.records.length });
      return { ok: true, recordCount: afterPush.recordCount, manifestHash: afterPush.manifestHash };
    }

    notifyLocalSave() {
      queueMicrotask(() => this.sync('save').catch((error) => {
        this.setState(error instanceof MultiAppSyncError && PAUSE_CODES.has(error.code) ? 'paused' : 'retrying');
      }));
    }

    bindLifecycle() {
      if (this.lifecycleBound || !global.addEventListener) return;
      this.lifecycleBound = true;
      global.addEventListener('focus', () => this.sync('focus').catch(() => {}));
      global.addEventListener('online', () => this.sync('online').catch(() => {}));
      global.document?.addEventListener('visibilitychange', () => {
        if (global.document.visibilityState === 'visible') this.sync('resume').catch(() => {});
      });
    }
  }

  root.MultiAppSyncError = MultiAppSyncError;
  root.MultiAppSyncRuntime = MultiAppSyncRuntime;
  root.notifyLocalSave = (appId) => {
    const runtime = root.runtimes?.[appId];
    if (runtime) runtime.notifyLocalSave();
  };
})(globalThis);
