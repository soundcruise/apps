(function installMultiAppSyncBootstrap(global) {
  'use strict';

  const syncRoot = global.SoundCruiseMultiAppSync = global.SoundCruiseMultiAppSync || {};
  const accountRoot = global.SoundCruiseSyncAccount;
  const syncUi = global.SoundCruiseSyncUI;
  const APP_ROOTS = Object.freeze({
    pitch: ['SoundCruisePitchSync', 'PitchSyncAdapter'],
    rhythm: ['SoundCruiseRhythmSync', 'RhythmSyncAdapter'],
    fretboard: ['SoundCruiseFretboardSync', 'FretboardSyncAdapter']
  });
  const JOIN_HOST_SELECTOR = '[data-sync-join-entry-host]';
  let settingsPresentation = null;
  let settingsObserver = null;
  let settingsRevision = 0;
  let connectedAccountDisplayId = null;
  let activeRuntime = null;
  let activeConfig = null;
  let hostSession = null;
  let attentionRevision = 0;

  let handoffToken = null;
  try { handoffToken = accountRoot?.core?.takeHandoffFromLocation() || null; }
  catch (_) { handoffToken = null; }

  function readConfig() {
    const value = global.__SOUND_CRUISE_MULTI_APP_SYNC__;
    const appId = document.documentElement.dataset.syncAppId;
    const qaRequested = global.location?.hostname === 'soundcruise.jp' &&
      new URLSearchParams(global.location.search || '').get('sound-cruise-qa') === '1';
    const effective = qaRequested ? {
      enabled: true, environment: 'qa',
      endpoint: 'https://sound-cruise-sync.cruise-port-requests.workers.dev',
      portUrl: '/apps/cruise-port/?sound-cruise-qa=1#sync-center'
    } : value;
    if (!effective || effective.enabled !== true ||
        !['development', 'qa', 'production'].includes(effective.environment) || !APP_ROOTS[appId]) return null;
    try {
      const endpoint = new URL(effective.endpoint);
      if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(endpoint.hostname))) {
        return null;
      }
      return {
        appId,
        endpoint: endpoint.toString().replace(/\/$/, ''),
        portUrl: effective.portUrl || '/apps/cruise-port/#sync-center',
        admissionMode: effective.environment === 'production' ? 'production' : 'qa'
      };
    } catch (_) { return null; }
  }

  function createLanding(appId, portUrl, mode = 'handoff') {
    if (syncUi?.createJoinDialog) return syncUi.createJoinDialog({ portUrl, mode });
    const dialog = document.createElement('dialog');
    dialog.className = 'sound-cruise-sync-setup';
    dialog.dataset.syncPhase = 'confirm';
    dialog.innerHTML = `
      <form method="dialog" class="sound-cruise-sync-setup-panel">
        <h2>${mode === 'join' ? '接続コードを入力' : 'クラウド同期'}</h2>
        <p data-sync-summary>${mode === 'join' ? 'Cruise Portに表示された既存データ接続コードを入力してください。' : 'このアプリをクラウド同期します。保存内容はこのアプリ内で確認し、安全に初回同期します。'}</p>
        <label data-sync-join-field ${mode === 'join' ? '' : 'hidden'}>接続コード
          <input data-sync-join-code autocomplete="off" autocapitalize="characters" spellcheck="false" data-sensitive="true" data-sync-sensitive="join-code-input">
        </label>
        <p data-sync-error role="alert" hidden></p>
        <button type="button" data-sync-action="start">${mode === 'join' ? '接続する' : '同期を開始'}</button>
        <button type="button" data-sync-action="continue" hidden>通常アプリへ進む</button>
        <a data-sync-action="return" href="${portUrl}" hidden>Cruise Portに戻る</a>
        <button value="cancel" data-sync-action="cancel">キャンセル</button>
      </form>`;
    document.body.append(dialog);
    return dialog;
  }

  function renderSettingsPresentation() {
    if (!settingsPresentation) return false;
    const host = document.querySelector(JOIN_HOST_SELECTOR);
    if (!host) return false;
    if (host.dataset.syncJoinUiRevision === String(settingsRevision)) return true;
    if (syncUi?.renderCard) {
      syncUi.renderCard(host, {
        state: settingsPresentation.state,
        statusLabel: settingsPresentation.status,
        description: settingsPresentation.description,
        accountDisplayId: settingsPresentation.accountDisplayId,
        privacyHref: '../privacy.html?edition=pro',
        onStatusClick: settingsPresentation.state === 'attention' ? settingsPresentation.action?.run : null,
        primaryAction: settingsPresentation.action ? {
          label: settingsPresentation.action.label,
          kind: 'primary',
          run: settingsPresentation.action.run
        } : null,
        secondaryAction: settingsPresentation.detach ? {
          id: 'current-environment-detach', label: 'この環境の同期を解除', kind: 'secondary',
          run: settingsPresentation.detach
        } : null
      });
      host.dataset.syncJoinUiAction = settingsPresentation.action?.label || '';
      host.dataset.syncJoinUiRevision = String(settingsRevision);
      return true;
    }
    host.textContent = '';
    host.dataset.syncJoinUiState = settingsPresentation.state;
    const section = document.createElement('section');
    section.className = 'sound-cruise-sync-settings-card';
    section.dataset.syncSettingsState = settingsPresentation.state;
    const header = document.createElement('div');
    header.className = 'sound-cruise-sync-settings-head';
    const title = document.createElement('strong');
    title.textContent = 'クラウド同期';
    const status = document.createElement('span');
    status.dataset.syncAccountStatus = '';
    status.textContent = settingsPresentation.status;
    header.append(title, status);
    section.append(header);
    if (settingsPresentation.accountDisplayId) {
      const accountId = document.createElement('p');
      accountId.className = 'sound-cruise-sync-account-id';
      accountId.textContent = `アカウント：${settingsPresentation.accountDisplayId}`;
      section.append(accountId);
    }
    if (settingsPresentation.action) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.syncAppJoinEntry = '';
      button.className = 'sound-cruise-sync-join-entry';
      button.textContent = settingsPresentation.action.label;
      button.addEventListener('click', settingsPresentation.action.run);
      section.append(button);
    }
    host.append(section);
    return true;
  }

  function setSettingsPresentation(presentation) {
    settingsPresentation = presentation;
    global.SoundCruiseNativeSyncHost?.present({state: presentation.state, status: presentation.status});
    settingsRevision += 1;
    renderSettingsPresentation();
    if (!settingsObserver && typeof MutationObserver === 'function' && document.body) {
      settingsObserver = new MutationObserver(renderSettingsPresentation);
      settingsObserver.observe(document.body, { childList: true, subtree: true });
    }
  }

  function showConnectedSettings(accountId = null) {
    if (accountId) connectedAccountDisplayId = accountRoot?.core?.formatAccountDisplayId?.(accountId) || null;
    setSettingsPresentation({
      state: 'ready', status: '同期済み', action: null, detach: openCurrentEnvironmentDetach,
      accountDisplayId: connectedAccountDisplayId
    });
  }

  function openCurrentEnvironmentDetach() {
    if (!activeRuntime || !activeConfig || !syncUi?.openCurrentEnvironmentDetachDialog) return;
    syncUi.openCurrentEnvironmentDetachDialog({
      document,
      onConfirm: async () => {
        await activeRuntime.detachCurrentEnvironment();
        connectedAccountDisplayId = null;
        installJoinEntry(activeConfig, activeRuntime);
      }
    });
  }

  function showPendingSettings() {
    setSettingsPresentation({
      state: 'connecting', status: '接続中', action: null,
      accountDisplayId: connectedAccountDisplayId
    });
  }

  function bindSettingsRuntime(runtime, conflictController, config) {
    const connectedPresentation = (presentation) => ({
      ...presentation, detach: openCurrentEnvironmentDetach, accountDisplayId: connectedAccountDisplayId
    });
    const show = (state, detail = {}) => {
      if (hostSession?.review) return;
      const revision = ++attentionRevision;
      if (state === 'ready') return showConnectedSettings();
      if (state === 'syncing') return setSettingsPresentation(connectedPresentation({ state: 'syncing', status: '同期中' }));
      if (state === 'paused') return setSettingsPresentation(connectedPresentation({ state: 'paused', status: '一時停止中' }));
      if (state === 'offline') return setSettingsPresentation(connectedPresentation({ state: 'offline', status: 'オフライン' }));
      if (hostSession && (state === 'retrying' || state === 'pending')) return setSettingsPresentation(connectedPresentation({
        state: 'attention', status: state === 'pending' ? '未送信の変更があります' : '通信を確認してください',
        description: '保存内容は保持しています。接続後に再開します。',
        action: { label: 'もう一度確認', run: () => runtime.sync('manual-retry') }
      }));
      if (state === 'credential_invalid') return setSettingsPresentation({
        state: 'reconnect', status: '再接続が必要',
        description: '以前のクラウド同期は利用できません。Cruise Portから接続し直してください。',
        action: { label: 'Cruise Portと接続', run: () => {
          const dialog = createLanding(config.appId, config.portUrl, 'join');
          bindLanding(dialog, config, runtime, 'join');
          dialog.showModal();
        } }
      });
      if (state === 'attention') {
        runtime.attentionSummary().then((attention) => {
          if (revision !== attentionRevision) return;
          setSettingsPresentation(connectedPresentation({
            state: 'attention', status: attention.status, description: attention.description,
            action: attention.kind === 'data_repair' && attention.reviewable && conflictController
              ? { label: '問題のデータを確認', run: () => conflictController.refresh() }
              : attention.kind === 'conflict' && conflictController
                ? { label: '同期内容を確認', run: () => conflictController.refresh() }
                : attention.kind === 'retry'
                  ? { label: 'もう一度試す', run: () => attention.count
                    ? runtime.retryLegacyFailures() : runtime.sync('manual_retry') }
                  : null
          }));
        }).catch(() => {
          if (revision !== attentionRevision) return;
          setSettingsPresentation(connectedPresentation({
            state: 'attention', status: '確認が必要',
            action: { label: 'もう一度確認', run: () => runtime.sync('manual_retry') }
          }));
        });
      }
    };
    runtime.addEventListener('statechange', (event) => show(event.detail?.state, event.detail));
    global.addEventListener?.('offline', () => { if (!hostSession?.review) setSettingsPresentation(connectedPresentation({ state: 'offline', status: 'オフライン' })); });
    global.addEventListener?.('online', () => {
      if (hostSession?.review) return;
      setSettingsPresentation(connectedPresentation({ state: 'checking', status: '同期を確認中' }));
      Promise.resolve().then(() => runtime.sync('online')).catch(() => {
        if (hostSession) setSettingsPresentation({ state: 'paused', status: '同期を停止しています', description: 'Accountと資格を確認してください。保存内容は保持しています。', action: null });
      });
    });
  }

  function bindLanding(dialog, config, runtime, mode) {
    const summary = dialog.querySelector('[data-sync-summary]');
    const error = dialog.querySelector('[data-sync-error]');
    const startButton = dialog.querySelector('[data-sync-action="start"]');
    const continueButton = dialog.querySelector('[data-sync-action="continue"]');
    const returnLink = dialog.querySelector('[data-sync-action="return"]');
    const joinField = dialog.querySelector('[data-sync-join-field]');
    const joinInput = dialog.querySelector('[data-sync-join-code]');
    const joinSecret = mode === 'join' && joinInput
      ? accountRoot.core.createSensitiveInputController(joinInput)
      : null;
    const joinFailureMessage = (reason) => ({
      app_join_expired: '接続コードの有効期限が切れました。Cruise Portで新しいコードを発行してください。',
      app_join_cancelled: '接続コードは取り消されました。Cruise Portで新しいコードを発行してください。',
      app_join_consumed: 'この接続コードはすでに使用されています。Cruise Portで新しいコードを発行してください。',
      qa_admission_required: 'このQA環境の利用確認を完了できませんでした。ページを更新してから、もう一度お試しください。'
    })[reason?.code] || '初回同期を完了できませんでした。コードと通信状態を確認してください。';
    continueButton.addEventListener('click', () => dialog.close());
    startButton.addEventListener('click', async () => {
      const code = joinSecret?.take();
      if (mode === 'join' && !code) {
        dialog.dataset.syncPhase = 'attention';
        error.hidden = false;
        error.textContent = '接続コードを入力してください。';
        startButton.disabled = false;
        return;
      }
      startButton.disabled = true;
      syncUi?.setJoinProcessing?.(dialog, {
        title: 'クラウド同期を設定しています…',
        description: '保存内容を確認しています。しばらくお待ちください。'
      });
      error.hidden = true;
      try {
        hostSession?.approveReview();
        const connect = async () => {
          if (mode === 'review') { const result = await runtime.sync('confirmed-local-review'); runtime.bindLifecycle(); return result; }
          if (mode === 'join') return runtime.consumeInvitation(code, hostSession ? 'Cruise Studio' : `${config.appId} app`);
          if (hostSession) { const grant = await hostSession.grant(); return grant.joinCode
            ? runtime.consumeInvitation(grant.joinCode, hostSession ? 'Cruise Studio' : `${config.appId} app`)
            : runtime.consumeHandoff(grant.handoffToken, hostSession ? 'Cruise Studio' : `${config.appId} app`); }
          return runtime.consumeHandoff(handoffToken, hostSession ? 'Cruise Studio' : `${config.appId} app`);
        };
        const result = hostSession ? await hostSession.connect(connect) : await connect();
        handoffToken = null;
        if (!result.ok) throw new Error(result.code || 'setup_failed');
        joinSecret?.resolve();
        showConnectedSettings(result.accountId);
        syncUi?.completeJoinDialog?.(dialog);
      } catch (reason) {
        joinSecret?.reject(reason);
        syncUi?.restoreJoinInput?.(dialog);
        error.hidden = false;
        error.textContent = reason?.code === 'merge_conflict'
          ? '自動統合できない変更があります。データは変更せず停止しました。'
          : mode === 'join' ? joinFailureMessage(reason)
            : '初回同期を完了できませんでした。コードと通信状態を確認してください。';
        startButton.disabled = false;
      }
    });
  }

  function installJoinEntry(config, runtime) {
    setSettingsPresentation({
      state: 'unconnected',
      status: '未接続',
      action: { label: 'Cruise Portと接続', run: () => {
      const dialog = createLanding(config.appId, config.portUrl, 'join');
      bindLanding(dialog, config, runtime, 'join');
      dialog.showModal();
      } }
    });
  }

  async function consumeAutoRejoin(config, runtime) {
    showPendingSettings();
    setSettingsPresentation({
      state: 'connecting', status: '再接続しています…', action: null,
      accountDisplayId: connectedAccountDisplayId
    });
    const token = handoffToken;
    handoffToken = null;
    try {
      const connect = async () => {
        if (hostSession) { const grant = await hostSession.grant(); return grant.joinCode
          ? runtime.consumeInvitation(grant.joinCode, hostSession ? 'Cruise Studio' : `${config.appId} app`)
          : runtime.consumeHandoff(grant.handoffToken, hostSession ? 'Cruise Studio' : `${config.appId} app`); }
        return runtime.consumeHandoff(token, hostSession ? 'Cruise Studio' : `${config.appId} app`);
      };
      const result = hostSession ? await hostSession.connect(connect) : await connect();
      if (!result?.ok) throw new Error(result?.code || 'setup_failed');
      showConnectedSettings(result.accountId);
      // Dataset hydration makes the environment usable, but removal safety is
      // reported by the regular sync path. Start that path immediately so a
      // successful Auto Rejoin does not remain fail-closed until a later focus,
      // reload or local save. A transient sync failure must not undo the durable
      // connection that was already established above.
      runtime.sync('auto-rejoin').catch(() => {});
      return true;
    } catch (reason) {
      // The grant is intentionally one-time. A failed automatic path keeps all
      // local/cloud data intact and returns to the existing manual Join entry.
      if (reason?.code === 'app_environment_limit') {
        setSettingsPresentation({
          state: 'attention', status: '環境の上限です',
          description: 'Cruise Portで使っていない環境の同期を解除してから、もう一度お試しください。',
          action: { label: 'Cruise Portで環境を管理', run: () => global.location.assign(config.portUrl) }
        });
        return false;
      }
      if (hostSession) setSettingsPresentation({ state: 'attention', status: '接続を確認できません',
        description: global.SoundCruiseNativeSyncHost.message(reason),
        action: { label: 'もう一度確認', run: () => global.SoundCruiseNativeSyncHost.retry() } });
      else installJoinEntry(config, runtime);
      return false;
    }
  }

  function installRestoreAttention() {
    setSettingsPresentation({
      state: 'attention', status: '確認が必要',
      description: '同期状態を確認できませんでした。',
      action: { label: 'もう一度確認', run: () => global.location.reload() }
    });
  }

  async function resolveStartupState(runtime, store, accountClient, accountCore) {
    let credential;
    let qaCredential;
    let migrationState;
    try {
      [credential, qaCredential, migrationState] = await Promise.all([
        runtime.credential(), runtime.qaCredential(), store.readMeta('migrationState')
      ]);
    } catch (_) {
      return Object.freeze({ state: 'restore_error' });
    }

    if (credential == null && qaCredential == null) {
      try {
        const resumed = await accountClient.resumePendingConsume({ preservePending: true });
        if (resumed.status === 'committed' && resumed.membership?.appId === runtime.appId &&
            accountCore.validAppCredential(resumed.appDeviceCredential) &&
            (runtime.admissionMode === 'production' || accountCore.validQaCredential(resumed.qaCredential))) {
          await store.setMeta('credential', resumed.appDeviceCredential);
          await store.setMeta('qaCredential', resumed.qaCredential || null);
          await store.setMeta('membership', {
            id: resumed.membership.id, appId: runtime.appId, state: resumed.membership.state
          });
          await accountClient.confirmConsumePersisted();
          credential = resumed.appDeviceCredential;
          qaCredential = resumed.qaCredential;
          migrationState = await store.readMeta('migrationState');
        }
      } catch (_) {
        return Object.freeze({ state: 'restore_error' });
      }
    }

    if (credential == null && qaCredential == null) return Object.freeze({ state: 'not_connected' });
    if (!accountCore.validAppCredential(credential) ||
        (runtime.admissionMode === 'qa' && !accountCore.validQaCredential(qaCredential))) {
      return Object.freeze({ state: 'restore_error' });
    }
    return Object.freeze({ state: migrationState === 'complete' ? 'connected' : 'migration_pending' });
  }

  async function start() {
    const config = readConfig();
    if (!config || !accountRoot?.AccountClient || !syncRoot.MultiAppSyncRuntime || !syncRoot.dataStorage) return;
    const [namespace, Adapter] = APP_ROOTS[config.appId];
    const AdapterClass = global[namespace]?.[Adapter];
    if (typeof AdapterClass !== 'function') return;
    const host = global.SoundCruiseNativeSyncHost;
    const store = syncRoot.dataStorage.createStore(config.appId, host?.storeOptions);
    const adapter = new AdapterClass();
    try { hostSession = host ? await host.prepare({ appId: config.appId, adapter, store }) : null; }
    catch (error) {
      setSettingsPresentation({ state: 'attention', status: '確認が必要', description: host?.message(error),
        action: { label: 'もう一度確認', run: () => host?.retry() } });
      return;
    }
    const accountClient = new accountRoot.AccountClient({
      endpoint: config.endpoint, storage: hostSession?.accountStorage || accountRoot.storage, core: accountRoot.core,
      ...(hostSession?.accountOptions || {}),
      admissionMode: config.admissionMode, qaScope: 'app', qaAppId: config.appId
    });
    const runtime = new syncRoot.MultiAppSyncRuntime({
      appId: config.appId, endpoint: config.endpoint,
      adapter, store, accountClient, accountCore: accountRoot.core,
      ...(hostSession?.runtimeOptions || {}),
      admissionMode: config.admissionMode
    });
    host?.own(runtime);
    activeRuntime = runtime;
    activeConfig = config;
    const conflictController = syncRoot.installConflictResolutionUi?.(runtime, document);
    bindSettingsRuntime(runtime, conflictController, config);
    syncRoot.runtimes = syncRoot.runtimes || Object.create(null);
    syncRoot.runtimes[config.appId] = runtime;
    if (hostSession?.review) {
      setSettingsPresentation({ state: 'attention', status: '内容の確認が必要',
        description: '最後の同期・未送信操作と一致しない端末内データがあります。別Accountの内容でないことを確認してください。',
        action: { label: '同期する内容を確認', run: () => {
          const dialog = createLanding(config.appId, config.portUrl, 'handoff');
          dialog.querySelector('[data-sync-summary]').textContent = 'この端末の保存内容を現在のAccountへ同期します。内容を確認して続行してください。';
          bindLanding(dialog, config, runtime, hostSession.connected ? 'review' : 'handoff'); dialog.showModal();
        } } });
      return;
    }
    try {
      const resumedDetach = await runtime.resumeCurrentEnvironmentDetach();
      if (resumedDetach?.status === 'committed') {
        installJoinEntry(config, runtime);
        return;
      }
    } catch (_) {
      // Keep the durable binding intact after a transient failure. The regular
      // startup path below can still safely resume normal synchronization.
    }
    const restored = await resolveStartupState(runtime, store, accountClient, accountRoot.core);
    if (['connected', 'migration_pending'].includes(restored.state)) {
      try {
        const savedAccount = await accountRoot.storage.getAccount();
        connectedAccountDisplayId = accountRoot.core.formatAccountDisplayId(savedAccount?.accountId) || null;
      } catch (_) {
        connectedAccountDisplayId = null;
      }
    }
    if (restored.state === 'connected') {
      // A URL handoff is transient. A durable, active app connection wins so a
      // stale launch URL cannot reopen setup over a connected container.
      handoffToken = null;
      if (!host) showConnectedSettings();
      else setSettingsPresentation({ state: 'checking', status: '同期を確認中…', action: null });
      runtime.bindLifecycle();
      runtime.resumeConflictResolutions().then(() => runtime.sync('startup')).catch(() => {});
      return;
    }
    if (restored.state === 'migration_pending') {
      handoffToken = null;
      showPendingSettings();
      runtime.initializeDataset().then((result) => {
        if (result?.ok === true) showConnectedSettings();
      }).catch(() => {});
      return;
    }
    if (restored.state === 'restore_error') {
      installRestoreAttention();
      return;
    }
    if (hostSession && !handoffToken) {
      await consumeAutoRejoin(config, runtime);
      return;
    }
    if (!handoffToken) {
      installJoinEntry(config, runtime);
      return;
    }
    await consumeAutoRejoin(config, runtime);
  }

  // Exposed for deterministic bootstrap contract tests; no credentials or
  // transient handoff material are returned by this state classifier.
  syncRoot.resolveStartupState = resolveStartupState;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})(globalThis);
