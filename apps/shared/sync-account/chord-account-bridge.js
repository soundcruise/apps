(function installChordAccountBridge(global) {
  'use strict';

  const root = global.SoundCruiseSyncAccount = global.SoundCruiseSyncAccount || {};

  class ChordAccountBridgeClient {
    constructor(options) {
      if (!options?.accountClient || !options?.storage || !options?.core) {
        throw new Error('chord_bridge_dependencies_unavailable');
      }
      this.accountClient = options.accountClient;
      this.storage = options.storage;
      this.core = options.core;
    }

    request(path, accountCredential, appCredential, body) {
      return this.accountClient.request(path, {
        method: body ? 'POST' : 'GET',
        accountCredential,
        appCredential,
        body
      });
    }

    state({ accountCredential, appCredential }) {
      return this.request('/v2/accounts/bridges/chord', accountCredential, appCredential);
    }

    async prepare({ accountCredential, appCredential, membershipId, accountGeneration, operationId }) {
      const result = await this.request(
        '/v2/accounts/bridges/chord/prepare',
        accountCredential,
        appCredential,
        {
          operationId: operationId || this.core.createOperationId(),
          membershipId,
          expectedAccountGeneration: accountGeneration
        }
      );
      await this.storage.setPendingBridge({
        bridgeId: result.bridge.bridgeId,
        state: result.bridge.state,
        generation: result.bridge.generation,
        membershipId: result.bridge.membershipId,
        accountRecoveryVersion: result.bridge.accountRecoveryVersion
      });
      return result;
    }

    async commitDual({
      accountCredential,
      appCredential,
      bridge,
      accountRecoveryVersion,
      recoverySaved,
      operationId
    }) {
      if (recoverySaved !== true || accountRecoveryVersion !== bridge.accountRecoveryVersion) {
        throw new Error('account_recovery_must_be_saved_first');
      }
      const operation = operationId || this.core.createOperationId();
      await this.storage.setPendingBridge({
        bridgeId: bridge.bridgeId,
        state: 'candidate_saved',
        generation: bridge.generation,
        membershipId: bridge.membershipId,
        accountRecoveryVersion,
        dualOperationId: operation,
        recoveryAcknowledged: true
      });
      const result = await this.request(
        '/v2/accounts/bridges/chord/dual',
        accountCredential,
        appCredential,
        {
          operationId: operation,
          bridgeId: bridge.bridgeId,
          expectedBridgeGeneration: bridge.generation,
          accountRecoveryVersion,
          recoverySaved: true
        }
      );
      await this.storage.setPendingBridge({
        bridgeId: result.bridge.bridgeId,
        state: result.bridge.state,
        generation: result.bridge.generation,
        membershipId: result.bridge.membershipId,
        accountRecoveryVersion,
        recoveryAcknowledged: true
      });
      return result;
    }

    async finalize({ accountCredential, appCredential, bridge, operationId }) {
      const result = await this.request(
        '/v2/accounts/bridges/chord/finalize',
        accountCredential,
        appCredential,
        {
          operationId: operationId || this.core.createOperationId(),
          bridgeId: bridge.bridgeId,
          expectedBridgeGeneration: bridge.generation
        }
      );
      await this.storage.clearPendingBridge();
      return result;
    }

    async rollback({ accountCredential, appCredential, bridge, operationId }) {
      const result = await this.request(
        '/v2/accounts/bridges/chord/rollback',
        accountCredential,
        appCredential,
        {
          operationId: operationId || this.core.createOperationId(),
          bridgeId: bridge.bridgeId,
          expectedBridgeGeneration: bridge.generation
        }
      );
      await this.storage.clearPendingBridge();
      return result;
    }

    async resume({ accountCredential, appCredential }) {
      const pending = await this.storage.getPendingBridge();
      if (!pending) return Object.freeze({ status: 'none' });
      try {
        const current = await this.state({ accountCredential, appCredential });
        if (current.bridge.state === 'finalized' || current.bridge.state === 'rolled_back') {
          await this.storage.clearPendingBridge();
        } else {
          await this.storage.setPendingBridge({
            ...pending,
            state: current.bridge.state,
            generation: current.bridge.generation
          });
        }
        return Object.freeze({ status: current.bridge.state, current });
      } catch (error) {
        if (error?.code === 'bridge_not_found') return Object.freeze({ status: 'not_committed' });
        throw error;
      }
    }

    async createAccountAndPrepare({
      appCredential,
      accountMaterial,
      recoverySaved,
      turnstileToken,
      deviceLabel
    }) {
      if (recoverySaved !== true) throw new Error('account_recovery_must_be_saved_first');
      const started = await this.accountClient.startAccount({
        appIds: ['chord'],
        deviceLabel,
        turnstileToken,
        material: accountMaterial,
        recoverySaved: true
      });
      const membership = started.memberships.find((entry) => entry.appId === 'chord');
      const summary = await this.accountClient.summary(accountMaterial.accountCredential);
      return this.prepare({
        accountCredential: accountMaterial.accountCredential,
        appCredential,
        membershipId: membership.id,
        accountGeneration: summary.account.generation
      });
    }
  }

  root.ChordAccountBridgeClient = ChordAccountBridgeClient;
})(globalThis);
