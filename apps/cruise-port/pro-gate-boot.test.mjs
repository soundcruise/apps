import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

// Boot sequence of the shared Pro gate: nothing protected and no passcode is shown until access is decided.
const gate = readFileSync(new URL('../shared/pro-gate.js', import.meta.url), 'utf8');
const token = 'scp1.123e4567-e89b-42d3-a456-426614174000.' + 'A'.repeat(43);
const v2 = { v: 2, credential: token, generation: 1, validatedAt: 100 };
const flush = () => new Promise(resolve => setImmediate(resolve));

function boot({ values = new Map(), readyState = 'loading' } = {}) {
  const requests = [];
  const listeners = new Map();
  class Element {
    constructor(tag) {
      this.tagName = tag; this.children = []; this.attributes = new Map(); this.listeners = new Map();
      this.hidden = false; this.value = ''; this.textContent = ''; this.tabIndex = 0; this.byId = new Map();
    }
    set innerHTML(html) {
      for (const [, id] of html.matchAll(/id="([^"]+)"/g)) this.byId.set(id, new Element('node'));
    }
    set id(value) { this._id = value; }
    get id() { return this._id; }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    hasAttribute(name) { return this.attributes.has(name); }
    removeAttribute(name) { this.attributes.delete(name); }
    appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
    querySelector(selector) { return this.byId.get(selector.slice(1)) || null; }
    querySelectorAll() { return []; }
    addEventListener(type, fn) { this.listeners.set(type, fn); }
    contains(element) { return element === this || this.children.includes(element); }
    matches() { return false; }
    closest() { return null; }
    getClientRects() { return [{}]; }
    focus() { document.activeElement = this; }
    remove() { body.children = body.children.filter(item => item !== this); }
  }
  const body = { children: [], get firstChild() { return this.children[0] || null; },
    insertBefore(node) { this.children.unshift(node); }, classList: { add() {}, remove() {} } };
  const document = { body, readyState, cookie: '', activeElement: null, head: { appendChild() {} },
    createElement: tag => new Element(tag),
    addEventListener(type, fn) { listeners.set(type, fn); }, removeEventListener() {} };
  const location = { href: 'https://soundcruise.jp/apps/pitch-cruise/pro_x9v7q2m8/', protocol: 'https:',
    hostname: 'soundcruise.jp', reload() {} };
  const storage = { getItem: key => values.get(key) ?? null, setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); } };
  const window = { __SOUNDCRUISE_PRO_GATE__: { appName: 'Test' }, location, addEventListener() {} };
  const fetch = (url) => new Promise((resolve, reject) => {
    requests.push({ path: url.split('/').at(-1), respond(status, json) { resolve({ status, async json() { return json; } }); },
      fail() { reject(Error('offline')); } });
  });
  const context = vm.createContext({ window, document, location, localStorage: storage, fetch, URL, AbortController,
    setTimeout, clearTimeout, history: { replaceState() {} }, Date, console,
    MutationObserver: class { observe() {} disconnect() {} }, requestAnimationFrame() { return 1; },
    cancelAnimationFrame() {}, getComputedStyle() { return { visibility: 'visible' }; } });
  vm.runInContext(gate, context);
  const overlay = () => body.children.find(item => item.id === 'pro-gate-overlay') || null;
  const box = () => overlay()?.children.find(item => item.className === 'pro-gate-box') || null;
  const checking = () => overlay()?.children.find(item => item.className === 'pro-gate-checking') || null;
  return {
    values, requests, window,
    async domReady() { listeners.get('DOMContentLoaded')?.(); await flush(); },
    request(path) { return requests.find(item => item.path === path); },
    state() {
      if (!overlay()) return 'unlocked';
      return box().hidden ? 'checking' : 'passcode';
    },
    checkingVisible() { return Boolean(checking() && !checking().hidden); },
    busy() { return overlay()?.getAttribute('aria-busy') === 'true'; },
    async settle() { await flush(); await flush(); await flush(); }
  };
}

test('A: legacy Phase 1 user sees checking, never the passcode, then the app', async () => {
  const g = boot({ values: new Map([['soundCruiseProAuth', JSON.stringify({ v: 1 })]]) });
  assert.equal(g.state(), 'checking');
  assert.equal(g.checkingVisible(), true);
  assert.equal(g.busy(), true);
  await g.domReady();
  assert.equal(g.state(), 'checking');
  g.request('policy').respond(200, { ok: true, protocol: 2, legacyCompatibilityEnabled: true });
  await g.settle();
  assert.equal(g.state(), 'unlocked');
  assert.deepEqual(g.requests.map(r => r.path), ['policy'], 'legacy never requests a Worker credential');
});

