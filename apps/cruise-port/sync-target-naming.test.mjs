import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeSyncCenterSummary } from './sync-center-controller.js';
import { describeAppSyncDetail } from './sync-center-device-detail.js';
import { describeLifecycleAction, describeTargetForConfirm, renderSyncCenter } from './sync-center-ui.js';
import { createSyncCenterOrchestrator } from './sync-center-orchestrator.js';
import { USER_LABEL_MAX, describeSyncTargetNames, normalizeUserLabel } from './sync-target-name.js';
import { RENAME_COPY, openSyncTargetRenameDialog, renameErrorMessage } from './sync-target-rename.js';
import { normalizeSyncTargetUserLabel } from '../../workers/sound-cruise-sync/src/account-validation.js';

// Cloud Sync UX 2.0 Phase N1 in Cruise Port: one display-name resolver (userLabel → registered
// label → short ID) for ⓘ, target management and detach confirmation, and a rename dialog that
// changes only the display name.
const account = { id: 'acct', state: 'active', recoveryVersion: 1 };
const PIXEL = '7a3e5d00-0000-4000-8000-000000000002';
const IPHONE = 'b91c7f00-0000-4000-8000-000000000001';
const MAC = 'c0ffee00-0000-4000-8000-000000000003';

function membership(appId, overrides = {}) {
  return { appId, state: 'active', activeAppDeviceCount: 1, attentionConflictCount: 0,
    removalSafety: 'safe', dataset: { state: 'ready', schemaVersion: 1, recordCount: 12 }, ...overrides };
}
const clean = () => ({ state: 'clean', reportedAt: Date.UTC(2026, 8, 24, 12), attentionCount: 0 });
const attention = (count) => ({ state: 'attention', reportedAt: Date.UTC(2026, 8, 24, 9), attentionCount: count });
function target(id, extra = {}) {
  return { id, appId: 'chord', label: 'Chord Cruise', userLabel: null, createdAt: 1, lastSeenAt: 2,
    revokedAt: null, isCurrent: false, lastReport: clean(), ...extra };
}
function presentation(targets, chord = {}, devices = []) {
  return normalizeSyncCenterSummary({ account, memberships: ['chord', 'pitch', 'fretboard', 'rhythm']
    .map((id) => membership(id, id === 'chord' ? { activeAppDeviceCount: targets.length, ...chord } : { activeAppDeviceCount: 0 })) },
  { devices, appDevices: targets });
}
const chordOf = (p) => p.apps.find((app) => app.id === 'chord');
const formatTime = () => '9/24 21:00';

// A small DOM good enough for rows, lists and the rename dialog.
function installDom() {
  const doc = { activeElement: null };
  class Node {
    constructor(tag) { this.tagName = tag; this.children = []; this.parent = null; this.attributes = new Map();
      this.dataset = {}; this.textContent = ''; this.className = ''; this.hidden = false; this.disabled = false;
      this.value = ''; this.readOnly = false; this.handlers = new Map(); this.open = false; this.returnValue = ''; }
    get isConnected() { let node = this; while (node.parent) node = node.parent; return node === doc.root; }
    append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
    replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this); this.parent = null; }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    removeAttribute(name) { this.attributes.delete(name); }
    addEventListener(type, fn) { if (!this.handlers.has(type)) this.handlers.set(type, []); this.handlers.get(type).push(fn); }
    dispatch(type, extra = {}) {
      const event = { type, defaultPrevented: false, target: extra.target || this, preventDefault() { this.defaultPrevented = true; },
        stopPropagation() {}, ...extra };
      for (const fn of this.handlers.get(type) || []) fn(event);
      return event;
    }
    click() { this.dispatch('click'); }
    focus() { doc.activeElement = this; }
    select() {}
    showModal() { this.open = true; }
    close(value = '') { if (!this.open) return; this.open = false; this.returnValue = value; this.dispatch('close'); }
    closest() { return null; }
    querySelector() { return null; }
    querySelectorAll() { return []; }
  }
  globalThis.document = { createElement: (tag) => new Node(tag) };
  doc.root = new Node('main');
  const walk = (node, out = []) => { out.push(node); node.children.forEach((child) => walk(child, out)); return out; };
  return { doc, Node, root: doc.root, walk, text: (node) => walk(node).map((item) => item.textContent).join('\n') };
}

