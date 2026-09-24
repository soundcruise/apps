import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CRUISE_APP_ICONS, bindHomeCruiseLaunch, createCruiseLaunchTransition } from './cruise-app-links.js';

// Port → Cruise app launch feedback: shown in the same tap, never delaying or duplicating navigation.
function dom({ styled = true } = {}) {
  const listeners = { window: new Map(), document: new Map() };
  const timers = new Map();
  let nextTimer = 1;
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.attributes = new Map(); this.hidden = false;
      this.className = ''; this.textContent = ''; this.src = ''; this.dataset = {}; this.handlers = new Map(); }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    appendChild(child) { this.children.push(child); return child; }
    append(...items) { this.children.push(...items); }
    addEventListener(type, fn) { this.handlers.set(type, fn); }
    querySelector(selector) {
      const cls = selector.slice(1);
      const walk = (node) => {
        for (const child of node.children) {
          if (String(child.className).split(' ').includes(cls)) return child;
          const found = walk(child);
          if (found) return found;
        }
        return null;
      };
      return walk(this);
    }
  }
  const links = ['pitch', 'fretboard', 'rhythm', 'chord'].map((app) => {
    const link = new Element('a');
    link.dataset.cruiseApp = app;
    link.setAttribute('href', `/apps/${app}/pro/`);
    return link;
  });
  const body = new Element('body');
  const documentObject = {
    body, visibilityState: 'visible',
    createElement: (tag) => new Element(tag),
    querySelectorAll: () => links,
    addEventListener(type, fn) { listeners.document.set(type, fn); }
  };
  const assigned = [];
  const windowObject = {
    location: { assign(url) { assigned.push(url); } },
    addEventListener(type, fn) { listeners.window.set(type, fn); },
    setTimeout(fn, ms) { const id = nextTimer++; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    getComputedStyle: (element) => ({ position: styled && element.className === 'port-launch' ? 'fixed' : 'static' })
  };
  const overlay = () => body.children.find((child) => child.className === 'port-launch') || null;
  function click(link, extra = {}) {
    const event = { button: 0, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra };
    link.handlers.get('click')(event);
    return event;
  }
  return { links, documentObject, windowObject, listeners, timers, assigned, overlay, click,
    visible() { return Boolean(overlay() && !overlay().hidden); } };
}

