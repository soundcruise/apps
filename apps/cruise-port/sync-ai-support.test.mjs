import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  AI_SUPPORT_COPY, buildHistory, containsSecret, createAiSupportClient, errorKind, readAiSupportConfig, readProCredential, readProAuthState
} from './ai-support-client.js';
import { AI_PANEL_COPY, createAiSupportPanel } from './ai-support-ui.js';
import { createUnavailablePresentation, normalizeSyncCenterSummary } from './sync-center-controller.js';
import { renderAppRows } from './sync-center-ui.js';
import { containsSecret as workerContainsSecret } from '../../workers/sound-cruise-sync/src/ai-support-policy.js';
import { containsSecret as detectorContainsSecret } from '../../workers/sound-cruise-sync/src/secret-detector.js';

// Cloud Sync UX 2.0 AI1-C: the Port AI support panel and client. No real network or model.
const PRO = `scp1.${'1'.repeat(8)}-2222-4333-8444-${'5'.repeat(12)}.${'A'.repeat(43)}`;
const MAIL = 'mailto:support@example.invalid?subject=test';

// ---------------------------------------------------------------- fake DOM

function installDom() {
  const doc = { activeElement: null };
  class Node {
    constructor(tag) {
      this.tagName = tag; this.children = []; this.parent = null; this.attributes = new Map(); this.dataset = {};
      this.textContent = ''; this.className = ''; this.hidden = false; this.disabled = false; this.value = '';
      this.handlers = new Map(); this.scrollTop = 0; this.scrollHeight = 100;
      this.classList = { toggle: (name, on) => {
        const set = new Set(this.className.split(' ').filter(Boolean));
        if (on) set.add(name); else set.delete(name);
        this.className = [...set].join(' ');
      } };
    }
    get isConnected() { let node = this; while (node.parent) node = node.parent; return node === doc.root; }
    append(...nodes) {
      for (const item of nodes) {
        const child = typeof item === 'string' ? Object.assign(new Node('#text'), { textContent: item }) : item;
        child.parent = this; this.children.push(child);
      }
    }
    replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this); this.parent = null; }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    removeAttribute(name) { this.attributes.delete(name); }
    addEventListener(type, fn) { if (!this.handlers.has(type)) this.handlers.set(type, []); this.handlers.get(type).push(fn); }
    dispatch(type, extra = {}) {
      const event = { type, defaultPrevented: false, target: this, preventDefault() { this.defaultPrevented = true; },
        stopPropagation() {}, ...extra };
      for (const fn of this.handlers.get(type) || []) fn(event);
      return event;
    }
    click() { if (!this.disabled) this.dispatch('click'); }
    focus() { doc.activeElement = this; }
    contains(other) { let node = other; while (node) { if (node === this) return true; node = node.parent; } return false; }
    scrollIntoView() {}
    querySelectorAll() { return []; }
  }
  globalThis.document = { createElement: (tag) => new Node(tag), get activeElement() { return doc.activeElement; } };
  doc.root = new Node('main');
  const walk = (node, out = []) => { out.push(node); node.children.forEach((child) => walk(child, out)); return out; };
  return { doc, Node, root: doc.root, walk, text: (node) => walk(node).map((item) => item.textContent).join('\n') };
}

function mountPanel({ send, online = () => true, enterSends = () => true } = {}) {
  const dom = installDom();
  const container = new dom.Node('div');
  dom.root.append(container);
  const calls = [];
  const client = { async send(input) { calls.push(input); return send ? send(input, calls.length) : { ok: true, reply: `回答${calls.length}` }; } };
  const panel = createAiSupportPanel({ container, client, mailHref: MAIL, isOnline: online, enterSends });
  const find = (predicate) => dom.walk(container).find(predicate);
  const byClass = (name) => find((node) => String(node.className).split(' ').includes(name));
  return {
    dom, panel, calls, container,
    openButton: byClass('sync-center-ai-open'),
    section: byClass('sync-center-ai-panel'),
    input: byClass('sync-center-ai-input'),
    form: byClass('sync-center-ai-form'),
    send: byClass('sync-center-ai-send'),
    cancel: byClass('sync-center-ai-cancel'),
    close: byClass('sync-center-ai-close'),
    log: byClass('sync-center-ai-log'),
    status: byClass('sync-center-ai-status'),
    error: byClass('sync-center-ai-error'),
    mail: byClass('sync-center-ai-mail'),
    counter: byClass('sync-center-ai-counter'),
    type(value) { this.input.value = value; this.input.dispatch('input'); },
    submit() { return this.form.dispatch('submit'); }
  };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));

// ---------------------------------------------------------------- tests

test('1: AI support is Pro-only and needs an explicit beta opt-in', () => {
  const sync = { enabled: true, endpoint: 'https://sync.example', admissionMode: 'production' };
  const at = (hostname, search = '') => ({ location: { hostname, search } });
  assert.equal(readAiSupportConfig({ edition: 'standard', syncConfig: sync, globalObject: { __SOUND_CRUISE_AI_SUPPORT__: { enabled: true } } }).enabled, false);
  assert.equal(readAiSupportConfig({ edition: 'pro', syncConfig: sync, globalObject: at('soundcruise.jp') }).enabled, false, 'off by default');
  assert.equal(readAiSupportConfig({ edition: 'pro', syncConfig: sync, globalObject: at('soundcruise.jp', '?sound-cruise-ai-beta=1') }).enabled, true);
  assert.equal(readAiSupportConfig({ edition: 'pro', syncConfig: sync, globalObject: at('evil.example', '?sound-cruise-ai-beta=1') }).enabled, false);
  assert.equal(readAiSupportConfig({ edition: 'pro', syncConfig: { enabled: false }, globalObject: { __SOUND_CRUISE_AI_SUPPORT__: { enabled: true } } }).enabled, false);
  const enabled = readAiSupportConfig({ edition: 'pro', syncConfig: sync, globalObject: { __SOUND_CRUISE_AI_SUPPORT__: { enabled: true } } });
  assert.deepEqual({ ...enabled }, { enabled: true, endpoint: 'https://sync.example', admissionMode: 'production' });
});

