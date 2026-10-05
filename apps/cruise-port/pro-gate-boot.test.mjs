import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

// Boot sequence of the shared Pro gate: nothing protected and no passcode is shown until access is decided.
const gate = readFileSync(new URL('../shared/pro-gate.js', import.meta.url), 'utf8');
const token = 'scp1.123e4567-e89b-42d3-a456-426614174000.' + 'A'.repeat(43);
const v2 = { v: 2, credential: token, generation: 1, validatedAt: 100 };
const flush = () => new Promise(resolve => setImmediate(resolve));

function boot({ values = new Map(), readyState = 'loading', offlineGrant = false, sessionOverrides = {} } = {}) {
  const requests = [];
  const listeners = new Map();
  const windowListeners = new Map();
  const intervals = [];
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
  const window = { __SOUNDCRUISE_PRO_GATE__: { appName: 'Test' }, location,
    addEventListener(type, handler) { windowListeners.set(type, handler); } };
  const pathOf = url => url.split('/').at(-1);
  const fetch = (url) => new Promise((resolve, reject) => {
    requests.push({ path: url.split('/').at(-1), respond(status, json) { resolve({ status, async json() { return pathOf(url) === 'verify' ? { ...json, session: { fixture: true } } : json; } }); },
      fail() { reject(Error('offline')); } });
  });
  // Gate state tests isolate the session service. Real cryptography, encrypted
  // persistence and real Worker protocol are covered by shared/pro-device-session.test.mjs.
  window.SoundCruiseProDeviceSession = { createClient: ({ request }) => ({
    publicKey: async () => ({ fixture: true }), accept: async () => true, forget: async () => {},
    allowance: async () => ({ ok: true, offlineRemainingMs: 60000 }),
    validate: async existing => {
      try {
        const result = await request('/session', { headers: { Authorization: 'Bearer '+existing.credential } });
        if (result.status === 200 && result.body?.ok && result.body.generation === existing.generation)
          return { ok: true, online: true, generation: existing.generation };
        if (result.status === 401 || (result.status === 200 && result.body.generation !== existing.generation))
          return { ok: false, terminal: true };
      } catch (_) { /* use only the independently supplied sealed grant fixture */ }
      return offlineGrant ? { ok: true, offline: true, generation: existing.generation, offlineRemainingMs: 60000 } : { ok: false };
    }, ...sessionOverrides
  }) };
  const context = vm.createContext({ window, document, location, localStorage: storage, fetch, URL, AbortController,
    setTimeout, clearTimeout, setInterval: (fn, ms) => { intervals.push({ fn, ms }); return 1; }, history: { replaceState() {} }, Date, console,
    MutationObserver: class { observe() {} disconnect() {} }, requestAnimationFrame() { return 1; },
    cancelAnimationFrame() {}, getComputedStyle() { return { visibility: 'visible' }; } });
  vm.runInContext(gate, context);
  const overlay = () => body.children.find(item => item.id === 'pro-gate-overlay') || null;
  const box = () => overlay()?.children.find(item => item.className === 'pro-gate-box') || null;
  const checking = () => overlay()?.children.find(item => item.className === 'pro-gate-checking') || null;
  return {
    values, requests, window,
    storageChanged() { windowListeners.get('storage')?.({ key: 'soundCruiseProAuth' }); },
    online() { windowListeners.get('online')?.(); },
    activity() { listeners.get('pointerdown')?.(); },
    heartbeat() { intervals[0]?.fn(); },
    get heartbeatMs() { return intervals[0]?.ms; },
    async domReady() { listeners.get('DOMContentLoaded')?.(); await flush(); },
    request(path) { return requests.find(item => item.path === path); },
    async submit() {
      window.__SOUND_CRUISE_ACCOUNT_TURNSTILE__ = { getToken: async () => 'isolated-turnstile' };
      box().querySelector('#pro-gate-input').value = '0007'; // Nonproduction fixture only.
      box().querySelector('#pro-gate-submit').listeners.get('click')();
      await flush();
    },
    state() {
      if (!overlay()) return 'unlocked';
      return box().hidden ? 'checking' : 'passcode';
    },
    checkingVisible() { return Boolean(checking() && !checking().hidden); },
    busy() { return overlay()?.getAttribute('aria-busy') === 'true'; },
    async settle() { await flush(); await flush(); await flush(); }
  };
}

