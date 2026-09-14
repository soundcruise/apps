(function installChordAccountOrchestration(global) {
  'use strict';

  const accountRoot = global.SoundCruiseSyncAccount;
  let handoffToken = null;
  try { handoffToken = accountRoot?.core?.takeHandoffFromLocation() || null; }
  catch (_) { handoffToken = null; }
  function config() {
    const value = global.__SOUND_CRUISE_MULTI_APP_SYNC__;
    if (!value || value.enabled !== true || value.environment !== 'development') return null;
    try {
      const endpoint = new URL(value.endpoint);
      if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(endpoint.hostname))) return null;
      return { endpoint: endpoint.toString().replace(/\/$/, ''), portUrl: value.portUrl || '/apps/cruise-port/#sync-center' };
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
      endpoint: settings.endpoint, storage: accountRoot.storage, core: accountRoot.core
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
    if (!handoffToken) {
      const chordStore = await chordClient.openStore();
      let existing = await chordStore.getMeta('deviceCredential');
      const resumed = await accountClient.resumePendingConsume({ preservePending: true });
      if (resumed.status === 'committed' && resumed.membership?.appId === 'chord' && resumed.appDeviceCredential) {
        const migrated = await chordClient.adoptAccountManagedIdentity({
          deviceId: resumed.appDeviceId,
          deviceCredential: resumed.appDeviceCredential
        });
        if (migrated.ok) await accountClient.confirmConsumePersisted();
        return;
      }
      if (resumed.status === 'bridge_required' && resumed.membership?.appId === 'chord' && existing?.credential) {
        await finishExistingBridge(existing, resumed);
        return;
      }
      const accountManagedSetup = await chordStore.getMeta('accountManagedSetup');
      const migrationState = await chordStore.getMeta('migrationState');
      if (accountManagedSetup === true && migrationState !== 'complete' && existing?.credential) {
        await chordClient.adoptAccountManagedIdentity({
          deviceId: existing.deviceId,
          deviceCredential: existing.credential
        });
      }
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
          const migrated = await chordClient.adoptAccountManagedIdentity({
            deviceId: consumed.appDeviceId,
            deviceCredential: consumed.appDeviceCredential
          });
          if (!migrated.ok) throw new Error(migrated.code || 'migration_failed');
          await accountClient.confirmConsumePersisted();
        }
        handoffToken = null;
        dialog.dataset.syncPhase = 'complete';
        summaryText.textContent = 'クラウド同期を設定しました。';
        start.hidden = true;
        dialog.querySelector('[data-sync-action="continue"]').hidden = false;
        dialog.querySelector('[data-sync-action="return"]').hidden = false;
      } catch (error) {
        dialog.dataset.syncPhase = 'attention';
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
