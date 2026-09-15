(function installMultiAppSyncBootstrap(global) {
  'use strict';

  const syncRoot = global.SoundCruiseMultiAppSync = global.SoundCruiseMultiAppSync || {};
  const accountRoot = global.SoundCruiseSyncAccount;
  const APP_ROOTS = Object.freeze({
    pitch: ['SoundCruisePitchSync', 'PitchSyncAdapter'],
    rhythm: ['SoundCruiseRhythmSync', 'RhythmSyncAdapter'],
    fretboard: ['SoundCruiseFretboardSync', 'FretboardSyncAdapter']
  });
  const JOIN_HOST_SELECTOR = '[data-sync-join-entry-host]';
  let settingsPresentation = null;
  let settingsObserver = null;

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
    const dialog = document.createElement('dialog');
    dialog.className = 'sound-cruise-sync-setup';
    dialog.dataset.syncPhase = 'confirm';
    dialog.innerHTML = `
      <form method="dialog" class="sound-cruise-sync-setup-panel">
        <h2>Sound Cruise Sync</h2>
        <p data-sync-summary>${mode === 'join' ? 'Cruise Portに表示された既存データ接続コードを入力してください。' : 'このアプリをクラウド同期します。保存内容はこのアプリ内で確認し、安全に初回同期します。'}</p>
        <label data-sync-join-field ${mode === 'join' ? '' : 'hidden'}>接続コード
          <input data-sync-join-code autocomplete="off" autocapitalize="characters" spellcheck="false" data-sensitive="true" data-sync-sensitive="join-code-input">
        </label>
        <p data-sync-error role="alert" hidden></p>
        <button type="button" data-sync-action="start">${mode === 'join' ? '既存データを接続' : '初回同期を開始'}</button>
        <button type="button" data-sync-action="continue" hidden>通常アプリへ進む</button>
        <a data-sync-action="return" href="${portUrl}" hidden>Cruise Portに戻る</a>
        <button value="cancel" data-sync-action="cancel">今は行わない</button>
      </form>`;
    document.body.append(dialog);
    return dialog;
  }

  function renderSettingsPresentation() {
    if (!settingsPresentation) return false;
    const host = document.querySelector(JOIN_HOST_SELECTOR);
    if (!host) return false;
    if (host.dataset.syncJoinUiState === settingsPresentation.state) return true;
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
    renderSettingsPresentation();
    if (!settingsObserver && typeof MutationObserver === 'function' && document.body) {
      settingsObserver = new MutationObserver(renderSettingsPresentation);
      settingsObserver.observe(document.body, { childList: true, subtree: true });
    }
  }

  function showConnectedSettings() {
    setSettingsPresentation({ state: 'connected', status: '同期済み', action: null });
  }

  function showPendingSettings() {
    setSettingsPresentation({ state: 'pending', status: '同期設定を再開しています…', action: null });
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
      startButton.disabled = true;
      dialog.dataset.syncPhase = 'working';
      summary.textContent = '保存内容を確認し、初回同期を進めています…';
      error.hidden = true;
      const code = joinSecret?.take();
      if (mode === 'join' && !code) {
        dialog.dataset.syncPhase = 'attention';
        error.hidden = false;
        error.textContent = '接続コードを入力してください。';
        startButton.disabled = false;
        return;
      }
      try {
        const result = mode === 'join'
          ? await runtime.consumeInvitation(code, `${config.appId} app`)
          : await runtime.consumeHandoff(handoffToken, `${config.appId} app`);
        handoffToken = null;
        if (!result.ok) throw new Error(result.code || 'setup_failed');
        joinSecret?.resolve();
        if (joinField) joinField.remove();
        dialog.querySelectorAll('[data-sync-copy-join-code]').forEach((node) => node.remove());
        showConnectedSettings();
        dialog.dataset.syncPhase = 'complete';
        summary.textContent = 'クラウド同期を設定しました。';
        startButton.hidden = true;
        continueButton.hidden = false;
        returnLink.hidden = false;
      } catch (reason) {
        joinSecret?.reject(reason);
        dialog.dataset.syncPhase = 'attention';
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

  function installRestoreAttention() {
    if (document.querySelector('[data-sync-restore-attention]')) return;
    const notice = document.createElement('section');
    notice.className = 'sound-cruise-sync-restore-attention';
    notice.dataset.syncRestoreAttention = '';
    notice.setAttribute('role', 'status');
    notice.innerHTML = `
      <p>同期状態を確認できませんでした。</p>
      <button type="button" data-sync-action="retry-restore">もう一度確認</button>`;
    notice.querySelector('[data-sync-action="retry-restore"]').addEventListener('click', () => global.location.reload());
    document.body.append(notice);
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
    // Production admission uses only verifier-backed Join invitations. A stale
    // QA handoff fragment must never select the unsupported handoff path.
    if (config.admissionMode === 'production') handoffToken = null;
    const [namespace, Adapter] = APP_ROOTS[config.appId];
    const AdapterClass = global[namespace]?.[Adapter];
    if (typeof AdapterClass !== 'function') return;
    const store = syncRoot.dataStorage.createStore(config.appId);
    const accountClient = new accountRoot.AccountClient({
      endpoint: config.endpoint, storage: accountRoot.storage, core: accountRoot.core,
      admissionMode: config.admissionMode, qaScope: 'app', qaAppId: config.appId
    });
    const runtime = new syncRoot.MultiAppSyncRuntime({
      appId: config.appId, endpoint: config.endpoint,
      adapter: new AdapterClass(), store, accountClient, accountCore: accountRoot.core,
      admissionMode: config.admissionMode
    });
    syncRoot.installConflictResolutionUi?.(runtime, document);
    syncRoot.runtimes = syncRoot.runtimes || Object.create(null);
    syncRoot.runtimes[config.appId] = runtime;
    const restored = await resolveStartupState(runtime, store, accountClient, accountRoot.core);
    if (restored.state === 'connected') {
      // A URL handoff is transient. A durable, active app connection wins so a
      // stale launch URL cannot reopen setup over a connected container.
      handoffToken = null;
      showConnectedSettings();
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
    if (!handoffToken) {
      installJoinEntry(config, runtime);
      return;
    }
    const dialog = createLanding(config.appId, config.portUrl);
    bindLanding(dialog, config, runtime, 'handoff');
    dialog.showModal();
  }

  // Exposed for deterministic bootstrap contract tests; no credentials or
  // transient handoff material are returned by this state classifier.
  syncRoot.resolveStartupState = resolveStartupState;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})(globalThis);