test('2: both entries keep the mail support and ship the AI container hidden', () => {
  for (const path of ['./index.html', './pro_9a3943176561/index.html']) {
    const html = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.match(html, /<div id="sync-center-ai-support" class="sync-center-ai-support" hidden><\/div>/);
    assert.match(html, /<p id="sync-center-support-intro">不具合や分からないことがあれば、メールでお知らせください。返信でやりとりできます。<\/p>/);
    assert.match(html, /class="sync-center-support-link" href="mailto:/, 'mail support is kept');
  }
  const app = readFileSync(new URL('./practice-menu-app.js', import.meta.url), 'utf8');
  assert.match(app, /if \(aiSupportConfig\.enabled\) \{/);
  // With AI on, the panel's own 「メールで報告」 is the mail route; the section's block is hidden, not removed.
  assert.match(app, /mailHref: mailLink\?\.getAttribute\('href'\)/);
  assert.match(app, /for \(const duplicate of \[intro, mailLink, mailNote\]\) if \(duplicate\) duplicate\.hidden = true;/);
  assert.doesNotMatch(app, /AIで解決しない場合は、メールでお知らせください。/);
  const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');
  assert.match(css, /\.sync-center-support-link\[hidden\], \.sync-center-support p\[hidden\] \{ display: none; \}/);
});

test('3: only rows that need attention offer 「AIに相談」 in ⓘ, and only when AI support is on', () => {
  const account = { id: 'a', state: 'active', recoveryVersion: 1 };
  const member = (appId, extra = {}) => ({ appId, state: 'active', activeAppDeviceCount: 1, attentionConflictCount: 0,
    removalSafety: 'safe', dataset: { state: 'ready', schemaVersion: 1, recordCount: 1 }, ...extra });
  const device = (id, appId, lastReport) => ({ id, appId, label: 'x', userLabel: null, createdAt: 1, lastSeenAt: 1, revokedAt: null, isCurrent: false, lastReport });
  const ready = normalizeSyncCenterSummary({ account, memberships: [
    member('pitch'), member('chord', { removalSafety: 'attention', attentionConflictCount: 1 }),
    member('rhythm', { activeAppDeviceCount: 2 }), member('fretboard')] }, { devices: [], appDevices: [
    device('b91c7f00-0000-4000-8000-000000000001', 'pitch', { state: 'clean', reportedAt: 1, attentionCount: 0 }),
    device('b91c7f00-0000-4000-8000-000000000002', 'chord', { state: 'attention', reportedAt: 1, attentionCount: 1 }),
    device('b91c7f00-0000-4000-8000-000000000003', 'rhythm', { state: 'clean', reportedAt: 1, attentionCount: 0 }),
    device('b91c7f00-0000-4000-8000-000000000004', 'fretboard', { state: 'clean', reportedAt: 1, attentionCount: 0 })] });
  const askButtons = (presentation, aiSupport) => {
    const dom = installDom();
    const list = new dom.Node('ul');
    renderAppRows({ querySelector: (selector) => (selector === '#sync-center-apps' ? list : null) }, presentation, 'pro', true, null,
      { onRecheck: () => {}, aiSupport });
    return dom.walk(list).filter((node) => node.dataset?.syncAiSupportOpen).map((node) => [node.dataset.syncAiSupportOpen, node.textContent]);
  };
  assert.deepEqual(askButtons(ready, true), [['rhythm', 'AIに相談'], ['chord', 'AIに相談']],
    '確認が必要 (chord) and 再確認が必要 (rhythm) only; ✓ 同期済み rows have none');
  assert.deepEqual(askButtons(ready, false), [], 'nothing when AI support is off');
  assert.equal(askButtons(createUnavailablePresentation('error', ready), true).length, 4, '状態を取得できません offers it too');
});

test('4: the panel starts closed, opens with focus in the input, and returns focus on close', () => {
  const view = mountPanel();
  assert.equal(view.section.hidden, true);
  assert.equal(view.openButton.textContent, 'AIに相談');
  assert.equal(view.openButton.getAttribute('aria-expanded'), 'false');
  assert.equal(view.openButton.getAttribute('aria-controls'), view.section.id);
  view.openButton.click();
  assert.equal(view.section.hidden, false);
  assert.equal(view.openButton.getAttribute('aria-expanded'), 'true');
  assert.equal(view.dom.doc.activeElement, view.input);
  view.close.click();
  assert.equal(view.section.hidden, true);
  assert.equal(view.dom.doc.activeElement, view.openButton, 'focus returns to the opener');
  const rowButton = new view.dom.Node('button');
  view.dom.root.append(rowButton);
  view.panel.open(rowButton);
  view.close.click();
  assert.equal(view.dom.doc.activeElement, rowButton, 'opened from ⓘ, focus returns to that button');
  const text = view.dom.text(view.section);
  assert.match(text, /Cloudflare Workers AI/);
  assert.match(text, /復旧コード・接続コードなどは入力しないでください/);
  assert.match(text, /ページを閉じたり更新したりすると会話は消えます/);
});

test('5/6: conversation is memory-only; a new panel (page reload) starts empty', async () => {
  const view = mountPanel();
  view.openButton.click();
  view.type('コードクルーズが同期されません');
  view.submit();
  await tick();
  assert.equal(view.panel.turns().length, 2);
  const reloaded = mountPanel();
  assert.deepEqual(reloaded.panel.turns(), [], 'nothing survives a reload');
  for (const file of ['./ai-support-ui.js', './ai-support-client.js']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8').split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
    assert.doesNotMatch(source, /sessionStorage|indexedDB|document\.cookie|setItem|openDatabase/, file);
  }
  const ui = readFileSync(new URL('./ai-support-ui.js', import.meta.url), 'utf8');
  assert.doesNotMatch(ui, /localStorage/, 'the panel never touches Web Storage');
  const client = readFileSync(new URL('./ai-support-client.js', import.meta.url), 'utf8');
  // Read-only: only the Pro credential key and the legacy (v1) Pro marker are ever read.
  const reads = [...client.matchAll(/getItem(?:\?\.)?\(([A-Z_]+)\)/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(reads)].sort(), ['PRO_AUTH_KEY', 'PRO_LEGACY_ROTATION_KEY'], 'the client only reads Pro state');
  assert.equal((client.match(/getItem(\?\.)?\(/g) || []).length, reads.length);
  assert.doesNotMatch(client, /removeItem|setItem/);
});

test('7: send shows both messages, passes earlier turns only, and keeps focus in the input', async () => {
  const view = mountPanel();
  view.openButton.click();
  view.type('  一つ目の質問  ');
  view.submit();
  await tick();
  view.type('二つ目の質問');
  view.submit();
  await tick();
  assert.deepEqual(view.calls.map((call) => [call.message, call.history.length]), [['一つ目の質問', 0], ['二つ目の質問', 2]]);
  assert.deepEqual(view.calls[1].history, [{ role: 'user', content: '一つ目の質問' }, { role: 'assistant', content: '回答1' }]);
  const texts = view.dom.walk(view.log).filter((node) => node.className === 'sync-center-ai-text').map((node) => node.textContent);
  assert.deepEqual(texts, ['一つ目の質問', '回答1', '二つ目の質問', '回答2']);
  assert.equal(view.input.value, '');
  assert.equal(view.log.getAttribute('role'), 'log');
  assert.equal(view.log.getAttribute('aria-live'), 'polite');
});

test('8/24: single-flight — a second submit while sending is ignored and replies stay in order', async () => {
  let release;
  const view = mountPanel({ send: () => new Promise((resolve) => { release = resolve; }) });
  view.openButton.click();
  view.type('質問A');
  view.submit();
  assert.equal(view.send.disabled, true, 'send is disabled while sending');
  assert.equal(view.cancel.hidden, false);
  assert.equal(view.section.getAttribute('aria-busy'), 'true');
  assert.equal(view.status.textContent, '', 'no status sentence while waiting');
  view.type('質問B');
  view.submit();
  view.input.dispatch('keydown', { key: 'Enter' });
  assert.equal(view.calls.length, 1, 'no second request');
  assert.equal(view.input.readOnly, undefined, 'the conversation stays usable (typing is allowed)');
  release({ ok: true, reply: '回答A' });
  await tick();
  assert.equal(view.send.disabled, false);
  assert.equal(view.section.getAttribute('aria-busy'), null);
});

test('9: Enter sends; Shift+Enter, IME composition and touch keyboards do not', async () => {
  const view = mountPanel();
  view.openButton.click();
  view.type('変換中');
  for (const extra of [{ isComposing: true }, { keyCode: 229 }, { shiftKey: true }, { key: 'a' }]) {
    const event = view.input.dispatch('keydown', { key: 'Enter', ...extra });
    assert.equal(event.defaultPrevented, false, JSON.stringify(extra));
  }
  await tick();
  assert.equal(view.calls.length, 0);
  const sent = view.input.dispatch('keydown', { key: 'Enter' });
  assert.equal(sent.defaultPrevented, true);
  await tick();
  assert.equal(view.calls.length, 1);
  const touch = mountPanel({ enterSends: () => false });
  touch.openButton.click();
  touch.type('スマホ');
  touch.input.dispatch('keydown', { key: 'Enter' });
  await tick();
  assert.equal(touch.calls.length, 0, 'touch keyboards insert a newline; the 送信 button sends');
});

test('10: 2000 characters maximum, with a counter; longer text is never sent', async () => {
  const view = mountPanel();
  view.openButton.click();
  view.type('あ'.repeat(2000));
  assert.equal(view.counter.textContent, '2000/2000');
  assert.equal(view.send.disabled, false);
  view.type('あ'.repeat(2001));
  assert.equal(view.counter.textContent, '2001/2000');
  assert.equal(view.send.disabled, true);
  assert.match(view.counter.className, /sync-center-ai-counter--over/);
  view.submit();
  await tick();
  assert.equal(view.calls.length, 0);
  assert.equal(view.error.textContent, AI_SUPPORT_COPY.tooLong);
});

test('11/32/33/34: secret-looking text is refused before sending and left unchanged', async () => {
  const view = mountPanel();
  view.openButton.click();
  const secret = '復旧コードは SAR1QF3G6WAY5XX090XFNZFK です';
  view.type(secret);
  view.submit();
  await tick();
  assert.equal(view.calls.length, 0);
  assert.equal(view.error.textContent, '4桁の番号や復旧コードなどが相談内容に含まれている可能性があります。該当部分を削除してから、もう一度お試しください。');
  assert.equal(view.error.getAttribute('role'), 'alert');
  assert.equal(view.input.value, secret, 'the text is not edited for the user');
  const vectors = ['SAR1QF3G6WAY5XX090XFNZFK', 'SCJ1 D2M9-FV75-J4MW-XQ0F-R0AJ', PRO, 'sca1.4714bf0c-f6bb-4edb-a29f-01fa9ae44daa.x',
    'Proの番号は1234です', '暗証番号 ４５６７', 'ABCD-EFGH-JKMN-PQRS-TVWX', '2026年から使っています', 'エラー 404 が出ます',
    '500 エラー', 'コードクルーズが反映されない', 'iPhone 15 Pro を使っています',
    'Proの番号は 12 34', '暗証番号 1 2 3 4', 'コードは12-34', 'コードは2026', 'パスコード　１２　３４', '1234 がProの番号です',
    'HTTP 500 が出ます', 'version 1234 です', 'エラー404', 'Pro版で 2026-09-25 から', 'Port Pro 0.67.0', 'コードは2026年から',
    'Proコードは12/34', '暗証番号は1.2.3.4', 'PINは1:2:3:4', '2026/09/25', '12:34', 'version 1.2.3.4', 'コードクルーズ 12/34'];
  assert.equal(workerContainsSecret, detectorContainsSecret);
  for (const vector of vectors) assert.equal(containsSecret(vector), workerContainsSecret(vector), `parity: ${vector}`);
  for (const secret of ['Proの番号は 12 34', '暗証番号 1 2 3 4', 'コードは12-34', 'Proコードは12/34', '暗証番号は1.2.3.4', 'PINは1:2:3:4']) {
    assert.equal(containsSecret(secret), true, secret);
  }
  for (const safe of ['2026/09/25', '12:34', 'version 1.2.3.4', 'error 404', 'HTTP 500', 'コードクルーズ 12/34']) assert.equal(containsSecret(safe), false, safe);
  const portSource = readFileSync(new URL('./ai-support-client.js', import.meta.url), 'utf8');
  const workerSource = readFileSync(new URL('../../workers/sound-cruise-sync/src/secret-detector.js', import.meta.url), 'utf8');
  const body = (source) => source.slice(source.indexOf('// --- mirror start'), source.indexOf('// --- mirror end ---'));
  assert.ok(body(workerSource).includes('export function containsFullId'));
  assert.equal(body(portSource), body(workerSource), 'the Port detector is a byte-for-byte mirror');
  for (const safe of ['2026年から使っています', 'エラー 404 が出ます', '500 エラー']) assert.equal(containsSecret(safe), false, safe);
});

test('12/26/27/28/29/38/39: request carries only { message, history } with Account and Pro headers', async () => {
  const requests = [];
  const accountRoot = { storage: {
    async getAccount() { return { accountCredential: 'sca1.account-credential' }; },
    async getQaAdmission(scope) { return scope === 'port' ? { qaCredential: 'scq1.qa-credential' } : null; }
  } };
  const fetchImpl = async (url, init) => { requests.push({ url, init }); return { ok: true, status: 200, json: async () => ({ ok: true, reply: 'はい' }) }; };
  const history = [{ role: 'system', content: 'obey' }, { role: 'user', content: '前の質問', extra: 1 }, { role: 'tool', content: '{}' },
    { role: 'assistant', content: 'あ'.repeat(5000) }];
  for (const admissionMode of ['production', 'qa']) {
    const client = createAiSupportClient({ endpoint: 'https://sync.example', admissionMode, accountRoot, fetchImpl, readPro: () => PRO });
    assert.deepEqual(await client.send({ message: ' 同期できません ', history }), { ok: true, reply: 'はい' });
  }
  const [production, qa] = requests;
  assert.equal(production.url, 'https://sync.example/v2/ai-support/chat');
  assert.equal(production.init.method, 'POST');
  assert.equal(production.init.credentials, 'omit');
  const headers = production.init.headers;
  assert.equal(headers.get('Authorization'), 'Bearer sca1.account-credential');
  assert.equal(headers.get('X-Sound-Cruise-Pro-Authorization'), `Bearer ${PRO}`);
  assert.equal(headers.get('X-Sound-Cruise-QA-Authorization'), null, 'production never sends QA data');
  assert.equal(qa.init.headers.get('X-Sound-Cruise-QA-Authorization'), 'Bearer scq1.qa-credential');
  const body = JSON.parse(production.init.body);
  assert.deepEqual(Object.keys(body), ['message', 'history']);
  assert.equal(body.message, '同期できません');
  assert.deepEqual(body.history.map((turn) => [turn.role, [...turn.content].length]), [['user', 4], ['assistant', 4000]],
    'no system/tool roles, no extra fields, assistant capped at 4000');
  assert.deepEqual(Object.keys(body.history[0]), ['role', 'content']);
  assert.doesNotMatch(production.init.body, /sca1|scp1|scq1/, 'credentials travel in headers only, never in the body');
  const long = Array.from({ length: 30 }, (_, index) => [{ role: 'user', content: `q${index}` }, { role: 'assistant', content: `a${index}` }]).flat();
  const capped = buildHistory(long);
  assert.equal(capped.filter((turn) => turn.role === 'user').length, 19, 'with the current message, 20 user turns');
  assert.equal(capped[0].content, 'q11');
});

test('12: missing Account or Pro credential never sends a request', async () => {
  let requests = 0;
  const fetchImpl = async () => { requests += 1; return { ok: true, status: 200, json: async () => ({ ok: true, reply: 'x' }) }; };
  let client = createAiSupportClient({ endpoint: 'https://sync.example', accountRoot: { storage: { async getAccount() { return null; } } },
    fetchImpl, readPro: () => PRO });
  assert.deepEqual(await client.send({ message: 'x' }), { ok: false, kind: 'notConfigured' });
  client = createAiSupportClient({ endpoint: 'https://sync.example', accountRoot: { storage: { async getAccount() { return { accountCredential: 'sca1.x' }; } } },
    fetchImpl, readPro: () => null });
  assert.deepEqual(await client.send({ message: 'x' }), { ok: false, kind: 'auth' });
  assert.equal(requests, 0);
  const storage = { getItem: (key) => (key === 'soundCruiseProAuth' ? JSON.stringify({ v: 2, credential: PRO, generation: 1 }) : null) };
  assert.equal(readProCredential(storage), PRO);
  assert.equal(readProCredential({ getItem: () => JSON.stringify({ v: 2, credential: 'nope' }) }), null);
  assert.equal(readProCredential({ getItem: () => '{broken' }), null);
});

test('13/14/15/35: server errors map to fixed, friendly copy; raw bodies are never shown', async () => {
  const cases = [[404, 'ai_support_disabled', 'disabled'], [429, 'rate_limited', 'rateLimited'],
    [503, 'ai_provider_unavailable', 'unavailable'], [503, 'ai_support_unavailable', 'unavailable'],
    [400, 'ai_support_secret_detected', 'secret'], [400, 'message_too_long', 'tooLong'], [401, 'invalid_account_credential', 'auth'],
    [403, 'pro_required', 'auth'], [403, 'ai_support_not_entitled', 'notEntitled'], [410, 'account_device_revoked', 'auth'], [500, 'whatever', 'unavailable'], [400, 'invalid_request', 'failed']];
  for (const [status, code, kind] of cases) assert.equal(errorKind(status, code), kind, code);
  for (const [status, code, kind] of cases.slice(0, 3)) {
    const view = mountPanel({ send: async () => {
      const response = { ok: false, status, json: async () => ({ ok: false, code, detail: 'INTERNAL <b>stack</b>' }) };
      const client = createAiSupportClient({ endpoint: 'https://x', accountRoot: { storage: { async getAccount() { return { accountCredential: 'sca1.x' }; } } },
        fetchImpl: async () => response, readPro: () => PRO });
      return client.send({ message: 'x' });
    } });
    view.openButton.click();
    view.type('同期できません');
    view.submit();
    await tick(); await tick();
    assert.equal(view.error.textContent, AI_SUPPORT_COPY[kind], code);
    assert.doesNotMatch(view.dom.text(view.section), /INTERNAL|stack/);
    assert.equal(view.input.value, '同期できません', 'the unanswered message is offered again');
    assert.match(view.dom.text(view.log), /（送信できませんでした）/);
    assert.deepEqual(view.panel.turns(), [], 'failed turns are not part of the history');
  }
  assert.match(AI_SUPPORT_COPY.disabled, /現在、AI相談は利用できません/);
  assert.doesNotMatch(AI_SUPPORT_COPY.disabled, /同期.*(障害|エラー)/, 'beta off is not presented as a sync failure');
});

test('16: a diagnostics-unavailable answer from the Worker is shown as the reply, not an error', async () => {
  const fallback = '現在の同期状態を確認できませんでした。通信状態を確認して、少し時間をおいてからもう一度お試しください。';
  const view = mountPanel({ send: async () => ({ ok: true, reply: fallback }) });
  view.openButton.click();
  view.type('同期できません');
  view.submit();
  await tick();
  assert.match(view.dom.text(view.log), /現在の同期状態を確認できませんでした/);
  assert.equal(view.error.hidden, true);
});

test('17/18: AI output is rendered as plain text only, whatever it contains', async () => {
  const hostile = '<img src=x onerror=alert(1)>\n**太字** [link](javascript:alert(1)) <script>alert(2)</script>';
  const view = mountPanel({ send: async () => ({ ok: true, reply: hostile }) });
  view.openButton.click();
  view.type('質問');
  view.submit();
  await tick();
  const aiText = view.dom.walk(view.log).filter((node) => node.className === 'sync-center-ai-text').at(-1);
  assert.equal(aiText.textContent, hostile, 'kept as inert text');
  assert.equal(aiText.children.length, 0, 'no element was created from it');
  for (const file of ['./ai-support-ui.js', './ai-support-client.js']) {
    assert.doesNotMatch(readFileSync(new URL(file, import.meta.url), 'utf8'), /innerHTML|outerHTML|insertAdjacentHTML|DOMParser|marked|markdown-it/, file);
  }
});

test('19/48/49: email fallback is always one tap away in the panel footer', async () => {
  const view = mountPanel({ send: async () => ({ ok: false, kind: 'unavailable' }) });
  assert.equal(view.mail.href, MAIL);
  assert.equal(view.mail.textContent, 'メールで報告');
  assert.match(view.dom.text(view.section), /解決しない場合は、\nメールで報告\nからご相談ください。/);
  view.openButton.click();
  view.type('同期できません');
  view.submit();
  await tick();
  assert.match(view.error.textContent, /メールでお知らせください/);
});

test('20: offline — nothing is sent and the panel says it works once online', async () => {
  let online = false;
  const view = mountPanel({ online: () => online });
  view.openButton.click();
  assert.equal(view.status.textContent, AI_SUPPORT_COPY.offline);
  view.type('同期できません');
  assert.equal(view.send.disabled, true);
  view.submit();
  await tick();
  assert.equal(view.calls.length, 0);
  assert.equal(view.error.textContent, AI_SUPPORT_COPY.offline);
  online = true;
  view.type('同期できません');
  assert.equal(view.send.disabled, false);
  assert.equal(view.status.textContent, '');
});

test('23: 中止 aborts the wait on this device only; the message can be sent again', async () => {
  const aborted = [];
  const client = createAiSupportClient({ endpoint: 'https://x', accountRoot: { storage: { async getAccount() { return { accountCredential: 'sca1.x' }; } } },
    readPro: () => PRO, fetchImpl: (_url, init) => new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => { aborted.push(true); reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); });
    }) });
  const view = mountPanel({ send: (input) => client.send(input) });
  view.openButton.click();
  view.type('待ちきれない質問');
  view.submit();
  await tick();
  view.cancel.click();
  await tick(); await tick();
  assert.deepEqual(aborted, [true]);
  assert.equal(view.error.textContent, AI_SUPPORT_COPY.cancelled);
  assert.equal(view.input.value, '待ちきれない質問');
  assert.equal(view.send.disabled, false);
  const ui = readFileSync(new URL('./ai-support-ui.js', import.meta.url), 'utf8');
  assert.match(ui, /the server may still finish the request/, 'no claim that the provider stops');
});

