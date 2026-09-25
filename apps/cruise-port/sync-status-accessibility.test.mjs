import test from 'node:test';
import assert from 'node:assert/strict';
import { createUnavailablePresentation, createUnsetPresentation, normalizeSyncCenterSummary } from './sync-center-controller.js';
import { markAppRowsChecking, renderAppRows } from './sync-center-ui.js';

// The row action's aria-label must carry the same status the chip shows. It used to embed the
// membership label, so a screen reader could hear 「同期済み」 next to a visible 「確認が必要」.
const account = { id: 'acct', state: 'active', recoveryVersion: 1 };
const ID = 'b91c7f00-0000-4000-8000-000000000001';
const OTHER = '7a3e5d00-0000-4000-8000-000000000002';
function membership(appId, overrides = {}) {
  return { appId, state: 'active', activeAppDeviceCount: 1, attentionConflictCount: 0,
    removalSafety: 'safe', dataset: { state: 'ready', schemaVersion: 1, recordCount: 40 }, ...overrides };
}
const target = (id, lastReport) => ({ id, appId: 'chord', label: 'Chord Cruise', createdAt: 1, lastSeenAt: 2,
  revokedAt: null, isCurrent: false, lastReport });
function ready(targets, chord = {}) {
  return normalizeSyncCenterSummary({ account, memberships: ['chord', 'pitch', 'fretboard', 'rhythm']
    .map((id) => membership(id, id === 'chord' ? { activeAppDeviceCount: targets.length, ...chord } : {})) },
  { devices: [], appDevices: targets });
}

function render(presentation) {
  class Node {
    constructor(tag) { this.tagName = tag; this.children = []; this.attributes = new Map(); this.dataset = {};
      this.textContent = ''; this.className = ''; this.hidden = false; this.handlers = new Map(); }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    removeAttribute(name) { this.attributes.delete(name); }
    addEventListener(type, fn) { this.handlers.set(type, fn); }
    querySelectorAll(selector) {
      const cls = selector.slice(1); const out = [];
      const walk = (node) => { for (const child of node.children) {
        if (String(child.className).split(' ').includes(cls)) out.push(child); walk(child); } };
      walk(this); return out;
    }
  }
  const list = new Node('ul');
  globalThis.document = { createElement: (tag) => new Node(tag) };
  const root = { querySelector: (selector) => (selector === '#sync-center-apps' ? list : null) };
  renderAppRows(root, presentation, 'pro', true, null, { onRecheck: () => {} });
  const row = list.children.find((item) => item.children[1].children[0].textContent === 'コードクルーズ');
  return { root, chip: row.children[1].children[1].children[0], action: row.children[2].children[0] };
}

const CASES = [
  ['✓ 同期済み', () => ready([target(ID, { state: 'clean', reportedAt: 1, attentionCount: 0 })])],
  ['確認が必要 2件', () => ready([target(ID, { state: 'attention', reportedAt: 1, attentionCount: 2 })],
    { removalSafety: 'attention', attentionConflictCount: 2 })],
  ['確認が必要', () => ready([target(ID, { state: 'error', reportedAt: 1, attentionCount: 0 })], { removalSafety: 'attention' })],
  ['再確認が必要', () => ready([target(ID, { state: 'clean', reportedAt: 1, attentionCount: 0 }),
    target(OTHER, { state: 'error', reportedAt: 1, attentionCount: 0 })], { removalSafety: 'safe' })],
  ['オフライン', () => createUnavailablePresentation('offline', ready([target(ID, null)], { removalSafety: 'unknown' }))],
  ['状態を取得できません', () => createUnavailablePresentation('error', ready([target(ID, null)], { removalSafety: 'unknown' }))],
  ['未接続', () => createUnsetPresentation()]
];

for (const [status, make] of CASES) {
  test(`aria-label carries the visible status: ${status}`, () => {
    const { chip, action } = render(make());
    assert.equal(chip.textContent, status);
    const label = action.getAttribute('aria-label');
    assert.ok(label.startsWith('コードクルーズで'), label);
    assert.ok(label.endsWith(`（${status}）`), `${label} ends with the chip status`);
    if (status !== '✓ 同期済み') assert.doesNotMatch(label, /同期済み/, 'no stale 同期済み');
    assert.doesNotMatch(label, /removalSafety|membership|snapshot|[0-9a-f]{8}-/i, 'no technical detail');
  });
}

test('while rows are checking the aria-label says 確認中… too', () => {
  const { root, chip, action } = render(ready([target(ID, { state: 'error', reportedAt: 1, attentionCount: 0 })],
    { removalSafety: 'attention' }));
  markAppRowsChecking(root);
  assert.equal(chip.textContent, '確認中…');
  assert.equal(action.getAttribute('aria-label'), 'コードクルーズで同期を解除（確認中…）');
});
