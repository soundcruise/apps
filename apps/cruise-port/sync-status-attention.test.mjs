import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSyncCenterController, explainAppAttention, normalizeSyncCenterSummary } from './sync-center-controller.js';
import { markAppRowsChecking, renderAppRows } from './sync-center-ui.js';
import { bindSyncCenterReturnRefresh } from './sync-center-refresh.js';

// Sync Center "確認が必要": fresh state on open/return, and an honest reason + next step.
const account = { id: 'acct', state: 'active', recoveryVersion: 1 };
function membership(appId, overrides = {}) {
  return { appId, state: 'active', activeAppDeviceCount: 1, attentionConflictCount: 0,
    removalSafety: 'safe', dataset: { state: 'ready', schemaVersion: 1, recordCount: 12 }, ...overrides };
}
function summary(overrides = {}) {
  return { account, memberships: ['chord', 'pitch', 'fretboard', 'rhythm'].map((id) => membership(id, overrides[id])) };
}

function controller(responses, { online = () => true } = {}) {
  const calls = { summary: 0, devices: 0 };
  class AccountClient {
    async summary() { calls.summary += 1; const next = responses.shift(); if (next instanceof Error) throw next; return next; }
    async devices() { calls.devices += 1; return { devices: [], appDevices: [] }; }
  }
  const accountRoot = { AccountClient, core: {}, storage: { async getAccount() { return { accountCredential: 'dummy-credential' }; } } };
  return { calls, ctrl: createSyncCenterController({
    config: { enabled: true, endpoint: 'https://example.invalid' }, accountRoot, online }) };
}

