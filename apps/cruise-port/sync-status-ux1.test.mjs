import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSyncCenterController, createUnavailablePresentation, createUnsetPresentation,
  normalizeSyncCenterSummary } from './sync-center-controller.js';
import { SYNC_DETAIL_COPY, describeAppSyncDetail } from './sync-center-device-detail.js';
import { SYNC_DETACH_NOTE, renderAppRows } from './sync-center-ui.js';
import { createSnapshotMismatchRetry } from './sync-center-refresh.js';
import { createPortSyncStatus } from './port-sync-status.js';

// Cloud Sync UX 2.0 Phase UX1: 「✓ 同期済み」 is the normal product status; pending / no report
// stays normal; every other main status carries its next step in the same ⓘ; Safe-to-remove,
// detach and Port's own sync status are untouched.
const account = { id: 'acct', state: 'active', recoveryVersion: 1 };
const PIXEL = 'b91c7f00-0000-4000-8000-000000000001';
const MAC = '7a3e5d00-0000-4000-8000-000000000002';

function membership(appId, overrides = {}) {
  return { appId, state: 'active', activeAppDeviceCount: 1, attentionConflictCount: 0,
    removalSafety: 'safe', dataset: { state: 'ready', schemaVersion: 1, recordCount: 40 }, ...overrides };
}
function summary(overrides = {}) {
  return { account, memberships: ['chord', 'pitch', 'fretboard', 'rhythm'].map((id) => membership(id, overrides[id])) };
}
function target(id, lastReport, extra = {}) {
  return { id, appId: 'chord', label: 'Chord Cruise', createdAt: 1, lastSeenAt: 2, revokedAt: null,
    isCurrent: false, lastReport, ...extra };
}
const clean = () => ({ state: 'clean', reportedAt: 10, attentionCount: 0 });
const pending = () => ({ state: 'pending', reportedAt: 10, attentionCount: 0 });
const attention = (count) => ({ state: 'attention', reportedAt: 10, attentionCount: count });
const error = () => ({ state: 'error', reportedAt: 10, attentionCount: 0 });

function presentationFor(targets, chord = {}) {
  return normalizeSyncCenterSummary(summary({ chord: { activeAppDeviceCount: targets.length, ...chord } }),
    { devices: [], appDevices: targets });
}
const chordOf = (presentation) => presentation.apps.find((app) => app.id === 'chord');

