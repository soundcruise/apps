import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSyncCenterController, normalizeSyncCenterSummary } from './sync-center-controller.js';
import { describeAppSyncDetail, shortTargetIds } from './sync-center-device-detail.js';
import { renderAppRows } from './sync-center-ui.js';
import { createPortSyncStatus } from './port-sync-status.js';

// ⓘ detail: the cloud state from the Account summary plus each active sync target's own last
// report from /v2/accounts/devices. The main row stays simple; only a reported attention or
// error raises 「確認が必要」, and Port never offers to open an app for a specific target.
const account = { id: 'acct', state: 'active', recoveryVersion: 1 };
const IPHONE = 'b91c7f00-0000-4000-8000-000000000001';
const ANDROID = '7a3e5d00-0000-4000-8000-000000000002';

function membership(appId, overrides = {}) {
  return { appId, state: 'active', activeAppDeviceCount: 1, attentionConflictCount: 0,
    removalSafety: 'safe', dataset: { state: 'ready', schemaVersion: 1, recordCount: 12 }, ...overrides };
}
function summary(overrides = {}) {
  return { account, memberships: ['chord', 'pitch', 'fretboard', 'rhythm'].map((id) => membership(id, overrides[id])) };
}
function target(appId, id, lastReport, extra = {}) {
  return { id, appId, label: 'Chord Cruise', createdAt: Date.UTC(2026, 8, 20, 1), lastSeenAt: Date.UTC(2026, 8, 24, 12),
    revokedAt: null, isCurrent: false, lastReport, ...extra };
}
const clean = (reportedAt = Date.UTC(2026, 8, 24, 12, 7)) => ({ state: 'clean', reportedAt, attentionCount: 0 });
const pending = () => ({ state: 'pending', reportedAt: Date.UTC(2026, 8, 24, 9), attentionCount: 0 });
const attention = (count = 2) => ({ state: 'attention', reportedAt: Date.UTC(2026, 8, 24, 9), attentionCount: count });
const error = () => ({ state: 'error', reportedAt: Date.UTC(2026, 8, 24, 9), attentionCount: 0 });

function chordPresentation(chordTargets, chordMembership = {}) {
  return normalizeSyncCenterSummary(summary({ chord: { activeAppDeviceCount: chordTargets.length, ...chordMembership } }), {
    devices: [], appDevices: chordTargets
  });
}
const chord = (presentation) => presentation.apps.find((app) => app.id === 'chord');
const formatTime = (value) => new Date(value).toISOString().slice(5, 16).replace('T', ' ');
const detailOf = (presentation, options = {}) => describeAppSyncDetail(chord(presentation),
  { kind: presentation.kind, devicesState: presentation.devicesState, formatTime, ...options });

