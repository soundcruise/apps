(function installSyncAccountClient(global) {
  'use strict';

  const root = global.SoundCruiseSyncAccount = global.SoundCruiseSyncAccount || {};
  const ERROR_MESSAGES = Object.freeze({
    account_admission_paused: 'account_runtime_paused',
    membership_admission_paused: 'account_runtime_paused',
    account_read_paused: 'account_runtime_paused',
    account_rollout_control_unavailable: 'account_runtime_unavailable',
    account_rollout_action_unclassified: 'account_runtime_unavailable',
    account_rate_limiter_unavailable: 'account_runtime_unavailable',
    account_server_unavailable: 'account_runtime_unavailable',
    account_server_error: 'account_runtime_unavailable',
    invalid_account_credential: 'account_auth_required',
    account_not_found: 'account_not_found',
    membership_state_invalid: 'membership_state_invalid',
    operation_conflict: 'operation_conflict',
    handoff_already_active: 'handoff_already_active',
    handoff_not_found: 'handoff_not_found',
    handoff_invalid: 'handoff_invalid',
    handoff_expired: 'handoff_expired',
    handoff_cancelled: 'handoff_cancelled',
    handoff_consumed: 'handoff_consumed',
    app_join_already_active: 'app_join_already_active',
    app_join_not_found: 'app_join_not_found',
    app_join_invalid: 'app_join_invalid',
    app_join_expired: 'app_join_expired',
    app_join_cancelled: 'app_join_cancelled',
    app_join_consumed: 'app_join_consumed',
    app_join_wrong_app: 'wrong_app',
    wrong_app: 'wrong_app',
    bridge_not_found: 'bridge_not_found',
    bridge_ownership_conflict: 'bridge_ownership_conflict',
    bridge_ineligible: 'bridge_ineligible',
    bridge_precondition_failed: 'bridge_precondition_failed',
    bridge_forward_only: 'bridge_forward_only',
    legacy_recovery_active: 'legacy_recovery_active',
    invalid_app_credential: 'app_auth_required',
    account_recovery_required: 'account_recovery_required',
    account_membership_delete_required: 'account_membership_delete_required',
    account_recovery_invalid: 'account_recovery_invalid',
    account_recovery_paused: 'account_runtime_paused',
    account_delete_invalid: 'account_delete_invalid',
    account_delete_paused: 'account_runtime_paused',
    account_device_not_found: 'account_device_not_found',
    rate_limited: 'rate_limited',
    turnstile_failed: 'verification_failed',
    qa_admission_required: 'qa_admission_required',
    account_qa_unavailable: 'account_runtime_unavailable',
    qa_enrollment_invalid: 'qa_enrollment_invalid',
    qa_enrollment_expired: 'qa_enrollment_expired',
    qa_enrollment_used: 'qa_enrollment_used',
    qa_enrollment_cancelled: 'qa_enrollment_cancelled',
    account_request_timeout: 'account_request_timeout',
    account_start_uncertain: 'account_start_uncertain',
    network_error: 'network_error',
    invalid_request: 'invalid_request'
  });
  const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;

  class AccountApiError extends Error {
    constructor(status, code) {
      super(ERROR_MESSAGES[code] || 'account_api_error');
      this.name = 'AccountApiError';
      this.status = status;
      this.code = code;
    }
  }

  function normalizedTimeout(value) {
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_REQUEST_TIMEOUT_MS;
  }

  function uncertainStartFailure(error) {
    return error instanceof AccountApiError && [
      'account_request_timeout', 'invalid_response', 'network_error', 'account_start_uncertain'
    ].includes(error.code);
  }

  class AccountClient {
    constructor(options) {
      if (!options || typeof options.endpoint !== 'string' || !options.endpoint.startsWith('https://')) {
        throw new Error('account_endpoint_invalid');
      }
      this.endpoint = options.endpoint.replace(/\/$/, '');
      this.fetchImpl = options.fetchImpl || global.fetch.bind(global);
      this.storage = options.storage || root.storage;
      this.core = options.core || root.core;
      this.qaScope = options.qaScope || 'port';
      this.qaAppId = options.qaAppId || null;
      this.requestTimeoutMs = normalizedTimeout(options.requestTimeoutMs);
    }

    async request(path, options = {}) {
      const timeoutMs = normalizedTimeout(options.timeoutMs || this.requestTimeoutMs);
      const controller = typeof global.AbortController === 'function' ? new global.AbortController() : null;
      let timeoutId = null;
      let timedOut = false;
      const timeout = new Promise((_, reject) => {
        timeoutId = global.setTimeout(() => {
          timedOut = true;
          try { controller?.abort(); } catch (_) { /* best effort cancellation */ }
          reject(new AccountApiError(0, 'account_request_timeout'));
        }, timeoutMs);
      });
      const operation = (async () => {
        const headers = new Headers({ Accept: 'application/json' });
        if (options.body) headers.set('Content-Type', 'application/json');
        if (options.accountCredential) headers.set('Authorization', `Bearer ${options.accountCredential}`);
        if (options.appCredential) {
          headers.set('X-Sound-Cruise-App-Authorization', `Bearer ${options.appCredential}`);
        }
        if (!options.skipQa) {
          const qa = options.qaAdmission || await this.storage?.getQaAdmission?.(this.qaScope, this.qaAppId);
          if (qa?.qaCredential) {
            headers.set('X-Sound-Cruise-QA-Authorization', `Bearer ${qa.qaCredential}`);
          }
        }
        let response;
        try {
          response = await this.fetchImpl(`${this.endpoint}${path}`, {
            method: options.method || 'GET',
            headers,
            body: options.body ? JSON.stringify(options.body) : undefined,
            credentials: 'omit',
            cache: 'no-store',
            referrerPolicy: 'no-referrer',
            ...(controller ? { signal: controller.signal } : {})
          });
        } catch (error) {
          if (timedOut || error?.name === 'AbortError') throw new AccountApiError(0, 'account_request_timeout');
          throw new AccountApiError(0, 'network_error');
        }
        let payload;
        try { payload = await response.json(); } catch {
          if (timedOut) throw new AccountApiError(0, 'account_request_timeout');
          throw new AccountApiError(response.status, 'invalid_response');
        }
        if (!response.ok || payload?.ok !== true) {
          throw new AccountApiError(response.status, payload?.code || 'account_api_error');
        }
        return payload;
      })();
      try {
        return await Promise.race([operation, timeout]);
      } finally {
        if (timeoutId !== null) global.clearTimeout(timeoutId);
      }
    }

    async enrollQa({ enrollmentCode, turnstileToken, material = null }) {
      const candidate = material || this.core.createQaCredential();
      if (!this.core.validQaCredential(candidate.qaCredential)) throw new Error('qa_material_invalid');
      const result = await this.request('/v2/accounts/qa/enroll', {
        method: 'POST', skipQa: true,
        body: { enrollmentCode, qaCredential: candidate.qaCredential, turnstileToken }
      });
      await this.storage.setQaAdmission({
        qaSessionId: result.qaSessionId,
        qaCredential: candidate.qaCredential,
        scope: result.scope,
        expiresAt: result.expiresAt
      });
      return Object.freeze(result);
    }

    async startAccount({ appIds, deviceLabel, turnstileToken, material, recoverySaved }) {
      if (!material || !this.core.validAccountCredential(material.accountCredential) ||
          typeof material.recoveryCode !== 'string' || typeof material.operationId !== 'string' ||
          recoverySaved !== true) {
        throw new Error('account_material_must_be_created_and_saved_first');
      }
      const candidate = material;
      await this.storage.setPendingStart({
        operationId: candidate.operationId,
        accountDeviceId: candidate.accountDeviceId,
        accountCredential: candidate.accountCredential,
        appIds,
        deviceLabel: deviceLabel || null,
        recoveryAcknowledged: true
      });
      let result;
      try {
        result = await this.request('/v2/accounts/start', {
          method: 'POST',
          body: {
            operationId: candidate.operationId,
            appIds,
            accountCredential: candidate.accountCredential,
            recoveryCode: candidate.recoveryCode,
            turnstileToken,
            deviceLabel: deviceLabel || null
          }
        });
      } catch (error) {
        if (!uncertainStartFailure(error)) throw error;
        try {
          const resumed = await this.resumePendingStart();
          if (resumed.status === 'committed') {
            return Object.freeze({
              ok: true,
              operation: 'reconciled',
              accountId: resumed.summary.account.id,
              accountDeviceId: candidate.accountDeviceId,
              recoveryVersion: resumed.summary.account.recoveryVersion,
              memberships: resumed.summary.memberships || [],
              recoveryCode: candidate.recoveryCode,
              reconciled: true
            });
          }
        } catch (_) {
          throw new AccountApiError(0, 'account_start_uncertain');
        }
        throw error;
      }
      await this.storage.setAccount({
        accountId: result.accountId,
        accountDeviceId: result.accountDeviceId,
        accountCredential: candidate.accountCredential,
        recoveryVersion: result.recoveryVersion,
        recoveryAcknowledgedVersion: result.recoveryVersion,
        recoveryAcknowledgedAt: Date.now()
      });
      await this.storage.clearPendingStart();
      return Object.freeze({ ...result, recoveryCode: candidate.recoveryCode });
    }

    summary(accountCredential, qaAdmission = null) {
      return this.request('/v2/accounts/summary', { accountCredential, qaAdmission });
    }

    memberships(accountCredential) {
      return this.request('/v2/accounts/memberships', { accountCredential });
    }

    devices(accountCredential) {
      return this.request('/v2/accounts/devices', { accountCredential });
    }

    async prepareAccountRecovery({ recoveryCode, deviceLabel, turnstileToken, material = null }) {
      const candidate = material || this.core.createAccountRecoveryMaterial();
      if (typeof recoveryCode !== 'string' || !recoveryCode.trim() ||
          !this.core.validAccountRecoveryClaim(candidate.claimToken) ||
          !this.core.validAccountCredential(candidate.accountCredential) ||
          typeof candidate.nextRecoveryCode !== 'string') {
        throw new Error('account_recovery_material_invalid');
      }
      const result = await this.request('/v2/accounts/recovery/prepare', {
        method: 'POST',
        body: {
          operationId: candidate.prepareOperationId,
          recoveryCode,
          claimToken: candidate.claimToken,
          nextRecoveryCode: candidate.nextRecoveryCode,
          accountCredential: candidate.accountCredential,
          deviceLabel: deviceLabel || null,
          turnstileToken
        }
      });
      return Object.freeze({
        ...result,
        material: candidate,
        nextRecoveryCode: this.core.formatRecoveryCode(candidate.nextRecoveryCode)
      });
    }

    async commitAccountRecovery({ material, recoverySaved }) {
      if (recoverySaved !== true || !material ||
          !this.core.validAccountRecoveryClaim(material.claimToken) ||
          !this.core.validAccountCredential(material.accountCredential)) {
        throw new Error('account_recovery_save_confirmation_required');
      }
      const pending = {
        commitOperationId: material.commitOperationId,
        claimToken: material.claimToken,
        accountDeviceId: material.accountDeviceId,
        accountCredential: material.accountCredential,
        recoveryAcknowledged: true
      };
      await this.storage.setPendingRecovery(pending);
      const result = await this.request('/v2/accounts/recovery/commit', {
        method: 'POST',
        body: {
          operationId: material.commitOperationId,
          claimToken: material.claimToken,
          accountCredential: material.accountCredential
        }
      });
      await this.storage.setAccount({
        accountId: result.accountId,
        accountDeviceId: result.accountDeviceId,
        accountCredential: material.accountCredential,
        recoveryVersion: result.recoveryVersion,
        recoveryAcknowledgedVersion: result.recoveryVersion,
        recoveryAcknowledgedAt: Date.now()
      });
      await this.storage.clearPendingRecovery();
      return Object.freeze(result);
    }

    async resumePendingRecovery() {
      const pending = await this.storage.getPendingRecovery?.();
      if (!pending) return Object.freeze({ status: 'none' });
      const result = await this.request('/v2/accounts/recovery/commit', {
        method: 'POST',
        body: {
          operationId: pending.commitOperationId,
          claimToken: pending.claimToken,
          accountCredential: pending.accountCredential
        }
      });
      await this.storage.setAccount({
        accountId: result.accountId,
        accountDeviceId: result.accountDeviceId,
        accountCredential: pending.accountCredential,
        recoveryVersion: result.recoveryVersion,
        recoveryAcknowledgedVersion: result.recoveryVersion,
        recoveryAcknowledgedAt: Date.now()
      });
      await this.storage.clearPendingRecovery();
      return Object.freeze({ status: 'committed', result });
    }

    async revokeEnvironment({ accountCredential, accountDeviceId, operationId }) {
      const result = await this.request('/v2/accounts/devices/revoke', {
        method: 'POST', accountCredential,
        body: { operationId, accountDeviceId }
      });
      if (result.isCurrent) await this.storage.clearAccount();
      return Object.freeze(result);
    }

    async issueDeleteIntent({ accountCredential, scope, appId = null, material = null }) {
      if (!['app', 'account'].includes(scope) || (scope === 'app' && !this.core.ACCOUNT_APPS.includes(appId))) {
        throw new Error('account_delete_scope_invalid');
      }
      const candidate = material || this.core.createAccountDeleteMaterial();
      if (!this.core.validAccountDeleteIntent(candidate.intentToken)) {
        throw new Error('account_delete_material_invalid');
      }
      const path = scope === 'account'
        ? '/v2/accounts/delete-intent'
        : `/v2/accounts/memberships/${encodeURIComponent(appId)}/delete-intent`;
      const body = { operationId: candidate.issueOperationId, intentToken: candidate.intentToken };
      if (scope === 'app') body.appId = appId;
      const result = await this.request(path, { method: 'POST', accountCredential, body });
      return Object.freeze({ ...result, material: candidate });
    }

    async commitDelete({ accountCredential, scope, appId = null, material, confirmed }) {
      if (confirmed !== true || !material || !this.core.validAccountDeleteIntent(material.intentToken)) {
        throw new Error('account_delete_confirmation_required');
      }
      const path = scope === 'account'
        ? '/v2/accounts'
        : `/v2/accounts/memberships/${encodeURIComponent(appId)}`;
      const body = { operationId: material.commitOperationId, intentToken: material.intentToken };
      if (scope === 'app') body.appId = appId;
      await this.storage.setPendingDelete({
        scope, appId, path, body, accountCredential
      });
      const result = await this.request(path, {
        method: 'DELETE', accountCredential, body
      });
      if (scope === 'account') await this.storage.clearAccount();
      await this.storage.clearPendingDelete();
      return Object.freeze(result);
    }

    async resumePendingDelete() {
      const pending = await this.storage.getPendingDelete?.();
      if (!pending) return Object.freeze({ status: 'none' });
      const result = await this.request(pending.path, {
        method: 'DELETE', accountCredential: pending.accountCredential, body: pending.body
      });
      if (pending.scope === 'account') await this.storage.clearAccount();
      await this.storage.clearPendingDelete();
      return Object.freeze({ status: 'committed', result });
    }

    prepareMembership({ accountCredential, appId, operationId }) {
      if (typeof operationId !== 'string') {
        throw new Error('membership_operation_id_required');
      }
      return this.request('/v2/accounts/memberships', {
        method: 'POST', accountCredential,
        body: { operationId, appId }
      });
    }

    async issueHandoff({ accountCredential, appId, appUrl, material }) {
      if (!material || !this.core.validHandoffToken(material.handoffToken) ||
          typeof material.operationId !== 'string') {
        throw new Error('handoff_material_required');
      }
      const candidate = material;
      const result = await this.request('/v2/accounts/handoffs', {
        method: 'POST', accountCredential,
        body: {
          operationId: candidate.operationId,
          appId,
          handoffToken: candidate.handoffToken
        }
      });
      return Object.freeze({
        ...result,
        url: this.core.createHandoffUrl(appUrl, candidate.handoffToken)
      });
    }

    cancelHandoff({ accountCredential, handoffId }) {
      return this.request('/v2/accounts/handoffs/cancel', {
        method: 'POST', accountCredential, body: { handoffId }
      });
    }

    async issueJoinInvitation({ accountCredential, appId, material }) {
      if (!material || !this.core.validJoinCode(material.joinCode) ||
          typeof material.operationId !== 'string' || typeof material.invitationId !== 'string') {
        throw new Error('app_join_material_required');
      }
      const result = await this.request('/v2/accounts/app-join-invitations', {
        method: 'POST', accountCredential,
        body: {
          operationId: material.operationId,
          invitationId: material.invitationId,
          appId,
          joinCode: material.joinCode
        }
      });
      return Object.freeze({ ...result, displayJoinCode: this.core.formatJoinCode(material.joinCode) });
    }

    joinInvitationStatus({ accountCredential, invitationId }) {
      return this.request(`/v2/accounts/app-join-invitations?invitationId=${encodeURIComponent(invitationId)}`, {
        accountCredential
      });
    }

    cancelJoinInvitation({ accountCredential, invitationId }) {
      return this.request('/v2/accounts/app-join-invitations/cancel', {
        method: 'POST', accountCredential, body: { invitationId }
      });
    }

    async consumeJoinInvitation({
      joinCode, appId, deviceLabel, operationId, accountMaterial, appMaterial,
      consumeMode = 'new_app', existingAppCredential = null, preservePending = false
    }) {
      const normalizedCode = this.core.normalizeJoinCode(joinCode);
      if (!normalizedCode || !['new_app', 'existing_chord'].includes(consumeMode) ||
          (consumeMode === 'existing_chord' && appId !== 'chord')) {
        throw new Error('app_join_input_invalid');
      }
      const account = accountMaterial || this.core.createAccountCredential();
      const app = consumeMode === 'existing_chord'
        ? { appDeviceId: String(existingAppCredential || '').split('.')[1] || null,
            appDeviceCredential: existingAppCredential }
        : (appMaterial || this.core.createAppCredential());
      if (!this.core.validAppCredential(app.appDeviceCredential)) throw new Error('app_join_app_credential_required');
      const operation = operationId || this.core.createOperationId();
      const qa = this.core.createQaCredential();
      await this.storage.setPendingConsume({
        transport: 'app_join', operationId: operation, appId, consumeMode,
        accountDeviceId: account.accountDeviceId, accountCredential: account.accountCredential,
        appDeviceId: app.appDeviceId, qaSessionId: qa.qaSessionId, qaCredential: qa.qaCredential,
        ...(consumeMode === 'new_app' ? { appDeviceCredential: app.appDeviceCredential } : {}),
        deviceLabel: deviceLabel || null
      });
      const result = await this.request('/v2/accounts/app-join-invitations/consume', {
        method: 'POST',
        body: {
          operationId: operation, appId, joinCode: normalizedCode,
          accountCredential: account.accountCredential,
          appDeviceCredential: app.appDeviceCredential,
          qaCredential: qa.qaCredential, deviceLabel: deviceLabel || null, consumeMode
        }
      });
      await this.storage.setAccount({
        accountId: result.accountId, accountDeviceId: result.accountDeviceId,
        accountCredential: account.accountCredential, membershipId: result.membershipId
      });
      await this.storage.setQaAdmission({
        qaSessionId: result.qaSessionId, qaCredential: qa.qaCredential,
        scope: 'app', appId, accountId: result.accountId
      });
      if (!preservePending) await this.storage.clearPendingConsume();
      return Object.freeze({
        ...result, consumeMode,
        ...(consumeMode === 'new_app' ? { appDeviceCredential: app.appDeviceCredential } : {}),
        qaCredential: qa.qaCredential
      });
    }

    async consumeHandoff({
      handoffToken, appId, deviceLabel, operationId, accountMaterial, appMaterial,
      consumeMode = 'new_app', existingAppCredential = null, preservePending = false
    }) {
      if (!['new_app', 'existing_chord'].includes(consumeMode) ||
          (consumeMode === 'existing_chord' && appId !== 'chord')) {
        throw new Error('handoff_consume_mode_invalid');
      }
      const account = accountMaterial || this.core.createAccountCredential();
      const app = consumeMode === 'existing_chord'
        ? { appDeviceId: String(existingAppCredential || '').split('.')[1] || null,
            appDeviceCredential: existingAppCredential }
        : (appMaterial || this.core.createAppCredential());
      if (!this.core.validAppCredential(app.appDeviceCredential)) {
        throw new Error('handoff_app_credential_required');
      }
      const operation = operationId || this.core.createOperationId();
      const qa = this.core.createQaCredential();
      await this.storage.setPendingConsume({
        operationId: operation,
        appId,
        consumeMode,
        accountDeviceId: account.accountDeviceId,
        accountCredential: account.accountCredential,
        appDeviceId: app.appDeviceId,
        qaSessionId: qa.qaSessionId,
        qaCredential: qa.qaCredential,
        ...(consumeMode === 'new_app' ? { appDeviceCredential: app.appDeviceCredential } : {}),
        deviceLabel: deviceLabel || null
      });
      const result = await this.request('/v2/accounts/handoffs/consume', {
        method: 'POST',
        body: {
          operationId: operation,
          appId,
          handoffToken,
          accountCredential: account.accountCredential,
          appDeviceCredential: app.appDeviceCredential,
          qaCredential: qa.qaCredential,
          deviceLabel: deviceLabel || null,
          consumeMode
        }
      });
      await this.storage.setAccount({
        accountId: result.accountId,
        accountDeviceId: result.accountDeviceId,
        accountCredential: account.accountCredential,
        membershipId: result.membershipId
      });
      await this.storage.setQaAdmission({
        qaSessionId: result.qaSessionId,
        qaCredential: qa.qaCredential,
        scope: 'app',
        appId,
        accountId: result.accountId
      });
      if (!preservePending) await this.storage.clearPendingConsume();
      return Object.freeze({
        ...result,
        consumeMode,
        ...(consumeMode === 'new_app' ? { appDeviceCredential: app.appDeviceCredential } : {}),
        qaCredential: qa.qaCredential
      });
    }

    async resumePendingStart() {
      const pending = await this.storage.getPendingStart();
      if (!pending) return Object.freeze({ status: 'none' });
      try {
        const summary = await this.summary(pending.accountCredential);
        await this.storage.setAccount({
          accountId: summary.account.id,
          accountDeviceId: pending.accountDeviceId,
          accountCredential: pending.accountCredential,
          recoveryVersion: summary.account.recoveryVersion,
          recoveryAcknowledgedVersion: pending.recoveryAcknowledged
            ? summary.account.recoveryVersion : null,
          recoveryAcknowledgedAt: pending.recoveryAcknowledged ? Date.now() : null
        });
        await this.storage.clearPendingStart();
        return Object.freeze({ status: 'committed', summary });
      } catch (error) {
        if (error instanceof AccountApiError && error.code === 'invalid_account_credential') {
          return Object.freeze({ status: 'not_committed' });
        }
        throw error;
      }
    }

    async resumePendingConsume({ preservePending = false } = {}) {
      const pending = await this.storage.getPendingConsume();
      if (!pending) return Object.freeze({ status: 'none' });
      try {
        const summary = await this.summary(pending.accountCredential, pending.qaCredential
          ? { qaCredential: pending.qaCredential }
          : null);
        const membership = summary.memberships.find((entry) => entry.appId === pending.appId);
        const consumeMode = pending.consumeMode || 'new_app';
        const expectedState = consumeMode === 'existing_chord' ? 'pending' : 'active';
        if (!membership || membership.state !== expectedState) {
          return Object.freeze({ status: 'not_committed' });
        }
        await this.storage.setAccount({
          accountId: summary.account.id,
          accountDeviceId: pending.accountDeviceId,
          accountCredential: pending.accountCredential,
          membershipId: membership.id
        });
        if (pending.qaCredential) {
          await this.storage.setQaAdmission({
            qaSessionId: pending.qaSessionId,
            qaCredential: pending.qaCredential,
            scope: 'app',
            appId: pending.appId,
            accountId: summary.account.id
          });
        }
        if (!preservePending) await this.storage.clearPendingConsume();
        return Object.freeze({
          status: consumeMode === 'existing_chord' ? 'bridge_required' : 'committed',
          membership,
          consumeMode,
          appDeviceId: pending.appDeviceId,
          ...(pending.appDeviceCredential ? { appDeviceCredential: pending.appDeviceCredential } : {}),
          ...(pending.qaCredential ? { qaCredential: pending.qaCredential } : {})
        });
      } catch (error) {
        if (error instanceof AccountApiError && error.code === 'invalid_account_credential') {
          return Object.freeze({ status: 'not_committed' });
        }
        throw error;
      }
    }

    confirmConsumePersisted() {
      return this.storage.clearPendingConsume();
    }
  }

  root.AccountApiError = AccountApiError;
  root.AccountClient = AccountClient;
  root.errorMessages = ERROR_MESSAGES;
})(globalThis);