// ---------------------------------------------------------------- AI1-C security / privacy fix

test('privacy: the panel links to privacy.html#ai-support and keeps the codes warning next to the input', () => {
  const view = mountPanel();
  const find = (name) => view.dom.walk(view.container).find((node) => String(node.className).split(' ').includes(name));
  const link = find('sync-center-ai-privacy-link');
  assert.equal(link.tagName, 'a');
  assert.equal(link.textContent, 'プライバシーポリシー');
  assert.match(link.href, /\/apps\/cruise-port\/privacy\.html#ai-support$/, 'resolved next to the module, so Standard and Pro share one page');
  assert.equal(link.rel, 'noopener');
  assert.equal(link.parent, find('sync-center-ai-privacy'));
  const codes = find('sync-center-ai-codes');
  assert.equal(codes.textContent, '復旧コード・接続コードなどは入力しないでください。');
  const form = view.form.children;
  assert.equal(form.indexOf(codes) + 1, form.indexOf(view.input), 'the warning sits right above the input');
  assert.match(view.input.getAttribute('aria-describedby'), /sync-center-ai-codes/);
  // The disclosure matches the Privacy text: consultation, recent history, a sync-state summary, names.
  for (const phrase of ['送信すると', '相談内容', '直近の会話', '同期状態の要約', '同期先の表示名', 'Cloudflare Workers AI', '自動で検出']) {
    assert.ok(AI_PANEL_COPY.privacy.includes(phrase), phrase);
  }
  assert.match(AI_PANEL_COPY.memory, /Cruiseは相談内容をサーバーにも端末にも保存しません/);
  const ui = readFileSync(new URL('./ai-support-ui.js', import.meta.url), 'utf8');
  assert.doesNotMatch(ui, /confirm\(|showModal|同意する/, 'no first-use modal; pressing 送信 is the consent');
});

test('privacy/terms pages carry the AI clauses that match the implementation', () => {
  const privacy = readFileSync(new URL('./privacy.html', import.meta.url), 'utf8');
  const section = privacy.slice(privacy.indexOf('<section id="ai-support">'));
  assert.ok(section.length > 100, 'privacy.html#ai-support exists');
  for (const phrase of ['任意の機能', 'Pro版の対象アカウントに限って', '入力した相談内容', '直近の会話', 'クラウド同期の状態の要約',
    '同期先の表示名', '会話の中だけで使う短い識別子', 'Cloudflare Workers AI',
    '4桁の番号、復旧コード、接続コードなどの認証情報をAIへ送らないよう自動検出・遮断する仕組みを設けています。これらを相談文へ入力しないでください。',
    'Cloudflare D1', 'ブラウザの保存領域にも保存しません', 'ページを閉じたり更新したりすると消えます',
    'Cloudflareのサービス条件・データ利用方針に従います', 'AIの回答は誤ることがあります', '画面表示と確認画面を優先', 'メールでお問い合わせ']) {
    assert.ok(section.includes(phrase), phrase);
  }
  assert.doesNotMatch(section, /学習に(は)?(利用|使用)(しません|されません)|保存されません（Cloudflare|削除されます/, 'no claims about Cloudflare beyond its terms');
  const terms = readFileSync(new URL('./terms.html', import.meta.url), 'utf8');
  const clause = terms.slice(terms.indexOf('<section id="ai-support">'), terms.indexOf('</section>', terms.indexOf('<section id="ai-support">')));
  for (const phrase of ['補助する任意の機能', '正確性・完全性を保証するものではありません', '画面表示と確認画面の説明が優先',
    '利用者ご自身が', '代わりに行うことはありません', 'クラウド同期は利用できます', 'メールでお問い合わせ']) {
    assert.ok(clause.includes(phrase), phrase);
  }
  assert.deepEqual([...terms.matchAll(/<h2>(\d+)\./g)].map((match) => Number(match[1])), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test('beta: a non-entitled Account sees a fixed message; the Port flag is UI discovery only; Standard is unaffected', async () => {
  assert.equal(AI_SUPPORT_COPY.notEntitled, '現在、AI相談はこのアカウントでは利用できません。');
  assert.equal(errorKind(403, 'ai_support_not_entitled'), 'notEntitled');
  const view = mountPanel({ send: async () => {
    const client = createAiSupportClient({ endpoint: 'https://x', accountRoot: { storage: { async getAccount() { return { accountCredential: 'sca1.x' }; } } },
      fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({ ok: false, code: 'ai_support_not_entitled' }) }), readPro: () => PRO });
    return client.send({ message: 'x' });
  } });
  view.openButton.click();
  view.type('同期できません');
  view.submit();
  await tick(); await tick();
  assert.equal(view.error.textContent, '現在、AI相談はこのアカウントでは利用できません。');
  const client = readFileSync(new URL('./ai-support-client.js', import.meta.url), 'utf8');
  assert.match(client, /they are UI discovery, never authorization/);
  // Standard never shows AI support, whatever flag or query is present.
  const sync = { enabled: true, endpoint: 'https://sync.example', admissionMode: 'production' };
  for (const globalObject of [{ __SOUND_CRUISE_AI_SUPPORT__: { enabled: true } },
    { location: { hostname: 'soundcruise.jp', search: '?sound-cruise-ai-beta=1' } }]) {
    assert.equal(readAiSupportConfig({ edition: 'standard', syncConfig: sync, globalObject }).enabled, false);
  }
  const standard = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(standard, /<div id="sync-center-ai-support" class="sync-center-ai-support" hidden><\/div>/);
});

test('AI1-C final: full IDs and slash/dot/colon codes are refused before sending', async () => {
  let requests = 0;
  const client = createAiSupportClient({ endpoint: 'https://sync.example', readPro: () => PRO,
    accountRoot: { storage: { async getAccount() { return { accountCredential: 'sca1.x' }; } } },
    fetchImpl: async () => { requests += 1; return { ok: true, status: 200, json: async () => ({ ok: true, reply: 'x' }) }; } });
  for (const message of ['4714bf0c-f6bb-4edb-a29f-01fa9ae44daa', 'B91C7F00A1B2C3D4E5F60718293A4B5C', 'PINは1:2:3:4']) {
    assert.deepEqual(await client.send({ message }), { ok: false, kind: 'secret' }, message);
  }
  assert.equal(requests, 0);
});

test('Pro Sync Help: the Privacy link resolves from the module URL, so it works under pro_*/', () => {
  const app = readFileSync(new URL('./practice-menu-app.js', import.meta.url), 'utf8');
  assert.match(app, /const PORT_PRIVACY_HREF = new URL\('\.\/privacy\.html', import\.meta\.url\)\.href;/);
  assert.match(app, /privacyHref: PORT_PRIVACY_HREF,/);
  assert.doesNotMatch(app, /privacyHref: '\.\/privacy\.html'/);
  const standard = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const pro = readFileSync(new URL('./pro_9a3943176561/index.html', import.meta.url), 'utf8');
  const moduleSrc = (html) => html.match(/<script type="module" src="([^"]*practice-menu-app\.js[^"]*)"/)[1];
  for (const [page, html] of [['https://soundcruise.jp/apps/cruise-port/', standard],
    ['https://soundcruise.jp/apps/cruise-port/pro_9a3943176561/', pro], ['https://soundcruise.jp/apps/cruise-port/pro_9a3943176561/index.html', pro]]) {
    const moduleUrl = new URL(moduleSrc(html), page);
    const privacy = new URL('./privacy.html', moduleUrl);
    assert.equal(privacy.pathname, '/apps/cruise-port/privacy.html', page);
    assert.ok(readFileSync(new URL('./privacy.html', import.meta.url), 'utf8').includes('<h1>プライバシーポリシー</h1>'));
  }
  // The AI panel link keeps its own (already correct) module-relative resolution.
  const ui = readFileSync(new URL('./ai-support-ui.js', import.meta.url), 'utf8');
  assert.match(ui, /new URL\('\.\/privacy\.html#ai-support', import\.meta\.url\)\.href/);
});

test('final blockers: reverse-context codes are refused before sending, same as the Worker', async () => {
  const reverse = ['12/34がPINです', '1.2.3.4 が暗証番号です', '1:2:3:4 がProコードです', '12-34 が接続コードです',
    '１２／３４がＰＩＮです', '１．２．３．４ が暗証番号です'];
  const allow = ['2026/09/25', '12:34', 'version 1.2.3.4', 'v1.2.3.4', 'version 1234', 'error 404', 'HTTP 500', 'コードクルーズ 12/34', '2026年'];
  for (const text of [...reverse, ...allow]) assert.equal(containsSecret(text), workerContainsSecret(text), `parity: ${text}`);
  for (const text of reverse) assert.equal(containsSecret(text), true, text);
  for (const text of allow) assert.equal(containsSecret(text), false, text);
  let requests = 0;
  const client = createAiSupportClient({ endpoint: 'https://sync.example', readPro: () => PRO,
    accountRoot: { storage: { async getAccount() { return { accountCredential: 'sca1.x' }; } } },
    fetchImpl: async () => { requests += 1; return { ok: true, status: 200, json: async () => ({ ok: true, reply: 'x' }) }; } });
  for (const text of reverse) {
    assert.deepEqual(await client.send({ message: text }), { ok: false, kind: 'secret' });
    assert.deepEqual(await client.send({ message: 'x', history: [{ role: 'user', content: 'q' }, { role: 'assistant', content: text }] }),
      { ok: false, kind: 'secret' });
  }
  assert.equal(requests, 0);
});

test('four-digit false positive: Port and Worker agree on benign numbers and secret contexts', () => {
  const benign = ['同期先の番号は1234です', '同期先番号は1234です', '端末の番号は1234です', '端末番号は1234です', '機器番号は1234です',
    '管理番号は1234です', '対象番号は1234です', '同期先1234で同期に不具合があるみたいなんですが、解消の仕方がわかりません',
    '同期先 1234 だけ同期されません', '端末ID 1234を確認したいです', 'エラー1234が表示されました'];
  const secret = ['PINは1234です', '1234がPINです', '暗証番号は1234です', '1234が暗証番号です', 'Proコードは1234です', '1234がProコードです',
    'Proの番号は1234です', '1234がProの番号です', '認証番号は1234です', '1234が認証番号です', '接続コードは1234です', '復旧コードは1234です'];
  for (const text of benign) { assert.equal(containsSecret(text), false, text); assert.equal(workerContainsSecret(text), false, text); }
  for (const text of secret) { assert.equal(containsSecret(text), true, text); assert.equal(workerContainsSecret(text), true, text); }
});

test('AI UX: disclosure behind 「送信内容の取り扱い」, quiet open button, visible thinking state', async () => {
  let release;
  const view = mountPanel({ send: () => new Promise((resolve) => { release = resolve; }) });
  const find = (name) => view.dom.walk(view.container).find((node) => String(node.className).split(' ').includes(name));
  // The open button is no longer a primary action.
  assert.equal(view.openButton.className, 'sync-center-ai-open');
  view.openButton.click();
  // A labelled button opens the whole disclosure: the summary sentence, privacy + link, and memory.
  const toggle = find('sync-center-ai-info-toggle');
  const details = find('sync-center-ai-details');
  assert.equal(toggle.textContent, '送信内容の取り扱い');
  assert.equal(toggle.getAttribute('aria-controls'), details.id);
  const summary = find('sync-center-ai-summary-text');
  assert.equal(summary.textContent, '送信した内容は Cloudflare Workers AI で処理され、Cruiseには保存されません。');
  assert.equal(summary.parent, details, 'the summary sentence lives inside the disclosure');
  assert.equal(details.children[0], summary);
  assert.equal(details.hidden, true);
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(find('sync-center-ai-privacy').parent, details);
  assert.equal(find('sync-center-ai-memory').parent, details);
  assert.equal(find('sync-center-ai-privacy-link').parent, find('sync-center-ai-privacy'));
  toggle.click();
  assert.equal(details.hidden, false);
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  // The codes warning stays next to the input, visible.
  assert.equal(find('sync-center-ai-codes').textContent, '復旧コード・接続コードなどは入力しないでください。');
  // Thinking: a pending bubble appears while the reply is on its way and goes away after.
  view.type('同期できていますか？');
  view.submit();
  await tick();
  const pending = find('sync-center-ai-message--pending');
  assert.ok(pending, 'pending bubble shown');
  // Dots only on screen; the words are for screen readers (the log is aria-live).
  assert.equal(find('sync-center-ai-dots').getAttribute('aria-hidden'), 'true');
  assert.equal(find('sync-center-ai-sr-only').textContent, '回答を作成しています');
  assert.equal(pending.getAttribute('aria-hidden'), null);
  assert.equal(view.status.textContent, '');
  assert.doesNotMatch(view.dom.text(view.container), /AIが同期状態を確認しています|回答を確認しています/);
  release({ ok: true, reply: 'はい、同期済みです。' });
  await tick(); await tick();
  assert.equal(find('sync-center-ai-message--pending'), undefined, 'removed after the reply');
  assert.match(view.dom.text(view.log), /はい、同期済みです。/);
  const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.sync-center-ai-dots span \{ animation: none;/);
  assert.match(css, /\.sync-center-support \.sync-center-ai-text \{[^}]*font-size: calc\(0\.94rem/);
});

test('A-2: legacy (v1) Pro access gets the renew guidance; other cases keep their own messages', async () => {
  const storage = (entries) => ({ getItem: (key) => entries[key] ?? null });
  assert.equal(readProAuthState(storage({ soundCruiseProAuth: JSON.stringify({ v: 1 }) })), 'legacy');
  assert.equal(readProAuthState(storage({ soundcruise_pro_gate_rotation: 'pitch-cruise-pro-gate-v8' })), 'legacy');
  assert.equal(readProAuthState(storage({})), 'none');
  assert.equal(readProAuthState(storage({ soundCruiseProAuth: '{broken' })), 'none');
  assert.equal(readProAuthState(storage({ soundCruiseProAuth: JSON.stringify({ v: 2, credential: PRO }) })), 'current');
  const account = { storage: { async getAccount() { return { accountCredential: 'sca1.x' }; } } };
  let requests = 0;
  const fetchImpl = async () => { requests += 1; return { ok: true, status: 200, json: async () => ({ ok: true, reply: 'x' }) }; };
  const legacy = createAiSupportClient({ endpoint: 'https://x', accountRoot: account, fetchImpl, readPro: () => null, readProState: () => 'legacy' });
  assert.deepEqual(await legacy.send({ message: '同期できません' }), { ok: false, kind: 'proUpdate' });
  const none = createAiSupportClient({ endpoint: 'https://x', accountRoot: account, fetchImpl, readPro: () => null, readProState: () => 'none' });
  assert.deepEqual(await none.send({ message: '同期できません' }), { ok: false, kind: 'auth' });
  const noAccount = createAiSupportClient({ endpoint: 'https://x', accountRoot: { storage: { async getAccount() { return null; } } },
    fetchImpl, readPro: () => null, readProState: () => 'legacy' });
  assert.deepEqual(await noAccount.send({ message: '同期できません' }), { ok: false, kind: 'notConfigured' }, 'Account not connected stays its own case');
  assert.equal(requests, 0);
  assert.equal(AI_SUPPORT_COPY.proUpdate,
    'Pro版の認証を更新してください。設定の「Pro版の認証」で「Pro版の認証をリセット」を押し、パスワードを入力し直してから、もう一度お試しください。');
  // The named UI really exists in the Pro page.
  const pro = readFileSync(new URL('./pro_9a3943176561/index.html', import.meta.url), 'utf8');
  assert.match(pro, /<h2 id="settings-pro-auth-title">Pro版の認証<\/h2>/);
  assert.match(pro, /id="settings-pro-auth-reset"[^>]*>Pro版の認証をリセット<\/button>/);
  assert.equal(errorKind(403, 'pro_required'), 'auth', 'server denials keep the generic message');
});

test('scroll UX: open reveals the input, a sent question and then the reply start at the top', async () => {
  let release;
  const view = mountPanel({ send: () => new Promise((resolve) => { release = resolve; }) });
  const scrolls = [];
  const record = (node, name) => { node.scrollIntoView = (options) => scrolls.push([name, options]); };
  record(view.form, 'form');
  const frames = [];
  globalThis.requestAnimationFrame = (fn) => { frames.push(fn); return frames.length; };
  const originalHistory = globalThis.history;
  try {
    view.openButton.click();
    assert.equal(view.dom.doc.activeElement, view.input, 'focused inside the tap (iOS keyboard)');
    assert.deepEqual(scrolls.shift(), ['form', { block: 'nearest', inline: 'nearest', behavior: 'auto' }]);
    assert.equal(frames.length, 1, 'one re-check on the next frame, no timers');
    view.type('コードクルーズだけ同期されません');
    // Record the bubbles' scrolls as they are created.
    const append = view.log.append.bind(view.log);
    view.log.append = (...nodes) => { for (const item of nodes) record(item, String(item.className)); append(...nodes); };
    view.submit();
    const [first] = scrolls.splice(0);
    assert.match(first[0], /sync-center-ai-message--user/);
    assert.equal(first[1].block, 'start');
    assert.equal(first[1].inline, 'nearest');
    release({ ok: true, reply: 'コードクルーズの行にある ⓘ を開いてください。' });
    await tick(); await tick();
    const [second] = scrolls.splice(0);
    assert.match(second[0], /sync-center-ai-message--ai/);
    assert.doesNotMatch(second[0], /pending/);
    assert.equal(second[1].block, 'start', 'the reply is read from its first line');
    assert.equal(globalThis.history, originalHistory);
  } finally {
    delete globalThis.requestAnimationFrame;
  }
  const source = readFileSync(new URL('./ai-support-ui.js', import.meta.url), 'utf8').split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
  assert.doesNotMatch(source, /location|history\.|setTimeout|scrollTop = /, 'no route, history or timer-based scrolling');
  assert.match(source, /input\.focus\(\{ preventScroll: true \}\)/);
  const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');
  assert.match(css, /\.sync-center-ai-log \{ display: grid; gap: 8px; \}/, 'no inner scroll box');
  assert.match(css, /\.sync-center-ai-message, \.sync-center-ai-form \{ scroll-margin-top: max\(16px, calc\(env\(safe-area-inset-top\) \+ 12px\)\)/);
});

test('scroll UX: a user who scrolled away while waiting is not pulled back; touch keeps the keyboard closed', async () => {
  let release;
  const listeners = new Map();
  globalThis.addEventListener = (type, fn) => listeners.set(type, fn);
  globalThis.removeEventListener = (type) => listeners.delete(type);
  const view = mountPanel({ send: () => new Promise((resolve) => { release = resolve; }), enterSends: () => false });
  try {
    view.openButton.click();
    const appended = [];
    const append = view.log.append.bind(view.log);
    view.log.append = (...nodes) => { for (const item of nodes) { item.scrollIntoView = () => appended.push(item.className); item.getBoundingClientRect = () => ({ top: -900, bottom: -800 }); } append(...nodes); };
    view.type('同期できません');
    view.submit();
    assert.equal(appended.length, 1);
    listeners.get('touchmove')?.();
    view.dom.doc.activeElement = view.send;
    release({ ok: true, reply: '回答です。' });
    await tick(); await tick();
    assert.equal(appended.length, 1, 'no jump when the conversation is off screen after a manual scroll');
    assert.equal(listeners.has('touchmove'), false, 'scroll watching stops after the reply');
    assert.equal(view.dom.doc.activeElement, view.send, 'touch screens: the keyboard is not reopened over the reply');
  } finally {
    delete globalThis.addEventListener; delete globalThis.removeEventListener;
  }
});

test('code warning: short, smaller, other text unchanged', () => {
  const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');
  assert.match(css, /\.sync-center-support \.sync-center-ai-codes \{[^}]*font-size: calc\(0\.74rem \* var\(--font-scale\)\)/);
  assert.doesNotMatch(AI_PANEL_COPY.codesWarning, /4桁/, 'the ambiguous 「4桁の番号」 is gone from the warning');
  assert.match(css, /\.sync-center-support \.sync-center-ai-text \{[^}]*font-size: calc\(0\.94rem/);
  assert.match(css, /\.sync-center-support \.sync-center-ai-summary-text \{[^}]*font-size: calc\(0\.8rem/);
  assert.equal(AI_PANEL_COPY.codesWarning, '復旧コード・接続コードなどは入力しないでください。');
});

test('scroll UX: with the keyboard up, the 相談内容 block is aligned to the top of the visible area', () => {
  const dom = installDom();
  const container = new dom.Node('div');
  dom.root.append(container);
  const handlers = {};
  const viewport = { height: 800, offsetTop: 0, addEventListener: (type, fn) => { handlers[type] = fn; } };
  const scrolled = [];
  const winListeners = {};
  const page = { clientHeight: 800, scrollHeight: 2000 };
  Object.defineProperty(globalThis.document, 'documentElement', { value: page, configurable: true });
  globalThis.scrollBy = (x, y) => scrolled.push(y);
  globalThis.requestAnimationFrame = (fn) => { fn(); return 1; };
  globalThis.getComputedStyle = () => ({ scrollMarginTop: '16px' });
  globalThis.addEventListener = (type, fn) => { winListeners[type] = fn; };
  try {
    createAiSupportPanel({ container, client: { send: async () => ({ ok: true, reply: 'x' }) }, mailHref: MAIL, viewport, enterSends: () => false });
    const byClass = (name) => dom.walk(container).find((node) => String(node.className).split(' ').includes(name));
    const form = byClass('sync-center-ai-form');
    const actions = byClass('sync-center-ai-actions');
    let formTop = 540;
    form.getBoundingClientRect = () => ({ top: formTop, bottom: formTop + 220 });
    actions.getBoundingClientRect = () => ({ top: formTop + 160, bottom: formTop + 210 });
    byClass('sync-center-ai-open').click();
    assert.deepEqual(scrolled, [], 'no keyboard and already visible: no scroll');
    viewport.height = 420; // software keyboard opened
    handlers.resize();
    assert.deepEqual(scrolled, [540 - 16], 'the block starts at the top of what is visible');
    // iOS pans the visual viewport afterwards: the next scroll event settles it relative to that.
    formTop = 16; viewport.offsetTop = 30;
    handlers.scroll();
    assert.deepEqual(scrolled, [524, 16 - 46]);
    formTop = 46;
    handlers.scroll();
    assert.equal(scrolled.length, 2, 'already in place: no further scrolling (no loop)');
    // The user scrolls by hand: no more repositioning until the input is focused again.
    winListeners.touchmove();
    formTop = 300;
    handlers.resize();
    assert.equal(scrolled.length, 2);
  } finally {
    delete globalThis.scrollBy; delete globalThis.requestAnimationFrame; delete globalThis.getComputedStyle; delete globalThis.addEventListener;
  }
});
