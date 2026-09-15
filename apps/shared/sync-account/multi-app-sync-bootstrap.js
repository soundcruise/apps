(function installMultiAppSyncBootstrap(global) {
  'use strict';

  const syncRoot = global.SoundCruiseMultiAppSync = global.SoundCruiseMultiAppSync || {};
  const accountRoot = global.SoundCruiseSyncAccount;
  const APP_ROOTS = Object.freeze({
    pitch: ['SoundCruisePitchSync', 'PitchSyncAdapter'],
    rhythm: ['SoundCruiseRhythmSync', 'RhythmSyncAdapter'],
    fretboard: ['SoundCruiseFretboardSync', 'FretboardSyncAdapter']
  });

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
    if (!effective || effective.enabled !== true || !['development', 'qa'].includes(effective.environment) || !APP_ROOTS[appId]) return null;
    try {
      const endpoint = new URL(effective.endpoint);
      if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(endpoint.hostname))) {
        return null;
      }
      return { appId, endpoint: endpoint.toString().replace(/\/$/, ''), portUrl: effective.portUrl || '/apps/cruise-port/#sync-center' };
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
          : '初回同期を完了できませんでした。コードと通信状態を確認してください。';
        startButton.disabled = false;
      }
    });
  }

  function installJoinEntry(config, runtime) {
    if (document.querySelector('[data-sync-app-join-entry]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.syncAppJoinEntry = '';
    button.className = 'sound-cruise-sync-join-entry';
    button.textContent = 'Cruise Portと接続';
    button.addEventListener('click', () => {
      const dialog = createLanding(config.appId, config.portUrl, 'join');
      bindLanding(dialog, config, runtime, 'join');
      dialog.showModal();
    });
    // Pitch Cruise keeps its actionable settings controls in the footer. Appending
    // after the modal body can leave this entry beyond the visible modal viewport,
    // so prefer the footer when that structure is present.
    const host = document.querySelector(
      '#settings-modal .settings-modal-footer, #settings-modal .modal-content, #screen-settings, [data-screen="settings"], main'
    ) || document.body;
    host.append(button);
  }

  async function start() {
    const config = readConfig();
    if (!config || !accountRoot?.AccountClient || !syncRoot.MultiAppSyncRuntime || !syncRoot.dataStorage) return;
    const [namespace, Adapter] = APP_ROOTS[config.appId];
    const AdapterClass = global[namespace]?.[Adapter];
    if (typeof AdapterClass !== 'function') return;
    const store = syncRoot.dataStorage.createStore(config.appId);
    const accountClient = new accountRoot.AccountClient({
      endpoint: config.endpoint, storage: accountRoot.storage, core: accountRoot.core,
      qaScope: 'app', qaAppId: config.appId
    });
    const runtime = new syncRoot.MultiAppSyncRuntime({
      appId: config.appId, endpoint: config.endpoint,
      adapter: new AdapterClass(), store, accountClient, accountCore: accountRoot.core
    });
    syncRoot.runtimes = syncRoot.runtimes || Object.create(null);
    syncRoot.runtimes[config.appId] = runtime;
    let existingCredential = await runtime.credential();
    if (!handoffToken) {
      if (!existingCredential) {
        const resumed = await accountClient.resumePendingConsume({ preservePending: true });
        if (resumed.status === 'committed' && resumed.membership?.appId === config.appId && resumed.appDeviceCredential) {
          await store.setMeta('credential', resumed.appDeviceCredential);
          if (resumed.qaCredential) await store.setMeta('qaCredential', resumed.qaCredential);
          await store.setMeta('membership', {
            id: resumed.membership.id, appId: config.appId, state: resumed.membership.state
          });
          await accountClient.confirmConsumePersisted();
          existingCredential = resumed.appDeviceCredential;
        }
      }
      if (existingCredential) {
        const migrationState = await store.readMeta('migrationState');
        if (migrationState === 'complete') {
          runtime.bindLifecycle();
          runtime.sync('startup').catch(() => {});
        } else {
          runtime.initializeDataset().catch(() => {});
        }
      } else installJoinEntry(config, runtime);
      return;
    }
    const dialog = createLanding(config.appId, config.portUrl);
    bindLanding(dialog, config, runtime, 'handoff');
    dialog.showModal();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})(globalThis);
