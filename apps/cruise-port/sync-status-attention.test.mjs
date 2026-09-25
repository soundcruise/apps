import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSyncCenterController } from './sync-center-controller.js';
import { markAppRowsChecking, renderAppRows } from './sync-center-ui.js';
import { bindSyncCenterReturnRefresh } from './sync-center-refresh.js';

// Sync Center status: fresh state on open/return, offline/unavailable wording, and the checking state.
// Per-target detail (ⓘ) is covered by sync-status-device-detail.test.mjs.
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
  // devices mirrors the summary it was fetched with, so both describe one consistent snapshot.
  let last = null;
  class AccountClient {
    async summary() { calls.summary += 1; const next = responses.shift(); if (next instanceof Error) throw next; last = next; return next; }
    async devices() {
      calls.devices += 1;
      return { devices: [], appDevices: (last?.memberships || []).map((item) => ({
        id: `${item.appId}-0000-target`, appId: item.appId, label: item.appId, createdAt: 1, lastSeenAt: 1,
        revokedAt: null, isCurrent: false,
        lastReport: item.removalSafety === 'safe' ? { state: 'clean', reportedAt: 2, attentionCount: 0 }
          : item.removalSafety === 'attention'
            ? { state: 'attention', reportedAt: 2, attentionCount: item.attentionConflictCount || 0 }
            : { state: 'pending', reportedAt: 2, attentionCount: 0 }
      })) };
    }
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
  const toggle = (appId) => row(appId).children[1].children[1].children[1] || null;
  const panel = (appId) => row(appId).children.find((child) => child.className === 'sync-center-app-info') || null;
  const text = (node) => [node.textContent, ...node.children.map(text)].join('\n');
  return { root, list, row, chip, toggle, panel, text };
}

test('A: opening Sync Center fetches the server state once per load, never from app storage', async () => {
  const { ctrl, calls } = controller([summary()]);
  const presentation = await ctrl.load();
  assert.equal(presentation.kind, 'ready');
  assert.deepEqual(calls, { summary: 1, devices: 1 });
});

test('B: once every target reports clean the row reads ✓ 同期済み, never a device guarantee', async () => {
  const { ctrl } = controller([summary({ rhythm: { removalSafety: 'unknown' } }), summary()]);
  const before = await ctrl.load();
  assert.equal(before.apps.find((app) => app.id === 'rhythm').presentationStatus.state, 'available',
    'an unconfirmed target alone does not raise 確認が必要');
  const after = await ctrl.load();
  const d = dom();
  renderAppRows(d.root, after, 'pro', true);
  assert.equal(d.chip('rhythm').tagName, 'span', 'the status chip is display-only');
  assert.equal(d.chip('rhythm').textContent, '✓ 同期済み');
  for (const phrase of ['全端末同期済み', 'すべて最新', '問題ありません', '削除して']) {
    assert.equal(d.text(d.row('rhythm')).includes(phrase), false, phrase);
  }
});

test('C: a reported attention is the only thing that makes the row 確認が必要', async () => {
  const { ctrl } = controller([summary({ chord: { removalSafety: 'attention', attentionConflictCount: 2 } })]);
  const presentation = await ctrl.load();
  const d = dom();
  renderAppRows(d.root, presentation, 'pro', true, null, { onRecheck: () => {} });
  assert.equal(d.chip('chord').tagName, 'span');
  assert.equal(d.chip('chord').textContent, '確認が必要 2件');
  assert.equal(d.chip('pitch').textContent, '✓ 同期済み');
  assert.equal(presentation.apps.find((app) => app.id === 'chord').removalSafetyLabel, '確認が必要',
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
  renderAppRows(d.root, presentation, 'pro', true, null, { onRecheck: () => {} });
  assert.equal(d.chip('pitch').textContent, 'オフライン');
  d.toggle('pitch').click();
  const panel = d.panel('pitch');
  assert.equal(panel.hidden, false);
  assert.match(d.text(panel), /オフラインのため、最新の状態を確認できません/);
  assert.doesNotMatch(d.text(panel), /同期先|前回の完了報告/, 'no past target state is shown as current');
});

test('G: a summary failure reads 状態を取得できません and offers only a safe recheck', async () => {
  const { ctrl } = controller([summary(), Object.assign(new Error('server'), { status: 503 })]);
  await ctrl.load();
  const presentation = await ctrl.load();
  assert.equal(presentation.kind, 'error');
  const d = dom();
  let rechecks = 0;
  renderAppRows(d.root, presentation, 'pro', true, null, { onRecheck: () => { rechecks += 1; } });
  assert.equal(d.chip('pitch').textContent, '状態を取得できません');
  assert.notEqual(d.chip('pitch').textContent, '確認が必要');
  d.toggle('pitch').click();
  const panel = d.panel('pitch');
  assert.match(d.text(panel), /最新の状態を取得できませんでした/);
  assert.doesNotMatch(d.text(panel), /クラウド上の同期データは利用できます|前回の完了報告/,
    'cloud health is never inferred without the summary');
  const retry = panel.children.at(-1);
  assert.equal(retry.textContent, 'もう一度確認');
  retry.click();
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
  renderAppRows(d.root, await ctrl.load(), 'pro', true, null, { onRecheck: () => {} });
  d.toggle('pitch').click();
  assert.equal(d.panel('pitch').hidden, false);
  markAppRowsChecking(d.root);
  assert.equal(d.list.getAttribute('aria-busy'), 'true');
  assert.equal(d.chip('pitch').textContent, '確認中…');
  assert.equal(d.chip('rhythm').textContent, '確認中…');
  assert.equal(d.panel('pitch').hidden, true);
  assert.equal(d.toggle('pitch').getAttribute('aria-expanded'), 'false');
  assert.equal(d.toggle('pitch').disabled, true, 'stale detail cannot be reopened while checking');
  renderAppRows(d.root, await controller([summary()]).ctrl.load(), 'pro', true);
  assert.equal(d.list.getAttribute('aria-busy'), null);
});

test('styles keep [hidden] effective and give the ⓘ a focus ring', () => {
  const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');
  assert.match(css, /\.sync-center-app-info\[hidden\] \{ display: none; \}/);
  assert.match(css, /\.sync-center-app-info-toggle:focus-visible/);
  assert.match(css, /\.sync-center-app-status-chip--checking/);
  assert.match(css, /\.sync-center-app-status-chip--available/);
  assert.match(css, /\.sync-center-app-status-chip--unavailable/);
  assert.doesNotMatch(css, /sync-center-attention-detail|status-chip--explain/, 'the old chip opener is gone');
});