test('resolver: userLabel → registered label → short ID, with a short second line', () => {
  const names = describeSyncTargetNames([
    { id: PIXEL, userLabel: 'Pixel', registeredLabel: 'Android Chrome' },
    { id: IPHONE, userLabel: null, registeredLabel: 'iPhone Safari' },
    { id: MAC, userLabel: null, registeredLabel: null }
  ]);
  assert.deepEqual(names.map(({ name, secondary, identifiable, reference }) => ({ name, secondary, identifiable, reference })), [
    { name: 'Pixel', secondary: '登録時 Android Chrome · 7A3E', identifiable: true, reference: '「Pixel」' },
    { name: '登録名「iPhone Safari」', secondary: null, identifiable: true, reference: '登録名「iPhone Safari」' },
    { name: '同期先 C0FF', secondary: null, identifiable: false, reference: '同期先 C0FF' }
  ]);
  const sameAsRegistered = describeSyncTargetNames([{ id: PIXEL, userLabel: 'Chord Cruise', registeredLabel: 'Chord Cruise' }]);
  assert.equal(sameAsRegistered[0].secondary, '同期先 7A3E', 'a name equal to the registered label adds only the ID');
});

test('duplicate names are allowed and told apart by the short ID', () => {
  const names = describeSyncTargetNames([
    { id: IPHONE, userLabel: 'iPhone', registeredLabel: 'Chord Cruise' },
    { id: PIXEL, userLabel: 'iPhone', registeredLabel: 'Chord Cruise' }
  ]);
  assert.deepEqual(names.map((item) => item.name), ['iPhone', 'iPhone']);
  assert.deepEqual(names.map((item) => item.secondary), ['登録時 Chord Cruise · B91C', '登録時 Chord Cruise · 7A3E']);
  assert.equal(names.some((item) => item.identifiable), false);
  assert.deepEqual(names.map((item) => item.reference), ['同期先 B91C', '同期先 7A3E'], 'guidance never guesses between them');
});

test('client validation matches the Worker for every vector', () => {
  const vectors = ['  Pixel  ', 'Cafe\u0301', '', '   ', null, 'あ'.repeat(40), 'あ'.repeat(41), '🎸'.repeat(40),
    'a\nb', 'a\rb', 'a\tb', 'a\u0000b', 'a\u0085b', 'a\u2028b', 'a\u202eb', 'a\u2066b', 'a\u200fb', 'a\u061cb',
    'a\ud800b', '<script>alert(1)</script>', 'iPhoneホーム', 'リビングiPad', 7, {}];
  for (const value of vectors) {
    const server = normalizeSyncTargetUserLabel(value);
    const client = normalizeUserLabel(value);
    if (value === undefined) continue;
    assert.equal(client.ok, server !== undefined, JSON.stringify(value));
    if (client.ok) assert.equal(client.value, server, JSON.stringify(value));
  }
  assert.equal(USER_LABEL_MAX, 40);
  assert.equal(normalizeUserLabel('あ'.repeat(41)).reason, 'length');
  assert.equal(normalizeUserLabel('a\nb').reason, 'characters');
});

test('controller keeps registered label and a re-validated userLabel; bad values fall back', () => {
  const p = presentation([target(PIXEL, { label: 'Android Chrome', userLabel: 'Pixel' }),
    target(IPHONE, { userLabel: 'bad\nname' }), target(MAC, { userLabel: 'x'.repeat(41) })],
  {}, [{ id: MAC, label: 'Cruise Port', userLabel: 'Mac Port', isCurrent: true, isPortEnvironment: true, revokedAt: null }]);
  const environments = chordOf(p).environments;
  assert.equal(environments[0].userLabel, 'Pixel');
  assert.equal(environments[0].registeredLabel, 'Android Chrome');
  assert.equal(environments[1].userLabel, null, 'a control character never reaches the UI');
  assert.equal(environments[2].userLabel, null);
  assert.equal(p.environments[0].userLabel, 'Mac Port');
  assert.equal(p.environments[0].isCurrent, true);
});