function dom() {
  class Node {
    constructor(tag) { this.tagName = tag; this.children = []; this.attributes = new Map(); this.dataset = {};
      this.textContent = ''; this.className = ''; this.hidden = false; this.handlers = new Map();
      this.classList = { add: (name) => { this.className = `${this.className} ${name}`.trim(); } }; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    removeAttribute(name) { this.attributes.delete(name); }
    addEventListener(type, fn) { this.handlers.set(type, fn); }
    click() { this.handlers.get('click')?.({ stopPropagation() {} }); }
    querySelectorAll(selector) {
      const cls = selector.slice(1); const out = [];
      const walk = (node) => { for (const child of node.children) { if (String(child.className).split(' ').includes(cls)) out.push(child); walk(child); } };
      walk(this); return out;
    }
  }
  const list = new Node('ul');
  globalThis.document = { createElement: (tag) => new Node(tag) };
  const root = { querySelector: (selector) => (selector === '#sync-center-apps' ? list : null) };
  const row = (appId) => list.children.find((item) => item.children[0] && String(item.className).includes('sync-center-app')
    && item.children[1].children[0].textContent === ({ chord: 'コードクルーズ', pitch: '音感クルーズ', fretboard: '指板クルーズ', rhythm: 'リズムクルーズ' })[appId]);
  const chip = (appId) => row(appId).children[1].children[1].children[0];
  const panel = (appId) => row(appId).children.find((child) => child.className === 'sync-center-attention-detail') || null;
  return { root, list, row, chip, panel };
}

test('A: opening Sync Center fetches the server state once per load, never from app storage', async () => {
  const { ctrl, calls } = controller([summary()]);
  const presentation = await ctrl.load();
  assert.equal(presentation.kind, 'ready');
  assert.deepEqual(calls, { summary: 1, devices: 1 });
});

test('B: a stale attention becomes 同期済み once the server reports every environment clean', async () => {
  const { ctrl } = controller([summary({ rhythm: { removalSafety: 'unknown' } }), summary()]);
  const before = await ctrl.load();
  assert.equal(before.apps.find((app) => app.id === 'rhythm').presentationStatus.state, 'attention');
  const after = await ctrl.load();
  assert.equal(after.apps.find((app) => app.id === 'rhythm').presentationStatus.state, 'synced');
  const d = dom();
  renderAppRows(d.root, after, 'pro', true);
  assert.equal(d.chip('rhythm').tagName, 'span', '同期済み is not made tappable');
  assert.equal(d.chip('rhythm').textContent, '✓ 同期済み');
  assert.equal(d.panel('rhythm'), null);
});

test('C/D/E: a remaining attention stays attention and explains itself with an app-open action', async () => {
  const { ctrl } = controller([summary({ chord: { removalSafety: 'unknown' } })]);
  const presentation = await ctrl.load();
  const d = dom();
  const opened = [];
  renderAppRows(d.root, presentation, 'pro', true, null, { onOpenApp: (appId) => opened.push(appId), onRecheck: () => {} });
  const chip = d.chip('chord');
  assert.equal(chip.tagName, 'button');
  assert.equal(chip.textContent, '確認が必要');
  assert.equal(chip.getAttribute('aria-expanded'), 'false');
  const panel = d.panel('chord');
  assert.equal(panel.hidden, true);
  chip.click();
  assert.equal(panel.hidden, false);
  assert.equal(chip.getAttribute('aria-expanded'), 'true');
  assert.equal(panel.children[0].textContent, '最新の同期完了をまだ確認できていません');
  assert.match(panel.children[1].textContent, /このアプリを一度開くと、同期状態が更新されます/);
  const action = panel.children[2];
  assert.equal(action.textContent, 'コードクルーズを開く');
  action.click();
  assert.deepEqual(opened, ['chord']);
  assert.equal(presentation.apps.find((app) => app.id === 'chord').removalSafetyLabel, '同期を確認してください',
    'Safe-to-remove label and authority are unchanged');
});

test('F: offline keeps the last known rows and shows offline, not a data problem', async () => {
  const network = { online: true };
  const { ctrl, calls } = controller([summary({ pitch: { removalSafety: 'unknown' } })], { online: () => network.online });
  const known = await ctrl.load();
  network.online = false;
  const presentation = await ctrl.load();
  assert.equal(presentation.kind, 'offline');
  assert.equal(calls.summary, 1, 'no request while offline');
  assert.deepEqual(presentation.apps.map((app) => app.id), known.apps.map((app) => app.id), 'last known rows are kept');
  const d = dom();
  renderAppRows(d.root, presentation, 'pro', true);
  assert.equal(d.chip('pitch').textContent, 'オフライン');
  assert.equal(d.panel('pitch'), null);
});

test('G: a Worker error is explained as a communication problem with a safe recheck', async () => {
  const { ctrl } = controller([summary(), Object.assign(new Error('server'), { status: 503 })]);
  await ctrl.load();
  const presentation = await ctrl.load();
  assert.equal(presentation.kind, 'error');
  const d = dom();
  let rechecks = 0;
  renderAppRows(d.root, presentation, 'pro', true, null, { onOpenApp: () => {}, onRecheck: () => { rechecks += 1; } });
  d.chip('pitch').click();
  const panel = d.panel('pitch');
  assert.equal(panel.children[0].textContent, '最新の状態を確認できませんでした');
  assert.match(panel.children[1].textContent, /同期データの異常ではありません/);
  assert.equal(panel.children[2].textContent, 'もう一度確認');
  panel.children[2].click();
  assert.equal(rechecks, 1);
});

test('H/I: return refresh is single-flight, throttled, and only while Sync Center is visible', async () => {
  const listeners = { document: new Map(), window: new Map() };
  const documentObject = { visibilityState: 'visible', addEventListener: (type, fn) => listeners.document.set(type, fn) };
  const windowObject = { addEventListener: (type, fn) => listeners.window.set(type, fn) };
  let clock = 10_000;
  let visible = true;
  let refreshes = 0;
  let release;
  const gate = bindSyncCenterReturnRefresh({ isVisible: () => visible, documentObject, windowObject, now: () => clock,
    refresh: () => { refreshes += 1; return new Promise((resolve) => { release = resolve; }); } });
  const leaveAndReturn = () => {
    documentObject.visibilityState = 'hidden'; listeners.document.get('visibilitychange')();
    documentObject.visibilityState = 'visible'; listeners.document.get('visibilitychange')();
  };
  leaveAndReturn();
  await Promise.resolve();
  assert.equal(refreshes, 1);
  clock += 5000;
  leaveAndReturn();
  assert.equal(refreshes, 1, 'no second request while one is in flight');
  release();
  await new Promise((resolve) => setImmediate(resolve));
  leaveAndReturn();
  assert.equal(refreshes, 1, 'no repeat within the minimum interval');
  clock += 5000;
  listeners.window.get('blur')(); listeners.window.get('focus')();
  await Promise.resolve();
  assert.equal(refreshes, 2, 'returning from the iOS in-app view (blur/focus) re-checks');
  release();
  await new Promise((resolve) => setImmediate(resolve));
  clock += 5000;
  listeners.window.get('focus')();
  assert.equal(refreshes, 2, 'focus without leaving Port does not re-check');
  visible = false;
  leaveAndReturn();
  assert.equal(refreshes, 2, 'hidden Sync Center never fetches');
  visible = true;
  gate.noteRefreshed();
  leaveAndReturn();
  assert.equal(refreshes, 2, 'an explicit open counts as the latest check');
});

test('checking state replaces old chips with a neutral label and closes open details', async () => {
  const { ctrl } = controller([summary({ pitch: { removalSafety: 'unknown' } })]);
  const d = dom();
  renderAppRows(d.root, await ctrl.load(), 'pro', true, null, { onOpenApp: () => {} });
  d.chip('pitch').click();
  markAppRowsChecking(d.root);
  assert.equal(d.list.getAttribute('aria-busy'), 'true');
  assert.equal(d.chip('pitch').textContent, '確認中…');
  assert.equal(d.chip('rhythm').textContent, '確認中…');
  assert.equal(d.panel('pitch').hidden, true);
  renderAppRows(d.root, await controller([summary()]).ctrl.load(), 'pro', true);
  assert.equal(d.list.getAttribute('aria-busy'), null);
});

test('reason mapping follows only what the Account summary reports', () => {
  const base = normalizeSyncCenterSummary(summary({
    chord: { attentionConflictCount: 2, removalSafety: 'attention' },
    pitch: { removalSafety: 'attention' },
    fretboard: { removalSafety: 'unknown', activeAppDeviceCount: 2 },
    rhythm: { state: 'suspended' }
  }), null);
  const byId = Object.fromEntries(base.apps.map((app) => [app.id, app]));
  assert.deepEqual({ ...explainAppAttention(byId.chord) }, { reason: 'conflict', title: '同期する内容の確認が2件あります',
    body: 'アプリを開いて、どちらの内容を残すか選んでください。', action: 'open' });
  assert.equal(explainAppAttention(byId.pitch).reason, 'app_error');
  assert.equal(explainAppAttention(byId.pitch).action, 'open');
  assert.match(explainAppAttention(byId.fretboard).body, /それぞれで一度開いてください/);
  assert.equal(explainAppAttention(byId.rhythm).reason, 'unknown');
  assert.equal(explainAppAttention(byId.rhythm).action, 'recheck');
  assert.equal(explainAppAttention(null).reason, 'unknown');
  assert.equal(explainAppAttention(byId.pitch, 'error').reason, 'unavailable');
  for (const app of base.apps) assert.equal(app.presentationStatus.state, 'attention', 'explanations never upgrade status');
  assert.equal(byId.chord.attentionCount, 2);
  assert.equal(byId.chord.recordCount, 12, 'record count is never shown as an attention count');
});

test('styles keep [hidden] effective and give the tappable chip an affordance', () => {
  const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');
  assert.match(css, /\.sync-center-attention-detail\[hidden\] \{ display: none; \}/);
  assert.match(css, /\.sync-center-app-status-chip--explain::after/);
  assert.match(css, /\.sync-center-app-status-chip--checking/);
});
