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
      const migrated = await chordClient.adoptAccountManagedIdentity({
        deviceId: consumed.appDeviceId,
        deviceCredential: consumed.appDeviceCredential
      });
      if (!migrated.ok) throw new Error(migrated.code || 'migration_failed');
      await accountClient.confirmConsumePersisted();
    }
    function installJoinEntry() {
      if (document.querySelector('[data-sync-app-join-entry]')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.syncAppJoinEntry = '';
      button.className = 'cc-sync-primary-action';
      button.textContent = 'Cruise Portと接続';
      button.addEventListener('click', () => {
        const dialog = landing(settings.portUrl);
        const summary = dialog.querySelector('[data-sync-summary]');
        summary.textContent = 'Cruise Portに表示された既存データ接続コードを入力してください。';
        const input = document.createElement('input');
        input.autocomplete = 'off';
        input.autocapitalize = 'characters';
        input.spellcheck = false;
        input.dataset.sensitive = 'true';
        input.setAttribute('aria-label', '既存データ接続コード');
        summary.after(input);
        const start = dialog.querySelector('[data-sync-action="start"]');
        start.textContent = '既存データを接続';
        start.addEventListener('click', async () => {
          start.disabled = true;
          try {
            await connectWithJoin(input.value);
            input.value = '';
            summary.textContent = 'クラウド同期を設定しました。';
            start.hidden = true;
            dialog.querySelector('[data-sync-action="continue"]').hidden = false;
            dialog.querySelector('[data-sync-action="return"]').hidden = false;
          } catch (_) {
            dialog.querySelector('[data-sync-error]').hidden = false;
            dialog.querySelector('[data-sync-error]').textContent = '接続を完了できませんでした。データは削除していません。';
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