test('ⓘ shows the user name, the report still follows the device ID, and guidance uses the name', () => {
  const p = presentation([
    target(IPHONE, { label: 'iPhone Safari', userLabel: 'iPhoneホーム', isCurrent: true }),
    target(PIXEL, { label: 'Android Chrome', userLabel: 'Pixel', lastReport: attention(2) })
  ], { removalSafety: 'attention', attentionConflictCount: 2 });
  const detail = describeAppSyncDetail(chordOf(p), { formatTime });
  assert.deepEqual(detail.targets.map((row) => [row.name, row.state, row.secondary]), [
    ['iPhoneホーム', 'clean', '登録時 iPhone Safari · B91C'],
    ['Pixel', 'attention', '登録時 Android Chrome · 7A3E']
  ]);
  assert.equal(detail.targets[1].countText, '確認する内容 2件');
  assert.deepEqual([...detail.guidance], ['「Pixel」のコードクルーズを開き、同期画面で内容を確認してください。']);
  assert.ok(detail.targets[0].meta.includes('このCruise Portから接続'), 'the system marker stays a separate fact');

  const renamed = presentation([
    target(IPHONE, { label: 'iPhone Safari', userLabel: 'Renamed', isCurrent: true }),
    target(PIXEL, { label: 'Android Chrome', userLabel: 'Pixel', lastReport: attention(2) })
  ], { removalSafety: 'attention', attentionConflictCount: 2 });
  const after = describeAppSyncDetail(chordOf(renamed), { formatTime });
  assert.deepEqual(after.targets.map((row) => [row.id, row.state, row.countText]),
    detail.targets.map((row) => [row.id, row.state, row.countText]), 'renaming never moves a report');
});

test('ⓘ rows render the name, second line and an accessible 名前を変更 for each target', () => {
  const dom = installDom();
  const root = { dataset: {}, querySelector: () => null, querySelectorAll: () => [] };
  const lists = { '#sync-center-apps': new dom.Node('ul'), '#sync-center-add-environments': new dom.Node('ul'),
    '#sync-center-app-environments': new dom.Node('ul') };
  root.querySelector = (selector) => lists[selector] || null;
  renderSyncCenter(root, presentation([target(PIXEL, { label: 'Android Chrome', userLabel: '<b>Pixel</b>' })]),
    { edition: 'pro', orchestrationEnabled: true });
  const chordRow = lists['#sync-center-apps'].children.find((row) => row.children[1].children[0].textContent === 'コードクルーズ');
  const panel = chordRow.children.find((child) => child.className === 'sync-center-app-info');
  const text = dom.text(panel);
  assert.match(text, /<b>Pixel<\/b>\n登録時 Android Chrome · 7A3E/, 'the name is plain text, never markup');
  const rename = dom.walk(panel).find((node) => node.dataset.syncTargetRename);
  assert.equal(rename.textContent, '名前を変更');
  assert.equal(rename.getAttribute('aria-label'), '<b>Pixel</b>の名前を変更');
  assert.deepEqual({ ...rename.dataset }, { syncTargetRename: 'app', syncTargetId: PIXEL, syncTargetApp: 'chord',
    syncTargetContext: 'コードクルーズ', syncTargetUserLabel: '<b>Pixel</b>', syncTargetRegisteredLabel: 'Android Chrome',
    syncTargetShortId: '7A3E' });
  const revoke = dom.walk(panel).find((node) => node.dataset.syncAppEnvironmentRevoke);
  assert.equal(revoke.textContent, '解除', 'ⓘ offers the same per-target detach as target management');
  assert.equal(revoke.getAttribute('aria-label'), '<b>Pixel</b>を解除');
  assert.equal(revoke.dataset.syncAppEnvironmentRevoke, PIXEL, 'revoke authority is the device ID');
  assert.equal(revoke.dataset.syncAppEnvironmentApp, 'chord');
  assert.equal(revoke.dataset.syncTargetLabel, '「<b>Pixel</b>」（コードクルーズ・7A3E）', 'the confirmation names the exact target');
  const ui = readFileSync(new URL('./sync-center-ui.js', import.meta.url), 'utf8');
  const rename2 = readFileSync(new URL('./sync-target-rename.js', import.meta.url), 'utf8');
  assert.doesNotMatch(ui + rename2, /innerHTML|insertAdjacentHTML|outerHTML/, 'names are only written via textContent/value');
});