function orchestrator() {
  const calls = [];
  let settle;
  return {
    calls, enabled: true,
    launchFromHome(appId) { calls.push(appId); return new Promise((resolve, reject) => { settle = { resolve, reject }; }); },
    resolve() { settle.resolve({ kind: 'open' }); },
    reject() { settle.reject(new Error('handoff failed')); }
  };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('tap shows the destination immediately and lets the native link navigate without delay', () => {
  const d = dom();
  bindHomeCruiseLaunch({ enabled: false }, d.documentObject, d.windowObject);
  const event = d.click(d.links[0]);
  assert.equal(event.defaultPrevented, false, 'native anchor navigation is not held back');
  assert.equal(d.visible(), true);
  assert.equal(d.overlay().querySelector('.port-launch-text').textContent, '音感クルーズに移動しています');
  assert.equal(d.overlay().querySelector('.port-launch-icon--to').src, CRUISE_APP_ICONS.pitch.standard);
  assert.equal(d.overlay().getAttribute('role'), 'status');
  assert.deepEqual([...d.timers.values()].map((timer) => timer.ms), [8000], 'only a failsafe timer, never a navigation delay');
});

test('routed launch starts in the same tap, and a second tap cannot start another handoff', async () => {
  const d = dom();
  const o = orchestrator();
  bindHomeCruiseLaunch(o, d.documentObject, d.windowObject);
  const first = d.click(d.links[2]);
  assert.equal(first.defaultPrevented, true);
  assert.deepEqual(o.calls, ['rhythm'], 'launchFromHome is called synchronously in the click');
  assert.equal(d.overlay().querySelector('.port-launch-text').textContent, 'リズムクルーズに移動しています');
  const again = d.click(d.links[2]);
  const other = d.click(d.links[0]);
  assert.equal(again.defaultPrevented, true);
  assert.equal(other.defaultPrevented, true);
  assert.deepEqual(o.calls, ['rhythm']);
  o.resolve();
  await flush();
  d.listeners.window.get('pageshow')();
  assert.equal(d.visible(), false);
  d.click(d.links[3]);
  assert.deepEqual(o.calls, ['rhythm', 'chord'], 'guard is released after the launch settles and the page is shown again');
});

test('a failed routed launch still navigates to the app by its link', async () => {
  const d = dom();
  const o = orchestrator();
  bindHomeCruiseLaunch(o, d.documentObject, d.windowObject);
  d.click(d.links[1]);
  o.reject();
  await flush();
  assert.deepEqual(d.assigned, ['/apps/fretboard/pro/']);
});

test('returning to Port always removes the feedback (bfcache, visibility, focus, failsafe)', () => {
  for (const restore of ['pageshow', 'visibility', 'focus', 'failsafe']) {
    const d = dom();
    bindHomeCruiseLaunch({ enabled: false }, d.documentObject, d.windowObject);
    d.click(d.links[3]);
    assert.equal(d.visible(), true, restore);
    if (restore === 'pageshow') d.listeners.window.get('pageshow')({ persisted: true });
    if (restore === 'visibility') {
      d.documentObject.visibilityState = 'hidden';
      d.listeners.document.get('visibilitychange')();
      d.documentObject.visibilityState = 'visible';
      d.listeners.document.get('visibilitychange')();
    }
    if (restore === 'focus') { d.listeners.window.get('blur')(); d.listeners.window.get('focus')(); }
    if (restore === 'failsafe') [...d.timers.values()][0].fn();
    assert.equal(d.visible(), false, restore);
    assert.equal(d.click(d.links[0]).defaultPrevented, false, `${restore}: launching works again`);
  }
});

test('focus without leaving Port does not clear an in-progress launch', () => {
  const d = dom();
  bindHomeCruiseLaunch({ enabled: false }, d.documentObject, d.windowObject);
  d.click(d.links[0]);
  d.listeners.window.get('focus')();
  assert.equal(d.visible(), true);
});

test('Pro edition uses Pro icons for Port and the destination', () => {
  const d = dom();
  const transition = createCruiseLaunchTransition(d.documentObject, d.windowObject, 'pro');
  assert.equal(transition.show('chord'), true);
  const icons = d.overlay().querySelector('.port-launch-icons');
  assert.equal(icons.children[0].src, '/apps/cruise-port/assets/app-icons/pro/icon-192.png');
  assert.equal(d.overlay().querySelector('.port-launch-icon--to').src, CRUISE_APP_ICONS.chord.pro);
  assert.equal(d.overlay().querySelector('.port-launch-text').textContent, 'コードクルーズに移動しています');
  assert.equal(transition.show('unknown'), false);
});

test('stale stylesheet skips the feedback but never the navigation', () => {
  const d = dom({ styled: false });
  bindHomeCruiseLaunch({ enabled: false }, d.documentObject, d.windowObject);
  const event = d.click(d.links[0]);
  assert.equal(event.defaultPrevented, false);
  assert.equal(d.visible(), false);
  assert.equal(d.click(d.links[0]).defaultPrevented, false, 'no guard is left behind');
});

test('modified clicks keep browser behavior and show nothing', () => {
  const d = dom();
  bindHomeCruiseLaunch({ enabled: false }, d.documentObject, d.windowObject);
  for (const modifier of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey']) {
    assert.equal(d.click(d.links[0], { [modifier]: true }).defaultPrevented, false);
  }
  assert.equal(d.visible(), false);
});

test('overlay styles respect reduced motion and keep [hidden] effective', () => {
  const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');
  assert.match(css, /\.port-launch\[hidden\]\s*\{\s*display:\s*none;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.port-launch, \.port-launch-icon--to, \.port-launch-dot \{ animation: none; \}/);
});
