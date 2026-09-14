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
    if (!value || value.enabled !== true || value.environment !== 'development' || !APP_ROOTS[appId]) return null;
    try {
      const endpoint = new URL(value.endpoint);
      if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(endpoint.hostname))) {
        return null;
      }
      return { appId, endpoint: endpoint.toString().replace(/\/$/, ''), portUrl: value.portUrl || '/apps/cruise-port/#sync-center' };
    } catch (_) { return null; }
  }

  function createLanding(appId, portUrl) {
    const dialog = document.createElement('dialog');
    dialog.className = 'sound-cruise-sync-setup';
    dialog.dataset.syncPhase = 'confirm';
    dialog.innerHTML = `
      <form method="dialog" class="sound-cruise-sync-setup-panel">
        <h2>Sound Cruise Sync</h2>
        <p data-sync-summary>このアプリをクラウド同期します。保存内容はこのアプリ内で確認し、安全に初回同期します。</p>
        <p data-sync-error role="alert" hidden></p>
        <button type="button" data-sync-action="start">初回同期を開始</button>
        <button type="button" data-sync-action="continue" hidden>通常アプリへ進む</button>
        <a data-sync-action="return" href="${portUrl}" hidden>Cruise Portに戻る</a>
        <button value="cancel" data-sync-action="cancel">今は行わない</button>
      </form>`;
    document.body.append(dialog);
    return dialog;
  }

  async function start() {
    const config = readConfig();
    if (!config || !accountRoot?.AccountClient || !syncRoot.MultiAppSyncRuntime || !syncRoot.dataStorage) return;
    const [namespace, Adapter] = APP_ROOTS[config.appId];
    const AdapterClass = global[namespace]?.[Adapter];
    if (typeof AdapterClass !== 'function') return;
    const store = syncRoot.dataStorage.createStore(config.appId);
    const accountClient = new accountRoot.AccountClient({
      endpoint: config.endpoint, storage: accountRoot.storage, core: accountRoot.core
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
      }
      return;
    }
    const dialog = createLanding(config.appId, config.portUrl);
    const summary = dialog.querySelector('[data-sync-summary]');
    const error = dialog.querySelector('[data-sync-error]');
    const startButton = dialog.querySelector('[data-sync-action="start"]');
    const continueButton = dialog.querySelector('[data-sync-action="continue"]');
    const returnLink = dialog.querySelector('[data-sync-action="return"]');
    continueButton.addEventListener('click', () => dialog.close());
    startButton.addEventListener('click', async () => {
      startButton.disabled = true;
      dialog.dataset.syncPhase = 'working';
      summary.textContent = '保存内容を確認し、初回同期を進めています…';
      error.hidden = true;
      try {
        const result = await runtime.consumeHandoff(handoffToken, `${config.appId} app`);
        handoffToken = null;
        if (!result.ok) throw new Error(result.code || 'setup_failed');
        dialog.dataset.syncPhase = 'complete';
        summary.textContent = 'クラウド同期を設定しました。';
        startButton.hidden = true;
        continueButton.hidden = false;
        returnLink.hidden = false;
      } catch (reason) {
        dialog.dataset.syncPhase = 'attention';
        error.hidden = false;
        error.textContent = reason?.code === 'merge_conflict'
          ? '自動統合できない変更があります。データは変更せず停止しました。'
          : '初回同期を完了できませんでした。Cruise Portへ戻ってもう一度お試しください。';
        startButton.disabled = false;
      }
    });
    dialog.showModal();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})(globalThis);
