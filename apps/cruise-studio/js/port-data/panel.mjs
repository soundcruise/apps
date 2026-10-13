import { createPortDataHost } from './host.mjs?v=0.26.11';
import { connectPortReadOnly } from './connection.mjs?v=0.26.11';
const CS = globalThis.CruiseStudio;
let host = createPortDataHost({ connect: connectPortReadOnly, schema: CS.metronomeSchema });
CS.portDataHost = host;
const panel = document.querySelector('#studio-port-data');
const button = panel.querySelector('button');
const labels = { unknown: '未確認', unavailable: '確認できません', standard: 'Standard', 'cached-valid': 'Pro（保存済み資格・期限内）', expired: '期限切れ', stale: '再確認が必要', synced: '同期済み', pending: '同期待ち', conflict: '競合（Portで管理）', error: 'エラー', 'no-account-known': '保存済みAccountなし', 'account-known': '保存済みAccountあり', 'membership-known': '保存済みmembershipあり' };
function render(state) {
    panel.querySelector('[data-port-sync]').textContent = labels[state.sync];
    panel.querySelector('[data-port-pro]').textContent = labels[state.pro];
    panel.querySelector('[data-port-account]').textContent = labels[state.account];
    const settings = state.dataset?.settings;
    panel.querySelector('[data-port-bpm]').textContent = settings?.savedBpm == null ? '未取得 / 保存値なし' : String(settings.savedBpm);
    const formats = { current: '対応形式', 'legacy-view': '旧形式を閲覧', absent: '保存値なし', invalid: '形式を確認できません', 'forward-incompatible': '新しい形式（閲覧のみ）' };
    panel.querySelector('[data-port-schema]').textContent = state.dataset ? (state.dataset.state === 'forward-incompatible' && settings.schemaState !== 'forward-incompatible' ? '一部に新しい形式 / ' : '') + formats[settings.schemaState] : '未確認';
    panel.querySelector('[data-port-effective]').textContent = settings?.effective ? `${settings.effective.meter}・${settings.effective.rhythm}・${settings.effective.sound}` : '未確認';
    const list = panel.querySelector('ol'); list.replaceChildren();
    for (const preset of state.dataset?.presets || []) {
        const item = document.createElement('li');
        const title = document.createElement('strong'); title.textContent = preset.name;
        const detail = document.createElement('small'); detail.textContent = `${preset.id} · BPM ${preset.savedBpm ?? '—'} · ${preset.effective?.meter ?? '未対応形式'}`;
        item.append(title, detail); list.append(item);
    }
    panel.querySelector('[data-port-empty]').hidden = Boolean(state.dataset?.presets.length);
}
let off = host.subscribe(render); render(host.getCachedStatus());
button.addEventListener('click', async () => { button.disabled = true; try { await host.readLocalStatus(); } finally { button.disabled = false; } });
const dispose = () => { window.removeEventListener('pagehide', dispose); off(); host.dispose(); };
window.addEventListener('pageshow', event => { if (event.persisted) { host = createPortDataHost({ connect: connectPortReadOnly, schema: CS.metronomeSchema }); CS.portDataHost = host; off = host.subscribe(render); render(host.getCachedStatus()); window.addEventListener('pagehide', dispose, { once: true }); } });
window.addEventListener('pagehide', dispose, { once: true });
