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
    rate_limited: 'rate_limited',
    turnstile_failed: 'verification_failed',
    invalid_request: 'invalid_request'
  });

  class AccountApiError extends Error {
    constructor(status, code) {
      super(ERROR_MESSAGES[code] || 'account_api_error');
      this.name = 'AccountApiError';
      this.status = status;
      this.code = code;
    }
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
    }

    async request(path, options = {}) {
      const headers = new Headers({ Accept: 'application/json' });
      if (options.body) headers.set('Content-Type', 'application/json');
      if (options.accountCredential) headers.set('Authorization', `Bearer ${options.accountCredential}`);
      if (options.appCredential) {
        headers.set('X-Sound-Cruise-App-Authorization', `Bearer ${options.appCredential}`);
      }
      const response = await this.fetchImpl(`${this.endpoint}${path}`, {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer'
      });
      let payload;
      try { payload = await response.json(); } catch { throw new AccountApiError(response.status, 'invalid_response'); }
      if (!response.ok || payload?.ok !== true) {
        throw new AccountApiError(response.status, payload?.code || 'account_api_error');
      }
      return payload;
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
      const result = await this.request('/v2/accounts/start', {
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

    summary(accountCredential) {
      return this.request('/v2/accounts/summary', { accountCredential });
    }

    memberships(accountCredential) {
      return this.request('/v2/accounts/memberships', { accountCredential });
    }

    devices(accountCredential) {
      return this.request('/v2/accounts/devices', { accountCredential });
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
      await this.storage.setPendingConsume({
        operationId: operation,
        appId,
        consumeMode,
        accountDeviceId: account.accountDeviceId,
        accountCredential: account.accountCredential,
        appDeviceId: app.appDeviceId,
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
      if (!preservePending) await this.storage.clearPendingConsume();
      return Object.freeze({
        ...result,
        consumeMode,
        ...(consumeMode === 'new_app' ? { appDeviceCredential: app.appDeviceCredential } : {})
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
        const summary = await this.summary(pending.accountCredential);
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
        if (!preservePending) await this.storage.clearPendingConsume();
        return Object.freeze({
          status: consumeMode === 'existing_chord' ? 'bridge_required' : 'committed',
          membership,
          consumeMode,
          appDeviceId: pending.appDeviceId,
          ...(pending.appDeviceCredential ? { appDeviceCredential: pending.appDeviceCredential } : {})
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
