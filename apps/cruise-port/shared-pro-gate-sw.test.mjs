import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const shared = readFileSync(new URL('../shared/pro-gate.js', import.meta.url), 'utf8');
const pitch = readFileSync(new URL('../pitch-cruise/pro_x9v7q2m8/pro-gate-hash.js', import.meta.url), 'utf8');
const token = 'scp1.123e4567-e89b-42d3-a456-426614174000.' + 'A'.repeat(43);
const v2 = { v: 2, credential: token, generation: 1, validatedAt: 100 };
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture({ values = new Map(), policy = true, session = { status: 200, body: { ok: true, generation: 1,
  legacyCompatibilityEnabled: true } }, offline = false, source = shared, oldConfig = false,
  missingHelper = false, cookiesUnavailable = false } = {}) {
  const calls = [], listeners = new Map(), nodes = new Map();
  class Element {
    constructor(tag) { this.tagName = tag; this.listeners = new Map(); this.style = {}; this.value = ''; this.disabled = false; this.tabIndex = 0; this.attributes = new Set(); }
    set innerHTML(_) {
      for (const id of ['pro-gate-title', 'pro-gate-input', 'pro-gate-error', 'pro-gate-turnstile', 'pro-gate-submit']) {
        nodes.set(id, new Element(id));
      }
    }
    setAttribute(name) { this.attributes.add(name); }
    hasAttribute(name) { return this.attributes.has(name); }
    removeAttribute(name) { this.attributes.delete(name); }
    matches() { return this.disabled; }
    closest() { return false; }
    getClientRects() { return [{}]; }
    appendChild(child) { this.child = child; child.parentNode = this; }
    querySelector(selector) { return nodes.get(selector.slice(1)) || null; }
    querySelectorAll() { return [nodes.get('pro-gate-input'), nodes.get('pro-gate-submit')].filter(Boolean); }
    contains(element) { return element === this || [...nodes.values()].includes(element); }
    addEventListener(type, fn) { this.listeners.set(type, fn); }
    focus() { document.activeElement = this; }
    remove() { body.locked = false; body.children = body.children.filter(item => item !== this); }
  }
  const body = { locked: false, firstChild: null, children: [], insertBefore(node) { this.locked = true; this.children.unshift(node); },
    classList: { add() {}, remove() {} } };
  const document = { body, activeElement: null, head: { appendChild(script) {
    if (script.src?.includes('pro-gate.js')) vm.runInContext(shared, context);
    if (script.src?.includes('sync-account-turnstile.js')) {
      window.__SOUND_CRUISE_ACCOUNT_TURNSTILE__ = { async getToken() { return 'dummy-turnstile'; } };
      script.onload?.();
    }
  } },
    readyState: 'complete', cookie: '', createElement: tag => new Element(tag),
    addEventListener(type, fn) { listeners.set(type, fn); }, removeEventListener(type) { listeners.delete(type); } };
  if (cookiesUnavailable) Object.defineProperty(document, 'cookie', {
    get() { throw Error('cookies unavailable'); }, set() { throw Error('cookies unavailable'); }
  });
  const location = { href: 'https://soundcruise.jp/apps/example/pro_test/index.html', protocol: 'https:',
    hostname: 'soundcruise.jp', reload() { calls.push('reload'); } };
  const storage = { getItem: key => values.get(key) ?? null, setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); } };
  const window = { __SOUNDCRUISE_PRO_GATE__: { appName: 'Test', ...(oldConfig ? { passwordHash: 'legacy-public-placeholder' } : {}) },
    ...(missingHelper ? {} : { __SOUND_CRUISE_ACCOUNT_TURNSTILE__: { async getToken() { return 'dummy-turnstile'; } } }),
    location, addEventListener(type, fn) { listeners.set(type, fn); } };
  const fetch = async (url, options) => {
    calls.push(url.split('/').at(-1));
    if (offline) throw Error('offline');
    const path = url.split('/').at(-1);
    const result = path === 'policy' ? { status: 200, body: { ok: true, legacyCompatibilityEnabled: policy } } :
      path === 'session' ? session : path === 'verify' ? { status: 201, body: { ok: true, credential: token, generation: 1 } } :
      { status: 200, body: { ok: true } };
    return { status: result.status, async json() { return result.body; } };
  };
  const context = vm.createContext({ window, document, location, localStorage: storage, fetch, URL, AbortController,
    setTimeout, clearTimeout, history: { replaceState() {} }, Date, console,
    MutationObserver: class { observe() {} disconnect() {} }, requestAnimationFrame() { return 1; },
    cancelAnimationFrame() {}, getComputedStyle() { return { visibility: 'visible' }; } });
  vm.runInContext(source, context);
  return { values, body, calls, nodes, window, listeners, async settle() { await flush(); await flush(); },
    async submit(code = '0007') {
      nodes.get('pro-gate-input').value = code;
      await nodes.get('pro-gate-submit').listeners.get('click')();
      await flush();
    } };
}

test('Phase 1 legacy UI entry never requests a Worker credential', async () => {
  const values = new Map([['soundCruiseProAuth', JSON.stringify({ v: 1, at: 1 })]]);
  const f = fixture({ values, oldConfig: true }); await f.settle();
  assert.equal(f.body.locked, false);
  assert.deepEqual(f.calls, ['policy']);
  assert.equal(JSON.parse(values.get('soundCruiseProAuth')).v, 1);
});