test('management list: same names, separate current marker, rename for Port and app targets, named detach', () => {
  const dom = installDom();
  const lists = { '#sync-center-apps': new dom.Node('ul'), '#sync-center-add-environments': new dom.Node('ul'),
    '#sync-center-app-environments': new dom.Node('ul') };
  const root = { dataset: {}, querySelector: (selector) => lists[selector] || null, querySelectorAll: () => [] };
  const p = presentation([target(PIXEL, { label: 'Android Chrome', userLabel: 'Pixel' })], {}, [
    { id: MAC, label: 'Cruise Port', userLabel: 'このCruise Port', isCurrent: true, isPortEnvironment: true, revokedAt: null },
    { id: IPHONE, label: 'Cruise Port', userLabel: null, isCurrent: false, isPortEnvironment: true, revokedAt: null }
  ]);
  renderSyncCenter(root, p, { edition: 'pro', orchestrationEnabled: true });
  const portRow = lists['#sync-center-add-environments'].children[0];
  const portItems = portRow.children.find((child) => child.dataset.syncEnvironmentDetails === 'port').children;
  const current = portItems[0];
  const copy = current.children[0];
  assert.equal(copy.children[0].className, 'sync-center-environment-name');
  assert.equal(copy.children[0].textContent, 'このCruise Port', 'a user name that looks like the marker is still just a name');
  assert.equal(copy.children[1].className, 'sync-center-environment-current');
  assert.equal(copy.children[1].textContent, 'この環境', 'the real marker is a separate element');
  const portRename = current.children.find((node) => node.dataset.syncTargetRename);
  assert.equal(portRename.dataset.syncTargetRename, 'account');
  assert.equal(portRename.dataset.syncTargetContext, 'Cruise Port');
  const other = portItems[1];
  assert.equal(other.children[0].children[0].textContent, '登録名「Cruise Port」');
  assert.equal(other.children[0].children[1].textContent, '最終利用 不明',
    'the other name is already unique (the first has a user name), so no ID line is added');
  const otherRevoke = other.children.find((node) => node.dataset.syncEnvironmentRevoke);
  assert.equal(otherRevoke.dataset.syncTargetLabel, '登録名「Cruise Port」（Cruise Port・B91C）',
    'the confirmation always carries the short ID');

  const chordRow = lists['#sync-center-app-environments'].children.find((row) =>
    row.children.some((child) => child.dataset.syncEnvironmentDetails === 'chord'));
  const chordItem = chordRow.children.find((child) => child.dataset.syncEnvironmentDetails === 'chord').children[0];
  assert.equal(chordItem.children[0].children[0].textContent, 'Pixel');
  const revoke = chordItem.children.find((node) => node.dataset.syncAppEnvironmentRevoke);
  assert.equal(revoke.dataset.syncTargetLabel, '「Pixel」（コードクルーズ・7A3E）');
  assert.equal(revoke.getAttribute('aria-label'), 'Pixelを解除');
  assert.ok(chordItem.children.some((node) => node.dataset.syncTargetRename === 'app'));

  const readOnly = installDom();
  const lists2 = { '#sync-center-apps': new readOnly.Node('ul'), '#sync-center-add-environments': new readOnly.Node('ul'),
    '#sync-center-app-environments': new readOnly.Node('ul') };
  renderSyncCenter({ dataset: {}, querySelector: (selector) => lists2[selector] || null, querySelectorAll: () => [] },
    p, { edition: 'pro', orchestrationEnabled: false });
  assert.equal(readOnly.walk(lists2['#sync-center-add-environments']).some((node) => node.dataset.syncTargetRename), false,
    'no rename without Port orchestration');
});

test('detach confirmation names the exact target; app-wide detach copy is unchanged', () => {
  const names = describeSyncTargetNames([{ id: PIXEL, userLabel: 'Pixel', registeredLabel: 'Android Chrome' },
    { id: IPHONE, registeredLabel: 'Chord Cruise' }, { id: MAC }]);
  assert.equal(describeTargetForConfirm(names[0], 'コードクルーズ'), '「Pixel」（コードクルーズ・7A3E）');
  assert.equal(describeTargetForConfirm(names[1], 'コードクルーズ'), '登録名「Chord Cruise」（コードクルーズ・B91C）');
  assert.equal(describeTargetForConfirm(names[2], 'コードクルーズ'), '同期先 C0FF（コードクルーズ）');
  const action = describeLifecycleAction('app-environment', { targetLabel: '「Pixel」（コードクルーズ・7A3E）' });
  assert.match(action.summary, /^「Pixel」（コードクルーズ・7A3E）の同期だけを解除します。同じアプリのほかの同期先/);
  assert.equal(action.syncNote, true);
  assert.equal(describeLifecycleAction('app-environment').summary.startsWith('選択した同期先1件だけの同期を解除します。'), true);
  assert.match(describeLifecycleAction('environment', { targetLabel: '「Mac Port」（Cruise Port・C0FF）' }).summary,
    /^「Mac Port」（Cruise Port・C0FF）の同期を解除します。そのCruise Portから接続した各Cruiseアプリの同期も解除されます/);
  assert.equal(describeLifecycleAction('detach', { appName: 'コードクルーズ' }).summary,
    'コードクルーズの同期先すべて（ホーム画面版・ブラウザ版・ほかの端末を含む）の同期を解除します。クラウド上と端末内のデータは削除されません。解除後は同期コードからいつでも再接続できます。');
});