test('A: legacy flags alone require one safe first server authentication', async () => {
  const g = boot({ values: new Map([['soundCruiseProAuth', JSON.stringify({ v: 1 })]]) });
  assert.equal(g.state(), 'checking');
  await g.domReady(); await g.settle();
  assert.equal(g.state(), 'passcode');
  assert.equal(g.requests.length, 0);
  assert.equal(g.values.get('soundCruiseProLegacyRetired'), '1');
});

test('a late password verification response cannot undo an explicit reset', async () => {
  const g = boot(); await g.domReady(); await g.submit();
  assert.ok(g.request('verify'));
  await g.window.__soundCruiseClearGate();
  g.request('verify').respond(201, { ok: true, credential: token, generation: 1 });
  await g.settle();
  assert.equal(g.state(), 'passcode');
  assert.equal(g.values.has('soundCruiseProAuth'), false);
});

test('reset during fresh-session receipt storage cannot be undone by a late completion', async () => {
  let finishStorage;
  const g = boot({ sessionOverrides: { accept: () => new Promise(resolve => { finishStorage = resolve; }) } });
  await g.domReady(); await g.submit();
  g.request('verify').respond(201, { ok: true, credential: token, generation: 1 });
  await g.settle(); assert.equal(typeof finishStorage, 'function');
  const reset = g.window.__soundCruiseClearGate(); await g.settle();
  g.request('revoke').respond(200, { ok: true }); await reset;
  finishStorage(true); await g.settle();
  assert.equal(g.state(), 'passcode');
  assert.equal(g.values.has('soundCruiseProAuth'), false);
});

test('a stored fresh receipt without a valid allowance cannot unlock Pro', async () => {
  const g = boot({ sessionOverrides: { allowance: async () => ({ ok: false }) } });
  await g.domReady(); await g.submit();
  g.request('verify').respond(201, { ok: true, credential: token, generation: 1 });
  await g.settle(); assert.equal(g.state(), 'passcode');
});

test('offline grace exhaustion keeps the token so online recovery needs no password', async () => {
  const g = boot({ values: new Map([['soundCruiseProAuth', JSON.stringify(v2)]]) });
  await g.domReady(); g.request('session').fail(); await g.settle();
  assert.equal(g.state(), 'passcode');
  assert.equal(JSON.parse(g.values.get('soundCruiseProAuth')).credential, token);
  g.online(); await g.settle();
  g.requests.filter(r => r.path === 'session').at(-1).respond(200, { ok: true, generation: 1 });
  await g.settle();
  assert.equal(g.state(), 'unlocked');
  assert.equal(g.request('verify'), undefined);
});

test('active-use and minute checkpoints lock detected rollback without deleting auth; online recovery stays silent', async () => {
  const calls = []; let blocked = false;
  const g = boot({ values: new Map([['soundCruiseProAuth', JSON.stringify(v2)], ['user-data', 'kept']]),
    sessionOverrides: { validate: async (auth, options = { force: true }) => {
      calls.push(options.force);
      return blocked ? { ok: false, clockRollback: true }
        : { ok: true, online: true, generation: auth.generation, offlineRemainingMs: 60000 };
    } } });
  await g.domReady(); await g.settle();
  assert.equal(g.state(), 'unlocked');
  assert.equal(g.heartbeatMs, 60000);
  g.activity(); await g.settle();
  assert.equal(calls.at(-1), false, 'local activity uses cached/revalidation checks');
  blocked = true; g.heartbeat(); await g.settle();
  assert.equal(g.state(), 'passcode');
  assert.equal(JSON.parse(g.values.get('soundCruiseProAuth')).credential, token);
  assert.equal(g.values.get('user-data'), 'kept');
  blocked = false; g.online(); await g.settle();
  assert.equal(calls.at(-1), true);
  assert.equal(g.state(), 'unlocked');
  assert.equal(g.request('verify'), undefined);
});

test('a legacy UI session cannot unlock a pending backend credential request', async () => {
  const g = boot({ values: new Map([['soundCruiseProAuth', JSON.stringify({ v: 1 })], ['user-data', 'kept']]) });
  const waiting = g.window.__soundCruiseRequireProBackendAuth();
  await g.domReady();
  await g.settle();
  assert.equal(g.state(), 'passcode');
  await g.submit();
  g.request('verify').respond(201, { ok: true, credential: token, generation: 1 });
  await waiting; await g.settle();
  assert.equal(g.state(), 'unlocked');
  assert.equal(JSON.parse(g.values.get('soundCruiseProAuth')).credential, token);
  assert.equal(g.values.get('user-data'), 'kept');
});

