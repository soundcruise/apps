(function installChordAccountOrchestration(global) {
  'use strict';

  const accountRoot = global.SoundCruiseSyncAccount;
  const syncUi = global.SoundCruiseSyncUI;
  const RETIRED_LEGACY_BRIDGE_META = 'retiredLegacyAccountBridge';
  let handoffToken = null;
  try { handoffToken = accountRoot?.core?.takeHandoffFromLocation() || null; }
  catch (_) { handoffToken = null; }
  function config() {
    const value = global.__SOUND_CRUISE_MULTI_APP_SYNC__;
    const qaRequested = global.location?.hostname === 'soundcruise.jp' &&
      new URLSearchParams(global.location.search || '').get('sound-cruise-qa') === '1';
    const effective = qaRequested ? {
      enabled: true, environment: 'qa',
      endpoint: 'https://sound-cruise-sync.cruise-port-requests.workers.dev',
      portUrl: '/apps/cruise-port/?sound-cruise-qa=1#sync-center'
    } : value;
    if (!effective || effective.enabled !== true ||
        !['development', 'qa', 'production'].includes(effective.environment)) return null;
    try {
      const endpoint = new URL(effective.endpoint);
      if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(endpoint.hostname))) return null;
      return {
        endpoint: endpoint.toString().replace(/\/$/, ''),
        portUrl: effective.portUrl || '/apps/cruise-port/#sync-center',
        admissionMode: effective.environment === 'production' ? 'production' : 'qa'
      };
    } catch (_) { return null; }
  }

  function landing(portUrl, mode = 'handoff') {
    if (syncUi?.createJoinDialog) return syncUi.createJoinDialog({ portUrl, mode });
    const dialog = document.createElement('dialog');
    dialog.className = 'sound-cruise-sync-setup';
    dialog.dataset.syncPhase = 'confirm';
    dialog.innerHTML = `<form method="dialog" class="sound-cruise-sync-setup-panel">
      <h2>${mode === 'join' ? '接続コードを入力' : 'クラウド同期'}</h2>
      <p data-sync-summary>コードクルーズをSound Cruise Sync Accountへ安全に接続します。</p>
      <p data-sync-error role="alert" hidden></p>
      <button type="button" data-sync-action="start">${mode === 'join' ? '接続する' : '同期を開始'}</button>
      <button type="button" data-sync-action="continue" hidden>通常アプリへ進む</button>
      <a href="${portUrl}" data-sync-action="return" hidden>Cruise Portに戻る</a>
      <button value="cancel" data-sync-action="cancel">キャンセル</button>
    </form>`;
    document.body.append(dialog);
    return dialog;
  }

  async function run() {
    const settings = config();
    if (!settings || !accountRoot?.AccountClient || !accountRoot?.ChordAccountBridgeClient) return;
    const ready = await global.ChordCruiseSyncPilot?.ready;
    const chordClient = global.ChordCruiseSync?.pilotClient;
    if (!ready?.enabled || !chordClient) return;
    const accountClient = new accountRoot.AccountClient({
      endpoint: settings.endpoint, storage: accountRoot.storage, core: accountRoot.core,
      admissionMode: settings.admissionMode, qaScope: 'app', qaAppId: 'chord'
    });
    async function finishExistingBridge(existing, consumed) {
      const account = await accountRoot.storage.getAccount();
      const accountSummary = await accountClient.summary(account.accountCredential);
      const bridgeClient = new accountRoot.ChordAccountBridgeClient({
        accountClient, storage: accountRoot.storage, core: accountRoot.core
      });
      const prepared = await bridgeClient.prepare({
        accountCredential: account.accountCredential,
        appCredential: existing.credential,
        membershipId: consumed.membershipId || consumed.membership?.id,
        accountGeneration: accountSummary.account.generation
      });
      const dual = await bridgeClient.commitDual({
        accountCredential: account.accountCredential,
        appCredential: existing.credential,
        bridge: prepared.bridge,
        accountRecoveryVersion: prepared.bridge.accountRecoveryVersion,
        recoverySaved: true
      });
      await bridgeClient.finalize({
        accountCredential: account.accountCredential,
        appCredential: existing.credential,
        bridge: dual.bridge
      });
      await accountClient.confirmConsumePersisted();
    }

    async function refreshPairingUi() {
      var pairingUi = global.ChordCruiseSync && global.ChordCruiseSync.pairingUi;
      if (pairingUi && typeof pairingUi.refresh === 'function') await pairingUi.refresh();
    }

    function committedJoinFailure(reason, resumeKind) {
      var error = reason instanceof Error ? reason : new Error('account_join_promotion_failed');
      error.accountJoinCommitted = true;
      error.accountJoinResume = resumeKind || 'consume';
      return error;
    }

    function removeJoinEntry() {
      var entry = document.querySelector('[data-sync-app-join-entry]');
      var card = entry && entry.closest ? entry.closest('[data-sync-settings-state]') : null;
      if (card) card.remove();
      else if (entry) entry.remove();
    }

    function renderJoinSettings(options) {
      var host = document.querySelector('[data-sync-join-entry-host]');
      if (!host) return false;
      if (syncUi?.renderCard) {
        syncUi.renderCard(host, {
          state: options.state,
          statusLabel: options.status,
          description: options.description,
          privacyHref: '../privacy.html?edition=pro',
          onStatusClick: options.state === 'attention' && options.action
            ? function () { options.action.click(); } : null,
          primaryAction: options.action ? {
            label: options.action.textContent,
            kind: 'primary',
            run: function () { options.action.click(); }
          } : null,
          secondaryAction: options.detach ? {
            id: 'current-environment-detach', label: 'この環境の同期を解除', kind: 'secondary',
            run: options.detach
          } : null
        });
        return true;
      }
      host.textContent = '';
      var section = document.createElement('section');
      section.className = 'sound-cruise-sync-settings-card';
      section.dataset.syncSettingsState = options.state;
      var header = document.createElement('div');
      header.className = 'sound-cruise-sync-settings-head';
      var title = document.createElement('strong');
      title.textContent = 'クラウド同期';
      var status = document.createElement('span');
      status.dataset.syncAccountStatus = '';
      status.textContent = options.status;
      header.append(title, status);
      section.append(header);
      if (options.action) {
        options.action.className = 'sound-cruise-sync-join-entry';
        options.action.dataset.syncAppJoinEntry = '';
        section.append(options.action);
      }
      host.append(section);
      return true;
    }

    function showConnectedJoinSettings() {
      renderJoinSettings({ state: 'ready', status: '同期済み', action: null,
        detach: openCurrentEnvironmentDetach });
      chordClient.openStore().then(function (store) { return store.listConflicts(); }).then(function (conflicts) {
        if (conflicts.length) showAttentionSettings(null, null, conflicts.length);
      }).catch(function () {});
    }

    function openCurrentEnvironmentDetach() {
      if (!syncUi?.openCurrentEnvironmentDetachDialog) return;
      syncUi.openCurrentEnvironmentDetachDialog({
        document: document,
        onConfirm: async function () {
          var store = await chordClient.openStore();
          var current = await store.getMeta('deviceCredential');
          if (await store.getMeta('accountManagedSetup') !== true || !current?.credential) {
            throw new Error('account_environment_detach_unavailable');
          }
          await accountClient.detachCurrentAppEnvironment({
            appCredential: current.credential, operationId: accountRoot.core.createOperationId()
          });
          var cleared = await chordClient.clearCloudState();
          if (!cleared?.ok) throw new Error(cleared?.code || 'client_storage_failed');
          installJoinEntry();
        }
      });
    }

    function isTerminalSyncCode(code) {
      return accountRoot?.terminalState?.isApp?.(code) === true || [
        'account_deleting', 'account_deleted', 'membership_deleting', 'membership_deleted',
        'app_device_revoked', 'app_identity_deleting', 'app_identity_deleted'
      ].indexOf(code) !== -1;
    }

    async function ensurePairingUi() {
      var installed = await global.ChordCruiseSyncPilot?.ensureManagementUi?.();
      if (installed !== true) throw new Error('pairing_ui_unavailable');
      await refreshPairingUi();
    }

    function uiAction(label, run) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', async () => {
        button.disabled = true;
        try { await run(); }
        finally {
          button.disabled = false;
        }
      });
      return button;
    }

    function attentionAction() {
      return uiAction('内容を確認', async () => {
        await ensurePairingUi();
        await global.ChordCruiseSync?.pairingUi?.openAttention?.();
      });
    }

    function showAttentionSettings(description, action, count) {
      renderJoinSettings({
        state: 'attention', status: count > 0 ? '確認が必要 ' + count + '件' : '確認が必要',
        description: description || '同期する内容を確認してください。',
        action: action || attentionAction(), manage: true
      });
      if (count === undefined) chordClient.openStore().then(async function (store) {
        const conflicts = await store.listConflicts();
        if (conflicts.length) return conflicts.length;
        const activeId = await store.getMeta('activeMergeSessionId');
        const session = activeId ? await store.getMergeSession(activeId) : null;
        return session?.stage === 'awaiting_confirmation' ? session.plan?.conflicts?.length || 0 : 0;
      }).then(function (resolvedCount) {
        if (resolvedCount > 0 && document.querySelector('[data-sync-join-entry-host]')?.dataset.syncJoinUiState === 'attention') {
          showAttentionSettings(description, action, resolvedCount);
        }
      }).catch(function () {});
    }

    async function resumeAccountManagedHydrate() {
      var hydrated = await chordClient.resumeAccountManagedHydrate();
      if (!hydrated.ok) {
        throw committedJoinFailure(new Error(hydrated.code || 'account_managed_hydrate_failed'), 'hydrate');
      }
      if (hydrated.requiresConfirmation) showAttentionSettings();
      else showConnectedJoinSettings();
      return hydrated;
    }

    async function promoteNewAppConsume(consumed) {
      var consumePersisted = false;
      try {
        if (!consumed || !consumed.appDeviceId || !consumed.appDeviceCredential) {
          throw new Error('account_join_consume_invalid');
        }
        var chordStore = await chordClient.openStore();
        var existing = await chordStore.getMeta('deviceCredential');
        var bridge = await chordStore.getMeta(RETIRED_LEGACY_BRIDGE_META);
        var replaceRetiredLegacy = Boolean(
          bridge && bridge.serverConfirmed === true &&
          bridge.retiredDeviceId === existing?.deviceId &&
          bridge.nextDeviceId === consumed.appDeviceId
        );
        if (bridge && !replaceRetiredLegacy) {
          await chordStore.setMeta(RETIRED_LEGACY_BRIDGE_META, null);
        }
        var migrated = await chordClient.adoptAccountManagedIdentity({
          deviceId: consumed.appDeviceId,
          deviceCredential: consumed.appDeviceCredential,
          // A different local identity may be replaced only when the Account
          // API verified the exact old credential as retired Legacy state.
          replaceRetiredLegacyCredential: replaceRetiredLegacy
        });
        if (!migrated.ok) throw new Error(migrated.code || 'migration_failed');
        if (replaceRetiredLegacy) {
          await chordStore.setMeta(RETIRED_LEGACY_BRIDGE_META, null);
        }
        await accountClient.confirmConsumePersisted();
        consumePersisted = true;
        var hydrated = await resumeAccountManagedHydrate();
        return Object.assign({}, migrated, hydrated);
      } catch (error) {
        // The Account client saved an operation-bound, credential-bearing
        // candidate before POSTing.  Once consume returned, this is no longer
        // a code-input failure: retain that candidate and resume the same B
        // device instead of issuing or consuming another Join invitation.
        throw committedJoinFailure(error, consumePersisted ? 'hydrate' : 'consume');
      }
    }

    async function resumeNewAppConsume() {
      var resumed = await accountClient.resumePendingConsume({ preservePending: true });
      if (resumed.status !== 'committed' || resumed.membership?.appId !== 'chord' ||
          !resumed.appDeviceId || !resumed.appDeviceCredential) {
        throw committedJoinFailure(new Error('account_join_resume_unavailable'));
      }
      return promoteNewAppConsume(resumed);
    }

    function canRetryAsNewChordEnvironment(reason) {
      return reason?.code === 'retired_legacy_device';
    }

    async function prepareRetiredLegacyReplacement(existing) {
      if (!existing?.deviceId) throw new Error('retired_legacy_identity_invalid');
      var appMaterial = accountRoot.core.createAppCredential();
      var chordStore = await chordClient.openStore();
      await chordStore.setMeta(RETIRED_LEGACY_BRIDGE_META, {
        serverConfirmed: true,
        retiredDeviceId: existing.deviceId,
        nextDeviceId: appMaterial.appDeviceId
      });
      return appMaterial;
    }

    async function connectAsNewChordEnvironment(joinCode, options) {
      var appMaterial = options?.serverConfirmedRetiredLegacy === true
        ? await prepareRetiredLegacyReplacement(options.existing)
        : null;
      const consumed = await accountClient.consumeJoinInvitation({
        joinCode, appId: 'chord', deviceLabel: 'Chord Cruise',
        consumeMode: 'new_app', preservePending: true,
        ...(appMaterial ? { appMaterial } : {})
      });
      return promoteNewAppConsume(consumed);
    }

    function joinFailureMessage(reason) {
      const messages = {
        app_join_expired: '接続コードの有効期限が切れました。Cruise Portで新しいコードを発行してください。',
        app_join_cancelled: '接続コードは取り消されました。Cruise Portで新しいコードを発行してください。',
        app_join_consumed: 'この接続コードはすでに使用されています。Cruise Portで新しいコードを発行してください。',
        wrong_app: 'このコードは別のアプリ用です。コードクルーズの同期コードを使用してください。',
        app_join_already_active: 'コードクルーズの接続コードがすでに開かれています。Cruise Portで状態を確認してください。',
        account_runtime_paused: '現在、新しいクラウド同期の受付を一時停止しています。',
        rate_limited: '少し時間をおいてから、もう一度お試しください。'
      };
      return messages[reason?.code] || '接続を完了できませんでした。データは削除していません。';
    }

    async function connectWithJoin(joinCode) {
      const chordStore = await chordClient.openStore();
      const existing = await chordStore.getMeta('deviceCredential');
      if (existing?.credential) {
        try {
          const consumed = await accountClient.consumeJoinInvitation({
            joinCode, appId: 'chord', deviceLabel: 'Chord Cruise',
            consumeMode: 'existing_chord', existingAppCredential: existing.credential,
            preservePending: true
          });
          if (consumed.operation !== 'bridge_required') throw new Error('bridge_required');
          await finishExistingBridge(existing, consumed);
          return;
        } catch (reason) {
          if (!canRetryAsNewChordEnvironment(reason)) throw reason;
          return connectAsNewChordEnvironment(joinCode, {
            serverConfirmedRetiredLegacy: true,
            existing
          });
        }
      }
      return connectAsNewChordEnvironment(joinCode);
    }

    function completeJoinDialog(dialog, summary, start, resume, result) {
      if (syncUi?.completeJoinDialog) {
        syncUi.completeJoinDialog(dialog, {
          title: result?.requiresConfirmation ? 'クラウド同期の確認が必要です' : 'クラウド同期'
        });
        return;
      }
      if (resume) resume.remove();
      summary.textContent = result?.requiresConfirmation
        ? '接続を保存しました。設定の「クラウド同期」で統合内容を確認してください。'
        : 'クラウド同期を設定しました。';
      start.hidden = true;
      dialog.querySelector('[data-sync-action="continue"]').hidden = false;
      dialog.querySelector('[data-sync-action="continue"]').textContent = '閉じる';
      dialog.querySelector('[data-sync-action="return"]').hidden = true;
      dialog.querySelector('[data-sync-action="cancel"]').hidden = true;
    }

    function showJoinAttention(dialog, summary, start, input, joinSecret, resumeKind) {
      joinSecret?.resolve();
      if (input) input.remove();
      start.hidden = true;
      summary.textContent = '接続を完了できませんでした。データは削除していません。';
      var error = dialog.querySelector('[data-sync-error]');
      error.hidden = false;
      error.textContent = '同期の状態を確認してください。';
      var retry = document.createElement('button');
      retry.type = 'button';
      retry.dataset.syncAction = 'retry';
      retry.textContent = 'もう一度確認';
      start.after(retry);
      retry.addEventListener('click', async () => {
        retry.disabled = true;
        try {
          var resumed = resumeKind === 'hydrate'
            ? await resumeAccountManagedHydrate()
            : await resumeNewAppConsume();
          error.hidden = true;
          completeJoinDialog(dialog, summary, start, retry, resumed);
        } catch (_) {
          error.hidden = false;
          error.textContent = '同期の状態を確認できませんでした。データは削除していません。';
          retry.disabled = false;
        }
      });
      return retry;
    }

    function showPendingJoinAttention() {
      var retry = uiAction('もう一度確認', async () => {
        try {
          var resumed = await resumeNewAppConsume();
          if (resumed?.requiresConfirmation) showAttentionSettings();
          else showConnectedJoinSettings();
        } catch (_) {
          showPendingJoinAttention();
        }
      });
      showAttentionSettings('同期の状態を確認できませんでした。データは削除していません。', retry);
    }

    function installJoinEntry(options) {
      if (document.querySelector('[data-sync-app-join-entry]')) return;
      var resumeOnly = options && options.resume === true;
      if (resumeOnly) {
        showPendingJoinAttention();
        return;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.syncAppJoinEntry = '';
      button.textContent = 'Cruise Portと接続';
      button.addEventListener('click', () => {
        const dialog = landing(settings.portUrl, 'join');
        dialog.querySelector('[data-sync-action="continue"]')?.addEventListener('click', () => dialog.close());
        const summary = dialog.querySelector('[data-sync-summary]');
        const start = dialog.querySelector('[data-sync-action="start"]');
        const error = dialog.querySelector('[data-sync-error]');
        summary.textContent = 'Cruise Portに表示された接続コードを入力してください。';
        const input = dialog.querySelector('[data-sync-join-code]') || document.createElement('input');
        if (!input.parentNode) {
          input.autocomplete = 'off';
          input.autocapitalize = 'characters';
          input.spellcheck = false;
          input.dataset.sensitive = 'true';
          input.setAttribute('data-sync-sensitive', 'join-code-input');
          input.setAttribute('aria-label', '接続コード');
          summary.after(input);
        }
        const joinSecret = accountRoot.core.createSensitiveInputController(input);
        start.textContent = '接続する';
        start.addEventListener('click', async () => {
          const joinCode = joinSecret.take();
          if (!joinCode) {
            dialog.querySelector('[data-sync-error]').hidden = false;
            dialog.querySelector('[data-sync-error]').textContent = '接続コードを入力してください。';
            start.disabled = false;
            return;
          }
          start.disabled = true;
          syncUi?.setJoinProcessing?.(dialog, {
            title: 'クラウド同期を設定しています…',
            description: '保存内容を確認しています。しばらくお待ちください。'
          });
          try {
            var connected = await connectWithJoin(joinCode);
            joinSecret.resolve();
            input.remove();
            if (connected?.requiresConfirmation) showAttentionSettings();
            else showConnectedJoinSettings();
            syncUi?.completeJoinDialog?.(dialog);
          } catch (reason) {
            if (reason && reason.accountJoinCommitted === true) {
              showJoinAttention(dialog, summary, start, input, joinSecret, reason.accountJoinResume);
              return;
            }
            joinSecret.reject(reason);
            syncUi?.restoreJoinInput?.(dialog);
            error.hidden = false;
            error.textContent = joinFailureMessage(reason);
            start.disabled = false;
          }
        });
        dialog.showModal();
      });
      renderJoinSettings({
        state: 'unconnected',
        status: '未接続',
        description: options?.terminal === true
          ? '以前のクラウド同期は利用できません。Cruise Portから接続し直してください。'
          : undefined,
        action: button
      });
    }
    function showTerminalReconnect() {
      installJoinEntry({ terminal: true });
    }
    global.addEventListener?.('soundcruise:sync-terminal', function () {
      showTerminalReconnect();
    });
    global.addEventListener?.('soundcruise:sync-status', function (event) {
      if (event.detail?.appId !== 'chord') return;
      if (event.detail.state === 'attention' && event.detail.count > 0) {
        showAttentionSettings(null, null, event.detail.count);
      } else if (event.detail.state === 'clean') {
        showConnectedJoinSettings();
      } else if (event.detail.state === 'pending') {
        renderJoinSettings({ state: 'syncing', status: '同期中', action: null });
      }
    });
    if (handoffToken) {
      const launchStore = await chordClient.openStore();
      const launchCredential = await launchStore.getMeta('deviceCredential');
      // Any existing Chord identity wins over a transient Port grant. This
      // preserves both Account-managed and Legacy environments and guarantees
      // that a normal Port launch never replaces a usable local identity.
      if (launchCredential?.credential) handoffToken = null;
    }
    if (!handoffToken) {
      const chordStore = await chordClient.openStore();
      let existing = await chordStore.getMeta('deviceCredential');
      let resumed;
      try {
        resumed = await accountClient.resumePendingConsume({ preservePending: true });
      } catch (_) {
        const pending = await accountRoot.storage.getPendingConsume?.();
        if (pending?.appId === 'chord' && pending?.consumeMode === 'new_app') {
          installJoinEntry({ resume: true });
          return;
        }
        throw _;
      }
      if (resumed.status === 'committed' && resumed.membership?.appId === 'chord' && resumed.appDeviceCredential) {
        try {
          await resumeNewAppConsume();
          return;
        } catch (_) {
          installJoinEntry({ resume: true });
          return;
        }
      }
      if (resumed.status === 'bridge_required' && resumed.membership?.appId === 'chord' && existing?.credential) {
        await finishExistingBridge(existing, resumed);
        showConnectedJoinSettings();
        return;
      }
      const accountManagedSetup = await chordStore.getMeta('accountManagedSetup');
      const migrationState = await chordStore.getMeta('migrationState');
      const syncState = await chordStore.getMeta('syncState');
      // A completed Account-managed Chord environment already owns a valid
      // app credential.  Do not regress it to a new Join prompt while the
      // runtime/pairing UI is still restoring after a reload.
      if (accountManagedSetup === true && migrationState === 'complete' && existing?.credential) {
        const verified = await chordClient.getServerSnapshot();
        if (verified?.ok === false && isTerminalSyncCode(verified.code)) {
          showTerminalReconnect();
        } else if (verified?.ok === false) {
          showAttentionSettings('同期状態を確認できませんでした。データは削除していません。',
            uiAction('もう一度確認', function () { return global.location.reload(); }));
        } else if (syncState === 'paired_pending') showAttentionSettings();
        else showConnectedJoinSettings();
        return;
      }
      if (accountManagedSetup === true && migrationState !== 'complete' && existing?.credential) {
        try { await resumeAccountManagedHydrate(); }
        catch (reason) {
          if (isTerminalSyncCode(reason?.code)) showTerminalReconnect();
          else showAttentionSettings('同期の設定を再確認してください。',
            uiAction('もう一度確認', resumeAccountManagedHydrate));
        }
        return;
      }
      installJoinEntry();
      return;
    }
    renderJoinSettings({ state: 'connecting', status: '再接続しています…', action: null });
    const launchToken = handoffToken;
    handoffToken = null;
    try {
      const consumed = await accountClient.consumeHandoff({
        handoffToken: launchToken, appId: 'chord', deviceLabel: 'Chord Cruise',
        consumeMode: 'new_app', preservePending: true
      });
      const setupResult = await promoteNewAppConsume(consumed);
      if (setupResult?.requiresConfirmation) showAttentionSettings();
      else showConnectedJoinSettings();
    } catch (error) {
      if (error?.accountJoinCommitted === true) showPendingJoinAttention();
      else if (error?.code === 'app_environment_limit') {
        showAttentionSettings(
          'Cruise Portで使っていない環境の同期を解除してから、もう一度お試しください。',
          uiAction('Cruise Portで環境を管理', function () {
            global.location.assign(settings.portUrl);
          })
        );
      }
      else installJoinEntry();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
})(globalThis);
