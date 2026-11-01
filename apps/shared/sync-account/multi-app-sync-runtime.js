(function installMultiAppSyncRuntime(global) {
  'use strict';

  const root = global.SoundCruiseMultiAppSync = global.SoundCruiseMultiAppSync || {};
  const ACCOUNT_APPS = Object.freeze(['pitch', 'rhythm', 'fretboard', 'port']);
  const PAUSE_CODES = new Set(['sync_write_paused', 'sync_read_paused', 'rollout_control_unavailable']);
  const TERMINAL_CODES = new Set([
    'account_deleting', 'account_deleted', 'account_device_revoked',
    'membership_deleting', 'membership_deleted', 'app_device_revoked',
    'app_identity_deleting', 'app_identity_deleted'
  ]);
  const authorityBlocked = code => /^(?:writer_protocol_|sync_protocol_|dataset_epoch_)/.test(code || '') ||
    ['dataset_authority_unavailable', 'legacy_outbox_needs_migration'].includes(code);
  const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
  const MAX_PUSH_OPERATIONS = 50;
  const REQUEST_TIMEOUT_MS = 20000;
  const LARGE_BODY_IDLE_TIMEOUT_MS = 20000;
  const LARGE_BODY_TOTAL_TIMEOUT_MS = 15 * 60 * 1000;
  const MAX_LARGE_RESPONSE_BYTES = 32 * 1024 * 1024;
  function retryableError(error) {
    return error instanceof MultiAppSyncError &&
      !authorityBlocked(error.code) && (error.code === 'network_error' || RETRYABLE_STATUS.has(error.status));
  }

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
  function sameRecordAnchors(leftRecords, rightRecords) {
    const left = mapRecords(leftRecords);
    const right = mapRecords(rightRecords);
    if (left.size !== right.size) return false;
    return [...left].every(([recordKey, record]) => sameAnchor(right.get(recordKey) || null, recordAnchor(record)));
  }
  function clone(value) { return value == null ? value : structuredClone(value); }
  function splitRecordKey(recordKey) {
    const value = String(recordKey || '');
    const divider = value.indexOf('/');
    if (divider <= 0 || divider === value.length - 1) return null;
    return { recordType: value.slice(0, divider), recordId: value.slice(divider + 1) };
  }
  function recordAnchor(record) {
    if (!record) return Object.freeze({ missing: true, deleted: true, revision: 0, payloadHash: null, operationId: null });
    return Object.freeze({
      missing: false,
      deleted: isDeleted(record),
      revision: Number(record.revision || 0),
      payloadHash: typeof record.payloadHash === 'string' ? record.payloadHash : null,
      operationId: typeof record.operationId === 'string' ? record.operationId : null
    });
  }
  function sameAnchor(record, anchor) {
    if (!anchor) return false;
    const current = recordAnchor(record);
    return current.missing === anchor.missing && current.deleted === anchor.deleted &&
      current.revision === Number(anchor.revision || 0) && current.payloadHash === (anchor.payloadHash || null) &&
      current.operationId === (anchor.operationId || null);
  }
  function localRecordFromRemote(record) {
    if (!record || isDeleted(record)) return null;
    return {
      recordType: record.recordType, recordId: record.recordId,
      schemaVersion: record.schemaVersion, payload: clone(record.payload)
    };
  }
  function safeErrorCode(error) {
    const code = typeof error?.code === 'string' ? error.code : 'resolution_failed';
    return /^[a-z0-9_]{1,80}$/u.test(code) ? code : 'resolution_failed';
  }
  function safePresentationText(value, fallback = '') {
    const text = String(value ?? fallback).replace(/[\u0000-\u001f\u007f-\u009f]/gu, ' ').trim();
    return text.slice(0, 120) || fallback;
  }
  function safePresentationTimestamp(value) {
    if (value == null || value === '') return null;
    const timestamp = typeof value === 'number' ? value : Date.parse(String(value));
    return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
  }
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

  // Execution scopes are lexical receivers, never a shared "lock held" flag.
  // Unrelated calls on the same runtime still queue behind the native lock.
  const executionScopes = new WeakMap();
  async function withSyncExecution({ accountId, appId, locks = global.navigator?.locks, signal, assertCurrent = () => {} }, operation) {
    if (!accountId || typeof accountId !== 'string' || !ACCOUNT_APPS.includes(appId)) throw new MultiAppSyncError('sync_identity_required');
    if (!locks?.request) throw new MultiAppSyncError('sync_locks_unavailable');
    assertCurrent();
    const name = `sound-cruise:sync-execution:v1:${encodeURIComponent(accountId)}:${appId}`;
    return locks.request(name, { mode: 'exclusive', ...(signal ? { signal } : {}) }, async () => {
      assertCurrent(); if (signal?.aborted) throw new MultiAppSyncError('runtime_disposed');
      return operation();
    });
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
      this.executionCoordinated = options.appId === 'port' || options.executionCoordination === true;
      this.executionAccountId = options.accountId || options.store.accountId;
      this.executionLocks = options.locks || global.navigator?.locks;
      this.endpoint = options.endpoint.replace(/\/$/, '');
      this.adapter = options.adapter;
      this.store = options.store;
      this.accountClient = options.accountClient;
      this.accountCore = options.accountCore;
      this.admissionMode = options.admissionMode || this.accountClient.admissionMode || 'qa';
      if (!['qa', 'production'].includes(this.admissionMode)) throw new Error('multi_app_runtime_admission_invalid');
      this.writerWireContext = options.writerWireContext || null;
      this.authorityFailure = null;
      this.fetchImpl = options.fetchImpl || global.fetch.bind(global);
      this.now = options.now || Date.now;
      this.randomOperationId = options.randomOperationId || (() => this.accountCore.createOperationId());
      this.running = null;
      this.resolutionRunning = null;
      this.syncRequestGeneration = 0;
      this.pendingSyncReason = null;
      this.lifecycleBound = false;
      this.retryTimer = null;
      this.networkRetryAt = 0;
      this.networkRetryAttempts = 0;
      this.disposed = false;
      this.assertCurrent = options.assertCurrent || (() => {});
      this.assertCurrentAsync = options.assertCurrentAsync || (() => {});
      this.hostLifecycle = options.hostLifecycle === true;
      this.lifetime = new AbortController();
      this.timers = new Set();
      this.listeners = [];
      this.abortControllers = new Set();

    }

    async runExclusive(operation) {
      const scope = executionScopes.get(this);
      if (scope?.active) { this.assertActive(); return operation(this); }
      const runtime = scope?.runtime || this;
      if (!runtime.executionCoordinated) return operation(runtime);
      return withSyncExecution({ accountId: runtime.executionAccountId, appId: runtime.appId,
        locks: runtime.executionLocks, signal: runtime.lifetime.signal, assertCurrent: () => runtime.assertActive() }, async () => {
        await runtime.assertCurrentAsync(); runtime.assertActive();
        const state = { runtime, active: true, pending: [] };
        const receiver = new Proxy(runtime, { get(target, key) {
          // Nested orchestration must not await an unrelated job waiting for
          // this lock. Timers fired after release use the normal entry points.
          if (state.active && key === 'sync') return reason => receiver.performSync(reason);
          if (state.active && key === 'resolveConflict') return (...args) => receiver.performConflictResolution(...args);
          if (['dispatchEvent', 'addEventListener', 'removeEventListener'].includes(key)) return target[key].bind(target);
          if (key === 'store') return new Proxy(Object.create(null), { get(_view, name) {
            // The native IDB store is frozen. A separate view avoids Proxy
            // invariants that forbid wrapping non-configurable methods.
            const store = target.store, fn = store[name]; if (typeof fn !== 'function') return fn;
            return (...args) => {
              if (/^(put|set|remove|delete|clear)/.test(String(name))) {
                if (!state.active) throw new MultiAppSyncError('execution_scope_expired');
                runtime.assertActive();
                const result = Promise.resolve(fn.apply(store, args));
                state.pending.push(result); return result;
              }
              return fn.apply(store, args);
            };
          } });
          return Reflect.get(target, key);
        } });
        executionScopes.set(receiver, state);
        try { return await operation(receiver); }
        finally {
          // setState writes are deliberately fire-and-forget in the legacy
          // API; include their transaction completion before releasing lock.
          await Promise.allSettled(state.pending); state.active = false;
        }
      });
    }

    assertActive() {
      if (this.disposed) throw new MultiAppSyncError('runtime_disposed');
      this.assertCurrent();
    }

    async wait(operation) {
      this.assertActive();
      const signal = this.lifetime.signal;
      let stop;
      const cancelled = new Promise((_, reject) => {
        stop = () => reject(new MultiAppSyncError('runtime_disposed'));
        signal.addEventListener('abort', stop, { once: true });
      });
      try {
        const result = await Promise.race([operation(), cancelled]);
        this.assertActive();
        return result;
      } finally { signal.removeEventListener('abort', stop); }
    }

    setTimer(callback, delay) {
      this.assertActive();
      const id = global.setTimeout(() => {
        this.timers.delete(id);
        if (!this.disposed) callback();
      }, delay);
      this.timers.add(id);
      return id;
    }
    clearTimer(id) { this.timers.delete(id); global.clearTimeout(id); }
    listen(target, type, callback) {
      this.assertActive();
      target?.addEventListener?.(type, callback);
      this.listeners.push(() => target?.removeEventListener?.(type, callback));
    }
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      this.pendingSyncReason = null;
      this.lifetime.abort();
      for (const abort of this.abortControllers) abort.abort();
      this.abortControllers.clear();
      for (const id of this.timers) global.clearTimeout(id);
      this.timers.clear();
      for (const remove of this.listeners.splice(0)) remove();
      this.lifecycleBound = false;
      this.retryTimer = null;
      if (root.runtimes?.[this.appId] === this) delete root.runtimes[this.appId];
    }

    setState(state, detail = {}) {
      if (this.disposed) return;
      this.assertActive();
      const scope = executionScopes.get(this);
      const save = current => current.store.setMeta('runtimeState', state);
      (scope?.active || !this.executionCoordinated ? save(this) : this.runExclusive(save)).catch(() => {});
      this.dispatchEvent(new CustomEvent('statechange', { detail: Object.freeze({ state, ...detail }) }));
    }

    async credential() { return this.wait(() => this.store.readMeta('credential')); }
    async qaCredential() { return this.wait(() => this.store.readMeta('qaCredential')); }
    async membership() { return this.wait(() => this.store.readMeta('membership')); }

    async detachTerminalIdentity(code) {
      if (!TERMINAL_CODES.has(code)) return false;
      if (typeof this.store.clearCloudState !== 'function') throw new MultiAppSyncError('sync_detach_unavailable');
      await this.wait(async () => (this.store.clearCloudState()));
      this.setState('credential_invalid', { reason: code, terminal: true });
      return true;
    }

    async detachCurrentEnvironment() {
      const credential = await this.wait(async () => (this.credential()));
      if (!this.accountCore.validAppCredential(credential)) {
        throw new MultiAppSyncError('app_auth_required', 401);
      }
      const pending = await this.wait(async () => (this.store.readMeta('pendingCurrentEnvironmentDetach')));
      const operationId = typeof pending?.operationId === 'string'
        ? pending.operationId : this.randomOperationId();
      if (!pending) await this.wait(async () => (this.store.setMeta('pendingCurrentEnvironmentDetach', { operationId })));
      this.setState('disconnecting');
      const result = await this.wait(async () => (this.accountClient.detachCurrentAppEnvironment({
        appCredential: credential, operationId
      })));
      // Server success is the only condition that clears the local binding.
      // clearCloudState deliberately leaves the app's ordinary local data alone.
      await this.wait(async () => (this.store.clearCloudState()));
      this.setState('credential_invalid', { reason: 'current_environment_detached', terminal: true });
      return Object.freeze(result);
    }

    async resumeCurrentEnvironmentDetach() {
      const pending = await this.wait(async () => (this.store.readMeta('pendingCurrentEnvironmentDetach')));
      if (!pending?.operationId) return Object.freeze({ status: 'none' });
      const result = await this.wait(async () => (this.detachCurrentEnvironment()));
      return Object.freeze({ status: 'committed', result });
    }

    writerEnvelope(body) {
      if (this.authorityFailure) throw new MultiAppSyncError(this.authorityFailure);
      const context = this.writerWireContext?.context;
      if (context && (context.accountId !== this.executionAccountId || context.appId !== this.appId ||
          (context.localAuthorityGeneration && context.localAuthorityGeneration !== this.store.authorityGeneration)))
        throw new MultiAppSyncError('dataset_authority_unavailable');
      return this.writerWireContext ? this.writerWireContext.envelope(body) : body;
    }
    writerHeaders() { this.writerEnvelope({}); return this.writerWireContext?.headers() || {}; }
    async prepareWriterAuthority(client) {
      let context;
      try {
        context = await this.wait(() => client.prepare(this));
        await this.wait(() => this.assertCurrentAsync());
        if (context.context?.accountId !== this.executionAccountId || context.context?.appId !== this.appId ||
            (context.context?.localAuthorityGeneration && context.context.localAuthorityGeneration !== this.store.authorityGeneration))
          throw new MultiAppSyncError('dataset_authority_unavailable');
      } catch (error) { this.authorityFailure = error.code || 'dataset_authority_unavailable'; this.setState('blocked', { reason: this.authorityFailure }); throw error; }
      this.writerWireContext = context; this.authorityFailure = null;
      return Object.freeze({ ...context.context, ...context.fields });
    }

    async request(method, path, body) {
      this.assertActive();
      if (method === 'POST' && ['/v1/sync/push', '/v1/sync/bootstrap',
        '/v1/sync/migration/complete', '/v1/sync/removal-safety'].includes(path)) body = this.writerEnvelope(body);
      if (path === '/v1/sync/push' &&
          (body?.operations?.length > 50 || new TextEncoder().encode(JSON.stringify(body)).byteLength > 256 * 1024)) {
        throw new MultiAppSyncError('operation_too_large');
      }
      const credential = await this.wait(async () => (this.credential()));
      const qaCredential = await this.wait(async () => (this.qaCredential()));
      if (!this.accountCore.validAppCredential(credential)) throw new MultiAppSyncError('app_auth_required', 401);
      if (this.admissionMode === 'qa' && !this.accountCore.validQaCredential(qaCredential)) {
        throw new MultiAppSyncError('qa_admission_required', 403);
      }
      const headers = new Headers({ Accept: 'application/json', Authorization: `Bearer ${credential}` });
      const proHeaders = await this.wait(async () => (global.SoundCruiseProBackendEntitlement?.proAuthorizationHeaders?.()));
      for (const [name, value] of Object.entries(proHeaders || {})) headers.set(name, value);
      if (this.admissionMode === 'qa') {
        headers.set('X-Sound-Cruise-QA-Authorization', `Bearer ${qaCredential}`);
      }
      if (body) headers.set('Content-Type', 'application/json');
      let response;
      const abort = typeof global.AbortController === 'function' ? new global.AbortController() : null;
      if (abort) this.abortControllers.add(abort);
      let timer;
      try {
        if (global.navigator?.onLine === false) throw new MultiAppSyncError('network_error');
        const fetchPromise = this.fetchImpl(`${this.endpoint}${path}`, {
          method, headers, body: body ? JSON.stringify(body) : undefined,
          credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', ...(abort ? { signal: abort.signal } : {})
        });
        const timeoutPromise = typeof global.setTimeout === 'function' ? new Promise((_, reject) => {
          timer = this.setTimer(() => { abort?.abort(); reject(new MultiAppSyncError('network_error')); }, REQUEST_TIMEOUT_MS);
          timer?.unref?.();
        }) : null;
        response = await (this.wait(async () => (timeoutPromise ? Promise.race([fetchPromise, timeoutPromise]) : fetchPromise)));
      } catch (error) {
        if (abort) this.abortControllers.delete(abort);
        if (this.disposed) throw error;
        throw new MultiAppSyncError('network_error');
      } finally {
        if (timer != null) this.clearTimer(timer);
      }
      let payload = null;
      let bodyTimer;
      try {
        const largeBody = method === 'GET' && /^\/v1\/sync\/(?:snapshot|changes)(?:\?|$)/u.test(path);
        // A snapshot may take much longer than 20 seconds in total on a slow
        // connection. Bound each idle interval instead of the whole transfer.
        const readProgressive = async () => {
          const reader = response.body.getReader();
          const decoder = new global.TextDecoder();
          let json = '';
          let bytes = 0;
          try {
            while (true) {
              let idleTimer;
              const read = reader.read();
              const idle = new Promise((_, reject) => {
                idleTimer = this.setTimer(() => {
                  abort?.abort();
                  reject(new MultiAppSyncError('network_error'));
                }, LARGE_BODY_IDLE_TIMEOUT_MS);
                idleTimer?.unref?.();
              });
              let chunk;
              try { chunk = await this.wait(async () => (Promise.race([read, idle]))); }
              finally { this.clearTimer(idleTimer); }
              if (chunk.done) break;
              bytes += chunk.value.byteLength;
              if (bytes > MAX_LARGE_RESPONSE_BYTES) throw new MultiAppSyncError('response_too_large');
              json += decoder.decode(chunk.value, { stream: true });
            }
            return JSON.parse(json + decoder.decode());
          } finally {
            reader.releaseLock();
          }
        };
        const progressive = largeBody && response.body?.getReader &&
          typeof global.setTimeout === 'function' && typeof global.TextDecoder === 'function';
        const bodyPromise = progressive ? readProgressive() : response.json();
        const timeoutPromise = typeof global.setTimeout === 'function' ? new Promise((_, reject) => {
          bodyTimer = this.setTimer(() => { abort?.abort(); reject(new MultiAppSyncError('network_error')); },
            largeBody ? LARGE_BODY_TOTAL_TIMEOUT_MS : REQUEST_TIMEOUT_MS);
          bodyTimer?.unref?.();
        }) : null;
        payload = await (this.wait(async () => (timeoutPromise ? Promise.race([bodyPromise, timeoutPromise]) : bodyPromise)));
      } catch (error) {
        if (error?.code === 'network_error' || ['AbortError', 'TypeError'].includes(error?.name)) {
          throw new MultiAppSyncError('network_error');
        }
      } finally {
        if (bodyTimer != null) this.clearTimer(bodyTimer);
        if (abort) this.abortControllers.delete(abort);
      }
      await this.wait(() => this.assertCurrentAsync());
      if (!response.ok || payload?.ok !== true) {
        const code = payload?.code || 'invalid_response';
        // Preserve a definite pre-mutation Pro refusal before notifying the UI
        // invalidates the current qualification/guarded store handle.
        if (this.appId === 'port' && method === 'POST' && path === '/v1/sync/push' && response.status === 403 && /^pro_(required|reauth_required|revalidation_required)$/.test(code)) {
          const pending = await this.wait(() => this.store.listOutbox());
          for (const op of body?.operations || []) {
            const saved = pending.find(x => x.operationId === op.operationId);
            if (saved) await this.wait(() => this.store.putOutbox({ ...saved, outcome: undefined, terminalError: code, nextRetryAt: 0 }));
          }
        }
        global.SoundCruiseProBackendEntitlement?.rejectProAuthorization?.(code, headers);
        if (await this.wait(async () => (this.detachTerminalIdentity(code)))) throw new MultiAppSyncError(code, response.status);
        if (authorityBlocked(code)) { this.authorityFailure = code; this.setState('blocked', { reason: code }); }
        if (PAUSE_CODES.has(code)) this.setState('paused', { reason: code });
        throw new MultiAppSyncError(code, response.status);
      }
      return payload;
    }

    async pushRequest(body) {
      this.assertActive();
      body = this.writerEnvelope(body);
      const bytes = operations => new TextEncoder().encode(JSON.stringify({ ...body, operations })).byteLength;
      for (const operation of body.operations || []) {
        if (bytes([operation]) > 256 * 1024) throw new MultiAppSyncError('operation_too_large');
      }
      const chunks = []; let chunk = [];
      for (const operation of body.operations || []) {
        if (chunk.length === 50 || bytes([...chunk, operation]) > 256 * 1024) { chunks.push(chunk); chunk = []; }
        chunk.push(operation);
      }
      if (chunk.length) chunks.push(chunk);
      const results = [];
      for (const operations of chunks) {
        const prior = this.appId === 'port' ? await this.wait(() => this.store.listOutbox()) : [];
        const previous = new Map(prior.map(o => [o.operationId, o]));
        if (this.appId === 'port' && prior.some(o => o.outcome === 'UNKNOWN')) throw new MultiAppSyncError('push_outcome_unknown');
        const readbackCursor = this.appId === 'port' ? await this.wait(() => this.store.readMeta('cursor')) : null;
        const dispatched = new Map();
        if (this.appId === 'port') for (const operation of operations) {
          const saved = {
            ...(previous.get(operation.operationId) || {
              ...operation,
              ...(this.writerWireContext ? { writerAuthority: { ...this.writerWireContext.fields } } : {}),
              ...(this.writerWireContext?.context ? { authorityContext: { ...this.writerWireContext.context } } : {}),
              migration: body.mode === 'migration',
              ...(operation.deleted ? { deleteIntentGeneration: this.adapter.deleteIntentGeneration?.(keyOf(operation)) } : {})
            }),
            outcome: 'UNKNOWN', readbackCursor: previous.get(operation.operationId)?.readbackCursor ?? readbackCursor, nextRetryAt: 0
          };
          dispatched.set(operation.operationId, saved);
          await this.wait(() => this.store.putOutbox(saved));
        }
        let response;
        try {
          response = await this.wait(() => this.request('POST', '/v1/sync/push', { ...body, operations }));
          const ids = new Set(operations.map(item => item.operationId));
          if (!Array.isArray(response.results) || response.results.length !== operations.length ||
              new Set(response.results.map(item => item.operationId)).size !== operations.length ||
              response.results.some(item => !ids.has(item.operationId) || !['applied','duplicate','conflict','invalid','forbidden'].includes(item.status))) throw new MultiAppSyncError('invalid_response');
        } catch (error) {
          if (this.appId !== 'port') throw error;
          if (authorityBlocked(error.code)) {
            for (const operation of operations) await this.wait(() => this.store.putOutbox({
              ...dispatched.get(operation.operationId), outcome: 'UNKNOWN', terminalError: error.code, authorityStatus: error.code === 'dataset_epoch_stale' ? 'stale-epoch' : /(?:required|outdated|unsupported)$/.test(error.code) ? 'needs-upgrade' : 'blocked-authority', nextRetryAt: 0
            }));
            throw error;
          }
          if (error.status === 403 && /^pro_(required|reauth_required|revalidation_required)$/.test(error.code || '')) throw error;
          this.setState('attention', { reason: 'push_outcome_unknown' });
          throw new MultiAppSyncError('push_outcome_unknown');
        }
        if (this.appId === 'port') for (const result of response.results) {
          const operation = operations.find(o => o.operationId === result.operationId), saved = previous.get(result.operationId);
          if (['applied','duplicate'].includes(result.status)) {
            if (operation.deleted) await this.wait(() => this.adapter.acknowledgeDelete?.(keyOf(operation), dispatched.get(result.operationId)?.deleteIntentGeneration));
            else await this.wait(() => this.acknowledgeOwnRecord(operation, result.record));
            await this.wait(() => this.store.deleteOutbox(result.operationId));
          } else if (saved) await this.wait(() => this.store.putOutbox({ ...saved, outcome: undefined }));
          else await this.wait(() => this.store.deleteOutbox(result.operationId));
        }
        results.push(...response.results);
      }
      return { ok: true, results };
    }

    async consumeHandoff(handoffToken, deviceLabel = null) {
      if (this.accountCore.validAppCredential(await this.wait(async () => (this.credential())))) {
        throw new MultiAppSyncError('active_identity_present');
      }
      this.setState('connecting');
      const result = await this.wait(async () => (this.accountClient.consumeHandoff({
        handoffToken, appId: this.appId, deviceLabel, consumeMode: 'new_app',
        preservePending: true
      })));
      if (result.consumeMode !== 'new_app' || !this.accountCore.validAppCredential(result.appDeviceCredential)) {
        throw new MultiAppSyncError('handoff_consume_invalid');
      }
      await this.wait(async () => (this.store.setMeta('credential', result.appDeviceCredential)));
      await this.wait(async () => (this.store.setMeta('qaCredential', result.qaCredential || null)));
      await this.wait(async () => (this.store.setMeta('membership', {
        id: result.membershipId, appId: this.appId, state: result.membershipState || 'active'
      })));
      if (typeof this.accountClient.confirmConsumePersisted === 'function') {
        await this.wait(async () => (this.accountClient.confirmConsumePersisted()));
      }
      return this.initializeDataset();
    }

    async consumeInvitation(joinCode, deviceLabel = null) {
      if (this.accountCore.validAppCredential(await this.wait(async () => (this.credential())))) {
        throw new MultiAppSyncError('active_identity_present');
      }
      this.setState('connecting');
      const result = await this.wait(async () => (this.accountClient.consumeJoinInvitation({
        joinCode, appId: this.appId, deviceLabel, consumeMode: 'new_app', preservePending: true
      })));
      if (result.consumeMode !== 'new_app' || !this.accountCore.validAppCredential(result.appDeviceCredential)) {
        throw new MultiAppSyncError('app_join_consume_invalid');
      }
      await this.wait(async () => (this.store.setMeta('credential', result.appDeviceCredential)));
      await this.wait(async () => (this.store.setMeta('qaCredential', result.qaCredential || null)));
      await this.wait(async () => (this.store.setMeta('membership', {
        id: result.membershipId, appId: this.appId, state: result.membershipState || 'active'
      })));
      await this.wait(async () => (this.accountClient.confirmConsumePersisted?.()));
      return this.initializeDataset();
    }

    // Record types gated behind a capability are only exchanged when the adapter
    // declares it. Adapters without capabilities send byte-identical requests.
    syncCapabilities() {
      const values = this.adapter?.syncCapabilities;
      return Array.isArray(values)
        ? values.filter((value) => typeof value === 'string' && /^[a-z][a-z0-9_]{0,63}$/u.test(value)).slice(0, 16)
        : [];
    }

    withSyncCapabilities(body) {
      const capabilities = this.syncCapabilities();
      return this.writerEnvelope(capabilities.length ? { ...body, capabilities } : body);
    }

    async serverSnapshot() {
      const capabilities = this.syncCapabilities();
      return this.request('GET', `/v1/sync/snapshot?appId=${encodeURIComponent(this.appId)}${capabilities.length
        ? `&capabilities=${encodeURIComponent(capabilities.join(','))}` : ''}`);
    }

    async reportRemovalSafety(state) {
      // Reporting is advisory presentation for Cruise Port. It must never turn
      // a successful local sync into a failure when the summary endpoint is
      // temporarily unavailable.
      if (this.appId === 'port') return;
      try {
        const attentionCount = state === 'attention' ? (await this.wait(async () => (this.store.listConflicts()))).length : 0;
        await this.wait(async () => (this.request('POST', '/v1/sync/removal-safety', { appId: this.appId, state, attentionCount })));
      } catch (_) { /* fail closed in Port */ }
    }

    recordsEqual(left, right) {
      return sameRecord(left, right) || this.adapter.sameRecordForSync?.(left, right) === true;
    }

    async attentionSummary() {
      const [conflicts, outbox] = await this.wait(async () => (Promise.all([this.store.listConflicts(), this.store.listOutbox()])));
      if (conflicts.some((item) => item.kind === 'invalid_record')) return Object.freeze({
        kind: 'data_repair', count: conflicts.length, reviewable: true,
        status: `問題のデータがあります ${conflicts.length}件`,
        description: '読み込めない保存データがあります。正常なデータを選ぶか、あとで決められます。'
      });
      if (conflicts.length) return Object.freeze({ kind: 'conflict', count: conflicts.length,
        status: `確認が必要 ${conflicts.length}件`, description: '同期する内容を選んでください。' });
      const terminal = outbox.filter((item) => item.terminalError || item.conflict);
      if (terminal.length && terminal.every((item) => item.terminalError === 'push_failed' && !item.failureKind)) return Object.freeze({
        kind: 'retry', count: terminal.length, status: '同期を再試行できます',
        description: '以前の送信を安全にもう一度試せます。'
      });
      if (terminal.length) return Object.freeze({ kind: 'data_repair', count: terminal.length,
        status: '保存データの確認が必要です',
        description: '自動では送信できないデータがあります。対象データを開いて内容を確認し、保存し直してください。' });
      return Object.freeze({ kind: 'retry', count: 0, status: '同期を確認できませんでした',
        description: '通信状態を確認して、もう一度お試しください。' });
    }

    recoveryChoices(conflict) {
      const localUsable = conflict?.recovery?.localInvalid !== true &&
        conflict?.anchors?.local?.missing !== true && conflict?.anchors?.local?.deleted !== true;
      const remoteUsable = conflict?.recovery?.remoteInvalid !== true &&
        conflict?.anchors?.remote?.missing !== true && conflict?.anchors?.remote?.deleted !== true;
      return Object.freeze({ localUsable, remoteUsable,
        allowed: Object.freeze(localUsable ? ['local'] : remoteUsable ? ['remote'] : ['local']) });
    }

    async localRecords() {
      let snapshot;
      let issues = [];
      let isolatedKeys = [];
      let writeIsolatedKeys = [];
      try {
        snapshot = this.adapter.normalizeLocalSnapshot(this.adapter.readLocalSnapshot());
      } catch (error) {
        if (typeof this.adapter.normalizeLocalSnapshotForRecovery === 'function') {
          const recovery = this.adapter.normalizeLocalSnapshotForRecovery(this.adapter.readLocalSnapshot());
          snapshot = recovery.snapshot;
          issues = recovery.issues || [];
          isolatedKeys = recovery.isolatedKeys || [];
          writeIsolatedKeys = recovery.writeIsolatedKeys || isolatedKeys;
        } else {
          if (typeof this.adapter.repairMissingLegacyReferences !== 'function' ||
              !/^pitch_legacy_(?:chord_stage|progression)_reference_invalid$/u.test(String(error?.message))) throw error;
          await this.wait(async () => (this.adapter.repairMissingLegacyReferences(await this.wait(async () => (this.store.listShadow())))));
          snapshot = this.adapter.normalizeLocalSnapshot(this.adapter.readLocalSnapshot());
        }
      }
      if (!issues.length && typeof this.adapter.partitionSyncRecords === 'function') {
        const partitioned = this.adapter.partitionSyncRecords(snapshot.records || []);
        snapshot = { ...snapshot, records: partitioned.records };
        issues = partitioned.issues || [];
        isolatedKeys = partitioned.isolatedKeys || [];
        writeIsolatedKeys = partitioned.writeIsolatedKeys || isolatedKeys;
      }
      return { snapshot, records: await this.wait(async () => (this.adapter.serializeRecords(snapshot))), issues, isolatedKeys, writeIsolatedKeys };
    }

    partitionRemote(remote) {
      if (typeof this.adapter.partitionSyncRecords !== 'function') {
        return { remote, issues: [], isolatedKeys: [], writeIsolatedKeys: [] };
      }
      const partitioned = this.adapter.partitionSyncRecords(remote.records || []);
      return { remote: { ...remote, records: partitioned.records },
        issues: partitioned.issues || [], isolatedKeys: partitioned.isolatedKeys || [],
        writeIsolatedKeys: partitioned.writeIsolatedKeys || partitioned.isolatedKeys || [] };
    }

    async recordRecoveryIssues(local, rawRemote, remoteIssues, localIssues) {
      const localIssueKeys = new Set((localIssues || []).map((issue) => issue.recordKey));
      const remoteIssueKeys = new Set((remoteIssues || []).map((issue) => issue.recordKey));
      const localMap = mapRecords(local.records);
      const rawRemoteMap = mapRecords(rawRemote.records || []);
      const existing = new Map((await this.wait(async () => (this.store.listConflicts()))).map((item) => [item.recordKey, item]));
      const currentKeys = new Set([...localIssueKeys, ...remoteIssueKeys]);
      for (const conflict of existing.values()) {
        if (conflict.kind !== 'invalid_record' || currentKeys.has(conflict.recordKey)) continue;
        const localRecord = localMap.get(conflict.recordKey) || null;
        const remoteRecord = rawRemoteMap.get(conflict.recordKey) || null;
        await this.wait(async () => (this.store.deleteConflict(conflict.id)));
        if (this.recordsEqual(localRecord, remoteRecord)) {
          await this.wait(async () => (this.clearConflictOutbox(conflict.recordKey)));
          if (remoteRecord) await this.wait(async () => (this.store.putShadow(conflict.recordKey, clone(remoteRecord))));
          else await this.wait(async () => (this.store.deleteShadow?.(conflict.recordKey)));
        } else {
          await this.wait(async () => (this.recordConflict('pull', conflict.recordKey, { reason: 'recovered_record_changed',
            localRecord, remoteRecord, shadowRecord: await this.wait(async () => (this.store.getShadow?.(conflict.recordKey))) })));
        }
      }
      for (const issue of [...(localIssues || []), ...(remoteIssues || [])]) {
        const previous = existing.get(issue.recordKey);
        const recovery = { localInvalid: localIssueKeys.has(issue.recordKey),
          remoteInvalid: remoteIssueKeys.has(issue.recordKey) };
        if (previous?.kind === 'invalid_record' &&
            (previous.recovery?.localInvalid !== recovery.localInvalid ||
             previous.recovery?.remoteInvalid !== recovery.remoteInvalid)) {
          await this.wait(async () => (this.store.deleteConflict(previous.id)));
        } else if (previous) continue;
        await this.wait(async () => (this.recordConflict('invalid_record', issue.recordKey, {
          reason: issue.reason,
          localRecord: localMap.get(issue.recordKey) || null,
          remoteRecord: rawRemoteMap.get(issue.recordKey) || null,
          recovery
        })));
      }
    }

    async applyWithBackup(nextSnapshot, previousSnapshot, { checkCurrent = false, remoteChoiceKey = null } = {}) {
      await this.wait(async () => (this.backupSnapshot(previousSnapshot)));
      if (checkCurrent && canonicalJson((await this.wait(async () => (this.localRecords()))).snapshot) !== canonicalJson(previousSnapshot)) {
        throw new MultiAppSyncError('local_changed_during_apply');
      }
      try {
        await this.wait(async () => (this.adapter.applyRemoteSnapshot(nextSnapshot, { ...(checkCurrent ? { expectedSnapshot: previousSnapshot } : {}), ...(remoteChoiceKey ? { remoteChoiceKey } : {}), assertCurrent: async () => { this.assertActive(); await this.assertCurrentAsync(); this.assertActive(); } })));
      } catch (error) {
        if (error?.code === 'local_changed_during_apply' || this.adapter.ownsRollback === true) throw error;
        try { await this.wait(async () => (this.adapter.applyRemoteSnapshot(previousSnapshot))); } catch (_) { /* preserve original failure */ }
        throw error;
      }
    }

    async backupSnapshot(snapshot) {
      const backup = global.SoundCruiseSyncAccount?.appBackupStorage;
      if (!backup?.save) throw new MultiAppSyncError('app_backup_unavailable');
      await this.wait(async () => (backup.save({
        version: 1, appId: this.appId, createdAt: this.now(), values: clone(snapshot)
      })));
    }

    async bootstrap(local) {
      return this.request('POST', '/v1/sync/bootstrap', {
        appId: this.appId,
        schemaVersion: local.snapshot.schemaVersion,
        recordCount: local.records.length,
        manifestHash: await this.wait(async () => (this.adapter.computeManifest(local.snapshot)))
      });
    }

    async operationFor(record, baseRevision, deleted = false, operationId = this.randomOperationId()) {
      const payloadHash = deleted ? await this.wait(async () => (sha256(canonicalJson({
        appId: this.appId,
        payload: null,
        recordId: record.recordId,
        recordType: record.recordType,
        schemaVersion: record.schemaVersion
      })))) : record.payloadHash;
      return Object.freeze({
        operationId,
        recordType: record.recordType,
        recordId: record.recordId,
        schemaVersion: record.schemaVersion,
        baseRevision: Number(baseRevision || 0),
        payload: deleted ? null : clone(record.payload),
        payloadHash,
        deleted,
        ...(deleted && this.adapter.deleteIntentGeneration ? { deleteIntentGeneration: this.adapter.deleteIntentGeneration(keyOf(record)) } : {}),
        ...(this.writerWireContext ? { writerAuthority: { ...this.writerWireContext.fields } } : {}),
        ...(this.writerWireContext?.context ? { authorityContext: { ...this.writerWireContext.context } } : {}),
        attempts: 0,
        nextRetryAt: 0,
        createdAt: this.now()
      });
    }

    async recordConflict(kind, recordKey, details = {}) {
      const parts = splitRecordKey(recordKey);
      if (!parts) throw new MultiAppSyncError('conflict_record_invalid');
      const existing = (await this.wait(async () => (this.store.listConflicts()))).find((item) => item.recordKey === recordKey);
      const conflict = {
        ...(existing || {}),
        id: existing?.id || this.randomOperationId(),
        kind, recordKey, recordType: parts.recordType, recordId: parts.recordId,
        reason: details.reason || existing?.reason || null,
        createdAt: existing?.createdAt || this.now(), updatedAt: this.now(),
        state: existing?.state || 'attention',
        ...(details.recovery ? { recovery: clone(details.recovery) } : {}),
        anchors: {
          local: recordAnchor(details.localRecord),
          remote: recordAnchor(details.remoteRecord),
          shadow: recordAnchor(details.shadowRecord)
        }
      };
      await this.wait(async () => (this.store.putConflict(conflict)));
      return conflict;
    }

    async conflictContext(conflict) {
      const parts = splitRecordKey(conflict?.recordKey);
      if (!parts) throw new MultiAppSyncError('conflict_record_invalid');
      const [local, remote, shadowRecords] = await this.wait(async () => (Promise.all([
        this.localRecords(), this.serverSnapshot(), this.store.listShadow()
      ])));
      const localRecord = mapRecords(local.records).get(conflict.recordKey) || null;
      const remoteRecord = mapRecords(remote.records || []).get(conflict.recordKey) || null;
      const shadowRecord = mapRecords(shadowRecords).get(conflict.recordKey) || null;
      return { parts, local, remote, shadowRecords, localRecord, remoteRecord, shadowRecord };
    }

    settingsFieldPlan(context, choices = {}) {
      if (this.appId === 'port' || typeof root.mergeSettingsFields !== 'function') return null;
      const { localRecord, remoteRecord, shadowRecord } = context;
      if ([localRecord, remoteRecord, shadowRecord].some((record) => record && record.recordType !== 'settings') ||
          (!localRecord && !remoteRecord)) return null;
      if ((!this.adapter.effectiveSettingsForMerge && (!localRecord || !remoteRecord)) ||
          (!shadowRecord && (!localRecord || !remoteRecord))) return null;
      const effective = (values) => this.adapter.effectiveSettingsForMerge?.(values) || values;
      const plan = root.mergeSettingsFields(effective(isDeleted(localRecord) ? {} : localRecord?.payload?.values || {}),
        effective(isDeleted(remoteRecord) ? {} : remoteRecord?.payload?.values || {}), shadowRecord ?
          effective(shadowRecord.payload?.values) : null, choices);
      return plan.values === null ? plan : Object.freeze({ ...plan,
        values: this.adapter.encodeSettingsForMerge?.(plan.values) || plan.values });
    }

    sanitizeConflictPresentation(value, context) {
      const stateText = (record) => record && !isDeleted(record) ? '保存されています' : '削除されています';
      const raw = value && typeof value === 'object' ? value : {};
      const fields = Array.isArray(raw.fields) ? raw.fields.slice(0, 8).map((field) => ({
        label: safePresentationText(field?.label, '内容'),
        local: safePresentationText(field?.local, stateText(context.localRecord)),
        remote: safePresentationText(field?.remote, stateText(context.remoteRecord))
      })) : [];
      if (!fields.length) fields.push({
        label: '状態', local: stateText(context.localRecord), remote: stateText(context.remoteRecord)
      });
      return Object.freeze({
        appName: safePresentationText(raw.appName, 'Sound Cruise'),
        title: safePresentationText(raw.title, '同期データ'),
        name: safePresentationText(raw.name, '確認が必要な項目'),
        localUpdatedAt: safePresentationTimestamp(raw.localUpdatedAt),
        remoteUpdatedAt: safePresentationTimestamp(raw.remoteUpdatedAt),
        localState: stateText(context.localRecord),
        remoteState: stateText(context.remoteRecord),
        fields: Object.freeze(fields.map(Object.freeze))
      });
    }

    async listConflictPresentations() {
      const conflicts = await this.wait(async () => (this.store.listConflicts()));
      if (!conflicts.length) return Object.freeze([]);
      const [local, remote, shadowRecords] = await this.wait(async () => (Promise.all([
        this.localRecords(), this.serverSnapshot(), this.store.listShadow()
      ])));
      const localMap = mapRecords(local.records);
      const remoteMap = mapRecords(remote.records || []);
      const shadowMap = mapRecords(shadowRecords);
      const items = conflicts.map((conflict) => {
        const context = {
          conflict,
          localRecord: localMap.get(conflict.recordKey) || null,
          remoteRecord: remoteMap.get(conflict.recordKey) || null,
          shadowRecord: shadowMap.get(conflict.recordKey) || null
        };
        const described = typeof this.adapter.getConflictPresentation === 'function'
          ? this.adapter.getConflictPresentation(context)
          : null;
        const settings = this.settingsFieldPlan(context, conflict.resolution?.fieldChoices || {});
        const recovery = conflict.kind === 'invalid_record' ? this.recoveryChoices(conflict) : null;
        return Object.freeze({
          id: conflict.id,
          state: conflict.state || 'attention',
          recovery: conflict.kind === 'invalid_record' ? Object.freeze({
            localInvalid: conflict.recovery?.localInvalid === true,
            remoteInvalid: conflict.recovery?.remoteInvalid === true,
            allowedChoices: recovery.allowed,
            localLabel: !recovery.localUsable && !recovery.remoteUsable
              ? 'このステージを削除' : 'この端末の正常データを使用',
            remoteLabel: 'クラウドの正常データを使用'
          }) : null,
          selection: ['local', 'remote'].includes(conflict.resolution?.choice)
            ? conflict.resolution.choice : null,
          settings: settings ? Object.freeze({
            fields: settings.conflicts,
            automaticCount: settings.automaticCount
          }) : null,
          presentation: this.sanitizeConflictPresentation(described, context)
        });
      });
      return Object.freeze(items);
    }

    async saveConflict(conflict, state, resolution) {
      const next = { ...conflict, state, resolution: resolution ? clone(resolution) : null, updatedAt: this.now() };
      await this.wait(async () => (this.store.putConflict(next)));
      this.setState(state.startsWith('resolving_') || state === 'verifying' ? state : 'attention', {
        reason: 'conflict'
      });
      return next;
    }

    async failResolution(conflict, error, { reset = false } = {}) {
      const code = safeErrorCode(error);
      const resolution = reset ? null : conflict.resolution ? { ...conflict.resolution, status: 'pending', lastError: code } : null;
      await this.wait(async () => (this.saveConflict(conflict, 'attention', resolution)));
      return Object.freeze({ ok: false, code });
    }

    async clearConflictOutbox(recordKey) {
      for (const operation of await this.wait(async () => (this.store.listOutbox()))) {
        if (operation.outcome !== 'UNKNOWN' && keyOf(operation) === recordKey && !authorityBlocked(operation.terminalError) &&
            canonicalJson(operation.writerAuthority || null) === canonicalJson(this.writerWireContext?.fields || null) &&
            canonicalJson(operation.authorityContext || null) === canonicalJson(this.writerWireContext?.context || null))
          await this.wait(async () => (this.store.deleteOutbox(operation.operationId)));
      }
    }

    async finishResolution(conflict, authoritative, relatedKeys = []) {
      await this.wait(async () => (this.clearConflictOutbox(conflict.recordKey)));
      const remaining = (await this.wait(async () => (this.store.listConflicts()))).filter((item) => item.id !== conflict.id);
      if (conflict.kind === 'invalid_record' && typeof this.adapter.recoveryRelatedRecordKeys === 'function') {
        relatedKeys = [...new Set([...relatedKeys, ...this.adapter.recoveryRelatedRecordKeys({
          recordKey: conflict.recordKey, remoteRecords: authoritative.records || []
        })])];
      }
      // Resolution changes only this record. Other remote edits still need the
      // ordinary three-way pull against their original shadow anchors.
      const resolved = mapRecords(authoritative.records || []).get(conflict.recordKey) || null;
      if (resolved) await this.wait(async () => (this.store.putShadow(conflict.recordKey, clone(resolved))));
      else await this.wait(async () => (this.store.deleteShadow?.(conflict.recordKey)));
      const authoritativeMap = mapRecords(authoritative.records || []);
      for (const recordKey of new Set(relatedKeys)) {
        if (recordKey === conflict.recordKey) continue;
        const record = authoritativeMap.get(recordKey) || null;
        if (record) await this.wait(async () => (this.store.putShadow(recordKey, clone(record))));
        else await this.wait(async () => (this.store.deleteShadow?.(recordKey)));
      }
      if (authoritative.cursor) await this.wait(async () => (this.store.setMeta('cursor', authoritative.cursor)));
      await this.wait(async () => (this.store.deleteConflict(conflict.id)));
      if (!remaining.length) {
        if (await this.wait(async () => (this.store.readMeta('migrationState'))) !== 'complete') {
          // The original initial merge was paused before migration completion.
          // Resume it only after the last choice is verified on both sides.
          return this.initializeDataset();
        }
        this.setState('ready', { reason: 'conflict_resolved' });
      } else {
        this.setState('attention', { reason: 'conflict', conflicts: remaining.length });
      }
      return Object.freeze({ ok: true, remaining: remaining.length });
    }

    remoteMatchesAppliedIntent(remoteRecord, resolution) {
      return !!remoteRecord && remoteRecord.operationId === resolution.operationId &&
        Number(remoteRecord.revision || 0) === Number(resolution.expectedRemote?.revision || 0) + 1 &&
        isDeleted(remoteRecord) === resolution.desiredDeleted &&
        remoteRecord.payloadHash === resolution.desiredHash;
    }

    async verifyLocalResolution(conflict, resolution, authoritative) {
      const local = await this.wait(async () => (this.localRecords()));
      const localRecord = mapRecords(local.records).get(conflict.recordKey) || null;
      if ((!localRecord) !== resolution.desiredDeleted ||
          (!resolution.desiredDeleted && localRecord?.payloadHash !== resolution.desiredHash)) {
        throw Object.assign(new MultiAppSyncError('local_changed_during_resolution'), { resetResolution: true });
      }
      // The authoritative manifest may include unrelated remote changes that
      // have not been pulled yet. The selected record was verified above and
      // finishResolution advances only its shadow anchor; ordinary sync pulls
      // every other record against its original anchor.
      if (conflict.recordType === 'melody_stage' && resolution.expectedRemote?.deleted === true &&
          resolution.desiredDeleted === false && typeof this.adapter.planDeletedStageRevival === 'function') {
        return this.completeDeletedStageRevival(conflict, resolution);
      }
      return this.finishResolution(conflict, authoritative);
    }

    async completeDeletedStageRevival(conflict, resolution) {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const context = await this.wait(async () => (this.conflictContext(conflict)));
        if (!this.remoteMatchesAppliedIntent(context.remoteRecord, resolution)) {
          throw Object.assign(new MultiAppSyncError('stale_resolution'), { resetResolution: true });
        }
        const plan = this.adapter.planDeletedStageRevival({ recordKey: conflict.recordKey,
          localRecords: context.local.records, remoteRecords: context.remote.records || [] });
        if (plan.complete) {
          const next = this.adapter.prepareRevivedStageLocalSnapshot(context.local.snapshot, {
            recordKey: conflict.recordKey, remoteRecords: context.remote.records || []
          });
          await this.wait(async () => (this.applyWithBackup(next, context.local.snapshot, { checkCurrent: true })));
          return this.finishResolution(conflict, context.remote, plan.relatedKeys);
        }
        const mutation = plan.mutations.find((item) => item.phase === 'order') || plan.mutations[0];
        const [serialized] = await this.wait(async () => (this.adapter.serializeRecords({
          appId: this.appId, schemaVersion: context.local.snapshot.schemaVersion,
          records: [mutation.record]
        })));
        const saved = (resolution.recoveryOperations || []).find((operation) =>
          keyOf(operation) === keyOf(mutation.record) &&
          Number(operation.baseRevision || 0) === Number(mutation.remoteRecord?.revision || 0) &&
          canonicalJson(operation.payload) === canonicalJson(mutation.record.payload));
        const operation = await this.wait(async () => (this.operationFor(serialized,
          mutation.remoteRecord?.revision || 0, false, saved?.operationId || this.randomOperationId())));
        resolution = { ...resolution, recoveryOperations: [clone(operation)], status: 'pending' };
        conflict = await this.wait(async () => (this.saveConflict(conflict, 'resolving_local', resolution)));
        const response = await this.wait(async () => (this.pushRequest( this.withSyncCapabilities({
          appId: this.appId, mode: 'sync',
          operations: [{ operationId: operation.operationId, recordType: operation.recordType,
            recordId: operation.recordId, schemaVersion: operation.schemaVersion,
            baseRevision: operation.baseRevision, payload: operation.payload,
            payloadHash: operation.payloadHash, deleted: false }]
        }))));
        const result = (response.results || []).find((item) => item.operationId === operation.operationId);
        if (result?.status === 'conflict') {
          resolution = { ...resolution, recoveryOperations: [], status: 'pending' };
          conflict = await this.wait(async () => (this.saveConflict(conflict, 'resolving_local', resolution)));
          continue;
        }
        if (!['applied', 'duplicate'].includes(result?.status)) {
          throw new MultiAppSyncError(result?.code || 'resolution_push_failed');
        }
        resolution = { ...resolution, recoveryOperations: [], status: 'pending' };
        conflict = await this.wait(async () => (this.saveConflict(conflict, 'resolving_local', resolution)));
      }
      throw new MultiAppSyncError('recovery_retry_exhausted');
    }

    async resolveInvalidRecordDeleteConflict(conflict) {
      if (global.navigator?.onLine === false) throw new MultiAppSyncError('resolution_offline');
      let resolution = conflict.resolution?.choice === 'local' &&
          conflict.resolution?.recoveryMode === 'delete_dependencies'
        ? clone(conflict.resolution)
        : { choice: 'local', status: 'pending', recoveryMode: 'delete_dependencies',
          startedAt: this.now(), backupSaved: false, recoveryOperations: [], relatedKeys: [conflict.recordKey] };
      let context = await this.wait(async () => (this.conflictContext(conflict)));
      if (context.localRecord) {
        throw Object.assign(new MultiAppSyncError('local_changed_during_resolution'), { resetResolution: true });
      }
      conflict = await this.wait(async () => (this.saveConflict(conflict, 'resolving_local', resolution)));
      if (!resolution.backupSaved) {
        await this.wait(async () => (this.backupSnapshot(context.local.snapshot)));
        resolution = { ...resolution, backupSaved: true };
        conflict = await this.wait(async () => (this.saveConflict(conflict, 'resolving_local', resolution)));
      }

      for (let attempt = 0; attempt < 8; attempt += 1) {
        context = await this.wait(async () => (this.conflictContext(conflict)));
        if (context.localRecord) {
          throw Object.assign(new MultiAppSyncError('local_changed_during_resolution'), { resetResolution: true });
        }
        const plan = this.adapter.planInvalidRecordDeleteRecovery({
          recordKey: conflict.recordKey, remoteRecords: context.remote.records || []
        });
        if (plan.changed) {
          throw Object.assign(new MultiAppSyncError('recovery_target_changed'), { resetResolution: true });
        }
        resolution = { ...resolution,
          relatedKeys: [...new Set([...(resolution.relatedKeys || []), ...(plan.relatedKeys || [])])] };
        if (plan.complete) {
          let cleanedSnapshot = typeof this.adapter.prepareInvalidRecordDeleteLocalSnapshot === 'function'
            ? await this.wait(async () => (this.adapter.prepareInvalidRecordDeleteLocalSnapshot(context.local.snapshot, {
              recordKey: conflict.recordKey, remoteRecords: context.remote.records || []
            }))) : context.local.snapshot;
          if (typeof this.adapter.reconcileOrderRecords === 'function') {
            cleanedSnapshot = { ...cleanedSnapshot, records: this.reconcileOrderRecords(cleanedSnapshot.records,
              context.remote.records || [], 'remote') };
          }
          await this.wait(async () => (this.applyWithBackup(cleanedSnapshot, context.local.snapshot, { checkCurrent: true })));
          conflict = await this.wait(async () => (this.saveConflict(conflict, 'verifying', { ...resolution,
            status: 'verifying', recoveryOperations: [] })));
          return this.finishResolution(conflict, context.remote, resolution.relatedKeys);
        }

        const phase = ['order', 'progress', 'stage'].find((value) =>
          plan.mutations.some((mutation) => mutation.phase === value));
        const mutations = plan.mutations.filter((mutation) => mutation.phase === phase)
          .slice(0, MAX_PUSH_OPERATIONS);
        const previous = new Map((resolution.recoveryOperations || []).map((operation) =>
          [`${operation.recordType}/${operation.recordId}`, operation]));
        const operations = [];
        for (const mutation of mutations) {
          const recordKey = keyOf(mutation.record);
          const saved = previous.get(recordKey);
          const reusable = saved && saved.deleted === mutation.deleted &&
            Number(saved.baseRevision || 0) === Number(mutation.remoteRecord?.revision || 0) &&
            canonicalJson(saved.payload) === canonicalJson(mutation.deleted ? null : mutation.record.payload);
          // A repair write built by the adapter (e.g. an order without the broken reference) carries no
          // payload hash yet; without one the Worker rejects it.
          const record = mutation.deleted || mutation.record.payloadHash || typeof this.adapter.recordPayloadHash !== 'function'
            ? mutation.record : { ...mutation.record, payloadHash: await this.wait(async () => (this.adapter.recordPayloadHash(mutation.record))) };
          operations.push(await this.wait(async () => (this.operationFor(record,
            mutation.remoteRecord?.revision || 0, mutation.deleted,
            reusable ? saved.operationId : this.randomOperationId()))));
        }
        resolution = { ...resolution, status: 'pending', phase,
          recoveryOperations: operations.map(clone) };
        conflict = await this.wait(async () => (this.saveConflict(conflict, 'resolving_local', resolution)));
        const response = await this.wait(async () => (this.pushRequest( this.withSyncCapabilities({
          appId: this.appId, mode: 'sync',
          operations: operations.map(({ operationId, recordType, recordId, schemaVersion,
            baseRevision, payload, payloadHash, deleted }) =>
            ({ operationId, recordType, recordId, schemaVersion, baseRevision, payload, payloadHash, deleted }))
        }))));
        const results = response.results || [];
        if (operations.some((operation) => !results.some((result) =>
          result.operationId === operation.operationId && ['applied', 'duplicate', 'conflict'].includes(result.status)))) {
          throw new MultiAppSyncError('invalid_response');
        }
        if (results.some((result) => result.status === 'conflict')) {
          resolution = { ...resolution, status: 'pending', recoveryOperations: [], lastError: 'stale_dependency' };
          conflict = await this.wait(async () => (this.saveConflict(conflict, 'resolving_local', resolution)));
          continue;
        }
        resolution = { ...resolution, status: 'pending', recoveryOperations: [], lastError: null };
        conflict = await this.wait(async () => (this.saveConflict(conflict, 'resolving_local', resolution)));
      }
      throw new MultiAppSyncError('recovery_retry_exhausted');
    }

    async resolveLocalConflict(conflict) {
      if (global.navigator?.onLine === false) throw new MultiAppSyncError('resolution_offline');
      if (conflict.kind === 'invalid_record' &&
          (conflict.recovery?.localInvalid === true || conflict.reason === 'pitch_stage_dependency_inconsistent') &&
          typeof this.adapter.planInvalidRecordDeleteRecovery === 'function') {
        return this.resolveInvalidRecordDeleteConflict(conflict);
      }
      let context = await this.wait(async () => (this.conflictContext(conflict)));
      if (conflict.kind === 'invalid_record' && conflict.recovery?.localInvalid === true &&
          !context.remoteRecord && !context.shadowRecord) {
        await this.wait(async () => (this.applyWithBackup(context.local.snapshot, context.local.snapshot, { checkCurrent: true })));
        return this.finishResolution(conflict, context.remote);
      }
      if (!(conflict.resolution?.choice === 'local' && conflict.resolution.expectedRemote) &&
          typeof this.adapter.reconcileOrderRecords === 'function' &&
          this.adapter.isOrderRecord?.(context.localRecord || context.remoteRecord) === true) {
        context = await this.wait(async () => (this.prepareLocalOrderResolution(conflict, context)));
      }
      let resolution = conflict.resolution?.choice === 'local' ? clone(conflict.resolution) : {
        choice: 'local', status: 'pending', operationId: this.randomOperationId(), startedAt: this.now()
      };
      if (resolution.expectedRemote) {
        if (this.remoteMatchesAppliedIntent(context.remoteRecord, resolution)) {
          if (conflict.kind === 'invalid_record' && resolution.desiredDeleted &&
              conflict.recovery?.localInvalid === true) {
            await this.wait(async () => (this.applyWithBackup(context.local.snapshot, context.local.snapshot, { checkCurrent: true })));
          }
          conflict = await this.wait(async () => (this.saveConflict(conflict, 'verifying', resolution)));
          return this.verifyLocalResolution(conflict, resolution, context.remote);
        }
        if (!sameAnchor(context.remoteRecord, resolution.expectedRemote)) {
          throw Object.assign(new MultiAppSyncError('stale_resolution'), { resetResolution: true });
        }
        if (!sameAnchor(context.localRecord, resolution.local)) {
          throw Object.assign(new MultiAppSyncError('local_changed_during_resolution'), { resetResolution: true });
        }
      } else {
        const source = context.localRecord || context.remoteRecord || context.shadowRecord;
        if (!source) throw new MultiAppSyncError('conflict_record_missing');
        const generated = await this.wait(async () => (this.operationFor(
          source, context.remoteRecord?.revision || 0, !context.localRecord, resolution.operationId
        )));
        resolution = {
          ...resolution,
          expectedRemote: recordAnchor(context.remoteRecord),
          local: recordAnchor(context.localRecord),
          desiredDeleted: !context.localRecord,
          desiredHash: generated.payloadHash,
          recordType: source.recordType,
          recordId: source.recordId,
          schemaVersion: source.schemaVersion,
          backupSaved: false
        };
      }
      conflict = await this.wait(async () => (this.saveConflict(conflict, 'resolving_local', resolution)));
      if (!resolution.backupSaved) {
        await this.wait(async () => (this.backupSnapshot(context.local.snapshot)));
        resolution = { ...resolution, backupSaved: true };
        conflict = await this.wait(async () => (this.saveConflict(conflict, 'resolving_local', resolution)));
      }
      const source = context.localRecord || context.remoteRecord || context.shadowRecord;
      const operation = await this.wait(async () => (this.operationFor(
        source, resolution.expectedRemote.revision, resolution.desiredDeleted, resolution.operationId
      )));
      const response = await this.wait(async () => (this.pushRequest( this.withSyncCapabilities({
        appId: this.appId, mode: 'sync',
        operations: [{
          operationId: operation.operationId, recordType: operation.recordType, recordId: operation.recordId,
          schemaVersion: operation.schemaVersion, baseRevision: operation.baseRevision,
          payload: operation.payload, payloadHash: operation.payloadHash, deleted: operation.deleted
        }]
      }))));
      const result = (response.results || []).find((item) => item.operationId === resolution.operationId);
      if (result?.status === 'conflict') {
        throw Object.assign(new MultiAppSyncError('stale_resolution'), { resetResolution: true });
      }
      if (!['applied', 'duplicate'].includes(result?.status)) throw new MultiAppSyncError(result?.code || 'resolution_push_failed');
      if (conflict.kind === 'invalid_record' && resolution.desiredDeleted &&
          conflict.recovery?.localInvalid === true) {
        await this.wait(async () => (this.applyWithBackup(context.local.snapshot, context.local.snapshot, { checkCurrent: true })));
      }
      conflict = await this.wait(async () => (this.saveConflict(conflict, 'verifying', { ...resolution, status: 'verifying' })));
      const authoritative = await this.wait(async () => (this.serverSnapshot()));
      const remoteRecord = mapRecords(authoritative.records || []).get(conflict.recordKey) || null;
      if (!this.remoteMatchesAppliedIntent(remoteRecord, resolution)) throw new MultiAppSyncError('resolution_verify_failed');
      return this.verifyLocalResolution(conflict, resolution, authoritative);
    }

    async resolveRemoteConflict(conflict) {
      if (global.navigator?.onLine === false) throw new MultiAppSyncError('resolution_offline');
      const context = await this.wait(async () => (this.conflictContext(conflict)));
      let resolution = conflict.resolution?.choice === 'remote' ? clone(conflict.resolution) : {
        choice: 'remote', status: 'pending', startedAt: this.now()
      };
      if (resolution.expectedRemote) {
        if (!sameAnchor(context.remoteRecord, resolution.expectedRemote)) {
          throw Object.assign(new MultiAppSyncError('stale_resolution'), { resetResolution: true });
        }
        if (!sameAnchor(context.localRecord, resolution.local) && !this.recordsEqual(context.localRecord, context.remoteRecord)) {
          throw Object.assign(new MultiAppSyncError('local_changed_during_resolution'), { resetResolution: true });
        }
      } else {
        resolution = {
          ...resolution,
          expectedRemote: recordAnchor(context.remoteRecord),
          local: recordAnchor(context.localRecord)
        };
      }
      conflict = await this.wait(async () => (this.saveConflict(conflict, 'resolving_remote', resolution)));
      if (!this.recordsEqual(context.localRecord, context.remoteRecord)) {
        const records = context.local.snapshot.records.filter((record) => keyOf(record) !== conflict.recordKey);
        const remoteLocal = localRecordFromRemote(context.remoteRecord);
        if (remoteLocal) records.push(remoteLocal);
        let nextSnapshot = { ...clone(context.local.snapshot), records };
        if (typeof this.adapter.prepareRemoteResolutionSnapshot === 'function') {
          nextSnapshot = await this.wait(async () => (this.adapter.prepareRemoteResolutionSnapshot(nextSnapshot, {
            recordKey: conflict.recordKey,
            localRecord: context.localRecord,
            remoteRecord: context.remoteRecord,
            remoteRecords: context.remote.records || []
          })));
        }
        if (typeof this.adapter.reconcileOrderRecords === 'function') {
          // Choosing the cloud's list brings in the items only the cloud has (never synced here, so not a
          // deletion on this device); items this device added follow the cloud's order.
          const orderChoice = this.adapter.isOrderRecord?.(context.remoteRecord || context.localRecord) === true;
          const changes = orderChoice ? this.remoteOnlyChanges(context.local.records, context.remote.records || [],
            context.shadowRecords, new Set([conflict.recordKey])) : new Map();
          nextSnapshot = { ...nextSnapshot, records: this.reconcileOrderRecords(nextSnapshot.records
            .filter((record) => !changes.has(keyOf(record))).concat([...changes.values()].filter(Boolean)),
          context.remote.records || [], orderChoice ? 'remote' : 'snapshot') };
          resolution = { ...resolution, relatedKeys: [...changes.keys()] };
        }
        nextSnapshot = this.adapter.normalizeLocalSnapshot(nextSnapshot);
        const expectedRecords = await this.wait(async () => (this.adapter.serializeRecords(nextSnapshot)));
        const expectedRecord = mapRecords(expectedRecords).get(conflict.recordKey) || null;
        const expectedManifest = await this.wait(async () => (this.adapter.computeManifest(nextSnapshot)));
        await this.wait(async () => (this.applyWithBackup(nextSnapshot, context.local.snapshot, { checkCurrent: true, remoteChoiceKey: conflict.recordKey })));
        resolution = { ...resolution, expectedLocalRecord: recordAnchor(expectedRecord), expectedLocalManifest: expectedManifest };
      }
      if (!resolution.expectedLocalRecord || !resolution.expectedLocalManifest) {
        resolution = {
          ...resolution,
          expectedLocalRecord: recordAnchor(context.localRecord),
          expectedLocalManifest: await this.wait(async () => (this.adapter.computeManifest(context.local.snapshot)))
        };
      }
      conflict = await this.wait(async () => (this.saveConflict(conflict, 'verifying', { ...resolution, status: 'verifying' })));
      const local = await this.wait(async () => (this.localRecords()));
      const localRecord = mapRecords(local.records).get(conflict.recordKey) || null;
      const expectedLocalRecord = resolution.expectedLocalRecord || recordAnchor(context.remoteRecord);
      const localManifest = await this.wait(async () => (this.adapter.computeManifest(local.snapshot)));
      if (!sameAnchor(localRecord, expectedLocalRecord) ||
          (resolution.expectedLocalManifest && localManifest !== resolution.expectedLocalManifest)) {
        try { await this.wait(async () => (this.adapter.applyRemoteSnapshot(context.local.snapshot))); } catch (_) { /* keep the conflict */ }
        throw new MultiAppSyncError('resolution_verify_failed');
      }
      const authoritative = await this.wait(async () => (this.serverSnapshot()));
      const currentRemote = mapRecords(authoritative.records || []).get(conflict.recordKey) || null;
      if (!sameAnchor(currentRemote, resolution.expectedRemote)) {
        try { await this.wait(async () => (this.adapter.applyRemoteSnapshot(context.local.snapshot))); } catch (_) { /* keep the conflict */ }
        throw Object.assign(new MultiAppSyncError('stale_resolution'), { resetResolution: true });
      }
      if (context.remoteRecord?.recordType === 'melody_stage' &&
          isDeleted(context.remoteRecord) &&
          typeof this.adapter.prepareRemoteResolutionSnapshot === 'function') {
        const latestLocal = await this.wait(async () => (this.localRecords()));
        const refreshed = this.adapter.prepareRemoteResolutionSnapshot(latestLocal.snapshot, {
          recordKey: conflict.recordKey, remoteRecord: currentRemote,
          remoteRecords: authoritative.records || []
        });
        await this.wait(async () => (this.applyWithBackup(refreshed, latestLocal.snapshot, { checkCurrent: true })));
        return this.finishResolution(conflict, authoritative, ['stage_order/melody',
          ...latestLocal.records.filter((record) => record.recordType === 'progress' &&
            record.payload?.stageRef === currentRemote.recordId)
            .map((record) => keyOf(record))]);
      }
      return this.finishResolution(conflict, authoritative, resolution.relatedKeys || []);
    }

    async resolveMergedSettingsConflict(conflict, fieldChoices = {}) {
      const context = await this.wait(async () => (this.conflictContext(conflict)));
      const saved = conflict.resolution?.choice === 'merged' ? clone(conflict.resolution) : null;
      const stored = saved?.expectedRemote ? saved : null;
      const choices = saved?.fieldChoices || fieldChoices;
      const plan = this.settingsFieldPlan(context, choices);
      if (!plan || plan.unresolved) throw new MultiAppSyncError('settings_selection_incomplete');
      const desiredDeleted = !Object.keys(plan.values).length;
      const desiredRecord = desiredDeleted ? null : {
        recordType: 'settings', recordId: context.parts.recordId,
        schemaVersion: (context.localRecord || context.remoteRecord).schemaVersion,
        payload: { id: context.parts.recordId, values: plan.values }
      };
      const candidate = {
        ...clone(context.local.snapshot),
        records: context.local.snapshot.records.filter((item) => keyOf(item) !== conflict.recordKey)
          .concat(desiredRecord ? [desiredRecord] : [])
      };
      // An older client may be unable to materialize a future settings field.
      // In that case retain both sides and stop before any cloud mutation.
      try { this.adapter.validateSnapshot(candidate); }
      catch { throw new MultiAppSyncError('settings_field_unsupported'); }
      const serialized = await this.wait(async () => (this.adapter.serializeRecords(candidate)));
      const desired = mapRecords(serialized).get(conflict.recordKey) || null;
      if (!desiredDeleted && !desired) throw new MultiAppSyncError('settings_record_invalid');
      const operationId = stored?.operationId || saved?.operationId || this.randomOperationId();
      const source = desired || context.remoteRecord || context.localRecord || context.shadowRecord;
      if (!source) throw new MultiAppSyncError('settings_record_invalid');
      const operation = await this.wait(async () => (this.operationFor(source, context.remoteRecord?.revision || 0,
        desiredDeleted, operationId)));
      let resolution = stored ? { ...stored, desiredDeleted: stored.desiredDeleted === true } : {
        choice: 'merged', status: 'pending', fieldChoices: clone(choices),
        operationId, startedAt: saved?.startedAt || this.now(),
        expectedRemote: recordAnchor(context.remoteRecord),
        local: recordAnchor(context.localRecord), desiredHash: operation.payloadHash, desiredDeleted,
        remoteAlreadyAbsent: desiredDeleted && (!context.remoteRecord || isDeleted(context.remoteRecord))
      };
      if (resolution.desiredHash !== operation.payloadHash || resolution.desiredDeleted !== desiredDeleted ||
          (!sameAnchor(context.localRecord, resolution.local) && !this.recordsEqual(context.localRecord, desired))) {
        throw Object.assign(new MultiAppSyncError('local_changed_during_resolution'), { resetResolution: true });
      }
      const alreadyApplied = this.remoteMatchesAppliedIntent(context.remoteRecord, resolution);
      const alreadyAbsent = desiredDeleted && resolution.remoteAlreadyAbsent === true;
      if (!alreadyApplied && !sameAnchor(context.remoteRecord, resolution.expectedRemote)) {
        throw Object.assign(new MultiAppSyncError('stale_resolution'), { resetResolution: true });
      }
      conflict = await this.wait(async () => (this.saveConflict(conflict, 'resolving_merged', resolution)));
      if (!alreadyApplied && !alreadyAbsent) {
        if (!resolution.backupSaved) {
          await this.wait(async () => (this.backupSnapshot(context.local.snapshot)));
          resolution = { ...resolution, backupSaved: true };
          conflict = await this.wait(async () => (this.saveConflict(conflict, 'resolving_merged', resolution)));
        }
        const response = await this.wait(async () => (this.pushRequest( this.withSyncCapabilities({
          appId: this.appId, mode: 'sync', operations: [{
            operationId: operation.operationId, recordType: operation.recordType,
            recordId: operation.recordId, schemaVersion: operation.schemaVersion,
            baseRevision: operation.baseRevision, payload: operation.payload,
            payloadHash: operation.payloadHash, deleted: operation.deleted
          }]
        }))));
        const result = (response.results || []).find((item) => item.operationId === resolution.operationId);
        if (result?.status === 'conflict') {
          throw Object.assign(new MultiAppSyncError('stale_resolution'), { resetResolution: true });
        }
        if (!['applied', 'duplicate'].includes(result?.status)) {
          throw new MultiAppSyncError(result?.code || 'resolution_push_failed');
        }
      }
      const authoritative = await this.wait(async () => (this.serverSnapshot()));
      const remoteRecord = mapRecords(authoritative.records || []).get(conflict.recordKey) || null;
      if (alreadyAbsent ? !sameAnchor(remoteRecord, resolution.expectedRemote)
        : !this.remoteMatchesAppliedIntent(remoteRecord, resolution)) {
        throw new MultiAppSyncError('resolution_verify_failed');
      }
      conflict = await this.wait(async () => (this.saveConflict(conflict, 'verifying', { ...resolution, status: 'verifying' })));
      const current = await this.wait(async () => (this.localRecords()));
      const currentRecord = mapRecords(current.records).get(conflict.recordKey) || null;
      if (!this.recordsEqual(currentRecord, desired)) {
        if (!sameAnchor(currentRecord, resolution.local)) {
          throw Object.assign(new MultiAppSyncError('local_changed_during_resolution'), { resetResolution: true });
        }
        const next = {
          ...clone(current.snapshot),
          records: current.snapshot.records.filter((item) => keyOf(item) !== conflict.recordKey)
            .concat(desiredRecord ? [desiredRecord] : [])
        };
        await this.wait(async () => (this.applyWithBackup(next, current.snapshot, { checkCurrent: true })));
      }
      const verified = mapRecords((await this.wait(async () => (this.localRecords()))).records).get(conflict.recordKey) || null;
      if (!this.recordsEqual(verified, desired)) throw new MultiAppSyncError('resolution_verify_failed');
      return this.finishResolution(conflict, authoritative);
    }

    async performConflictResolution(conflictId, choice, options = {}) {
      if (this.appId === 'port' && choice !== 'later' && (await this.wait(() => this.store.listOutbox())).some(x => x.outcome === 'UNKNOWN')) return { ok:false, code:'push_outcome_unknown' };
      let conflict = await this.wait(async () => (this.store.getConflict?.(conflictId))) ||
        (await this.wait(async () => (this.store.listConflicts()))).find((item) => item.id === conflictId);
      if (!conflict) return Object.freeze({ ok: false, code: 'conflict_not_found' });
      if (choice === 'later') {
        await this.wait(async () => (this.saveConflict(conflict, 'attention', null)));
        return Object.freeze({ ok: true, deferred: true, remaining: (await this.wait(async () => (this.store.listConflicts()))).length });
      }
      if (conflict.kind === 'invalid_record') {
        if (!this.recoveryChoices(conflict).allowed.includes(choice)) {
          return Object.freeze({ ok: false, code: 'resolution_choice_invalid' });
        }
      }
      if (global.navigator?.onLine === false) {
        const resolution = conflict.resolution?.choice === choice ? conflict.resolution : {
          choice, status: 'pending', startedAt: this.now(),
          ...(['local', 'merged'].includes(choice) ? { operationId: this.randomOperationId() } : {}),
          ...(choice === 'merged' ? { fieldChoices: clone(options.fieldChoices || {}) } : {})
        };
        await this.wait(async () => (this.saveConflict(conflict, 'attention', { ...resolution, lastError: 'resolution_offline' })));
        return Object.freeze({ ok: false, code: 'resolution_offline' });
      }
      try {
        // A settings record with a field plan is resolved field by field (as the
        // conflict screen does). A whole-record "remote" (e.g. a choice saved by an
        // older screen) cannot be verified for adapters that keep a device theme or
        // fill defaults, so it is refused and the saved choice cleared.
        if (choice === 'remote' && conflict.recordType === 'settings' &&
            this.settingsFieldPlan(await this.wait(async () => (this.conflictContext(conflict))))) {
          throw Object.assign(new MultiAppSyncError('settings_field_choice_required'), { resetResolution: true });
        }
        return choice === 'merged'
          ? await this.wait(async () => (this.resolveMergedSettingsConflict(conflict, options.fieldChoices || {})))
          : choice === 'local' ? await this.wait(async () => (this.resolveLocalConflict(conflict)))
            : await this.wait(async () => (this.resolveRemoteConflict(conflict)));
      } catch (error) {
        conflict = await this.wait(async () => (this.store.getConflict?.(conflictId))) || conflict;
        return this.failResolution(conflict, error, { reset: error?.resetResolution === true });
      }
    }

    resolveConflict(conflictId, choice, options = {}) {
      if (!['local', 'remote', 'later', 'merged'].includes(choice)) {
        return Promise.resolve(Object.freeze({ ok: false, code: 'resolution_choice_invalid' }));
      }
      if (this.resolutionRunning) return this.resolutionRunning;
      let work;
      work = this.performConflictResolution(conflictId, choice, options).finally(() => {
        if (this.resolutionRunning === work) this.resolutionRunning = null;
      });
      this.resolutionRunning = work;
      return work;
    }

    async resumeConflictResolutions() {
      const pending = (await this.wait(async () => (this.store.listConflicts()))).filter((item) =>
        ['local', 'remote', 'merged'].includes(item.resolution?.choice) && item.resolution?.lastError !== 'operation_too_large');
      let resumed = 0;
      for (const conflict of pending.slice(0, 1)) {
        const result = await this.wait(async () => (this.resolveConflict(conflict.id, conflict.resolution.choice)));
        if (result.ok) resumed += 1;
        else return Object.freeze({ ok: false, code: result.code, resumed, pending: pending.length });
      }
      return Object.freeze({ ok: true, resumed, pending: (await this.wait(async () => (this.store.listConflicts()))).length });
    }

    async reconcileConvergedPortConflicts(conflicts) {
      if (this.appId !== 'port' || !conflicts.length) return conflicts;
      const [local, remote] = await this.wait(async () => (Promise.all([this.localRecords(), this.serverSnapshot()])));
      const localMap = mapRecords(local.records);
      const remoteMap = mapRecords(remote.records || []);
      const remaining = [];
      for (const conflict of conflicts) {
        const localRecord = localMap.get(conflict.recordKey) || null;
        const remoteRecord = remoteMap.get(conflict.recordKey) || null;
        if (!this.recordsEqual(localRecord, remoteRecord)) {
          remaining.push(conflict);
          continue;
        }
        // A Port conflict can outlive the divergence that created it after a
        // response-loss/reload cycle. Only clear it once both authoritative
        // values already agree; real local/Remote differences still fail closed.
        await this.wait(async () => (this.clearConflictOutbox(conflict.recordKey)));
        if (remoteRecord) await this.wait(async () => (this.store.putShadow(conflict.recordKey, clone(remoteRecord))));
        else await this.wait(async () => (this.store.deleteShadow?.(conflict.recordKey)));
        await this.wait(async () => (this.store.deleteConflict(conflict.id)));
      }
      return remaining;
    }

    async queueDiff(localRecords, remoteRecords, shadowRecords, { migration = false, isolatedKeys = new Set() } = {}) {
      const local = mapRecords(localRecords);
      const remote = mapRecords(remoteRecords);
      const shadow = mapRecords(shadowRecords);
      const pending = await this.wait(async () => (this.store.listOutbox()));
      const pendingByKey = new Map(pending.map((item) => [`${keyOf(item)}:${item.deleted === true}`, item]));
      for (const recordKey of new Set([...local.keys(), ...shadow.keys()])) {
        if (isolatedKeys.has(recordKey)) continue;
        const current = local.get(recordKey);
        const previous = shadow.get(recordKey);
        if (this.recordsEqual(current, previous)) continue;
        const deleted = !current;
        // Migration absence is not a deletion unless the adapter can prove an
        // explicit user intent for this exact record. Port records use a durable
        // deletion journal; other adapters retain the conservative behavior.
        if (migration && deleted && this.adapter.canDeleteDuringMigration?.(recordKey, previous) !== true) continue;
        if (!migration && !previous && deleted) continue;
        if (deleted && previous && this.adapter.canDeleteRecord?.(recordKey, previous) === false) {
          await this.wait(async () => (this.recordConflict('ambiguous_delete', recordKey, {
            reason: 'local_deletion_unconfirmed', localRecord: null,
            remoteRecord: remote.get(recordKey) || null, shadowRecord: previous
          })));
          continue;
        }
        const source = current || previous;
        const pendingKey = `${recordKey}:${deleted}`;
        const operation = await this.wait(async () => (this.operationFor(source, remote.get(recordKey)?.revision || previous?.revision || 0, deleted)));
        const pendingOperation = pendingByKey.get(pendingKey);
        if (pendingOperation) {
          const mutationUnchanged = pendingOperation.payloadHash === operation.payloadHash &&
            Number(pendingOperation.baseRevision || 0) === Number(operation.baseRevision || 0) &&
            Number(pendingOperation.schemaVersion || 0) === Number(operation.schemaVersion || 0);
          // Terminal failures remain fail-closed until the underlying mutation
          // actually changes. A corrected payload safely supersedes only that
          // exact stale operation; ordinary pending/conflict work is untouched.
          if (!pendingOperation.terminalError || mutationUnchanged || authorityBlocked(pendingOperation.terminalError)) continue;
          await this.wait(async () => (this.store.deleteOutbox(pendingOperation.operationId)));
        }
        await this.wait(async () => (this.store.putOutbox({ ...operation, migration })));
      }
    }

    async scheduleRetryWake() {
      if (this.retryTimer != null) this.clearTimer(this.retryTimer);
      this.retryTimer = null;
      if (this.disposed || global.navigator?.onLine === false || (this.hostLifecycle && global.document?.visibilityState === 'hidden') || typeof global.setTimeout !== 'function') return;
      const pending = await this.wait(async () => (this.store.listOutbox()));
      const outboxDue = pending.filter((item) => !item.conflict &&
        item.outcome !== 'UNKNOWN' && (!item.terminalError || (item.terminalError === 'push_failed' && item.failureKind === 'network')) &&
        Number.isFinite(item.nextRetryAt) && item.nextRetryAt > 0)
        .reduce((earliest, item) => Math.min(earliest, item.nextRetryAt), Infinity);
      const due = Math.min(outboxDue, this.networkRetryAt || Infinity);
      if (!Number.isFinite(due)) return;
      this.retryTimer = this.setTimer(() => {
        this.retryTimer = null;
        if (global.navigator?.onLine === false) return;
        this.sync('retry-timer').catch(() => {});
      }, Math.max(0, due - this.now()));
      this.retryTimer?.unref?.();
    }

    async retryLegacyFailures() {
      const local = mapRecords((await this.wait(async () => (this.localRecords()))).records);
      let recovered = 0;
      for (const item of await this.wait(async () => (this.store.listOutbox()))) {
        const proRejected = this.appId === 'port' && /^pro_(required|reauth_required|revalidation_required)$/.test(item.terminalError || '');
        if (item.outcome === 'UNKNOWN' || !proRejected && (item.terminalError !== 'push_failed' || item.failureKind || item.legacyRecoveryAttempted)) continue;
        const recordKey = keyOf(item);
        const current = local.get(recordKey) || null;
        const stillRequested = item.deleted
          ? !current && this.adapter.canDeleteRecord?.(recordKey, item) !== false
          : !!current && current.payloadHash === item.payloadHash &&
            current.schemaVersion === item.schemaVersion &&
            canonicalJson(current.payload) === canonicalJson(item.payload);
        if (!stillRequested) continue;
        await this.wait(async () => (this.store.putOutbox({ ...item, terminalError: undefined, nextRetryAt: 0,
          legacyRecoveryAttempted: true })));
        recovered += 1;
      }
      if (recovered) await this.wait(async () => (this.sync('legacy-retry')));
      return Object.freeze({ ok: recovered > 0, recovered });
    }

    // The cloud record this device itself just produced is the new common ancestor of local and
    // cloud for that record. Advancing the shadow to it (only when the server confirms our exact
    // payload) keeps a later edit on this device from looking like "both changed". A real change
    // from another device still differs from this shadow and still becomes a conflict.
    async acknowledgeOwnRecord(operation, record) {
      if (!record || isDeleted(record) || operation.deleted ||
          keyOf(record) !== keyOf(operation) || record.payloadHash !== operation.payloadHash) return false;
      await this.wait(async () => (this.store.putShadow(keyOf(operation), clone(record))));
      return true;
    }

    // After a lost push response the outbox still holds an operation the server already applied.
    // If the cloud record carries that same operation id and payload, it is our own echo: complete
    // the operation and advance the shadow instead of treating the cloud as changed elsewhere.
    async acknowledgeOwnEchoes(remoteRecords) {
      const remote = mapRecords(remoteRecords);
      let acknowledged = 0;
      for (const item of await this.wait(async () => (this.store.listOutbox()))) {
        if (item.outcome === 'UNKNOWN' || item.deleted || item.conflict || authorityBlocked(item.terminalError)) continue;
        const record = remote.get(keyOf(item));
        if (!record || !item.operationId || record.operationId !== item.operationId) continue;
        if (await this.wait(async () => (this.acknowledgeOwnRecord(item, record)))) {
          await this.wait(async () => (this.store.deleteOutbox(item.operationId)));
          acknowledged += 1;
        }
      }
      return acknowledged;
    }

    async flushOutbox({ migration = false, force = false } = {}) {
      const now = this.now();
      const initial = await this.wait(async () => (this.store.listOutbox()));
      const oversizedInvalidMigration = initial.filter((item) => item.migration === true &&
        !item.conflict && item.terminalError === 'invalid_request');
      const recoverableIds = new Set(migration && oversizedInvalidMigration.length > MAX_PUSH_OPERATIONS
        ? oversizedInvalidMigration.map((item) => item.operationId) : []);
      let sent = 0;
      let conflicts = 0;
      let oversized = initial.some(item => item.migration === migration && item.terminalError === 'operation_too_large');
      while (true) {
        for (const item of await this.wait(async () => (this.store.listOutbox()))) {
          if (!item.deleted || item.conflict ||
              this.adapter.canDeleteRecord?.(keyOf(item), item) !== false) continue;
          await this.wait(async () => (this.recordConflict('ambiguous_delete', keyOf(item), {
            reason: 'local_deletion_unconfirmed', localRecord: null,
            remoteRecord: null, shadowRecord: await this.wait(async () => (this.store.getShadow?.(keyOf(item)))) || null
          })));
          await this.wait(async () => (this.store.putOutbox({ ...item, conflict: true })));
        }
        {
          for (const item of await this.wait(() => this.store.listOutbox())) {
            if (canonicalJson(item.writerAuthority || null) !== canonicalJson(this.writerWireContext?.fields || null) ||
                canonicalJson(item.authorityContext || null) !== canonicalJson(this.writerWireContext?.context || null))
              await this.wait(() => this.store.putOutbox({ ...item, terminalError: 'legacy_outbox_needs_migration', authorityStatus: 'blocked-authority', nextRetryAt: 0 }));
          }
        }
        const candidates = (await this.wait(async () => (this.store.listOutbox()))).filter((item) =>
          item.migration === migration && !item.conflict && item.outcome !== 'UNKNOWN' && !authorityBlocked(item.terminalError) &&
          (!item.terminalError || recoverableIds.has(item.operationId) ||
            (item.terminalError === 'push_failed' && item.failureKind === 'network')) &&
          (force || !item.nextRetryAt || item.nextRetryAt <= now)
        ).filter((item) => !item.deleted || this.adapter.canDeleteRecord?.(keyOf(item), item) !== false)
          ;
        const operations = [];
        const bodyFor = items => this.withSyncCapabilities({ appId: this.appId,
          mode: migration ? 'migration' : 'sync',
          operations: items.map(({operationId, recordType, recordId, schemaVersion, baseRevision, payload, payloadHash, deleted}) =>
            ({operationId, recordType, recordId, schemaVersion, baseRevision, payload, payloadHash, deleted})) });
        for (const item of candidates) {
          if (new TextEncoder().encode(JSON.stringify(bodyFor([item]))).byteLength > 256 * 1024) {
            oversized = true;
            await this.wait(() => this.store.putOutbox({ ...item, terminalError: 'operation_too_large', nextRetryAt: 0 }));
            continue;
          }
          if (operations.length === MAX_PUSH_OPERATIONS ||
              new TextEncoder().encode(JSON.stringify(bodyFor([...operations, item]))).byteLength > 256 * 1024) break;
          operations.push(item);
        }
        if (!operations.length) {
          if (oversized) throw new MultiAppSyncError('operation_too_large');
          return { ok: conflicts === 0, sent, conflict: conflicts };
        }
        operations.forEach((item) => recoverableIds.delete(item.operationId));
        let payload;
        try {
          payload = await this.wait(async () => (this.pushRequest( this.withSyncCapabilities({
            appId: this.appId,
            mode: migration ? 'migration' : 'sync',
            operations: operations.map(({ operationId, recordType, recordId, schemaVersion, baseRevision, payload, payloadHash, deleted }) =>
              ({ operationId, recordType, recordId, schemaVersion, baseRevision, payload, payloadHash, deleted }))
          }))));
        } catch (error) {
          if (this.appId === 'port') throw error;
          for (const operation of operations) {
            const attempts = Number(operation.attempts || 0) + 1;
            const retryable = error instanceof MultiAppSyncError && !authorityBlocked(error.code) &&
              (error.code === 'network_error' || RETRYABLE_STATUS.has(error.status) || PAUSE_CODES.has(error.code));
            await this.wait(async () => (this.store.putOutbox({
              ...operation, attempts,
              nextRetryAt: retryable ? now + Math.min(300000, 1000 * (2 ** Math.min(attempts, 8))) : 0,
              ...(retryable ? { terminalError: undefined, failureKind: error.code === 'network_error' ? 'network' : undefined }
                : { terminalError: error.code || 'push_failed', ...(authorityBlocked(error.code) ? {
                  authorityStatus: error.code === 'dataset_epoch_stale' ? 'stale-epoch' : /(?:required|outdated|unsupported)$/.test(error.code) ? 'needs-upgrade' : 'blocked-authority' } : {}) })
            })));
          }
          if (error instanceof MultiAppSyncError && !authorityBlocked(error.code) &&
              (error.code === 'network_error' || RETRYABLE_STATUS.has(error.status) || PAUSE_CODES.has(error.code))) {
            await this.wait(async () => (this.scheduleRetryWake()));
          }
          throw error;
        }
        sent += operations.length;
        for (const result of payload.results || []) {
          const operation = operations.find((item) => item.operationId === result.operationId);
          if (!operation) throw new MultiAppSyncError('invalid_response');
          if (['applied', 'duplicate'].includes(result.status)) {
            await this.wait(async () => (this.store.deleteOutbox(operation.operationId)));
            if (operation.deleted) await this.wait(async () => (this.adapter.acknowledgeDelete?.(keyOf(operation), operation.deleteIntentGeneration)));
            else await this.wait(async () => (this.acknowledgeOwnRecord(operation, result.record)));
          }
          else if (result.status === 'conflict') {
            conflicts += 1;
            const recordKey = keyOf(operation);
            const localRecord = operation.deleted ? null : {
              recordType: operation.recordType, recordId: operation.recordId,
              schemaVersion: operation.schemaVersion, payload: clone(operation.payload), payloadHash: operation.payloadHash
            };
            await this.wait(async () => (this.recordConflict('push', recordKey, {
              localRecord,
              remoteRecord: result.record || null,
              shadowRecord: await this.wait(async () => (this.store.getShadow?.(recordKey)))
            })));
            await this.wait(async () => (this.store.putOutbox({ ...operation, outcome: undefined, conflict: true })));
          } else await this.wait(async () => (this.store.putOutbox({ ...operation, outcome: undefined, terminalError: result.code || 'invalid' })));
        }
        if (conflicts) {
          this.setState('attention', { reason: 'conflict' });
          return { ok: false, sent, conflict: conflicts };
        }
      }
    }

    async replaceShadow(records, cursor = null) {
      for (const record of records) await this.wait(async () => (this.store.putShadow(keyOf(record), clone(record))));
      await this.wait(async () => (this.store.setMeta('shadowKeys', records.map(keyOf))));
      if (cursor) await this.wait(async () => (this.store.setMeta('cursor', cursor)));
    }

    // Migration completion compares manifests byte for byte, while the push
    // decision skips records the adapter calls semantically equal. When a final
    // record only means the same as the cloud record (e.g. defaults written out
    // locally but missing in the cloud), attest to the cloud's own record: no
    // write, and the manifests match. Adapters without semantic equality are
    // never touched.
    // Order records (stage / preset lists) must name every live item of their kind exactly once. The
    // adapter owns that rule; the runtime asks it to reconcile any snapshot it assembles from more than
    // one source before the snapshot is applied or sent. Adapters without order records are untouched.
    reconcileOrderRecords(records, remoteRecords = [], prefer = 'snapshot') {
      if (typeof this.adapter.reconcileOrderRecords !== 'function') return records;
      return this.adapter.reconcileOrderRecords({ appId: this.appId, records }, { remoteRecords, prefer }).records;
    }

    // Records only the cloud changed since the last sync (this device left them as synced): additions,
    // edits and deletions, as the pull would take them. Map of record key → cloud record or null (deleted).
    remoteOnlyChanges(localRecords, remoteRecords, shadowRecords, except = new Set()) {
      const localMap = mapRecords(localRecords);
      const remoteMap = mapRecords(remoteRecords);
      const shadowMap = mapRecords(shadowRecords);
      const changes = new Map();
      for (const recordKey of new Set([...remoteMap.keys(), ...shadowMap.keys()])) {
        if (except.has(recordKey)) continue;
        const remoteRecord = remoteMap.get(recordKey);
        const shadowRecord = shadowMap.get(recordKey);
        if (!this.recordsEqual(localMap.get(recordKey), shadowRecord) || this.recordsEqual(remoteRecord, shadowRecord)) continue;
        changes.set(recordKey, remoteRecord && !isDeleted(remoteRecord) ? localRecordFromRemote(remoteRecord) : null);
      }
      return changes;
    }

    async rememberSyncedRemote(recordKeys, remoteRecords) {
      const remoteMap = mapRecords(remoteRecords);
      for (const recordKey of recordKeys) {
        const remoteRecord = remoteMap.get(recordKey);
        if (remoteRecord) await this.wait(async () => (this.store.putShadow(recordKey, clone(remoteRecord))));
        else await this.wait(async () => (this.store.deleteShadow?.(recordKey)));
      }
    }

    // Keeping this device's list must still name every item the cloud holds and only items the cloud will
    // hold: take the cloud-only changes, reconcile this device's order, and send this device's new items
    // first, so the order pushed next never points at nothing and never leaves a cloud item out.
    async prepareLocalOrderResolution(conflict, context) {
      const remoteRecords = context.remote.records || [];
      const changes = this.remoteOnlyChanges(context.local.records, remoteRecords, context.shadowRecords,
        new Set([conflict.recordKey]));
      const records = this.reconcileOrderRecords(context.local.snapshot.records.filter((record) =>
        !changes.has(keyOf(record))).concat([...changes.values()].filter(Boolean)), remoteRecords, 'snapshot');
      const next = this.adapter.deserializeRecords(records);
      if (canonicalJson(this.adapter.normalizeLocalSnapshot(next)) !==
          canonicalJson(this.adapter.normalizeLocalSnapshot(context.local.snapshot))) {
        await this.wait(async () => (this.applyWithBackup(next, context.local.snapshot, { checkCurrent: true })));
      }
      await this.wait(async () => (this.rememberSyncedRemote(changes.keys(), remoteRecords)));
      const local = await this.wait(async () => (this.localRecords()));
      const cloudKeys = new Set(remoteRecords.filter((record) => !isDeleted(record)).map(keyOf));
      const shadowKeys = new Set(context.shadowRecords.map(keyOf));
      const newItems = local.records.filter((record) => keyOf(record) !== conflict.recordKey &&
        !cloudKeys.has(keyOf(record)) && !shadowKeys.has(keyOf(record)));
      if (newItems.length) {
        const operations = [];
        for (const record of newItems) operations.push(await this.wait(async () => (this.operationFor(record, 0))));
        const response = await this.wait(async () => (this.pushRequest( this.withSyncCapabilities({
          appId: this.appId, mode: 'sync',
          operations: operations.map(({ operationId, recordType, recordId, schemaVersion, baseRevision, payload, payloadHash, deleted }) =>
            ({ operationId, recordType, recordId, schemaVersion, baseRevision, payload, payloadHash, deleted }))
        }))));
        for (const operation of operations) {
          const result = (response.results || []).find((item) => item.operationId === operation.operationId);
          if (!['applied', 'duplicate'].includes(result?.status)) {
            throw Object.assign(new MultiAppSyncError('stale_resolution'), { resetResolution: true });
          }
          await this.wait(async () => (this.acknowledgeOwnRecord(operation, result.record)));
          await this.wait(async () => (this.clearConflictOutbox(keyOf(operation))));
        }
      }
      return this.conflictContext(conflict);
    }

    async adoptSemanticallyEqualRemote(snapshot, remoteLive) {
      if (typeof this.adapter.sameRecordForSync !== 'function') return snapshot;
      const remoteMap = mapRecords(remoteLive);
      const records = await this.wait(async () => (this.adapter.serializeRecords(snapshot)));
      let adopted = 0;
      const next = records.map((record) => {
        const remoteRecord = remoteMap.get(keyOf(record));
        if (!remoteRecord || sameRecord(record, remoteRecord) || !this.recordsEqual(record, remoteRecord)) return record;
        adopted += 1;
        return localRecordFromRemote(remoteRecord);
      });
      return adopted ? this.adapter.deserializeRecords(next) : snapshot;
    }

    async initializeDataset() {
      if (this.appId === 'port' && (await this.wait(() => this.store.listOutbox())).some(x => x.outcome === 'UNKNOWN')) return { ok:false, code:'push_outcome_unknown' };
      const membership = await this.wait(async () => (this.membership()));
      this.adapter.assertDataPlaneContext({
        membership: membership || { appId: this.appId, state: 'active' },
        appCredential: { appId: this.appId, credential: await this.wait(async () => (this.credential())) }
      });
      this.setState('initializing');
      const local = await this.wait(async () => (this.localRecords()));
      await this.wait(async () => (this.bootstrap(local)));
      const rawRemote = await this.wait(async () => (this.serverSnapshot()));
      const partitioned = this.partitionRemote(rawRemote);
      const remote = partitioned.remote;
      await this.wait(async () => (this.recordRecoveryIssues(local, rawRemote, partitioned.issues, local.issues)));
      const hydrationIsolatedKeys = new Set([...(local.isolatedKeys || []), ...(partitioned.isolatedKeys || [])]);
      const writeIsolatedKeys = new Set([...(local.writeIsolatedKeys || []),
        ...(partitioned.writeIsolatedKeys || [])]);
      const remoteLive = (remote.records || []).filter((record) =>
        !isDeleted(record) && !hydrationIsolatedKeys.has(keyOf(record)));
      const remoteSnapshot = this.adapter.deserializeRecords(remoteLive);
      const [shadowRecords, unresolvedConflicts] = await this.wait(async () => (Promise.all([
        this.store.listShadow(), this.store.listConflicts()
      ])));
      let finalSnapshot = local.snapshot;
      const resumesOwnPartialMigration = this.appId === 'port' && remote.datasetState === 'initializing' && remoteLive.length > 0 &&
        remoteLive.every((record) => record.ownedByCurrentDevice === true);
      const resumesResolvedConflictMerge = unresolvedConflicts.length === 0 && shadowRecords.length > 0 &&
        sameRecordAnchors(shadowRecords, remote.records || []);
      if (resumesOwnPartialMigration) {
        // Resume only from an authenticated baseline: either every partial record
        // belongs to this device, or the saved shadow exactly matches the current
        // remote snapshot after the last initial-merge conflict was resolved.
        finalSnapshot = local.snapshot;
        // An own record missing locally without a deletion intent is not a
        // deletion: hydrate it, as every other join path does. Records with an
        // intent stay out and are tombstoned by queueDiff.
        const present = new Set(local.records.map(keyOf));
        const hydrate = remoteLive.filter((record) => !present.has(keyOf(record)) &&
          this.adapter.canDeleteDuringMigration?.(keyOf(record), record) !== true);
        if (hydrate.length) {
          finalSnapshot = this.adapter.deserializeRecords([...local.records, ...hydrate]);
          await this.wait(async () => (this.applyWithBackup(finalSnapshot, local.snapshot, { checkCurrent: true })));
        }
      } else if (resumesResolvedConflictMerge) {
        // The matching saved shadow proves that earlier conflict choices were
        // completed. Hydrate only records still absent locally; never infer a
        // delete from those absences or re-run the original conflict merge.
        const present = new Set(local.records.map(keyOf));
        finalSnapshot = await this.wait(async () => (this.adoptSemanticallyEqualRemote(this.adapter.deserializeRecords(
          this.reconcileOrderRecords([
            ...local.records, ...remoteLive.filter((record) => !present.has(keyOf(record)))
          ], remoteLive)), remoteLive)));
        await this.wait(async () => (this.applyWithBackup(finalSnapshot, local.snapshot, { checkCurrent: true })));
      } else if (!local.records.length && remoteLive.length) {
        finalSnapshot = remoteSnapshot;
        await this.wait(async () => (this.applyWithBackup(finalSnapshot, local.snapshot, { checkCurrent: true })));
      } else if (local.records.length && remoteLive.length) {
        const merged = this.adapter.mergeSnapshots(local.snapshot, remoteSnapshot);
        let mergedSnapshot = merged.snapshot;
        let unresolved = merged.conflicts;
        if (typeof root.mergeSettingsFields === 'function' && this.appId !== 'port') {
          const localSettings = local.records.find((record) => record.recordType === 'settings' && record.recordId === 'settings');
          const remoteSettings = remoteLive.find((record) => record.recordType === 'settings' && record.recordId === 'settings');
          if (localSettings && remoteSettings) {
            const settingsPlan = this.settingsFieldPlan({ localRecord: localSettings, remoteRecord: remoteSettings,
              shadowRecord: null });
            if (settingsPlan && settingsPlan.unresolved === 0) {
              const combined = { ...clone(localSettings), payload: { ...clone(localSettings.payload), values: settingsPlan.values } };
              mergedSnapshot = { ...mergedSnapshot, records: mergedSnapshot.records.filter((record) =>
                !(record.recordType === 'settings' && record.recordId === 'settings')).concat(combined) };
              unresolved = unresolved.filter((item) => item.recordKey !== 'settings/settings');
            }
          }
        }
        if (unresolved.length) {
          const localMap = mapRecords(local.records);
          const remoteMap = mapRecords(remote.records || []);
          for (const item of unresolved) await this.wait(async () => (this.recordConflict('initial_merge', item.recordKey, {
            reason: item.reason,
            localRecord: localMap.get(item.recordKey) || null,
            remoteRecord: remoteMap.get(item.recordKey) || null,
            shadowRecord: null
          })));
          this.setState('attention', { reason: 'conflict' });
          await this.wait(async () => (this.reportRemovalSafety('attention')));
          return Object.freeze({ ok: false, code: 'merge_conflict', conflicts: unresolved.length });
        }
        if (typeof this.adapter.reconcileOrderRecords === 'function') {
          mergedSnapshot = { ...mergedSnapshot, records: this.reconcileOrderRecords(mergedSnapshot.records, remoteLive) };
        }
        finalSnapshot = await this.wait(async () => (this.adoptSemanticallyEqualRemote(mergedSnapshot, remoteLive)));
        this.adapter.validateSnapshot(finalSnapshot);
        await this.wait(async () => (this.applyWithBackup(finalSnapshot, local.snapshot, { checkCurrent: true })));
      }
      const finalRecords = await this.wait(async () => (this.adapter.serializeRecords(finalSnapshot)));
      await this.wait(async () => (this.queueDiff(finalRecords, remote.records || [], remote.records || [], {
        migration: true, isolatedKeys: writeIsolatedKeys
      })));
      await this.wait(async () => (this.flushOutbox({ migration: true, force: true })));
      const finalManifest = await this.wait(async () => (this.adapter.computeManifest(finalSnapshot)));
      const completionSnapshot = partitioned.issues.length || local.issues?.length ? await this.wait(async () => (this.serverSnapshot())) : null;
      const completionManifest = completionSnapshot?.manifestHash || finalManifest;
      const completionRecordCount = completionSnapshot?.recordCount ?? finalRecords.length;
      const completed = await this.wait(async () => (this.request('POST', '/v1/sync/migration/complete', this.withSyncCapabilities({
        appId: this.appId, schemaVersion: finalSnapshot.schemaVersion,
        recordCount: completionRecordCount, manifestHash: completionManifest
      }))));
      if (completed.datasetState !== 'ready' || completed.manifestHash !== completionManifest) {
        throw new MultiAppSyncError('manifest_mismatch');
      }
      const authoritativeRaw = await this.wait(async () => (this.serverSnapshot()));
      const authoritative = this.partitionRemote(authoritativeRaw).remote;
      await this.wait(async () => (this.replaceShadow(authoritative.records || [], authoritative.cursor)));
      await this.wait(async () => (this.store.setMeta('migrationState', 'complete')));
      await this.wait(async () => (this.store.setMeta('datasetState', 'ready')));
      await this.wait(async () => (this.store.setMeta('lastSyncAt', this.now())));
      const remaining = await this.wait(async () => (this.store.listConflicts()));
      this.setState(remaining.length ? 'attention' : 'ready', remaining.length
        ? { reason: 'data_repair', conflicts: remaining.length } : {});
      this.bindLifecycle();
      await this.wait(async () => (this.reportRemovalSafety(remaining.length ? 'attention' : 'clean')));
      return Object.freeze({ ok: true, recordCount: authoritative.recordCount, manifestHash: authoritative.manifestHash });
    }

    sync(reason = 'manual') {
      if (this.disposed) return Promise.reject(new MultiAppSyncError('runtime_disposed'));
      this.assertActive();
      this.syncRequestGeneration += 1;
      if (!this.pendingSyncReason || reason === 'save') this.pendingSyncReason = reason;
      if (this.running) return this.running;
      return this.startScheduledSync();
    }

    startScheduledSync() {
      this.assertActive();
      const generation = this.syncRequestGeneration;
      const reason = this.pendingSyncReason || 'pending';
      this.pendingSyncReason = null;
      let scheduled;
      scheduled = Promise.resolve().then(() => this.performSync(reason)).then(
        (result) => {
          this.assertActive();
          const hasPendingRequest = this.syncRequestGeneration > generation;
          if (this.running === scheduled) this.running = null;
          if (result?.ok === true && hasPendingRequest) return this.startScheduledSync();
          // An online event can arrive while an in-flight sync is still
          // returning its earlier offline result. Preserve that wake-up and
          // immediately run the coalesced save once connectivity is usable.
          if (result?.code === 'offline' && hasPendingRequest && global.navigator?.onLine !== false) {
            return this.startScheduledSync();
          }
          return result;
        },
        (error) => {
          if (this.disposed) throw error;
          if (this.running === scheduled) this.running = null;
          if (retryableError(error)) {
            this.networkRetryAttempts += 1;
            this.networkRetryAt = this.now() + Math.min(300000, 1000 * (2 ** Math.min(this.networkRetryAttempts, 8)));
            this.setState('retrying', { reason: error.code });
            void this.scheduleRetryWake().catch(() => {});
          }
          else if (!TERMINAL_CODES.has(error?.code) && !PAUSE_CODES.has(error?.code)) {
            this.setState('attention', { reason: safeErrorCode(error) });
          }
          throw error;
        }
      );
      this.running = scheduled;
      return scheduled;
    }

    async reconcileUnknown() {
      if (this.appId !== 'port') throw new MultiAppSyncError('app_invalid');
      await this.wait(() => this.assertCurrentAsync());
      const snapshot = await this.wait(() => this.serverSnapshot());
      const remote = mapRecords(snapshot.records || []), pending = (await this.wait(() => this.store.listOutbox())).filter(x => x.outcome === 'UNKNOWN');
      const history = new Map(); let pages = 0, resolved = 0, historical = 0;
      // Existing change history is a bounded readback of the old operation,
      // even when another device has advanced the current head.
      for (const start of new Set(pending.filter(item => remote.get(keyOf(item))?.operationId !== item.operationId).map(item => item.readbackCursor || ''))) {
        let cursor = start;
        for (; pages < 10; pages++) {
          const capabilities = this.syncCapabilities(); let page;
          try { page = await this.wait(() => this.request('GET', `/v1/sync/changes?appId=port${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}${capabilities.length ? `&capabilities=${encodeURIComponent(capabilities.join(','))}` : ''}`)); }
          catch (error) { if (error.code === 'cursor_expired' || error.code === 'dataset_not_ready') break; throw error; }
          for (const change of page.changes || []) history.set(change.operationId, change);
          if (!page.hasMore || !page.nextCursor || page.nextCursor === cursor) { pages++; break; }
          cursor = page.nextCursor;
        }
      }
      for (const item of pending) {
        const head = remote.get(keyOf(item)), record = head?.operationId === item.operationId ? head : history.get(item.operationId);
        if (!record || keyOf(record) !== keyOf(item) || record.operationId !== item.operationId || Boolean(isDeleted(record)) !== Boolean(item.deleted) || record.payloadHash !== item.payloadHash) continue;
        if (item.deleted) await this.wait(() => this.adapter.acknowledgeDelete?.(keyOf(item), item.deleteIntentGeneration));
        else await this.wait(() => this.acknowledgeOwnRecord(item, record));
        await this.wait(() => this.store.deleteOutbox(item.operationId)); resolved++; if (record !== head) historical++;
      }
      const remaining = (await this.wait(() => this.store.listOutbox())).filter(x => x.outcome === 'UNKNOWN').length;
      this.setState('attention', { reason: remaining ? 'push_outcome_unknown' : 'reconciled' });
      return Object.freeze({ ok: remaining === 0, resolved, historical, unknown: remaining });
    }

    async performSync(reason) {
      if (this.appId === 'port' && (await this.wait(() => this.store.listOutbox())).some(x => x.outcome === 'UNKNOWN')) {
        this.setState('attention', { reason: 'push_outcome_unknown' });
        return { ok: false, code: 'push_outcome_unknown' };
      }
      if (this.authorityFailure) throw new MultiAppSyncError(this.authorityFailure);
      if (await this.wait(async () => (this.store.readMeta('migrationState'))) !== 'complete') return { ok: false, code: 'migration_required' };
      if (global.navigator?.onLine === false) {
        this.setState('offline');
        return { ok: false, code: 'offline' };
      }
      let unresolved = await this.wait(async () => (this.store.listConflicts()));
      if (unresolved.length) unresolved = await this.wait(async () => (this.reconcileConvergedPortConflicts(unresolved)));
      const isolatedKinds = new Set(['ambiguous_delete', 'invalid_record']);
      const isolatedKeys = new Set(unresolved.filter((item) => isolatedKinds.has(item.kind)).map((item) => item.recordKey));
      if (unresolved.some((item) => !isolatedKinds.has(item.kind))) {
        this.setState('attention', { reason: 'conflict', conflicts: unresolved.length });
        await this.wait(async () => (this.reportRemovalSafety('attention')));
        return { ok: false, code: 'conflict_pending', conflicts: unresolved.length };
      }
      this.setState('syncing', { reason });
      const rawRemote = await this.wait(async () => (this.serverSnapshot()));
      await this.wait(async () => (this.acknowledgeOwnEchoes(this.partitionRemote(rawRemote).remote.records || [])));
      let shadowRecords = await this.wait(async () => (this.store.listShadow()));
      let local = await this.wait(async () => (this.localRecords()));
      const partitioned = this.partitionRemote(rawRemote);
      const remote = partitioned.remote;
      await this.wait(async () => (this.recordRecoveryIssues(local, rawRemote, partitioned.issues, local.issues)));
      for (const key of [...(local.writeIsolatedKeys || local.isolatedKeys || []),
        ...(partitioned.writeIsolatedKeys || partitioned.isolatedKeys || [])]) isolatedKeys.add(key);
      let localMap = mapRecords(local.records);
      const remoteMap = mapRecords(remote.records || []);
      const shadowMap = mapRecords(shadowRecords);
      const conflictKeys = [];
      const automaticSettings = [];
      const automaticOrders = [];
      for (const recordKey of new Set([...localMap.keys(), ...remoteMap.keys(), ...shadowMap.keys()])) {
        if (isolatedKeys.has(recordKey)) continue;
        const localRecord = localMap.get(recordKey);
        const remoteRecord = remoteMap.get(recordKey);
        const shadowRecord = shadowMap.get(recordKey);
        if (!this.recordsEqual(localRecord, shadowRecord) && !this.recordsEqual(remoteRecord, shadowRecord) &&
            !this.recordsEqual(localRecord, remoteRecord)) {
          const plan = this.settingsFieldPlan({ localRecord, remoteRecord, shadowRecord });
          if (plan && !plan.unresolved) {
            automaticSettings.push({ recordKey, record: Object.keys(plan.values).length ? {
              recordType: 'settings', recordId: (localRecord || remoteRecord).recordId,
              schemaVersion: (localRecord || remoteRecord).schemaVersion,
              payload: { id: (localRecord || remoteRecord).recordId, values: plan.values }
            } : null });
            continue;
          }
          // Two devices that changed one list (e.g. each added an item) merge it three-way by the
          // adapter's own order rule; only contradicting reorders become a choice for the user.
          const order = this.adapter.mergeOrderRecord?.(localRecord, remoteRecord, shadowRecord,
            { localRecords: local.records, remoteRecords: remote.records || [] });
          if (order) {
            automaticOrders.push({ recordKey, record: order });
            continue;
          }
          conflictKeys.push(recordKey);
        }
      }
      if (conflictKeys.length) {
        for (const recordKey of conflictKeys) await this.wait(async () => (this.recordConflict('pull', recordKey, {
          localRecord: localMap.get(recordKey) || null,
          remoteRecord: remoteMap.get(recordKey) || null,
          shadowRecord: shadowMap.get(recordKey) || null
        })));
        this.setState('attention', { reason: 'conflict' });
        await this.wait(async () => (this.reportRemovalSafety('attention')));
        return { ok: false, code: 'conflict', conflicts: conflictKeys.length };
      }
      if (automaticSettings.length || automaticOrders.length) {
        const automatic = [...automaticSettings, ...automaticOrders];
        const replacements = new Map(automatic.map(({ recordKey, record }) => [recordKey, record]));
        // A merged order may list items only the cloud has: take the cloud's changes that this device did
        // not touch now (as the pull would), and remember them as synced so they are not pushed back.
        const pulled = [];
        if (automaticOrders.length) {
          const changes = this.remoteOnlyChanges(local.records, remote.records || [], shadowRecords,
            new Set([...isolatedKeys, ...replacements.keys()]));
          for (const [recordKey, record] of changes) { replacements.set(recordKey, record); pulled.push(recordKey); }
        }
        let records = local.snapshot.records.filter((record) =>
          !replacements.has(keyOf(record))).concat([...replacements.values()].filter(Boolean));
        if (automaticOrders.length) records = this.reconcileOrderRecords(records, remote.records || []);
        const next = { ...clone(local.snapshot), records };
        try { this.adapter.validateSnapshot(next); }
        catch {
          for (const { recordKey } of automatic) await this.wait(async () => (this.recordConflict('pull', recordKey, {
            reason: automaticSettings.some((item) => item.recordKey === recordKey) ? 'settings_field_unsupported' : 'ordering_conflict',
            localRecord: localMap.get(recordKey), remoteRecord: remoteMap.get(recordKey), shadowRecord: shadowMap.get(recordKey)
          })));
          this.setState('attention', { reason: 'conflict', conflicts: automatic.length });
          await this.wait(async () => (this.reportRemovalSafety('attention')));
          return { ok: false, code: 'conflict', conflicts: automatic.length };
        }
        await this.wait(async () => (this.applyWithBackup(next, local.snapshot, { checkCurrent: true })));
        await this.wait(async () => (this.rememberSyncedRemote(pulled, remote.records || [])));
        if (pulled.length) shadowRecords = await this.wait(async () => (this.store.listShadow()));
        local = await this.wait(async () => (this.localRecords()));
        localMap = mapRecords(local.records);
      }
      await this.wait(async () => (this.queueDiff(local.records, remote.records || [], shadowRecords, { isolatedKeys })));
      for (const conflict of await this.wait(async () => (this.store.listConflicts()))) {
        if (isolatedKinds.has(conflict.kind)) isolatedKeys.add(conflict.recordKey);
      }
      await this.wait(async () => (this.flushOutbox()));
      // Records this device just pushed now have their confirmed cloud version as the shadow.
      const shadowAfterPush = mapRecords(await this.wait(async () => (this.store.listShadow())));
      const rawAfterPush = await this.wait(async () => (this.serverSnapshot()));
      const afterPartition = this.partitionRemote(rawAfterPush);
      const afterPush = afterPartition.remote;
      const localAfterPush = await this.wait(async () => (this.localRecords()));
      const afterMap = mapRecords(afterPush.records || []);
      const freshMap = mapRecords(localAfterPush.records);
      const pending = await this.wait(async () => (this.store.listOutbox()));
      const pendingKeys = new Set(pending.map(keyOf));
      const merged = new Map(localAfterPush.records.map((record) => [keyOf(record), record]));
      const lateConflicts = [];
      let remoteChanged = false;
      for (const recordKey of new Set([...freshMap.keys(), ...afterMap.keys(), ...shadowAfterPush.keys()])) {
        if (isolatedKeys.has(recordKey)) continue;
        const current = freshMap.get(recordKey);
        const incoming = afterMap.get(recordKey);
        const previous = shadowAfterPush.get(recordKey);
        if (this.recordsEqual(current, incoming)) continue;
        if (pendingKeys.has(recordKey) && this.recordsEqual(incoming, previous)) continue;
        if (!pendingKeys.has(recordKey) && this.recordsEqual(current, previous)) {
          if (incoming && !isDeleted(incoming)) merged.set(recordKey, localRecordFromRemote(incoming));
          else merged.delete(recordKey);
          remoteChanged = true;
        } else if (!this.recordsEqual(incoming, previous)) {
          lateConflicts.push(recordKey);
        }
      }
      if (lateConflicts.length) {
        for (const recordKey of lateConflicts) await this.wait(async () => (this.recordConflict('pull', recordKey, {
          localRecord: freshMap.get(recordKey) || null,
          remoteRecord: afterMap.get(recordKey) || null,
          shadowRecord: shadowAfterPush.get(recordKey) || null
        })));
        this.setState('attention', { reason: 'conflict', conflicts: lateConflicts.length });
        await this.wait(async () => (this.reportRemovalSafety('attention')));
        return { ok: false, code: 'conflict', conflicts: lateConflicts.length };
      }
      if (remoteChanged) {
        // A pulled order may lag its items (another device mid-push, or an older client): reconcile first.
        const next = this.adapter.deserializeRecords(this.reconcileOrderRecords([...merged.values()], afterPush.records || []));
        await this.wait(async () => (this.applyWithBackup(next, localAfterPush.snapshot, { checkCurrent: true })));
      }
      await this.wait(async () => (this.replaceShadow(afterPush.records || [], afterPush.cursor)));
      await this.wait(async () => (this.store.setMeta('lastSyncAt', this.now())));
      this.networkRetryAt = 0;
      this.networkRetryAttempts = 0;
      const [outbox, conflicts] = await this.wait(async () => (Promise.all([this.store.listOutbox(), this.store.listConflicts()])));
      const state = conflicts.length || outbox.some((item) => item.terminalError || item.conflict)
        ? 'attention' : outbox.length ? 'pending' : 'ready';
      this.setState(state, { reason, recordCount: localAfterPush.records.length });
      await this.wait(async () => (this.reportRemovalSafety(state === 'ready' ? 'clean' : state === 'attention' ? 'attention' : 'pending')));
      await this.wait(async () => (this.scheduleRetryWake()));
      return { ok: true, recordCount: afterPush.recordCount, manifestHash: afterPush.manifestHash };
    }

    notifyLocalSave() {
      if (this.disposed) return;
      void this.reportRemovalSafety('pending').catch(() => {});
      queueMicrotask(() => { if (this.disposed) return; this.sync('save').catch((error) => {
        if (this.disposed) return;
        // An expired/replaced host qualification cannot publish state through
        // this retired runtime, including from its error callback.
        try { this.assertActive(); } catch (_) { return; }
        void this.reportRemovalSafety('error').catch(() => {});
        this.setState(error instanceof MultiAppSyncError && PAUSE_CODES.has(error.code) ? 'paused' :
          authorityBlocked(error.code) ? 'blocked' : retryableError(error) ? 'retrying' : 'attention');
      }); });
    }

    bindLifecycle() {
      if (this.disposed || this.hostLifecycle || this.lifecycleBound || !global.addEventListener) return;
      this.lifecycleBound = true;
      this.scheduleRetryWake().catch(() => {});
      this.listen(global, 'focus', () => this.sync('focus').catch(() => {}));
      this.listen(global, 'online', () => this.resumeConflictResolutions()
        .then(() => this.sync('online')).catch(() => {}));
      this.listen(global.document, 'visibilitychange', () => {
        if (global.document.visibilityState === 'visible') this.sync('resume').catch(() => {});
      });
    }
  }

  // All externally callable mutable entries (including direct test/owner
  // helpers) share the same scope. Pure readers and scheduling entry points do
  // not acquire it. Lock order: activation -> execution -> dataset; never reverse.
  for (const name of ['prepareWriterAuthority', 'detachTerminalIdentity', 'detachCurrentEnvironment', 'resumeCurrentEnvironmentDetach',
    'consumeHandoff', 'consumeInvitation', 'reportRemovalSafety', 'recordRecoveryIssues', 'applyWithBackup',
    'backupSnapshot', 'bootstrap', 'recordConflict', 'saveConflict', 'failResolution', 'clearConflictOutbox',
    'finishResolution', 'completeDeletedStageRevival', 'resolveInvalidRecordDeleteConflict', 'resolveLocalConflict',
    'resolveRemoteConflict', 'resolveMergedSettingsConflict', 'performConflictResolution',
    'reconcileUnknown', 'reconcileConvergedPortConflicts', 'queueDiff', 'retryLegacyFailures', 'acknowledgeOwnRecord',
    'acknowledgeOwnEchoes', 'flushOutbox', 'replaceShadow', 'rememberSyncedRemote', 'prepareLocalOrderResolution',
    'adoptSemanticallyEqualRemote', 'initializeDataset', 'performSync', 'pushRequest']) {
    const implementation = MultiAppSyncRuntime.prototype[name];
    MultiAppSyncRuntime.prototype[name] = function (...args) {
      return this.runExclusive(current => implementation.apply(current, args));
    };
  }
  root.withSyncExecution = withSyncExecution;
  root.MultiAppSyncError = MultiAppSyncError;
  root.MultiAppSyncRuntime = MultiAppSyncRuntime;
  root.notifyLocalSave = (appId) => {
    const runtime = root.runtimes?.[appId];
    if (runtime) runtime.notifyLocalSave();
  };
})(globalThis);
