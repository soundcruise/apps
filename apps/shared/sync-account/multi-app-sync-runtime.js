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
  const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
  const MAX_PUSH_OPERATIONS = 50;
  function retryableError(error) {
    return error instanceof MultiAppSyncError &&
      (error.code === 'network_error' || RETRYABLE_STATUS.has(error.status));
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
      this.admissionMode = options.admissionMode || this.accountClient.admissionMode || 'qa';
      if (!['qa', 'production'].includes(this.admissionMode)) throw new Error('multi_app_runtime_admission_invalid');
      this.fetchImpl = options.fetchImpl || global.fetch.bind(global);
      this.now = options.now || Date.now;
      this.randomOperationId = options.randomOperationId || (() => this.accountCore.createOperationId());
      this.running = null;
      this.resolutionRunning = null;
      this.syncRequestGeneration = 0;
      this.pendingSyncReason = null;
      this.lifecycleBound = false;
      this.retryTimer = null;
    }

    setState(state, detail = {}) {
      this.store.setMeta('runtimeState', state).catch(() => {});
      this.dispatchEvent(new CustomEvent('statechange', { detail: Object.freeze({ state, ...detail }) }));
    }

    async credential() { return this.store.readMeta('credential'); }
    async qaCredential() { return this.store.readMeta('qaCredential'); }
    async membership() { return this.store.readMeta('membership'); }

    async detachTerminalIdentity(code) {
      if (!TERMINAL_CODES.has(code)) return false;
      if (typeof this.store.clearCloudState !== 'function') throw new MultiAppSyncError('sync_detach_unavailable');
      await this.store.clearCloudState();
      this.setState('credential_invalid', { reason: code, terminal: true });
      return true;
    }

    async detachCurrentEnvironment() {
      const credential = await this.credential();
      if (!this.accountCore.validAppCredential(credential)) {
        throw new MultiAppSyncError('app_auth_required', 401);
      }
      const pending = await this.store.readMeta('pendingCurrentEnvironmentDetach');
      const operationId = typeof pending?.operationId === 'string'
        ? pending.operationId : this.randomOperationId();
      if (!pending) await this.store.setMeta('pendingCurrentEnvironmentDetach', { operationId });
      this.setState('disconnecting');
      const result = await this.accountClient.detachCurrentAppEnvironment({
        appCredential: credential, operationId
      });
      // Server success is the only condition that clears the local binding.
      // clearCloudState deliberately leaves the app's ordinary local data alone.
      await this.store.clearCloudState();
      this.setState('credential_invalid', { reason: 'current_environment_detached', terminal: true });
      return Object.freeze(result);
    }

    async resumeCurrentEnvironmentDetach() {
      const pending = await this.store.readMeta('pendingCurrentEnvironmentDetach');
      if (!pending?.operationId) return Object.freeze({ status: 'none' });
      const result = await this.detachCurrentEnvironment();
      return Object.freeze({ status: 'committed', result });
    }

    async request(method, path, body) {
      const credential = await this.credential();
      const qaCredential = await this.qaCredential();
      if (!this.accountCore.validAppCredential(credential)) throw new MultiAppSyncError('app_auth_required', 401);
      if (this.admissionMode === 'qa' && !this.accountCore.validQaCredential(qaCredential)) {
        throw new MultiAppSyncError('qa_admission_required', 403);
      }
      const headers = new Headers({ Accept: 'application/json', Authorization: `Bearer ${credential}` });
      if (this.admissionMode === 'qa') {
        headers.set('X-Sound-Cruise-QA-Authorization', `Bearer ${qaCredential}`);
      }
      if (body) headers.set('Content-Type', 'application/json');
      let response;
      try {
        response = await this.fetchImpl(`${this.endpoint}${path}`, {
          method, headers, body: body ? JSON.stringify(body) : undefined,
          credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer'
        });
      } catch (_) {
        throw new MultiAppSyncError('network_error');
      }
      let payload = null;
      try { payload = await response.json(); } catch (error) {
        if (['AbortError', 'TypeError'].includes(error?.name)) throw new MultiAppSyncError('network_error');
      }
      if (!response.ok || payload?.ok !== true) {
        const code = payload?.code || 'invalid_response';
        if (await this.detachTerminalIdentity(code)) throw new MultiAppSyncError(code, response.status);
        if (PAUSE_CODES.has(code)) this.setState('paused', { reason: code });
        throw new MultiAppSyncError(code, response.status);
      }
      return payload;
    }

    async consumeHandoff(handoffToken, deviceLabel = null) {
      if (this.accountCore.validAppCredential(await this.credential())) {
        throw new MultiAppSyncError('active_identity_present');
      }
      this.setState('connecting');
      const result = await this.accountClient.consumeHandoff({
        handoffToken, appId: this.appId, deviceLabel, consumeMode: 'new_app',
        preservePending: true
      });
      if (result.consumeMode !== 'new_app' || !this.accountCore.validAppCredential(result.appDeviceCredential)) {
        throw new MultiAppSyncError('handoff_consume_invalid');
      }
      await this.store.setMeta('credential', result.appDeviceCredential);
      await this.store.setMeta('qaCredential', result.qaCredential || null);
      await this.store.setMeta('membership', {
        id: result.membershipId, appId: this.appId, state: result.membershipState || 'active'
      });
      if (typeof this.accountClient.confirmConsumePersisted === 'function') {
        await this.accountClient.confirmConsumePersisted();
      }
      return this.initializeDataset();
    }

    async consumeInvitation(joinCode, deviceLabel = null) {
      if (this.accountCore.validAppCredential(await this.credential())) {
        throw new MultiAppSyncError('active_identity_present');
      }
      this.setState('connecting');
      const result = await this.accountClient.consumeJoinInvitation({
        joinCode, appId: this.appId, deviceLabel, consumeMode: 'new_app', preservePending: true
      });
      if (result.consumeMode !== 'new_app' || !this.accountCore.validAppCredential(result.appDeviceCredential)) {
        throw new MultiAppSyncError('app_join_consume_invalid');
      }
      await this.store.setMeta('credential', result.appDeviceCredential);
      await this.store.setMeta('qaCredential', result.qaCredential || null);
      await this.store.setMeta('membership', {
        id: result.membershipId, appId: this.appId, state: result.membershipState || 'active'
      });
      await this.accountClient.confirmConsumePersisted?.();
      return this.initializeDataset();
    }

    async serverSnapshot() {
      return this.request('GET', `/v1/sync/snapshot?appId=${encodeURIComponent(this.appId)}`);
    }

    async reportRemovalSafety(state) {
      // Reporting is advisory presentation for Cruise Port. It must never turn
      // a successful local sync into a failure when the summary endpoint is
      // temporarily unavailable.
      if (this.appId === 'port') return;
      try { await this.request('POST', '/v1/sync/removal-safety', { appId: this.appId, state }); } catch (_) { /* fail closed in Port */ }
    }

    async localRecords() {
      const snapshot = this.adapter.normalizeLocalSnapshot(this.adapter.readLocalSnapshot());
      return { snapshot, records: await this.adapter.serializeRecords(snapshot) };
    }

    async applyWithBackup(nextSnapshot, previousSnapshot, { checkCurrent = false } = {}) {
      await this.backupSnapshot(previousSnapshot);
      if (checkCurrent && canonicalJson((await this.localRecords()).snapshot) !== canonicalJson(previousSnapshot)) {
        throw new MultiAppSyncError('local_changed_during_apply');
      }
      try {
        await this.adapter.applyRemoteSnapshot(nextSnapshot, checkCurrent ? { expectedSnapshot: previousSnapshot } : undefined);
      } catch (error) {
        if (error?.code === 'local_changed_during_apply') throw error;
        try { await this.adapter.applyRemoteSnapshot(previousSnapshot); } catch (_) { /* preserve original failure */ }
        throw error;
      }
    }

    async backupSnapshot(snapshot) {
      const backup = global.SoundCruiseSyncAccount?.appBackupStorage;
      if (!backup?.save) throw new MultiAppSyncError('app_backup_unavailable');
      await backup.save({
        version: 1, appId: this.appId, createdAt: this.now(), values: clone(snapshot)
      });
    }

    async bootstrap(local) {
      return this.request('POST', '/v1/sync/bootstrap', {
        appId: this.appId,
        schemaVersion: local.snapshot.schemaVersion,
        recordCount: local.records.length,
        manifestHash: await this.adapter.computeManifest(local.snapshot)
      });
    }

    async operationFor(record, baseRevision, deleted = false, operationId = this.randomOperationId()) {
      const payloadHash = deleted ? await sha256(canonicalJson({
        appId: this.appId,
        payload: null,
        recordId: record.recordId,
        recordType: record.recordType,
        schemaVersion: record.schemaVersion
      })) : record.payloadHash;
      return Object.freeze({
        operationId,
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

    async recordConflict(kind, recordKey, details = {}) {
      const parts = splitRecordKey(recordKey);
      if (!parts) throw new MultiAppSyncError('conflict_record_invalid');
      const existing = (await this.store.listConflicts()).find((item) => item.recordKey === recordKey);
      const conflict = {
        ...(existing || {}),
        id: existing?.id || this.randomOperationId(),
        kind, recordKey, recordType: parts.recordType, recordId: parts.recordId,
        reason: details.reason || existing?.reason || null,
        createdAt: existing?.createdAt || this.now(), updatedAt: this.now(),
        state: existing?.state || 'attention',
        anchors: {
          local: recordAnchor(details.localRecord),
          remote: recordAnchor(details.remoteRecord),
          shadow: recordAnchor(details.shadowRecord)
        }
      };
      await this.store.putConflict(conflict);
      return conflict;
    }

    async conflictContext(conflict) {
      const parts = splitRecordKey(conflict?.recordKey);
      if (!parts) throw new MultiAppSyncError('conflict_record_invalid');
      const [local, remote, shadowRecords] = await Promise.all([
        this.localRecords(), this.serverSnapshot(), this.store.listShadow()
      ]);
      const localRecord = mapRecords(local.records).get(conflict.recordKey) || null;
      const remoteRecord = mapRecords(remote.records || []).get(conflict.recordKey) || null;
      const shadowRecord = mapRecords(shadowRecords).get(conflict.recordKey) || null;
      return { parts, local, remote, shadowRecords, localRecord, remoteRecord, shadowRecord };
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
      const conflicts = await this.store.listConflicts();
      if (!conflicts.length) return Object.freeze([]);
      const [local, remote, shadowRecords] = await Promise.all([
        this.localRecords(), this.serverSnapshot(), this.store.listShadow()
      ]);
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
        return Object.freeze({
          id: conflict.id,
          state: conflict.state || 'attention',
          selection: ['local', 'remote'].includes(conflict.resolution?.choice)
            ? conflict.resolution.choice : null,
          presentation: this.sanitizeConflictPresentation(described, context)
        });
      });
      return Object.freeze(items);
    }

    async saveConflict(conflict, state, resolution) {
      const next = { ...conflict, state, resolution: resolution ? clone(resolution) : null, updatedAt: this.now() };
      await this.store.putConflict(next);
      this.setState(state.startsWith('resolving_') || state === 'verifying' ? state : 'attention', {
        reason: 'conflict'
      });
      return next;
    }

    async failResolution(conflict, error, { reset = false } = {}) {
      const code = safeErrorCode(error);
      const resolution = reset ? null : conflict.resolution ? { ...conflict.resolution, status: 'pending', lastError: code } : null;
      await this.saveConflict(conflict, 'attention', resolution);
      return Object.freeze({ ok: false, code });
    }

    async clearConflictOutbox(recordKey) {
      for (const operation of await this.store.listOutbox()) {
        if (keyOf(operation) === recordKey) await this.store.deleteOutbox(operation.operationId);
      }
    }

    async finishResolution(conflict, authoritative) {
      await this.clearConflictOutbox(conflict.recordKey);
      const remaining = (await this.store.listConflicts()).filter((item) => item.id !== conflict.id);
      if (!remaining.length) {
        await this.replaceShadow(authoritative.records || [], authoritative.cursor);
      } else {
        const resolved = mapRecords(authoritative.records || []).get(conflict.recordKey) || null;
        if (resolved) await this.store.putShadow(conflict.recordKey, clone(resolved));
        else await this.store.deleteShadow?.(conflict.recordKey);
        if (authoritative.cursor) await this.store.setMeta('cursor', authoritative.cursor);
      }
      await this.store.deleteConflict(conflict.id);
      if (!remaining.length) {
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
      const local = await this.localRecords();
      const localRecord = mapRecords(local.records).get(conflict.recordKey) || null;
      if ((!localRecord) !== resolution.desiredDeleted ||
          (!resolution.desiredDeleted && localRecord?.payloadHash !== resolution.desiredHash)) {
        throw Object.assign(new MultiAppSyncError('local_changed_during_resolution'), { resetResolution: true });
      }
      if ((await this.store.listConflicts()).length === 1 &&
          await this.adapter.computeManifest(local.snapshot) !== authoritative.manifestHash) {
        throw new MultiAppSyncError('resolution_manifest_mismatch');
      }
      return this.finishResolution(conflict, authoritative);
    }

    async resolveLocalConflict(conflict) {
      if (global.navigator?.onLine === false) throw new MultiAppSyncError('resolution_offline');
      let context = await this.conflictContext(conflict);
      let resolution = conflict.resolution?.choice === 'local' ? clone(conflict.resolution) : {
        choice: 'local', status: 'pending', operationId: this.randomOperationId(), startedAt: this.now()
      };
      if (resolution.expectedRemote) {
        if (this.remoteMatchesAppliedIntent(context.remoteRecord, resolution)) {
          conflict = await this.saveConflict(conflict, 'verifying', resolution);
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
        const generated = await this.operationFor(
          source, context.remoteRecord?.revision || 0, !context.localRecord, resolution.operationId
        );
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
      conflict = await this.saveConflict(conflict, 'resolving_local', resolution);
      if (!resolution.backupSaved) {
        await this.backupSnapshot(context.local.snapshot);
        resolution = { ...resolution, backupSaved: true };
        conflict = await this.saveConflict(conflict, 'resolving_local', resolution);
      }
      const source = context.localRecord || context.remoteRecord || context.shadowRecord;
      const operation = await this.operationFor(
        source, resolution.expectedRemote.revision, resolution.desiredDeleted, resolution.operationId
      );
      const response = await this.request('POST', '/v1/sync/push', {
        appId: this.appId, mode: 'sync',
        operations: [{
          operationId: operation.operationId, recordType: operation.recordType, recordId: operation.recordId,
          schemaVersion: operation.schemaVersion, baseRevision: operation.baseRevision,
          payload: operation.payload, payloadHash: operation.payloadHash, deleted: operation.deleted
        }]
      });
      const result = (response.results || []).find((item) => item.operationId === resolution.operationId);
      if (result?.status === 'conflict') {
        throw Object.assign(new MultiAppSyncError('stale_resolution'), { resetResolution: true });
      }
      if (!['applied', 'duplicate'].includes(result?.status)) throw new MultiAppSyncError(result?.code || 'resolution_push_failed');
      conflict = await this.saveConflict(conflict, 'verifying', { ...resolution, status: 'verifying' });
      const authoritative = await this.serverSnapshot();
      const remoteRecord = mapRecords(authoritative.records || []).get(conflict.recordKey) || null;
      if (!this.remoteMatchesAppliedIntent(remoteRecord, resolution)) throw new MultiAppSyncError('resolution_verify_failed');
      return this.verifyLocalResolution(conflict, resolution, authoritative);
    }

    async resolveRemoteConflict(conflict) {
      if (global.navigator?.onLine === false) throw new MultiAppSyncError('resolution_offline');
      const context = await this.conflictContext(conflict);
      let resolution = conflict.resolution?.choice === 'remote' ? clone(conflict.resolution) : {
        choice: 'remote', status: 'pending', startedAt: this.now()
      };
      if (resolution.expectedRemote) {
        if (!sameAnchor(context.remoteRecord, resolution.expectedRemote)) {
          throw Object.assign(new MultiAppSyncError('stale_resolution'), { resetResolution: true });
        }
        if (!sameAnchor(context.localRecord, resolution.local) && !sameRecord(context.localRecord, context.remoteRecord)) {
          throw Object.assign(new MultiAppSyncError('local_changed_during_resolution'), { resetResolution: true });
        }
      } else {
        resolution = {
          ...resolution,
          expectedRemote: recordAnchor(context.remoteRecord),
          local: recordAnchor(context.localRecord)
        };
      }
      conflict = await this.saveConflict(conflict, 'resolving_remote', resolution);
      if (!sameRecord(context.localRecord, context.remoteRecord)) {
        const records = context.local.snapshot.records.filter((record) => keyOf(record) !== conflict.recordKey);
        const remoteLocal = localRecordFromRemote(context.remoteRecord);
        if (remoteLocal) records.push(remoteLocal);
        let nextSnapshot = { ...clone(context.local.snapshot), records };
        if (typeof this.adapter.prepareRemoteResolutionSnapshot === 'function') {
          nextSnapshot = await this.adapter.prepareRemoteResolutionSnapshot(nextSnapshot, {
            recordKey: conflict.recordKey,
            localRecord: context.localRecord,
            remoteRecord: context.remoteRecord
          });
        }
        nextSnapshot = this.adapter.normalizeLocalSnapshot(nextSnapshot);
        const expectedRecords = await this.adapter.serializeRecords(nextSnapshot);
        const expectedRecord = mapRecords(expectedRecords).get(conflict.recordKey) || null;
        const expectedManifest = await this.adapter.computeManifest(nextSnapshot);
        await this.applyWithBackup(nextSnapshot, context.local.snapshot);
        resolution = { ...resolution, expectedLocalRecord: recordAnchor(expectedRecord), expectedLocalManifest: expectedManifest };
      }
      if (!resolution.expectedLocalRecord || !resolution.expectedLocalManifest) {
        resolution = {
          ...resolution,
          expectedLocalRecord: recordAnchor(context.localRecord),
          expectedLocalManifest: await this.adapter.computeManifest(context.local.snapshot)
        };
      }
      conflict = await this.saveConflict(conflict, 'verifying', { ...resolution, status: 'verifying' });
      const local = await this.localRecords();
      const localRecord = mapRecords(local.records).get(conflict.recordKey) || null;
      const expectedLocalRecord = resolution.expectedLocalRecord || recordAnchor(context.remoteRecord);
      const localManifest = await this.adapter.computeManifest(local.snapshot);
      if (!sameAnchor(localRecord, expectedLocalRecord) ||
          (resolution.expectedLocalManifest && localManifest !== resolution.expectedLocalManifest)) {
        try { await this.adapter.applyRemoteSnapshot(context.local.snapshot); } catch (_) { /* keep the conflict */ }
        throw new MultiAppSyncError('resolution_verify_failed');
      }
      const authoritative = await this.serverSnapshot();
      const currentRemote = mapRecords(authoritative.records || []).get(conflict.recordKey) || null;
      if (!sameAnchor(currentRemote, resolution.expectedRemote)) {
        try { await this.adapter.applyRemoteSnapshot(context.local.snapshot); } catch (_) { /* keep the conflict */ }
        throw Object.assign(new MultiAppSyncError('stale_resolution'), { resetResolution: true });
      }
      return this.finishResolution(conflict, authoritative);
    }

    async performConflictResolution(conflictId, choice) {
      let conflict = await this.store.getConflict?.(conflictId) ||
        (await this.store.listConflicts()).find((item) => item.id === conflictId);
      if (!conflict) return Object.freeze({ ok: false, code: 'conflict_not_found' });
      if (choice === 'later') {
        await this.saveConflict(conflict, 'attention', null);
        return Object.freeze({ ok: true, deferred: true, remaining: (await this.store.listConflicts()).length });
      }
      if (global.navigator?.onLine === false) {
        const resolution = conflict.resolution?.choice === choice ? conflict.resolution : {
          choice, status: 'pending', startedAt: this.now(),
          ...(choice === 'local' ? { operationId: this.randomOperationId() } : {})
        };
        await this.saveConflict(conflict, 'attention', { ...resolution, lastError: 'resolution_offline' });
        return Object.freeze({ ok: false, code: 'resolution_offline' });
      }
      try {
        return choice === 'local'
          ? await this.resolveLocalConflict(conflict)
          : await this.resolveRemoteConflict(conflict);
      } catch (error) {
        conflict = await this.store.getConflict?.(conflictId) || conflict;
        return this.failResolution(conflict, error, { reset: error?.resetResolution === true });
      }
    }

    resolveConflict(conflictId, choice) {
      if (!['local', 'remote', 'later'].includes(choice)) {
        return Promise.resolve(Object.freeze({ ok: false, code: 'resolution_choice_invalid' }));
      }
      if (this.resolutionRunning) return this.resolutionRunning;
      let work;
      work = this.performConflictResolution(conflictId, choice).finally(() => {
        if (this.resolutionRunning === work) this.resolutionRunning = null;
      });
      this.resolutionRunning = work;
      return work;
    }

    async resumeConflictResolutions() {
      const pending = (await this.store.listConflicts()).filter((item) =>
        ['local', 'remote'].includes(item.resolution?.choice));
      let resumed = 0;
      for (const conflict of pending.slice(0, 1)) {
        const result = await this.resolveConflict(conflict.id, conflict.resolution.choice);
        if (result.ok) resumed += 1;
        else return Object.freeze({ ok: false, code: result.code, resumed, pending: pending.length });
      }
      return Object.freeze({ ok: true, resumed, pending: (await this.store.listConflicts()).length });
    }

    async reconcileConvergedPortConflicts(conflicts) {
      if (this.appId !== 'port' || !conflicts.length) return conflicts;
      const [local, remote] = await Promise.all([this.localRecords(), this.serverSnapshot()]);
      const localMap = mapRecords(local.records);
      const remoteMap = mapRecords(remote.records || []);
      const remaining = [];
      for (const conflict of conflicts) {
        const localRecord = localMap.get(conflict.recordKey) || null;
        const remoteRecord = remoteMap.get(conflict.recordKey) || null;
        if (!sameRecord(localRecord, remoteRecord)) {
          remaining.push(conflict);
          continue;
        }
        // A Port conflict can outlive the divergence that created it after a
        // response-loss/reload cycle. Only clear it once both authoritative
        // values already agree; real local/Remote differences still fail closed.
        await this.clearConflictOutbox(conflict.recordKey);
        if (remoteRecord) await this.store.putShadow(conflict.recordKey, clone(remoteRecord));
        else await this.store.deleteShadow?.(conflict.recordKey);
        await this.store.deleteConflict(conflict.id);
      }
      return remaining;
    }

    async queueDiff(localRecords, remoteRecords, shadowRecords, { migration = false } = {}) {
      const local = mapRecords(localRecords);
      const remote = mapRecords(remoteRecords);
      const shadow = mapRecords(shadowRecords);
      const pending = await this.store.listOutbox();
      const pendingByKey = new Map(pending.map((item) => [`${keyOf(item)}:${item.deleted === true}`, item]));
      for (const recordKey of new Set([...local.keys(), ...shadow.keys()])) {
        const current = local.get(recordKey);
        const previous = shadow.get(recordKey);
        if (sameRecord(current, previous)) continue;
        const deleted = !current;
        if (!migration && !previous && deleted) continue;
        if (deleted && previous && this.adapter.canDeleteRecord?.(recordKey, previous) === false) {
          throw new MultiAppSyncError('local_deletion_unconfirmed');
        }
        const source = current || previous;
        const pendingKey = `${recordKey}:${deleted}`;
        const operation = await this.operationFor(source, remote.get(recordKey)?.revision || previous?.revision || 0, deleted);
        const pendingOperation = pendingByKey.get(pendingKey);
        if (pendingOperation) {
          const mutationUnchanged = pendingOperation.payloadHash === operation.payloadHash &&
            Number(pendingOperation.baseRevision || 0) === Number(operation.baseRevision || 0) &&
            Number(pendingOperation.schemaVersion || 0) === Number(operation.schemaVersion || 0);
          // Terminal failures remain fail-closed until the underlying mutation
          // actually changes. A corrected payload safely supersedes only that
          // exact stale operation; ordinary pending/conflict work is untouched.
          if (!pendingOperation.terminalError || mutationUnchanged) continue;
          await this.store.deleteOutbox(pendingOperation.operationId);
        }
        await this.store.putOutbox({ ...operation, migration });
      }
    }

    async scheduleRetryWake() {
      if (this.retryTimer != null) global.clearTimeout?.(this.retryTimer);
      this.retryTimer = null;
      if (typeof global.setTimeout !== 'function') return;
      const pending = await this.store.listOutbox();
      const due = pending.filter((item) => !item.conflict &&
        (!item.terminalError || (item.terminalError === 'push_failed' && item.failureKind === 'network')) &&
        Number.isFinite(item.nextRetryAt) && item.nextRetryAt > 0)
        .reduce((earliest, item) => Math.min(earliest, item.nextRetryAt), Infinity);
      if (!Number.isFinite(due)) return;
      this.retryTimer = global.setTimeout(() => {
        this.retryTimer = null;
        if (global.navigator?.onLine === false) return;
        this.sync('retry-timer').catch(() => {});
      }, Math.max(0, due - this.now()));
      this.retryTimer?.unref?.();
    }

    async flushOutbox({ migration = false, force = false } = {}) {
      const now = this.now();
      const initial = await this.store.listOutbox();
      const oversizedInvalidMigration = initial.filter((item) => item.migration === true &&
        !item.conflict && item.terminalError === 'invalid_request');
      const recoverableIds = new Set(migration && oversizedInvalidMigration.length > MAX_PUSH_OPERATIONS
        ? oversizedInvalidMigration.map((item) => item.operationId) : []);
      let sent = 0;
      let conflicts = 0;
      while (true) {
        const operations = (await this.store.listOutbox()).filter((item) =>
          item.migration === migration && !item.conflict &&
          (!item.terminalError || recoverableIds.has(item.operationId) ||
            (item.terminalError === 'push_failed' && item.failureKind === 'network')) &&
          (force || !item.nextRetryAt || item.nextRetryAt <= now)
        ).slice(0, MAX_PUSH_OPERATIONS);
        if (!operations.length) return { ok: conflicts === 0, sent, conflict: conflicts };
        for (const item of operations) {
          if (item.deleted && this.adapter.canDeleteRecord?.(keyOf(item),
              await this.store.getShadow?.(keyOf(item)) || item) === false) {
            throw new MultiAppSyncError('local_deletion_unconfirmed');
          }
        }
        operations.forEach((item) => recoverableIds.delete(item.operationId));
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
            const retryable = error instanceof MultiAppSyncError &&
              (error.code === 'network_error' || RETRYABLE_STATUS.has(error.status) || PAUSE_CODES.has(error.code));
            await this.store.putOutbox({
              ...operation, attempts,
              nextRetryAt: retryable ? now + Math.min(300000, 1000 * (2 ** Math.min(attempts, 8))) : 0,
              ...(retryable ? { terminalError: undefined, failureKind: error.code === 'network_error' ? 'network' : undefined }
                : { terminalError: error.code || 'push_failed' })
            });
          }
          if (error instanceof MultiAppSyncError &&
              (error.code === 'network_error' || RETRYABLE_STATUS.has(error.status) || PAUSE_CODES.has(error.code))) {
            await this.scheduleRetryWake();
          }
          throw error;
        }
        sent += operations.length;
        for (const result of payload.results || []) {
          const operation = operations.find((item) => item.operationId === result.operationId);
          if (!operation) throw new MultiAppSyncError('invalid_response');
          if (['applied', 'duplicate'].includes(result.status)) await this.store.deleteOutbox(operation.operationId);
          else if (result.status === 'conflict') {
            conflicts += 1;
            const recordKey = keyOf(operation);
            const localRecord = operation.deleted ? null : {
              recordType: operation.recordType, recordId: operation.recordId,
              schemaVersion: operation.schemaVersion, payload: clone(operation.payload), payloadHash: operation.payloadHash
            };
            await this.recordConflict('push', recordKey, {
              localRecord,
              remoteRecord: result.record || null,
              shadowRecord: await this.store.getShadow?.(recordKey)
            });
            await this.store.putOutbox({ ...operation, conflict: true });
          } else await this.store.putOutbox({ ...operation, terminalError: result.code || 'invalid' });
        }
        if (conflicts) {
          this.setState('attention', { reason: 'conflict' });
          return { ok: false, sent, conflict: conflicts };
        }
      }
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
      const [shadowRecords, unresolvedConflicts] = await Promise.all([
        this.store.listShadow(), this.store.listConflicts()
      ]);
      let finalSnapshot = local.snapshot;
      const resumesOwnPartialMigration = this.appId === 'port' && remote.datasetState === 'initializing' && remoteLive.length > 0 &&
        remoteLive.every((record) => record.ownedByCurrentDevice === true);
      const resumesResolvedConflictMerge = unresolvedConflicts.length === 0 && shadowRecords.length > 0 &&
        sameRecordAnchors(shadowRecords, remote.records || []);
      if (resumesOwnPartialMigration || resumesResolvedConflictMerge) {
        // Resume only from an authenticated baseline: either every partial record
        // belongs to this device, or the saved shadow exactly matches the current
        // remote snapshot after the last initial-merge conflict was resolved.
        finalSnapshot = local.snapshot;
      } else if (!local.records.length && remoteLive.length) {
        finalSnapshot = remoteSnapshot;
        await this.applyWithBackup(finalSnapshot, local.snapshot, { checkCurrent: true });
      } else if (local.records.length && remoteLive.length) {
        const merged = this.adapter.mergeSnapshots(local.snapshot, remoteSnapshot);
        if (merged.conflicts.length) {
          const localMap = mapRecords(local.records);
          const remoteMap = mapRecords(remote.records || []);
          for (const item of merged.conflicts) await this.recordConflict('initial_merge', item.recordKey, {
            reason: item.reason,
            localRecord: localMap.get(item.recordKey) || null,
            remoteRecord: remoteMap.get(item.recordKey) || null,
            shadowRecord: null
          });
          this.setState('attention', { reason: 'conflict' });
          return Object.freeze({ ok: false, code: 'merge_conflict', conflicts: merged.conflicts.length });
        }
        finalSnapshot = merged.snapshot;
        await this.applyWithBackup(finalSnapshot, local.snapshot, { checkCurrent: true });
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

    sync(reason = 'manual') {
      this.syncRequestGeneration += 1;
      if (!this.pendingSyncReason || reason === 'save') this.pendingSyncReason = reason;
      if (this.running) return this.running;
      return this.startScheduledSync();
    }

    startScheduledSync() {
      const generation = this.syncRequestGeneration;
      const reason = this.pendingSyncReason || 'pending';
      this.pendingSyncReason = null;
      let scheduled;
      scheduled = Promise.resolve().then(() => this.performSync(reason)).then(
        (result) => {
          const hasPendingRequest = this.syncRequestGeneration > generation;
          if (this.running === scheduled) this.running = null;
          if (result?.ok === true && hasPendingRequest) return this.startScheduledSync();
          return result;
        },
        (error) => {
          if (this.running === scheduled) this.running = null;
          if (retryableError(error)) this.setState('retrying', { reason: error.code });
          else if (!TERMINAL_CODES.has(error?.code) && !PAUSE_CODES.has(error?.code)) {
            this.setState('attention', { reason: safeErrorCode(error) });
          }
          throw error;
        }
      );
      this.running = scheduled;
      return scheduled;
    }

    async performSync(reason) {
      if (await this.store.readMeta('migrationState') !== 'complete') return { ok: false, code: 'migration_required' };
      if (global.navigator?.onLine === false) {
        this.setState('offline');
        return { ok: false, code: 'offline' };
      }
      let unresolved = await this.store.listConflicts();
      if (unresolved.length) unresolved = await this.reconcileConvergedPortConflicts(unresolved);
      if (unresolved.length) {
        this.setState('attention', { reason: 'conflict', conflicts: unresolved.length });
        await this.reportRemovalSafety('attention');
        return { ok: false, code: 'conflict_pending', conflicts: unresolved.length };
      }
      this.setState('syncing', { reason });
      const [remote, shadowRecords] = await Promise.all([this.serverSnapshot(), this.store.listShadow()]);
      const local = await this.localRecords();
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
        for (const recordKey of conflictKeys) await this.recordConflict('pull', recordKey, {
          localRecord: localMap.get(recordKey) || null,
          remoteRecord: remoteMap.get(recordKey) || null,
          shadowRecord: shadowMap.get(recordKey) || null
        });
        this.setState('attention', { reason: 'conflict' });
        await this.reportRemovalSafety('attention');
        return { ok: false, code: 'conflict', conflicts: conflictKeys.length };
      }
      await this.queueDiff(local.records, remote.records || [], shadowRecords);
      await this.flushOutbox();
      const afterPush = await this.serverSnapshot();
      const localAfterPush = await this.localRecords();
      const afterMap = mapRecords(afterPush.records || []);
      const freshMap = mapRecords(localAfterPush.records);
      const pending = await this.store.listOutbox();
      const pendingKeys = new Set(pending.map(keyOf));
      const merged = new Map(localAfterPush.records.map((record) => [keyOf(record), record]));
      const lateConflicts = [];
      let remoteChanged = false;
      for (const recordKey of new Set([...freshMap.keys(), ...afterMap.keys(), ...shadowMap.keys()])) {
        const current = freshMap.get(recordKey);
        const incoming = afterMap.get(recordKey);
        const previous = shadowMap.get(recordKey);
        if (sameRecord(current, incoming)) continue;
        if (pendingKeys.has(recordKey) && sameRecord(incoming, previous)) continue;
        if (!pendingKeys.has(recordKey) && sameRecord(current, previous)) {
          if (incoming && !isDeleted(incoming)) merged.set(recordKey, localRecordFromRemote(incoming));
          else merged.delete(recordKey);
          remoteChanged = true;
        } else if (!sameRecord(incoming, previous)) {
          lateConflicts.push(recordKey);
        }
      }
      if (lateConflicts.length) {
        for (const recordKey of lateConflicts) await this.recordConflict('pull', recordKey, {
          localRecord: freshMap.get(recordKey) || null,
          remoteRecord: afterMap.get(recordKey) || null,
          shadowRecord: shadowMap.get(recordKey) || null
        });
        this.setState('attention', { reason: 'conflict', conflicts: lateConflicts.length });
        await this.reportRemovalSafety('attention');
        return { ok: false, code: 'conflict', conflicts: lateConflicts.length };
      }
      if (remoteChanged) {
        const next = this.adapter.deserializeRecords([...merged.values()]);
        await this.applyWithBackup(next, localAfterPush.snapshot, { checkCurrent: true });
      }
      await this.replaceShadow(afterPush.records || [], afterPush.cursor);
      await this.store.setMeta('lastSyncAt', this.now());
      const [outbox, conflicts] = await Promise.all([this.store.listOutbox(), this.store.listConflicts()]);
      const state = conflicts.length || outbox.some((item) => item.terminalError || item.conflict)
        ? 'attention' : outbox.length ? 'pending' : 'ready';
      this.setState(state, { reason, recordCount: localAfterPush.records.length });
      await this.reportRemovalSafety(state === 'ready' ? 'clean' : state === 'attention' ? 'attention' : 'pending');
      await this.scheduleRetryWake();
      return { ok: true, recordCount: afterPush.recordCount, manifestHash: afterPush.manifestHash };
    }

    notifyLocalSave() {
      void this.reportRemovalSafety('pending');
      queueMicrotask(() => this.sync('save').catch((error) => {
        void this.reportRemovalSafety('error');
        this.setState(error instanceof MultiAppSyncError && PAUSE_CODES.has(error.code) ? 'paused' :
          retryableError(error) ? 'retrying' : 'attention');
      }));
    }

    bindLifecycle() {
      if (this.lifecycleBound || !global.addEventListener) return;
      this.lifecycleBound = true;
      this.scheduleRetryWake().catch(() => {});
      global.addEventListener('focus', () => this.sync('focus').catch(() => {}));
      global.addEventListener('online', () => this.resumeConflictResolutions()
        .then(() => this.sync('online')).catch(() => {}));
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