function dom() {
  class Node {
    constructor(tag) { this.tagName = tag; this.children = []; this.attributes = new Map(); this.dataset = {};
      this.textContent = ''; this.className = ''; this.hidden = false; this.handlers = new Map(); this.disabled = false;
      this.classList = { add: (name) => { this.className = `${this.className} ${name}`.trim(); } }; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    removeAttribute(name) { this.attributes.delete(name); }
    addEventListener(type, fn) { this.handlers.set(type, fn); }
    click() { this.handlers.get('click')?.({ stopPropagation() {} }); }
    querySelectorAll() { return []; }
  }
  const list = new Node('ul');
  globalThis.document = { createElement: (tag) => new Node(tag) };
  const root = { querySelector: (selector) => (selector === '#sync-center-apps' ? list : null) };
  const row = (name) => list.children.find((item) => item.children[1]?.children[0]?.textContent === name);
  const walk = (node, out = []) => { out.push(node); node.children.forEach((child) => walk(child, out)); return out; };
  const text = (node) => walk(node).map((item) => item.textContent).join('\n');
  return { root, list, row, walk, text };
}

function renderChord(presentation, handlers = {}) {
  const d = dom();
  renderAppRows(d.root, presentation, 'pro', true, null, handlers);
  const row = d.row('コードクルーズ');
  const statusLine = row.children[1].children[1];
  return { ...d, row, chip: statusLine.children[0], toggle: statusLine.children[1],
    panel: row.children.find((child) => child.className === 'sync-center-app-info') };
}

function assertNoLaunch(d, row) {
  for (const node of d.walk(row)) {
    assert.doesNotMatch(node.textContent, /を開く$|この端末で開く|アプリを開く/, 'no launch CTA');
    assert.equal(node.tagName === 'a' && /cruise/i.test(node.href || ''), false, 'no app link');
  }
  const buttons = d.walk(row).filter((node) => node.tagName === 'button').map((node) => node.textContent);
  for (const label of buttons) assert.ok(['i', 'もう一度確認', '同期を解除', '名前を変更'].includes(label), label);
}

test('1: all targets clean — simple row, ⓘ lists each target with 前回の完了報告あり', () => {
  const presentation = chordPresentation([target('chord', IPHONE, clean()), target('chord', ANDROID, clean(), { label: 'Android Chrome' })]);
  const d = renderChord(presentation);
  assert.equal(d.chip.textContent, '✓ 同期済み');
  assert.equal(d.toggle.tagName, 'button');
  assert.equal(d.toggle.getAttribute('aria-label'), 'コードクルーズの同期情報');
  assert.equal(d.toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(d.toggle.getAttribute('aria-controls'), 'sync-center-app-info-chord');
  assert.equal(d.panel.hidden, true, 'details stay out of the main screen');
  d.toggle.click();
  assert.equal(d.panel.hidden, false);
  assert.equal(d.toggle.getAttribute('aria-expanded'), 'true');
  const text = d.text(d.panel);
  assert.match(text, /クラウド\nクラウド上の同期データは利用できます/);
  assert.match(text, /同期先/);
  assert.equal((text.match(/前回の完了報告あり/g) || []).length, 2);
  assert.match(text, /最終報告 \d{1,2}\/\d{1,2} \d{2}:\d{2}・追加 \d{1,2}\/\d{1,2} \d{2}:\d{2}/);
  assert.doesNotMatch(text, /最終利用/, 'lastSeenAt is never presented as a report time');
  assert.doesNotMatch(text, /全端末同期済み|すべて最新|問題ありません/);
  d.toggle.click();
  assert.equal(d.panel.hidden, true);
});

test('2/5: pending and never-reported targets stay neutral and are not called errors', () => {
  const presentation = chordPresentation([target('chord', IPHONE, clean()), target('chord', ANDROID, pending()),
    target('chord', 'c0ffee00-0000-4000-8000-000000000003', null)], { removalSafety: 'unknown' });
  const d = renderChord(presentation);
  assert.equal(d.chip.textContent, '✓ 同期済み');
  const text = d.text(d.panel);
  assert.match(text, /最新の完了報告は未確認/);
  assert.match(text, /完了報告はまだ確認できていません/);
  assert.doesNotMatch(text, /同期エラー|問題あり|失敗/);
  const states = detailOf(presentation).targets.map((row) => [row.state, row.mark]);
  assert.deepEqual(states, [['clean', '✓'], ['pending', '○'], ['none', '○']]);
});

test('3: one attention target raises 確認が必要 and names its reported item count', () => {
  const presentation = chordPresentation([target('chord', IPHONE, clean()), target('chord', ANDROID, attention(3))],
    { removalSafety: 'attention', attentionConflictCount: 3 });
  const d = renderChord(presentation);
  assert.equal(d.chip.textContent, '確認が必要 3件');
  const detail = detailOf(presentation);
  assert.equal(detail.targets[1].stateText, '前回の同期報告に確認事項があります');
  assert.equal(detail.targets[1].countText, '確認する内容 3件');
  assert.equal(detail.targets[1].mark, '!');
  assert.equal(detail.notice, null);
});

test('4: one error target is reported as a past report, not as sync currently stopped', () => {
  const presentation = chordPresentation([target('chord', IPHONE, clean()), target('chord', ANDROID, error())],
    { removalSafety: 'attention' });
  const d = renderChord(presentation);
  assert.equal(d.chip.textContent, '確認が必要');
  const text = d.text(d.panel);
  assert.match(text, /前回の同期報告でエラーが報告されています/);
  assert.doesNotMatch(text, /現在も同期が停止中|停止しています/);
});

test('6: several non-clean targets are all listed; no single culprit is assumed', () => {
  const presentation = chordPresentation([
    target('chord', IPHONE, pending(), { label: 'iPhone Safari' }),
    target('chord', ANDROID, attention(1), { label: 'Android Chrome' }),
    target('chord', 'c0ffee00-0000-4000-8000-000000000003', error(), { label: 'Mac Safari' })
  ], { removalSafety: 'attention', attentionConflictCount: 1 });
  const detail = detailOf(presentation);
  assert.deepEqual(detail.targets.map((row) => row.state), ['pending', 'attention', 'error']);
  assert.equal(detail.guidance.length, 3);
  assert.match(detail.guidance[0], /登録名「iPhone Safari」のコードクルーズを開くと、最新の状態を確認できます/);
  assert.match(detail.guidance[1], /登録名「Android Chrome」のコードクルーズを開き、同期画面で内容を確認してください/);
  assert.match(detail.guidance[2], /登録名「Mac Safari」/);
});

test('7: Android pending + iPhone clean stays ✓ 同期済み and guides by registered name only', () => {
  const presentation = chordPresentation([
    target('chord', IPHONE, clean(), { label: 'iPhone Safari', isCurrent: true }),
    target('chord', ANDROID, pending(), { label: 'Android Chrome' })
  ], { removalSafety: 'unknown' });
  const d = renderChord(presentation, { onRecheck: () => {} });
  assert.equal(d.chip.textContent, '✓ 同期済み');
  assert.notEqual(d.chip.textContent, '確認が必要');
  const text = d.text(d.panel);
  assert.match(text, /✓\n+登録名「iPhone Safari」\n前回の完了報告あり/);
  assert.match(text, /○\n+登録名「Android Chrome」\n最新の完了報告は未確認/);
  assert.match(text, /登録名「Android Chrome」のコードクルーズを開くと、最新の状態を確認できます。/);
  assert.match(text, /このCruise Portから接続/);
  assertNoLaunch(d, d.row);
});

test('8: Android attention + iPhone clean is 確認が必要 with the attention on the Android row only', () => {
  const presentation = chordPresentation([
    target('chord', IPHONE, clean(), { label: 'iPhone Safari', isCurrent: true }),
    target('chord', ANDROID, attention(1), { label: 'Android Chrome' })
  ], { removalSafety: 'attention', attentionConflictCount: 1 });
  const d = renderChord(presentation, { onRecheck: () => {} });
  assert.equal(d.chip.textContent, '確認が必要 1件');
  const detail = detailOf(presentation);
  assert.equal(detail.targets[0].state, 'clean');
  assert.equal(detail.targets[1].state, 'attention');
  assert.deepEqual([...detail.guidance], ['登録名「Android Chrome」のコードクルーズを開き、同期画面で内容を確認してください。']);
  assertNoLaunch(d, d.row);
});

test('9/10: no app launch CTA in any state, even for the target connected from this Port', () => {
  for (const [report, safety] of [[pending(), 'unknown'], [attention(1), 'attention'], [error(), 'attention'], [null, 'unknown']]) {
    const presentation = chordPresentation([target('chord', IPHONE, report, { isCurrent: true })], { removalSafety: safety });
    const d = renderChord(presentation, { onRecheck: () => {} });
    assertNoLaunch(d, d.row);
  }
  const ui = readFileSync(new URL('./sync-center-ui.js', import.meta.url), 'utf8');
  const app = readFileSync(new URL('./practice-menu-app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(ui, /onOpenApp|\$\{app\.name\}を開く/);
  assert.doesNotMatch(app, /openCruiseAppFromSyncCenter|onOpenApp/);
});

test('11: labels are registered names only; no platform is inferred and no metadata is required', () => {
  const presentation = chordPresentation([target('chord', IPHONE, pending(), { label: 'Chord Cruise' })],
    { removalSafety: 'unknown' });
  const detail = detailOf(presentation);
  assert.equal(detail.targets[0].name, '登録名「Chord Cruise」');
  const text = JSON.stringify(detail);
  assert.doesNotMatch(text, /iPhone|Android|ホーム画面版|ブラウザ版|Safari|Chrome/,
    'nothing about OS, browser, or Home Screen is added from the label');
  const source = readFileSync(new URL('./sync-center-device-detail.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /userAgent|navigator\./);
});

test('12: duplicate labels keep the label with a short ID; empty labels use the short ID (N1 resolver)', () => {
  const presentation = chordPresentation([
    target('chord', IPHONE, clean()), target('chord', ANDROID, pending()),
    target('chord', 'c0ffee00-0000-4000-8000-000000000003', null, { label: '  ' })
  ], { removalSafety: 'unknown' });
  const detail = detailOf(presentation);
  assert.deepEqual(detail.targets.map((row) => row.name), ['登録名「Chord Cruise」', '登録名「Chord Cruise」', '同期先 C0FF']);
  assert.deepEqual(detail.targets.map((row) => row.secondary), ['同期先 B91C', '同期先 7A3E', null],
    'same names are told apart by the short ID');
  assert.equal(detail.targets.some((row) => row.identifiable), false);
  assert.equal(detail.guidance.length, 1);
  assert.match(detail.guidance[0], /同期先 7A3E・同期先 C0FFは、名前で区別できないため、Cruise Portからはどの端末・ブラウザかを特定できません。「名前を変更」で区別できる名前を付けられます。/);
  assert.doesNotMatch(detail.guidance.join(''), /B91C/, 'a clean target is never pointed at');
});

test('13: short IDs grow until unique and never come from a credential', () => {
  assert.deepEqual(shortTargetIds(['b91c7f00-aaaa', 'b91c7f11-bbbb', 'a0000000-cccc']), ['B91C7F0', 'B91C7F1', 'A000'],
    'only colliding targets grow');
  assert.deepEqual(shortTargetIds(['b91c-0001', '7a3e-0002']), ['B91C', '7A3E']);
  assert.deepEqual(shortTargetIds([null, 'abcd1234']), [null, 'ABCD']);
  const presentation = chordPresentation([target('chord', 'b91c7f00-0000-4000-8000-000000000001', clean()),
    target('chord', 'b91c7f11-0000-4000-8000-000000000002', pending())], { removalSafety: 'unknown' });
  assert.deepEqual(detailOf(presentation).targets.map((row) => row.secondary), ['同期先 B91C7F0', '同期先 B91C7F1']);
});

test('14: summary succeeds and devices fail — row keeps the summary status, ⓘ explains and retries', async () => {
  const calls = { summary: 0, devices: 0 };
  class AccountClient {
    async summary() { calls.summary += 1; return summary({ chord: { removalSafety: 'unknown' } }); }
    async devices() { calls.devices += 1; throw Object.assign(new Error('server'), { status: 503 }); }
  }
  const accountRoot = { AccountClient, core: {}, storage: { async getAccount() { return { accountCredential: 'dummy' }; } } };
  const ctrl = createSyncCenterController({ config: { enabled: true, endpoint: 'https://example.invalid' }, accountRoot, online: () => true });
  const presentation = await ctrl.load();
  assert.equal(presentation.kind, 'ready');
  assert.equal(presentation.devicesState, 'unavailable');
  let rechecks = 0;
  const d = renderChord(presentation, { onRecheck: () => { rechecks += 1; } });
  assert.equal(d.chip.textContent, '✓ 同期済み', 'a devices failure is never turned into 確認が必要');
  const text = d.text(d.panel);
  assert.match(text, /クラウド上の同期データは利用できます/);
  assert.match(text, /同期先の詳細情報を取得できませんでした/);
  const retry = d.panel.children.at(-1);
  assert.equal(retry.textContent, 'もう一度確認');
  retry.click();
  assert.equal(rechecks, 1);
  assert.deepEqual(calls, { summary: 1, devices: 1 });
});

test('14b: a terminal Account code from devices still clears the local Account as before', async () => {
  let cleared = 0;
  class AccountClient {
    async summary() { return summary(); }
    async devices() { throw Object.assign(new Error('revoked'), { code: 'account_device_revoked' }); }
  }
  const accountRoot = { AccountClient, core: {}, storage: {
    async getAccount() { return { accountCredential: 'dummy' }; }, async clearAccount() { cleared += 1; } } };
  const ctrl = createSyncCenterController({ config: { enabled: true, endpoint: 'https://example.invalid' }, accountRoot, online: () => true });
  assert.equal((await ctrl.load()).kind, 'unset');
  assert.equal(cleared, 1);
});

test('15: summary failure never infers cloud health from devices', async () => {
  class AccountClient {
    async summary() { throw Object.assign(new Error('server'), { status: 503 }); }
    async devices() { return { devices: [], appDevices: [target('chord', IPHONE, clean())] }; }
  }
  const accountRoot = { AccountClient, core: {}, storage: { async getAccount() { return { accountCredential: 'dummy' }; } } };
  const ctrl = createSyncCenterController({ config: { enabled: true, endpoint: 'https://example.invalid' }, accountRoot, online: () => true });
  const presentation = await ctrl.load();
  assert.equal(presentation.kind, 'error');
  const d = renderChord(presentation, { onRecheck: () => {} });
  assert.equal(d.chip.textContent, '状態を取得できません');
  assert.doesNotMatch(d.text(d.panel), /利用できます|前回の完了報告あり/);
});

const MISMATCH = '状態を確定できませんでした。最新情報をもう一度確認してください。';

function assertNeutralRecheck(presentation, message) {
  const app = chord(presentation);
  assert.equal(app.snapshot, 'mismatch', message);
  assert.deepEqual({ ...app.presentationStatus }, { state: 'recheck', label: '再確認が必要' }, message);
  let rechecks = 0;
  const d = renderChord(presentation, { onRecheck: () => { rechecks += 1; } });
  assert.equal(d.chip.textContent, '再確認が必要');
  const text = d.text(d.panel);
  assert.match(text, /状態を確定できませんでした。最新情報をもう一度確認してください。/);
  assert.doesNotMatch(text, /登録名|同期先 [0-9A-F]{4}|前回の|最新の完了報告|を開くと|を開き|確認が必要|同期済み/,
    'no target is listed, named, or blamed and no state is asserted');
  const detail = detailOf(presentation);
  assert.equal(detail.targets, null);
  assert.deepEqual([...detail.guidance], []);
  assert.equal(detail.notice, MISMATCH);
  const retry = d.panel.children.at(-1);
  assert.equal(retry.textContent, 'もう一度確認');
  retry.click();
  assert.equal(rechecks, 1);
  assertNoLaunch(d, d.row);
}

test('16a: summary safe / targets report attention → neutral recheck, never 同期済み', () => {
  assertNeutralRecheck(chordPresentation([target('chord', IPHONE, clean(), { label: 'iPhone Safari' }),
    target('chord', ANDROID, attention(1), { label: 'Android Chrome' })], { removalSafety: 'safe' }), 'safe/attention');
});

test('16b: summary safe / targets report error → neutral recheck', () => {
  assertNeutralRecheck(chordPresentation([target('chord', IPHONE, clean()), target('chord', ANDROID, error())],
    { removalSafety: 'safe' }), 'safe/error');
});

test('16c: summary attention / every target clean → neutral recheck, not a stale 確認が必要', () => {
  assertNeutralRecheck(chordPresentation([target('chord', IPHONE, clean(), { label: 'iPhone Safari' }),
    target('chord', ANDROID, clean(), { label: 'Android Chrome' })],
  { removalSafety: 'attention', attentionConflictCount: 1 }), 'attention/clean');
});

test('16d: summary unknown / a target reports attention → neutral recheck', () => {
  assertNeutralRecheck(chordPresentation([target('chord', IPHONE, pending()), target('chord', ANDROID, attention(2))],
    { removalSafety: 'unknown' }), 'unknown/attention');
});

test('16e: summary safe / a target still pending → neutral recheck (safe needs every target clean)', () => {
  assertNeutralRecheck(chordPresentation([target('chord', IPHONE, clean()), target('chord', ANDROID, pending())],
    { removalSafety: 'safe' }), 'safe/pending');
});

test('16f: attention item totals that disagree are a mismatch; record count is never used', () => {
  assertNeutralRecheck(chordPresentation([target('chord', IPHONE, clean()), target('chord', ANDROID, attention(2))],
    { removalSafety: 'attention', attentionConflictCount: 5 }), 'attention count');
  const aligned = chordPresentation([target('chord', IPHONE, clean()), target('chord', ANDROID, attention(2))],
    { removalSafety: 'attention', attentionConflictCount: 2, dataset: { state: 'ready', schemaVersion: 1, recordCount: 2 } });
  assert.equal(chord(aligned).snapshot, 'aligned');
  assert.equal(chord(aligned).presentationStatus.label, '確認が必要');
});

test('16g: a different number of active targets is a mismatch', () => {
  assertNeutralRecheck(normalizeSyncCenterSummary(summary({ chord: { activeAppDeviceCount: 2 } }),
    { devices: [], appDevices: [target('chord', IPHONE, clean())] }), 'count');
});

test('aligned snapshots keep their meaning', () => {
  const safe = chordPresentation([target('chord', IPHONE, clean()), target('chord', ANDROID, clean())]);
  assert.equal(chord(safe).snapshot, 'aligned');
  assert.equal(chord(safe).presentationStatus.label, '✓ 同期済み');
  const unknown = chordPresentation([target('chord', IPHONE, clean()), target('chord', ANDROID, pending()),
    target('chord', 'c0ffee00-0000-4000-8000-000000000003', null)], { removalSafety: 'unknown' });
  assert.equal(chord(unknown).snapshot, 'aligned');
  assert.equal(chord(unknown).presentationStatus.label, '✓ 同期済み', 'pending/no report alone is not 確認が必要');
  const attentionAligned = chordPresentation([target('chord', IPHONE, clean()), target('chord', ANDROID, error())],
    { removalSafety: 'attention' });
  assert.equal(chord(attentionAligned).snapshot, 'aligned');
  assert.equal(chord(attentionAligned).presentationStatus.label, '確認が必要');
  assert.equal(detailOf(attentionAligned).targets[1].state, 'error', 'agreeing snapshots show target detail');
  const noDevices = normalizeSyncCenterSummary(summary({ chord: { removalSafety: 'unknown' } }), null);
  assert.equal(chord(noDevices).snapshot, 'unverified', 'a devices failure is not a mismatch');
  assert.equal(chord(noDevices).presentationStatus.label, '✓ 同期済み');
  const legacy = normalizeSyncCenterSummary(summary(), { devices: [], appDevices: [
    { id: IPHONE, appId: 'chord', label: 'x', createdAt: 1, lastSeenAt: 1, revokedAt: null, isCurrent: false }] });
  assert.equal(chord(legacy).snapshot, 'unverified', 'targets without report data cannot be compared');
});

test('the recheck state is neutral, distinct from checking and offline', () => {
  const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');
  const rule = css.match(/\.sync-center-app-status-chip--recheck \{([^}]*)\}/)?.[1] || '';
  assert.match(rule, /border-style: dashed/);
  assert.doesNotMatch(rule, /232, 176, 104|232, 111, 120|ead39b/, 'no attention/danger colours');
  assert.notEqual('再確認が必要', '確認中…');
});

test('17/18: offline and checking never show stale target detail as current', () => {
  const presentation = chordPresentation([target('chord', ANDROID, pending(), { label: 'Android Chrome' })]);
  const offline = describeAppSyncDetail(chord(presentation), { kind: 'offline' });
  assert.equal(offline.targets, null);
  assert.equal(offline.retry, false);
  const ui = readFileSync(new URL('./sync-center-ui.js', import.meta.url), 'utf8');
  assert.match(ui, /querySelectorAll\?\.\('\.sync-center-app-info'\)\.forEach\(\(panel\) => \{ panel\.hidden = true; \}\)/);
});

test('reports from a Worker without lastReport are shown as unavailable, not as clean', () => {
  const presentation = normalizeSyncCenterSummary(summary(), { devices: [], appDevices: [
    { id: IPHONE, appId: 'chord', label: 'Chord Cruise', createdAt: 1, lastSeenAt: 2, revokedAt: null, isCurrent: false }
  ] });
  assert.equal(detailOf(presentation).targets[0].state, 'unknown');
  assert.equal(detailOf(presentation).targets[0].stateText, '報告の状態を取得できませんでした');
  const malformed = normalizeSyncCenterSummary(summary(), { devices: [], appDevices: [
    target('chord', IPHONE, { state: 'mystery', reportedAt: 1 })
  ] });
  assert.equal(detailOf(malformed).targets[0].state, 'unknown');
});

test('old active targets that never reported are shown neutrally and nothing is cleaned up', () => {
  const targets = Array.from({ length: 10 }, (_, index) => target('chord',
    `${String(index).padStart(4, '0')}aaaa-0000-4000-8000-00000000000${index}`, index === 0 ? clean() : null));
  const presentation = chordPresentation(targets, { removalSafety: 'unknown' });
  const detail = detailOf(presentation);
  assert.equal(detail.targets.length, 10);
  assert.equal(detail.targets.filter((row) => row.state === 'none').length, 9);
  assert.equal(chord(presentation).presentationStatus.state, 'available');
  assert.equal(chord(presentation).environments.length, 10, 'every active target is still listed for manual removal');
});

test('19: Safe-to-remove authority and label are unchanged by the neutral main status', () => {
  const presentation = chordPresentation([target('chord', IPHONE, clean()), target('chord', ANDROID, pending())],
    { removalSafety: 'unknown' });
  assert.equal(chord(presentation).presentationStatus.state, 'available');
  assert.equal(chord(presentation).removalSafety, 'unknown');
  assert.equal(chord(presentation).removalSafetyLabel, '同期を確認してください');
  const safe = chordPresentation([target('chord', IPHONE, clean())]);
  assert.equal(chord(safe).removalSafety, 'safe');
  assert.equal(chord(safe).removalSafetyLabel, '同期完了');
});

test('20/21: the detach action and Port own sync status are unchanged', () => {
  const presentation = chordPresentation([target('chord', IPHONE, pending())], { removalSafety: 'unknown' });
  const d = renderChord(presentation);
  const detach = d.row.children[2].children[0];
  assert.equal(detach.textContent, '同期を解除');
  assert.equal(detach.dataset.syncAppDetach, 'chord');
  assert.equal(createPortSyncStatus({ accountState: 'active', online: true,
    structured: { known: true, connected: true, migrationState: 'complete', datasetState: 'ready',
      runtimeState: 'ready', lastSyncAt: 1, pendingCount: 0, conflictCount: 0 },
    assets: { known: true, pendingCount: 0, running: false, error: false } }).label, '✓ 同期済み',
  'Port keeps its own structured status');
});