function render(presentation, handlers = { onRecheck: () => {} }) {
  class Node {
    constructor(tag) { this.tagName = tag; this.children = []; this.attributes = new Map(); this.dataset = {};
      this.textContent = ''; this.className = ''; this.hidden = false; this.handlers = new Map(); this.disabled = false; }
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
  renderAppRows({ querySelector: (selector) => (selector === '#sync-center-apps' ? list : null) },
    presentation, 'pro', true, null, handlers);
  const row = list.children.find((item) => item.children[1]?.children[0]?.textContent === 'コードクルーズ');
  const statusLine = row.children[1].children[1];
  const walk = (node, out = []) => { out.push(node); node.children.forEach((child) => walk(child, out)); return out; };
  const panel = row.children.find((child) => child.className === 'sync-center-app-info') || null;
  return {
    row, chip: statusLine.children[0], toggle: statusLine.children[1] || null, panel, walk,
    text: (node) => walk(node).map((item) => item.textContent).join('\n'),
    action: row.children[2].children[0]
  };
}

// Every non-normal ⓘ must give something to do: a target to open, a recheck, waiting, or support.
function assertNextAction(view, message) {
  assert.ok(view.panel, `${message}: ⓘ exists`);
  const text = view.text(view.panel);
  const retry = view.walk(view.panel).some((node) => node.tagName === 'button' && node.textContent === 'もう一度確認');
  const step = /を開き、同期画面|もう一度確認|自動で状態を確認|Cruise Portに戻ると表示が更新|しばらくお待ちください/.test(text);
  assert.ok(retry || step, `${message}: a next action is offered`);
}

function assertNoLaunch(view) {
  for (const node of view.walk(view.row)) {
    assert.doesNotMatch(node.textContent, /を開く$|この端末で開く|アプリを開く/, 'no launch CTA');
    assert.equal(node.tagName === 'a', false, 'no app link');
  }
}

test('1: all clean → ✓ 同期済み with a simple row', () => {
  const view = render(presentationFor([target(PIXEL, clean()), target(MAC, clean(), { label: 'Mac Safari' })]));
  assert.equal(view.chip.textContent, '✓ 同期済み');
  assert.equal(view.row.children[1].children.length, 2, 'name + status line only, no secondary text');
  assert.equal(view.panel.hidden, true);
});

test('2/3/4: pending, no report, and clean + pending stay ✓ 同期済み without user action', () => {
  for (const [targets, safety] of [
    [[target(PIXEL, pending())], 'unknown'],
    [[target(PIXEL, null)], 'unknown'],
    [[target(PIXEL, clean()), target(MAC, pending(), { label: 'Mac Safari' })], 'unknown']
  ]) {
    const presentation = presentationFor(targets, { removalSafety: safety });
    const view = render(presentation);
    assert.equal(view.chip.textContent, '✓ 同期済み');
    assert.equal(chordOf(presentation).snapshot, 'aligned');
    const text = view.text(view.panel);
    assert.doesNotMatch(text, /確認が必要|要確認|エラー|解決しない場合/);
    assert.equal(view.walk(view.panel).some((node) => node.tagName === 'button'), false, 'no action demanded');
  }
});

test('ⓘ explains 「同期済み」 briefly and keeps the Phase 1B technical detail', () => {
  const view = render(presentationFor([target(PIXEL, clean()), target(MAC, pending(), { label: 'Mac Safari' })],
    { removalSafety: 'unknown' }));
  assert.equal(view.toggle.textContent, 'i', 'the same neutral affordance');
  const summaryLine = view.panel.children[0];
  assert.equal(summaryLine.className, 'sync-center-app-info-summary');
  assert.equal(summaryLine.textContent, '「同期済み」は、クラウド同期を通常利用でき、現在確認されている問題がない状態です。');
  const text = view.text(view.panel);
  assert.match(text, /前回の完了報告あり/);
  assert.match(text, /最新の完了報告は未確認/);
  assert.match(text, /最終報告/);
  assert.match(text, /登録名「Chord Cruise」/);
  assert.doesNotMatch(text, /削除しても|解除しても安全|全端末/);
});

test('5: aligned attention → 確認が必要 N件 with count, target, report and next step', () => {
  const presentation = presentationFor([target(PIXEL, clean(), { label: 'iPhone' }),
    target(MAC, attention(2), { label: 'Pixel' })], { removalSafety: 'attention', attentionConflictCount: 2 });
  const view = render(presentation);
  assert.equal(view.chip.textContent, '確認が必要 2件');
  const text = view.text(view.panel);
  assert.match(text, /確認する内容が2件あります。/);
  assert.match(text, /登録名「Pixel」\n前回の同期報告に確認事項があります\n確認する内容 2件/);
  assert.match(text, /登録名「Pixel」のコードクルーズを開き、同期画面で内容を確認してください。/);
  assert.match(text, /解決しない場合は、画面下の「クラウド同期で困ったときは」からお知らせください。/);
  assert.doesNotMatch(text, /40件/, 'record count is never presented as items to check');
  assertNextAction(view, 'attention');
  assertNoLaunch(view);
});

test('6: aligned error → 確認が必要 as a past report, with where to look', () => {
  const view = render(presentationFor([target(PIXEL, error(), { label: 'Pixel' })], { removalSafety: 'attention' }));
  assert.equal(view.chip.textContent, '確認が必要');
  const text = view.text(view.panel);
  assert.equal(view.panel.children[0].textContent, '前回の同期報告でエラーが報告されています。');
  assert.match(text, /登録名「Pixel」のコードクルーズを開き、同期画面を確認してください。/);
  assert.doesNotMatch(text, /停止しています|現在も/);
  assertNextAction(view, 'error');
});

test('7: attention on targets that cannot be told apart still gets an app-wide next step', () => {
  const view = render(presentationFor([target(PIXEL, attention(1)), target(MAC, clean())],
    { removalSafety: 'attention', attentionConflictCount: 1 }));
  const text = view.text(view.panel);
  assert.match(text, /同期先 B91Cは、登録名で区別できないため/);
  assert.match(text, /コードクルーズを使っている端末・ブラウザでコードクルーズを開き、同期画面を確認してください。/);
  assert.doesNotMatch(text, /同期先 7A3Eの/, 'a clean target is never pointed at');
});

test('8/9/10: mismatch retries automatically at most once, then 再確認が必要 with a manual recheck', async () => {
  const mismatch = presentationFor([target(PIXEL, clean()), target(MAC, attention(1))], { removalSafety: 'safe' });
  assert.equal(chordOf(mismatch).snapshot, 'mismatch');
  const retry = createSnapshotMismatchRetry();
  assert.equal(retry.shouldRetry(mismatch), true, 'first detection retries');
  assert.equal(retry.shouldRetry(mismatch), false, 'never twice in one visit');
  assert.equal(retry.shouldRetry(mismatch), false);
  retry.reset();
  assert.equal(retry.shouldRetry({ kind: 'ready', apps: [{ snapshot: 'aligned' }, { snapshot: 'unverified' }] }), false,
    'aligned needs no retry');
  assert.equal(retry.shouldRetry(createUnavailablePresentation('error')), false, 'failures are not mismatches');
  assert.equal(retry.shouldRetry(mismatch), true, 'a new visit allows one again');

  let rechecks = 0;
  const view = render(mismatch, { onRecheck: () => { rechecks += 1; } });
  assert.equal(view.chip.textContent, '再確認が必要');
  const text = view.text(view.panel);
  assert.match(text, /最新情報をもう一度確認してください。/);
  assert.doesNotMatch(text, /登録名|同期先 [0-9A-F]{4}|前回の同期報告/, 'no device is blamed');
  const button = view.panel.children.at(-1);
  assert.equal(button.textContent, 'もう一度確認');
  button.click();
  assert.equal(rechecks, 1);

  const app = readFileSync(new URL('./practice-menu-app.js', import.meta.url), 'utf8');
  const body = app.slice(app.indexOf('async function renderSyncCenterView'), app.indexOf('function findGearItem'));
  assert.equal((body.match(/syncCenterMismatchRetry\.shouldRetry/g) || []).length, 1);
  assert.equal((body.match(/syncCenterController\.load\(\)/g) || []).length, 2, 'initial load + at most one retry');
  assert.doesNotMatch(body, /while\s*\(|setInterval|setTimeout/, 'no loop or polling');
  assert.match(app, /lastRenderedHash !== SYNC_CENTER_ROUTE\) syncCenterMismatchRetry\.reset\(\)/);
});

test('11: summary failure → 状態を取得できません with retry and support', async () => {
  const view = render(createUnavailablePresentation('error'));
  assert.equal(view.chip.textContent, '状態を取得できません');
  const text = view.text(view.panel);
  assert.match(text, /通信状態を確認して、もう一度確認してください。/);
  assert.match(text, /クラウド同期で困ったときは/);
  assert.equal(view.panel.children.at(-1).textContent, 'もう一度確認');
  assert.doesNotMatch(text, /AI/, 'no placeholder AI button');
});

test('12: devices failure keeps the summary status and explains the missing detail', async () => {
  class AccountClient {
    async summary() { return summary({ chord: { removalSafety: 'unknown' } }); }
    async devices() { throw Object.assign(new Error('server'), { status: 503 }); }
  }
  const ctrl = createSyncCenterController({ config: { enabled: true, endpoint: 'https://example.invalid' }, online: () => true,
    accountRoot: { AccountClient, core: {}, storage: { async getAccount() { return { accountCredential: 'dummy' }; } } } });
  const view = render(await ctrl.load());
  assert.equal(view.chip.textContent, '✓ 同期済み');
  const text = view.text(view.panel);
  assert.match(text, /同期先の詳細情報を取得できませんでした/);
  assert.equal(view.panel.children.at(-1).textContent, 'もう一度確認');
});

test('13: offline → オフライン with the automatic re-check on reconnection', () => {
  const view = render(createUnavailablePresentation('offline', presentationFor([target(PIXEL, clean())])));
  assert.equal(view.chip.textContent, 'オフライン');
  assert.match(view.text(view.panel), /インターネットに接続すると、自動で状態を確認します。/);
  assertNextAction(view, 'offline');
  const refresh = readFileSync(new URL('./sync-center-refresh.js', import.meta.url), 'utf8');
  assert.match(refresh, /addEventListener\?\.\('online', trigger\)/, 'the promise is backed by the online listener');
});

test('14: unconnected rows keep their connection action', () => {
  const unset = render(createUnsetPresentation());
  assert.equal(unset.chip.textContent, '未接続');
  assert.equal(unset.action.textContent, '先にアカウントを作成または接続してください');
  const detached = render(normalizeSyncCenterSummary(summary({ chord: { activeAppDeviceCount: 0 } }),
    { devices: [], appDevices: [] }));
  assert.equal(detached.chip.textContent, '未接続');
  assert.equal(detached.action.textContent, '同期コード');
});

test('15: 確認中… is only the in-flight state', () => {
  const ui = readFileSync(new URL('./sync-center-ui.js', import.meta.url), 'utf8');
  assert.equal((ui.match(/'確認中…'/g) || []).length, 1, 'set only by markAppRowsChecking');
  assert.match(ui, /list\.removeAttribute\('aria-busy'\)/, 'every render clears it');
});

test('16/17: lifecycle states are shown as progress, not folded into 確認が必要', () => {
  const connecting = render(normalizeSyncCenterSummary(summary({ chord: { dataset: { state: 'initializing' } } }),
    { devices: [], appDevices: [target(PIXEL, null)] }));
  assert.equal(connecting.chip.textContent, '接続中');
  assert.match(connecting.text(connecting.panel), /接続したアプリを開くと、初回の同期が進みます。/);
  assertNextAction(connecting, 'connecting');
  const initial = render(normalizeSyncCenterSummary(summary({ chord: { activeAppDeviceCount: 0, dataset: { state: 'empty' } } }),
    { devices: [], appDevices: [] }));
  assert.equal(initial.chip.textContent, '同期中');
  assertNextAction(initial, 'initial');
  const deleting = render(normalizeSyncCenterSummary(summary({ chord: { state: 'deleting', deletedAt: 5 } }),
    { devices: [], appDevices: [] }));
  assert.equal(deleting.chip.textContent, '削除中');
  assert.match(deleting.text(deleting.panel), /削除を処理しています。完了まで、しばらくお待ちください。/);
  for (const view of [connecting, initial, deleting]) {
    assert.doesNotMatch(view.text(view.panel), /確認が必要|要確認/);
  }
});

test('membership attention (not a reported problem) still offers a recheck and support', () => {
  const view = render(normalizeSyncCenterSummary(summary({ chord: { state: 'suspended' } }), { devices: [], appDevices: [] }));
  assert.equal(view.chip.textContent, '確認が必要');
  assert.match(view.text(view.panel), /時間をおいて、もう一度確認してください。/);
  assert.equal(view.panel.children.at(-1).textContent, 'もう一度確認');
});

test('every non-normal ready status offers a next action', () => {
  const cases = [
    presentationFor([target(PIXEL, attention(1), { label: 'Pixel' })], { removalSafety: 'attention', attentionConflictCount: 1 }),
    presentationFor([target(PIXEL, error())], { removalSafety: 'attention' }),
    presentationFor([target(PIXEL, clean()), target(MAC, error())], { removalSafety: 'safe' })
  ];
  for (const presentation of cases) {
    const view = render(presentation);
    assert.notEqual(view.chip.textContent, '✓ 同期済み');
    assertNextAction(view, view.chip.textContent);
  }
});

test('18: Safe-to-remove authority and labels are unchanged', () => {
  const pendingOnly = chordOf(presentationFor([target(PIXEL, clean()), target(MAC, pending())], { removalSafety: 'unknown' }));
  assert.equal(pendingOnly.presentationStatus.label, '✓ 同期済み');
  assert.equal(pendingOnly.removalSafety, 'unknown', '✓ 同期済み is never a reason removal is safe');
  assert.equal(pendingOnly.removalSafetyLabel, '同期を確認してください');
  const safe = chordOf(presentationFor([target(PIXEL, clean())]));
  assert.equal(safe.removalSafetyLabel, '同期完了');
  const flagged = chordOf(presentationFor([target(PIXEL, attention(1))], { removalSafety: 'attention', attentionConflictCount: 1 }));
  assert.equal(flagged.removalSafetyLabel, '確認が必要');
});

test('19: detach copy names the app\'s own sync status; the condition itself is unchanged', () => {
  assert.equal(SYNC_DETACH_NOTE, 'まだ同期していない変更がある場合は、解除する前に対象のアプリを開き、そのアプリ内の同期状態が「同期済み」になっていることを確認してください。');
  assert.doesNotMatch(SYNC_DETACH_NOTE, /✓|Cruise Portの/, 'Port\'s ✓ 同期済み is never the removal basis');
  const view = render(presentationFor([target(PIXEL, pending())], { removalSafety: 'unknown' }));
  assert.equal(view.action.textContent, '同期を解除');
  assert.equal(view.action.dataset.syncAppDetach, 'chord');
});

test('20: no app launch CTA returns in any state', () => {
  for (const presentation of [
    presentationFor([target(PIXEL, clean(), { label: 'Pixel', isCurrent: true })]),
    presentationFor([target(PIXEL, attention(1), { label: 'Pixel', isCurrent: true })], { removalSafety: 'attention', attentionConflictCount: 1 }),
    presentationFor([target(PIXEL, error(), { label: 'Pixel' })], { removalSafety: 'attention' }),
    presentationFor([target(PIXEL, clean()), target(MAC, error())], { removalSafety: 'safe' }),
    createUnavailablePresentation('error'), createUnavailablePresentation('offline')
  ]) {
    const view = render(presentation);
    assertNoLaunch(view);
    const buttons = view.walk(view.row).filter((node) => node.tagName === 'button').map((node) => node.textContent);
    for (const label of buttons) assert.ok(['i', 'もう一度確認', '同期を解除'].includes(label), label);
  }
});

test('21: Port own sync status keeps its own vocabulary', () => {
  const base = { accountState: 'active', online: true,
    assets: { known: true, pendingCount: 0, running: false, error: false } };
  const structured = { known: true, connected: true, migrationState: 'complete', datasetState: 'ready',
    runtimeState: 'ready', lastSyncAt: 1, pendingCount: 0, conflictCount: 0 };
  assert.equal(createPortSyncStatus({ ...base, structured }).label, '✓ 同期済み');
  assert.equal(createPortSyncStatus({ ...base, structured: { ...structured, conflictCount: 1 } }).label, '確認が必要');
  const source = readFileSync(new URL('./port-sync-status.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /sync-center-device-detail|SYNC_DETAIL_COPY/);
});

test('copy stays plain: no internal terms and no long disclaimer on the normal row', () => {
  const copy = Object.values(SYNC_DETAIL_COPY).join('\n');
  assert.doesNotMatch(copy, /dataset|membership|snapshot|App Device|removalSafety|pending|mismatch/);
  assert.ok(SYNC_DETAIL_COPY.synced.length <= 45, 'the ⓘ explanation is one short sentence');
  assert.equal(describeAppSyncDetail(chordOf(presentationFor([target(PIXEL, clean())]))).support, false,
    'no support pointer on the normal status');
});

test('narrow layouts keep the app name readable next to a long disabled action', () => {
  const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');
  assert.match(css, /\.sync-center-app-row-actions \{[^}]*max-width: 132px;/, 'wide phones cap the action column');
  assert.match(css, /@media \(max-width: 359px\) \{[^@]*\.sync-center-app-row-actions \{ max-width: 104px; \}/,
    '320px keeps 「未接続」 and the app name on readable lines');
  assert.match(css, /@media \(max-width: 359px\) \{[^@]*padding-inline: 6px;/, '「再確認が必要」 fits at 320px');
});