function openDialog(dom, target, options) {
  const dialog = openSyncTargetRenameDialog(dom.root, target, options);
  const form = dialog.children[0];
  const find = (predicate) => dom.walk(dialog).find(predicate);
  return {
    dialog, form,
    input: find((node) => node.tagName === 'input'),
    error: find((node) => node.className === 'sync-center-rename-error'),
    counter: find((node) => node.className === 'sync-center-rename-counter'),
    button: (label) => find((node) => node.tagName === 'button' && node.textContent === label),
    submit() { return form.dispatch('submit'); }
  };
}
const TARGET = Object.freeze({ kind: 'app', id: PIXEL, appId: 'chord', context: 'コードクルーズ',
  userLabel: 'Pixel', registeredLabel: 'Android Chrome', shortId: '7A3E' });
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('rename dialog: accessible, focused, prefilled; Enter saves trimmed text and refreshes', async () => {
  const dom = installDom();
  const saved = [];
  const order = [];
  const view = openDialog(dom, TARGET, { save: async (value) => { saved.push(value); },
    onSaved: async () => { await tick(); order.push('refresh'); },
    isOnline: () => true, restoreFocus: (reason) => { order.push(`focus:${reason}`); } });
  assert.equal(view.dialog.open, true);
  assert.equal(dom.doc.activeElement, view.input, 'focus moves to the input');
  assert.equal(view.input.value, 'Pixel');
  assert.equal(view.dialog.getAttribute('aria-labelledby'), view.form.children[0].id);
  assert.equal(view.error.getAttribute('role'), 'alert');
  assert.match(view.input.getAttribute('aria-describedby'), /hint.*counter.*error/);
  assert.equal(view.counter.textContent, '5/40');
  assert.match(dom.text(view.dialog), /コードクルーズ・同期先 7A3E/);
  assert.match(dom.text(view.dialog), /登録時の名前：Android Chrome/);
  view.input.value = '  リビングiPad  ';
  view.input.dispatch('input');
  view.submit();
  await tick();
  await tick();
  assert.deepEqual(saved, ['リビングiPad']);
  assert.equal(view.dialog.open, false);
  assert.deepEqual(order, ['refresh', 'focus:saved'], 'focus moves only after the refreshed rows exist');
  assert.equal(view.dialog.parent, null, 'the dialog is removed after closing');
});

test('rename dialog: 登録時の名前に戻す and a blank save both reset to null', async () => {
  for (const mode of ['button', 'blank']) {
    const dom = installDom();
    const saved = [];
    const view = openDialog(dom, TARGET, { save: async (value) => { saved.push(value); }, isOnline: () => true });
    if (mode === 'button') view.button(RENAME_COPY.reset).click();
    else { view.input.value = '   '; view.input.dispatch('input'); view.submit(); }
    await tick();
    assert.deepEqual(saved, [null], mode);
  }
  const dom = installDom();
  const view = openDialog(dom, { ...TARGET, userLabel: null }, { save: async () => {}, isOnline: () => true });
  assert.equal(view.button(RENAME_COPY.reset), undefined, 'no reset when there is no user name yet');
  const reasons = [];
  const cancelled = openDialog(installDom(), TARGET, { save: async () => {}, isOnline: () => true,
    restoreFocus: (reason) => reasons.push(reason) });
  cancelled.button(RENAME_COPY.cancel).click();
  assert.deepEqual(reasons, ['cancel'], 'cancel returns focus to the trigger right away');
});

