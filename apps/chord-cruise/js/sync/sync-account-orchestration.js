(function installChordAccountOrchestration(global) {
  'use strict';

  const accountRoot = global.SoundCruiseSyncAccount;
  const syncUi = global.SoundCruiseSyncUI;
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
      <button value="cancel" data-sync-action="continue" hidden>通常アプリへ進む</button>
      <a href="${portUrl}" data-sync-action="return" hidden>Cruise Portに戻る</a>
      <button value="cancel" data-sync-action="cancel">キャンセル</button>
    </form>`;
    document.body.append(dialog);
    return dialog;
  }

  async function run() {
    const settings = config();
    if (!settings || !accountRoot?.AccountClient || !accountRoot?.ChordAccountBridgeClient) return;
    if (settings.admissionMode === 'production') handoffToken = null;
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
          primaryAction: options.action ? {
            label: options.action.textContent,
            kind: 'primary',
            run: function () { options.action.click(); }
          } : null,
          secondaryAction: options.manage ? {
            id: 'manage', label: 'Cruise Portで管理', kind: 'secondary',
            run: function () { global.location.assign(settings.portUrl); }
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
      renderJoinSettings({ state: 'ready', status: '同期済み', action: null, manage: true });
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

    function showAttentionSettings(description, action) {
      renderJoinSettings({
        state: 'attention', status: '確認が必要',
        description: description || '同期する内容を確認してください。',
        action: action || attentionAction(), manage: true
      });
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
        var migrated = await chordClient.adoptAccountManagedIdentity({
          deviceId: consumed.appDeviceId,
          deviceCredential: consumed.appDeviceCredential,
          // `new_app` with an existing Chord credential is reached only after
          // the Account API rejected that legacy device. The local Chord data
          // is preserved; only its no-longer-valid sync identity is replaced.
          replaceRetiredLegacyCredential: true
        });
        if (!migrated.ok) throw new Error(migrated.code || 'migration_failed');
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
      // A legacy Chord credential can remain in this browser after its former
      // remote device was revoked. It cannot be bridged, but the user's local
      // data is still safe to connect through the normal Account-managed flow.
      return reason?.code === 'invalid_app_credential' || reason?.code === 'membership_state_invalid';
    }

    async function connectAsNewChordEnvironment(joinCode) {
      const consumed = await accountClient.consumeJoinInvitation({
        joinCode, appId: 'chord', deviceLabel: 'Chord Cruise',
        consumeMode: 'new_app', preservePending: true
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
          return connectAsNewChordEnvironment(joinCode);
        }
      }
      return connectAsNewChordEnvironment(joinCode);
    }

    function completeJoinDialog(dialog, summary, start, resume, result) {
      if (resume) resume.remove();
      summary.textContent = result?.requiresConfirmation
        ? '接続を保存しました。設定の「クラウド同期」で統合内容を確認してください。'
        : 'クラウド同期を設定しました。';
      start.hidden = true;
      dialog.querySelector('[data-sync-action="continue"]').hidden = false;
      dialog.querySelector('[data-sync-action="return"]').hidden = false;
    }

    function showJoinResume(dialog, summary, start, input, joinSecret, resumeKind) {
      joinSecret?.resolve();
      if (input) input.remove();
      start.hidden = true;
      summary.textContent = 'この端末の接続設定を安全に再開できます。接続コードをもう一度入力する必要はありません。';
      var error = dialog.querySelector('[data-sync-error]');
      error.hidden = false;
      error.textContent = '接続設定の続きが必要です。';
      var resume = document.createElement('button');
      resume.type = 'button';
      resume.dataset.syncAction = 'resume';
      resume.textContent = '同期の設定を再開';
      start.after(resume);
      resume.addEventListener('click', async () => {
        resume.disabled = true;
        try {
          var resumed = resumeKind === 'hydrate'
            ? await resumeAccountManagedHydrate()
            : await resumeNewAppConsume();
          error.hidden = true;
          completeJoinDialog(dialog, summary, start, resume, resumed);
        } catch (_) {
          error.hidden = false;
          error.textContent = '接続設定を再開できませんでした。データは削除していません。';
          resume.disabled = false;
        }
      });
      return resume;
    }

    function installJoinEntry(options) {
      if (document.querySelector('[data-sync-app-join-entry]')) return;
      var resumeOnly = options && options.resume === true;
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.syncAppJoinEntry = '';
      button.textContent = resumeOnly ? 'クラウド同期の設定を再開' : 'Cruise Portと接続';
      button.addEventListener('click', () => {
        const dialog = landing(settings.portUrl, resumeOnly ? 'handoff' : 'join');
        const summary = dialog.querySelector('[data-sync-summary]');
        const start = dialog.querySelector('[data-sync-action="start"]');
        const error = dialog.querySelector('[data-sync-error]');
        if (resumeOnly) {
          summary.textContent = 'この端末の接続設定を安全に再開できます。接続コードをもう一度入力する必要はありません。';
          start.textContent = '同期の設定を再開';
          start.addEventListener('click', async () => {
            start.disabled = true;
            try {
              var resumed = await resumeNewAppConsume();
              error.hidden = true;
              completeJoinDialog(dialog, summary, start, null, resumed);
            } catch (_) {
              error.hidden = false;
              error.textContent = '接続設定を再開できませんでした。データは削除していません。';
              start.disabled = false;
            }
          });
          dialog.showModal();
          return;
        }
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
          start.disabled = true;
          const joinCode = joinSecret.take();
          if (!joinCode) {
            dialog.querySelector('[data-sync-error]').hidden = false;
            dialog.querySelector('[data-sync-error]').textContent = '接続コードを入力してください。';
            start.disabled = false;
            return;
          }
          try {
            var connected = await connectWithJoin(joinCode);
            joinSecret.resolve();
            input.remove();
            if (connected?.requiresConfirmation) showAttentionSettings();
            else showConnectedJoinSettings();
            completeJoinDialog(dialog, summary, start, null, connected);
          } catch (reason) {
            if (reason && reason.accountJoinCommitted === true) {
              showJoinResume(dialog, summary, start, input, joinSecret, reason.accountJoinResume);
              return;
            }
            joinSecret.reject(reason);
            error.hidden = false;
            error.textContent = joinFailureMessage(reason);
            start.disabled = false;
          }
        });
        dialog.showModal();
      });
      renderJoinSettings({
        state: resumeOnly ? 'pending' : 'unconnected',
        status: resumeOnly ? '設定を再開してください' : '未接続',
        action: button
      });
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
        if (syncState === 'paired_pending') showAttentionSettings();
        else showConnectedJoinSettings();
        return;
      }
      if (accountManagedSetup === true && migrationState !== 'complete' && existing?.credential) {
        try { await resumeAccountManagedHydrate(); }
        catch (_) {
          showAttentionSettings('同期の設定を再確認してください。',
            uiAction('もう一度確認', resumeAccountManagedHydrate));
        }
        return;
      }
      installJoinEntry();
      return;
    }
    const dialog = landing(settings.portUrl);
    const start = dialog.querySelector('[data-sync-action="start"]');
    const summaryText = dialog.querySelector('[data-sync-summary]');
    const errorText = dialog.querySelector('[data-sync-error]');
    start.addEventListener('click', async () => {
      start.disabled = true;
      dialog.dataset.syncPhase = 'working';
      summaryText.textContent = '既存の同期状態を確認しています…';
      try {
        var setupResult = null;
        const chordStore = await chordClient.openStore();
        const existing = await chordStore.getMeta('deviceCredential');
        if (existing?.credential) {
          const consumed = await accountClient.consumeHandoff({
            handoffToken, appId: 'chord', deviceLabel: 'Chord Cruise',
            consumeMode: 'existing_chord', existingAppCredential: existing.credential,
            preservePending: true
          });
          if (consumed.operation !== 'bridge_required') throw new Error('bridge_required');
          await finishExistingBridge(existing, consumed);
        } else {
          const consumed = await accountClient.consumeHandoff({
            handoffToken, appId: 'chord', deviceLabel: 'Chord Cruise', consumeMode: 'new_app',
            preservePending: true
          });
          setupResult = await promoteNewAppConsume(consumed);
        }
        handoffToken = null;
        if (setupResult?.requiresConfirmation) showAttentionSettings();
        else showConnectedJoinSettings();
        dialog.dataset.syncPhase = 'complete';
        summaryText.textContent = setupResult?.requiresConfirmation
          ? '接続を保存しました。設定の「クラウド同期」で統合内容を確認してください。'
          : 'クラウド同期を設定しました。';
        start.hidden = true;
        dialog.querySelector('[data-sync-action="continue"]').hidden = false;
        dialog.querySelector('[data-sync-action="return"]').hidden = false;
      } catch (error) {
        dialog.dataset.syncPhase = 'attention';
        if (error && error.accountJoinCommitted === true) {
          showJoinResume(dialog, summaryText, start, null, null, error.accountJoinResume);
          return;
        }
        errorText.hidden = false;
        errorText.textContent = '接続を完了できませんでした。データは削除していません。Cruise Portから再度お試しください。';
        start.disabled = false;
      }
    });
    dialog.showModal();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
})(globalThis);