test('B: valid Server credential is checked before DOMContentLoaded and unlocks without a passcode flash', async () => {
  const g = boot({ values: new Map([['soundCruiseProAuth', JSON.stringify(v2)]]) });
  assert.equal(g.request('session') !== undefined, true, 'session validation starts at script execution');
  assert.equal(g.state(), 'checking');
  await g.domReady();
  assert.equal(g.state(), 'checking');
  assert.equal(g.requests.filter(r => r.path === 'session').length, 1, 'the early check is reused, not repeated');
  g.request('session').respond(200, { ok: true, generation: 1, legacyCompatibilityEnabled: true });
  await g.settle();
  assert.equal(g.state(), 'unlocked');
});

test('C: no stored access goes from checking straight to the passcode', async () => {
  const g = boot();
  assert.equal(g.state(), 'checking');
  assert.equal(g.requests.length, 0);
  await g.domReady();
  await g.settle();
  assert.equal(g.state(), 'passcode');
  assert.equal(g.checkingVisible(), false);
  assert.equal(g.busy(), false);
});

test('D: 401 shows the passcode and never falls back to legacy or offline', async () => {
  const values = new Map([['soundCruiseProAuth', JSON.stringify(v2)], ['soundcruise_pro_gate_rotation', 'pitch-cruise-pro-gate-v8']]);
  const g = boot({ values });
  await g.domReady();
  assert.equal(g.state(), 'checking');
  g.request('session').respond(401, { ok: false, code: 'invalid_credential' });
  await g.settle();
  assert.equal(g.state(), 'passcode');
  assert.equal(values.has('soundCruiseProAuth'), false);
  assert.equal(values.get('soundCruiseProAuthMigrated'), '1');
  assert.equal(g.request('policy'), undefined);
});

test('E: outage keeps the existing offline rule (validated -> app, never validated -> passcode)', async () => {
  for (const [validatedAt, expected] of [[100, 'unlocked'], [0, 'passcode']]) {
    for (const outage of ['network', 503]) {
      const g = boot({ values: new Map([['soundCruiseProAuth', JSON.stringify({ ...v2, validatedAt })]]) });
      await g.domReady();
      assert.equal(g.state(), 'checking');
      if (outage === 'network') g.request('session').fail();
      else g.request('session').respond(503, { ok: false });
      await g.settle();
      assert.equal(g.state(), expected, `${outage} validatedAt=${validatedAt}`);
    }
  }
});

test('F: generation mismatch removes the credential and shows the passcode', async () => {
  const values = new Map([['soundCruiseProAuth', JSON.stringify(v2)]]);
  const g = boot({ values });
  await g.domReady();
  g.request('session').respond(200, { ok: true, generation: 2, legacyCompatibilityEnabled: false });
  await g.settle();
  assert.equal(g.state(), 'passcode');
  assert.equal(values.has('soundCruiseProAuth'), false);
});

test('G: retired legacy never falls back, online or during an outage', async () => {
  const retired = boot({ values: new Map([['soundCruiseProAuth', JSON.stringify({ v: 1 })],
    ['soundCruiseProLegacyRetired', '1']]) });
  await retired.domReady();
  await retired.settle();
  assert.equal(retired.state(), 'passcode');
  assert.equal(retired.requests.length, 0);

  const values = new Map([['soundCruiseProAuth', JSON.stringify({ v: 1 })]]);
  const off = boot({ values });
  await off.domReady();
  off.request('policy').respond(200, { ok: true, protocol: 2, legacyCompatibilityEnabled: false });
  await off.settle();
  assert.equal(off.state(), 'passcode');
  assert.equal(values.get('soundCruiseProLegacyRetired'), '1');
  values.set('soundCruiseProAuth', JSON.stringify({ v: 1 }));
  const outage = boot({ values });
  await outage.domReady();
  await outage.settle();
  assert.equal(outage.state(), 'passcode');
});

test('reset shows the passcode immediately, never the checking state', async () => {
  const g = boot({ values: new Map([['soundCruiseProAuth', JSON.stringify(v2)]]) });
  await g.domReady();
  g.request('session').respond(200, { ok: true, generation: 1, legacyCompatibilityEnabled: true });
  await g.settle();
  assert.equal(g.state(), 'unlocked');
  const pending = g.window.__soundCruiseClearGate();
  assert.equal(g.state(), 'passcode');
  g.request('revoke')?.fail();
  await pending;
});

test('script loaded after DOMContentLoaded (Port defer) decides the same way', async () => {
  const g = boot({ values: new Map([['soundCruiseProAuth', JSON.stringify(v2)]]), readyState: 'complete' });
  assert.equal(g.state(), 'checking');
  assert.equal(g.requests.filter(r => r.path === 'session').length, 1);
  g.request('session').respond(200, { ok: true, generation: 1, legacyCompatibilityEnabled: true });
  await g.settle();
  assert.equal(g.state(), 'unlocked');
});
