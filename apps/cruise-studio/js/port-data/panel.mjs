import { createPortDataHost } from './host.mjs?v=0.53.0';
import { connectPortReadOnly } from './connection.mjs?v=0.53.0';
import { describeRead, findPreset, standardBpm, copyStandardBpm } from './presentation.mjs?v=0.53.0';
import { describeAccountObservation } from './account-status-projection.mjs?v=0.53.0';
const CS = globalThis.CruiseStudio;
let host = createPortDataHost({ connect: connectPortReadOnly, schema: CS.metronomeSchema });
CS.portDataHost = host;
CS.practice.attachHost(host);
CS.library.attachHost(host);
const panel = document.querySelector('#studio-port-data');
const button = panel.querySelector('#studio-port-read');
let selectedId = null, requested = false, loading = false, hadData = false, lifecycle = 0;
const labels = { unknown: '未確認', unavailable: '確認できません', standard: 'Standard', 'cached-valid': 'Pro（保存済み資格・期限内）', expired: '期限切れ', stale: '再確認が必要', synced: '同期済み', pending: '同期待ち', conflict: '競合（Portで管理）', error: 'エラー', 'no-account-known': '保存済みAccountなし', 'account-known': '保存済みAccountあり', 'membership-known': '保存済みmembershipあり' };
const formats = { current: '対応形式', 'legacy-view': '旧形式を閲覧', absent: '保存値なし', invalid: '形式を確認できません', 'forward-incompatible': '新しい形式（閲覧のみ）' };
function render(state) {
    const presentation = describeRead(state, { requested, loading, hadData });
    const status = panel.querySelector('#studio-port-read-status');
    status.textContent = presentation.text; status.dataset.status = presentation.status;
    if (state.dataset) hadData = true;
    panel.querySelector('[data-port-sync]').textContent = labels[state.sync];
    panel.querySelector('[data-port-pro]').textContent = labels[state.pro];
    const account = describeAccountObservation(state);
    const accountLabel = panel.querySelector('[data-port-account]');
    accountLabel.textContent = account.label;
    let accountDetail = panel.querySelector('[data-port-account-detail]');
    if (!accountDetail) {
        accountDetail = document.createElement('small'); accountDetail.dataset.portAccountDetail = '';
        accountLabel.after(accountDetail);
    }
    accountDetail.textContent = account.detail;
    const settings = state.dataset?.settings;
    panel.querySelector('[data-port-bpm]').textContent = settings?.savedBpm == null ? '未取得 / 保存値なし' : String(settings.savedBpm);
    panel.querySelector('[data-port-schema]').textContent = state.dataset ? (state.dataset.state === 'forward-incompatible' && settings.schemaState !== 'forward-incompatible' ? '一部に新しい形式 / ' : '') + formats[settings.schemaState] : '未確認';
    panel.querySelector('[data-port-effective]').textContent = settings?.effective ? `${settings.effective.meter}・${settings.effective.rhythm}・${settings.effective.sound}・音量${settings.effective.volume}（閲覧のみ）` : '未確認';
    panel.querySelector('#studio-port-copy-bpm').disabled = loading || standardBpm(state) === null;
    const focusedId = document.activeElement?.dataset.presetId;
    const list = panel.querySelector('ol'); list.replaceChildren();
    for (const preset of state.dataset?.presets || []) {
        const item = document.createElement('li');
        const select = document.createElement('button'); select.type = 'button'; select.dataset.presetId = preset.id;
        select.textContent = preset.name; select.setAttribute('aria-pressed', String(preset.id === selectedId));
        const detail = document.createElement('small'); detail.textContent = `BPM ${preset.savedBpm ?? '—'} · ${formats[preset.schemaState]}`;
        item.append(select, detail); list.append(item);
        if (focusedId === preset.id) select.focus({ preventScroll: true });
    }
    if (focusedId && !findPreset(state, focusedId)) button.focus({ preventScroll: true });
    panel.querySelector('[data-port-empty]').hidden = Boolean(state.dataset?.presets.length);
    panel.querySelector('[data-port-empty]').textContent = state.dataset ? '保存済みプリセットなし' : '未取得';
    const preset = findPreset(state, selectedId), detail = panel.querySelector('#studio-port-preset-detail');
    if (!preset) selectedId = null;
    // Return focus before hiding a removed selection's detail.
    if (!preset && detail.contains(document.activeElement)) button.focus({ preventScroll: true });
    detail.hidden = !preset;
    detail.querySelector('[data-preset-name]').textContent = preset?.name || '';
    detail.querySelector('[data-preset-detail]').textContent = preset ? `BPM ${preset.savedBpm ?? '—'} · ${formats[preset.schemaState]} · Standard: BPMのみ` : '';
    detail.querySelector('button').disabled = loading || !preset || standardBpm(state, selectedId) === null;
    panel.querySelector('#studio-port-preview-preset').disabled = loading || !preset || standardBpm(state, selectedId) === null;
    panel.querySelector('#studio-port-copy-status').textContent = '';
}
let off = host.subscribe(render); render(host.getCachedStatus());
button.addEventListener('click', async () => {
    const epoch = lifecycle, currentHost = host;
    requested = true; loading = true; button.disabled = true; render(host.getCachedStatus());
    try { await currentHost.readLocalStatus(); }
    finally { if (epoch === lifecycle) { loading = false; button.disabled = false; render(host.getCachedStatus()); } }
});
panel.querySelector('ol').addEventListener('click', event => {
    const select = event.target.closest('button[data-preset-id]');
    if (!select) return;
    selectedId = select.dataset.presetId; render(host.getCachedStatus());
});
function copy(presetId = null) {
    if (loading || panel.closest('[hidden], [inert]') || CS.shellHost.getCommandContext().activeModal) return;
    const state = host.getCachedStatus();
    const ok = copyStandardBpm(host, CS.metronomeM1, { revision: state.dataset?.revision, presetId });
    panel.querySelector('#studio-port-copy-status').textContent = ok ? 'BPMだけをStudio一時設定へ反映しました。Port保存値は変更していません。' : '表示を再確認してください。この値は反映できません。';
}
panel.querySelector('#studio-port-copy-bpm').addEventListener('click', () => copy());
panel.querySelector('#studio-port-copy-preset').addEventListener('click', () => { if (selectedId !== null) copy(selectedId); });
panel.querySelector('#studio-port-preview-preset').addEventListener('click', async () => {
    if (selectedId === null || loading || panel.closest('[hidden], [inert]') || CS.shellHost.getCommandContext().activeModal || CS.shellHost.keyboard.isIMEBlocked({})) return;
    const state = host.getCachedStatus();
    if (!copyStandardBpm(host, CS.metronomeM1, { revision: state.dataset?.revision, presetId: selectedId })) return;
    const epoch = lifecycle;
    const started = await CS.metronomeM1.start();
    if (epoch !== lifecycle) return;
    panel.querySelector('#studio-port-copy-status').textContent = started ? 'BPMだけを一時プレビュー中。詳細設定は適用せず、Port保存値も変更しません。' : 'プレビューを開始できません。他の音声を停止して再操作してください。';
});
const dispose = () => { lifecycle++; loading = false; requested = false; hadData = false; selectedId = null; button.disabled = false; window.removeEventListener('pagehide', dispose); CS.practice.attachHost(null); CS.library.attachHost(null); off(); host.dispose(); };
window.addEventListener('pageshow', event => { if (event.persisted) { host = createPortDataHost({ connect: connectPortReadOnly, schema: CS.metronomeSchema }); CS.portDataHost = host; CS.practice.attachHost(host); CS.library.attachHost(host); off = host.subscribe(render); render(host.getCachedStatus()); window.addEventListener('pagehide', dispose, { once: true }); } });
window.addEventListener('pagehide', dispose, { once: true });