test('backend revocation reopens the existing gate without clearing saved app data', async () => {
  const g = boot({ values: new Map([['soundCruiseProAuth', JSON.stringify(v2)], ['user-data', 'kept']]) });
  await g.domReady();
  g.request('session').respond(200, { ok: true, generation: 1, legacyCompatibilityEnabled: true });
  await g.settle();
  assert.equal(g.state(), 'unlocked');
  g.window.__soundCruiseRejectProBackendAuth(token);
  assert.equal(g.state(), 'passcode');
  assert.equal(g.values.has('soundCruiseProAuth'), false);
  assert.equal(g.values.get('user-data'), 'kept');
});

test('a delayed Pro denial cannot invalidate a freshly reauthenticated credential', async () => {
  const g = boot({ values: new Map([['soundCruiseProAuth', JSON.stringify(v2)]]) });
  await g.domReady();
  g.request('session').respond(200, { ok: true, generation: 1, legacyCompatibilityEnabled: true });
  await g.settle();
  const fresh = token.replace(/A$/, 'B');
  g.values.set('soundCruiseProAuth', JSON.stringify({ ...v2, credential: fresh }));
  g.window.__soundCruiseRejectProBackendAuth(token);
  assert.equal(g.state(), 'unlocked');
  assert.equal(JSON.parse(g.values.get('soundCruiseProAuth')).credential, fresh);
});

test('another Pro tab can complete a pending backend credential request after server validation', async () => {
  const g = boot({ values: new Map([['soundCruiseProAuth', JSON.stringify({ v: 1 })]]) });
  await g.domReady();
  await g.settle();
  const waiting = g.window.__soundCruiseRequireProBackendAuth();
  g.values.set('soundCruiseProAuth', JSON.stringify(v2));
  g.storageChanged(); await g.settle();
  assert.equal(g.state(), 'passcode');
  g.request('session').respond(200, { ok: true, generation: 1, legacyCompatibilityEnabled: true });
  await waiting; await g.settle();
  assert.equal(g.state(), 'unlocked');
});

test('a late boot success cannot restore a credential already rejected by the backend', async () => {
  const g = boot({ values: new Map([['soundCruiseProAuth', JSON.stringify(v2)], ['user-data', 'kept']]) });
  await g.domReady();
  g.window.__soundCruiseRejectProBackendAuth(token);
  g.request('session').respond(200, { ok: true, generation: 1, legacyCompatibilityEnabled: true });
  await g.settle();
  assert.equal(g.state(), 'passcode');
  assert.equal(g.values.has('soundCruiseProAuth'), false);
  assert.equal(g.values.get('user-data'), 'kept');
});

test('a late offline boot result cannot unlock after a backend denial', async () => {
  const g = boot({ values: new Map([['soundCruiseProAuth', JSON.stringify(v2)]]) });
  await g.domReady();
  g.window.__soundCruiseRejectProBackendAuth(token);
  g.request('session').fail();
  await g.settle();
  assert.equal(g.state(), 'passcode');
  assert.equal(g.values.has('soundCruiseProAuth'), false);
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

test('E: outage accepts only the session service bounded grant, never localStorage timestamps', async () => {
  for (const [offlineGrant, expected] of [[true, 'unlocked'], [false, 'passcode']]) {
    for (const outage of ['network', 503]) {
      const g = boot({ values: new Map([['soundCruiseProAuth', JSON.stringify({ ...v2, validatedAt: Date.now() })]]), offlineGrant });
      await g.domReady();
      assert.equal(g.state(), 'checking');
      if (outage === 'network') g.request('session').fail();
      else g.request('session').respond(503, { ok: false });
      await g.settle();
      assert.equal(g.state(), expected, `${outage} boundedGrant=${offlineGrant}`);
    }
  }
});

test('F: generation mismatch removes the credential and shows the passcode', async () => {
  const values = new Map([['soundCruiseProAuth', JSON.stringify(v2)]]);
  const g = boot({ values });
  await g.domReady();
  g.request('session').respond(200, { ok: true, generation: 2, legacyCompatibilityEnabled: true });
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
  await g.settle();
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
