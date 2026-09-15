(function installChordAccountOrchestration(global) {
  'use strict';

  const accountRoot = global.SoundCruiseSyncAccount;
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
    if (!effective || effective.enabled !== true || !['development', 'qa'].includes(effective.environment)) return null;
    try {
      const endpoint = new URL(effective.endpoint);
      if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(endpoint.hostname))) return null;
      return { endpoint: endpoint.toString().replace(/\/$/, ''), portUrl: effective.portUrl || '/apps/cruise-port/#sync-center' };
    } catch (_) { return null; }
  }

  function landing(portUrl) {
    const dialog = document.createElement('dialog');
    dialog.className = 'sound-cruise-sync-setup';
    dialog.dataset.syncPhase = 'confirm';
    dialog.innerHTML = `<form method="dialog" class="sound-cruise-sync-setup-panel">
      <h2>Sound Cruise Sync</h2>
      <p data-sync-summary>コードクルーズをSound Cruise Sync Accountへ安全に接続します。</p>
      <p data-sync-error role="alert" hidden></p>
      <button type="button" data-sync-action="start">接続を開始</button>
      <button value="cancel" data-sync-action="continue" hidden>通常アプリへ進む</button>
      <a href="${portUrl}" data-sync-action="return" hidden>Cruise Portに戻る</a>
      <button value="cancel" data-sync-action="cancel">今は行わない</button>
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
      qaScope: 'app', qaAppId: 'chord'
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
      document.querySelector('[data-sync-app-join-entry]')?.remove();
    }

    async function ensurePairingUi() {
      var installed = await global.ChordCruiseSyncPilot?.ensureManagementUi?.();
      if (installed !== true) throw new Error('pairing_ui_unavailable');
      await refreshPairingUi();
    }

    async function resumeAccountManagedHydrate() {
      var hydrated = await chordClient.resumeAccountManagedHydrate();
      await ensurePairingUi();
      removeJoinEntry();
      if (!hydrated.ok) {
        throw committedJoinFailure(new Error(hydrated.code || 'account_managed_hydrate_failed'), 'hydrate');
      }
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
          deviceCredential: consumed.appDeviceCredential
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

    async function connectWithJoin(joinCode) {
      const chordStore = await chordClient.openStore();
      const existing = await chordStore.getMeta('deviceCredential');
      if (existing?.credential) {
        const consumed = await accountClient.consumeJoinInvitation({
          joinCode, appId: 'chord', deviceLabel: 'Chord Cruise',
          consumeMode: 'existing_chord', existingAppCredential: existing.credential,
          preservePending: true
        });
        if (consumed.operation !== 'bridge_required') throw new Error('bridge_required');
        await finishExistingBridge(existing, consumed);
        return;
      }
      const consumed = await accountClient.consumeJoinInvitation({
        joinCode, appId: 'chord', deviceLabel: 'Chord Cruise',
        consumeMode: 'new_app', preservePending: true
      });
      return promoteNewAppConsume(consumed);
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
      button.className = 'cc-sync-primary-action';
      button.textContent = resumeOnly ? 'クラウド同期の設定を再開' : 'Cruise Portと接続';
      button.addEventListener('click', () => {
        const dialog = landing(settings.portUrl);
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
        summary.textContent = 'Cruise Portに表示された既存データ接続コードを入力してください。';
        const input = document.createElement('input');
        input.autocomplete = 'off';
        input.autocapitalize = 'characters';
        input.spellcheck = false;
        input.dataset.sensitive = 'true';
        input.setAttribute('data-sync-sensitive', 'join-code-input');
        input.setAttribute('aria-label', '既存データ接続コード');
        summary.after(input);
        const joinSecret = accountRoot.core.createSensitiveInputController(input);
        start.textContent = '既存データを接続';
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
            completeJoinDialog(dialog, summary, start, null, connected);
          } catch (reason) {
            if (reason && reason.accountJoinCommitted === true) {
              showJoinResume(dialog, summary, start, input, joinSecret, reason.accountJoinResume);
              return;
            }
            joinSecret.reject(reason);
            error.hidden = false;
            error.textContent = '接続を完了できませんでした。データは削除していません。';
            start.disabled = false;
          }
        });
        dialog.showModal();
      });
      const host = document.querySelector('.cc-sync-settings-entry') || document.querySelector('main') || document.body;
      host.append(button);
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
        return;
      }
      const accountManagedSetup = await chordStore.getMeta('accountManagedSetup');
      const migrationState = await chordStore.getMeta('migrationState');
      // A completed Account-managed Chord environment already owns a valid
      // app credential.  Do not regress it to a new Join prompt while the
      // runtime/pairing UI is still restoring after a reload.
      if (accountManagedSetup === true && migrationState === 'complete' && existing?.credential) {
        await ensurePairingUi();
        removeJoinEntry();
        return;
      }
      if (accountManagedSetup === true && migrationState !== 'complete' && existing?.credential) {
        try { await resumeAccountManagedHydrate(); }
        catch (_) { await ensurePairingUi(); removeJoinEntry(); }
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