test('legacy compatibility OFF latches across outages', async () => {
  const values = new Map([['soundCruiseProAuth', JSON.stringify({ v: 1 })]]);
  const f = fixture({ values, policy: false }); await f.settle();
  assert.equal(f.body.locked, true);
  assert.equal(values.get('soundCruiseProLegacyRetired'), '1');
  values.set('soundCruiseProAuth', JSON.stringify({ v: 1 }));
  const offline = fixture({ values, offline: true }); await offline.settle();
  assert.equal(offline.body.locked, true);
});

test('manual dummy code always uses Worker and migrates shared state', async () => {
  const values = new Map([['soundCruiseProAuth', JSON.stringify({ v: 1 })]]);
  const f = fixture({ values }); await f.settle();
  await f.window.__soundCruiseClearGate();
  f.body.locked = true;
  // A fresh page after reset presents the gate.
  const next = fixture({ values }); await next.settle();
  await next.submit();
  assert(next.calls.includes('verify'));
  assert.equal(JSON.parse(values.get('soundCruiseProAuth')).v, 2);
  assert.equal(values.get('soundCruiseProAuthMigrated'), '1');
  assert.equal(next.body.locked, false);
});

test('same-origin v2 credential works across all five entry points without re-entry', async () => {
  const values = new Map([['soundCruiseProAuth', JSON.stringify(v2)]]);
  for (const app of ['port', 'pitch', 'fretboard', 'rhythm', 'chord']) {
    const f = fixture({ values, source: app === 'pitch' ? pitch : shared });
    await f.settle();
    assert.equal(f.body.locked, false, app);
    assert.deepEqual(f.calls.filter(c => c === 'verify'), []);
  }
  const other = fixture(); await other.settle();
  assert.equal(other.body.locked, true);
});

test('revoked or old-generation credential never falls back to legacy', async () => {
  for (const code of ['invalid_credential', 'reauth_required']) {
    const values = new Map([['soundCruiseProAuth', JSON.stringify(v2)], ['soundcruise_pro_gate_rotation', 'pitch-cruise-pro-gate-v8']]);
    const f = fixture({ values, session: { status: 401, body: { ok: false, code } } }); await f.settle();
    assert.equal(f.body.locked, true);
    assert.equal(values.has('soundCruiseProAuth'), false);
    assert.equal(values.get('soundCruiseProAuthMigrated'), '1');
  }
  const values = new Map([['soundCruiseProAuth', JSON.stringify(v2)]]);
  const mismatch = fixture({ values, session: { status: 200, body: { ok: true, generation: 2 } } });
  await mismatch.settle();
  assert.equal(mismatch.body.locked, true);
  assert.equal(values.has('soundCruiseProAuth'), false);
});

test('validated v2 credential continues UI through outage without time expiry', async () => {
  const values = new Map([['soundCruiseProAuth', JSON.stringify(v2)]]);
  const f = fixture({ values, offline: true }); await f.settle();
  assert.equal(f.body.locked, false);
  const unvalidated = fixture({ values: new Map([['soundCruiseProAuth', JSON.stringify({ ...v2, validatedAt: 0 })]]), offline: true });
  await unvalidated.settle(); assert.equal(unvalidated.body.locked, true);
});

test('server credential remains usable when legacy cookie access is unavailable', async () => {
  const f = fixture({ values: new Map([['soundCruiseProAuth', JSON.stringify(v2)]]), cookiesUnavailable: true });
  await f.settle();
  assert.equal(f.body.locked, false);
});

test('offline reset immediately locks UI and persists pending revoke', async () => {
  const values = new Map([['soundCruiseProAuth', JSON.stringify(v2)]]);
  const f = fixture({ values, offline: true }); await f.settle();
  await f.window.__soundCruiseClearGate();
  assert.equal(f.body.locked, true);
  assert.equal(values.has('soundCruiseProAuth'), false);
  assert.deepEqual(JSON.parse(values.get('soundCruiseProRevokePending')), [token]);
  const online = fixture({ values }); await online.settle();
  assert(online.calls.includes('revoke'));
  assert.equal(values.has('soundCruiseProRevokePending'), false);
});

test('old HTML with new JS ignores old hash and loads Turnstile; new HTML with cached old JS lacks verifier', async () => {
  const f = fixture({ oldConfig: true, missingHelper: true }); await f.settle();
  await f.submit();
  assert.equal(f.body.locked, false);
  for (const name of ['cruise-port', 'pitch-cruise', 'fretboard_cruise', 'rhythm-cruise', 'chord-cruise']) {
    const html = readFileSync(new URL('../' + name + '/', import.meta.url).pathname +
      ({ 'cruise-port': 'pro_9a3943176561', 'pitch-cruise': 'pro_x9v7q2m8',
        'fretboard_cruise': 'pro_a9f4k7q2m8z', 'rhythm-cruise': 'pro_r4m8k7n2q9x',
        'chord-cruise': 'pro_k7m4q9v2x8' })[name] + '/index.html', 'utf8');
    assert.doesNotMatch(html, /passwordHash/);
    if (name === 'pitch-cruise') assert.match(html, /shared\/pro-gate\.js\?v=22/);
  }
  assert.doesNotMatch(pitch, /passwordHash|sha256|AUTH_TOKEN/);
});