test('rename dialog: validation, offline, failure and Escape behave safely', async () => {
  let dom = installDom();
  let calls = 0;
  let view = openDialog(dom, TARGET, { save: async () => { calls += 1; }, isOnline: () => true });
  view.input.value = 'あ'.repeat(41);
  view.input.dispatch('input');
  assert.equal(view.button('保存').disabled, true);
  assert.equal(view.error.textContent, '40文字以内で入力してください。');
  assert.equal(view.input.getAttribute('aria-invalid'), 'true');
  view.input.value = 'two\nlines';
  view.input.dispatch('input');
  assert.equal(view.error.textContent, RENAME_COPY.characters);
  view.submit();
  await tick();
  assert.equal(calls, 0, 'invalid text is never sent');

  dom = installDom();
  calls = 0;
  view = openDialog(dom, TARGET, { save: async () => { calls += 1; }, isOnline: () => false });
  view.input.value = 'Offline name';
  view.input.dispatch('input');
  view.submit();
  await tick();
  assert.equal(calls, 0, 'online only; nothing is queued');
  assert.equal(view.error.textContent, 'オフラインのため保存できません。インターネット接続後にもう一度お試しください。');
  assert.equal(view.dialog.open, true);

  dom = installDom();
  let release;
  view = openDialog(dom, TARGET, { save: () => new Promise((_, reject) => { release = reject; }), isOnline: () => true });
  view.input.value = 'Mac Safari';
  view.input.dispatch('input');
  view.submit();
  assert.equal(view.button('保存中…').getAttribute('aria-busy'), 'true');
  assert.equal(view.button(RENAME_COPY.cancel).disabled, true);
  assert.equal(view.dialog.dispatch('cancel').defaultPrevented, true, 'Escape cannot abandon an in-flight save');
  release(Object.assign(new Error('x'), { status: 409, code: 'device_rename_unavailable' }));
  await tick();
  assert.equal(view.dialog.open, true, 'a failure keeps the dialog open');
  assert.equal(view.input.value, 'Mac Safari', 'and keeps what the user typed');
  assert.equal(view.error.textContent, 'この同期先は解除済みのため、名前を変更できません。');
  assert.equal(view.button('保存').disabled, false);
  view.dialog.dispatch('cancel');
  assert.equal(view.dialog.open, false, 'Escape closes when idle');
  assert.equal(view.dialog.parent, null, 'and removes the dialog right away');

  assert.equal(renameErrorMessage({ code: 'network_error' }), RENAME_COPY.offline);
  assert.equal(renameErrorMessage({ status: 404, code: 'app_device_not_found' }), RENAME_COPY.notFound);
  assert.equal(renameErrorMessage({ status: 423, code: 'account_delete_paused' }), RENAME_COPY.paused);
  assert.equal(renameErrorMessage({ status: 503 }), RENAME_COPY.failed);
});

test('orchestrator rename sends only the display name with the Account credential', async () => {
  const requests = [];
  class AccountClient {
    constructor() {}
    async request(pathname, options) { requests.push({ pathname, ...options }); return { ok: true }; }
  }
  const orchestrator = createSyncCenterOrchestrator({
    config: { enabled: true, endpoint: 'https://example.invalid', admissionMode: 'production' },
    accountRoot: { AccountClient, core: { createOperationId: () => 'op' },
      storage: { async getAccount() { return { accountCredential: 'account-credential' }; } } }
  });
  await orchestrator.renameAppEnvironment('chord', PIXEL, '  Pixel ');
  await orchestrator.renameEnvironment(MAC, null);
  assert.deepEqual(requests, [
    { pathname: '/v2/accounts/memberships/chord/devices/name', method: 'POST', accountCredential: 'account-credential',
      body: { appId: 'chord', appDeviceId: PIXEL, userLabel: 'Pixel' } },
    { pathname: '/v2/accounts/devices/name', method: 'POST', accountCredential: 'account-credential',
      body: { accountDeviceId: MAC, userLabel: null } }
  ]);
  await assert.rejects(orchestrator.renameAppEnvironment('chord', PIXEL, 'a\nb'), /sync_target_name_invalid/);
  await assert.rejects(orchestrator.renameAppEnvironment('port', PIXEL, 'x'), /sync_target_name_invalid/);
  assert.equal(requests.length, 2, 'invalid input is never sent');
});
