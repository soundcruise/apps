import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('./sync-account-turnstile.js', import.meta.url), 'utf8');

function fixture({ siteKey = 'public-site-key' } = {}) {
  const elements = new Map();
  const appended = [];
  const rendered = [];
  const document = {
    head: { appendChild(script) { appended.push(script); elements.set(script.id, script); } },
    body: {
      appendChild(element) {
        element.parentNode = this;
        elements.set(element.id, element);
      },
      removeChild(element) { elements.delete(element.id); }
    },
    getElementById(id) { return elements.get(id) || null; },
    createElement(tag) {
      const listeners = {};
      return {
        tag, id: '', textContent: '',
        addEventListener(type, callback) { listeners[type] = callback; },
        setAttribute() {},
        dispatch(type) { listeners[type]?.(); }
      };
    }
  };
  const context = {
    document,
    setTimeout,
    clearTimeout,
    __SOUND_CRUISE_ACCOUNT_TURNSTILE_SITE_KEY__: siteKey,
    turnstile: {
      render(container, options) {
        rendered.push({ container, options });
        options.callback('verified-token');
        return `widget-${rendered.length}`;
      },
      remove() {}
    }
  };
  context.globalThis = context;
  vm.runInNewContext(source, context);
  return { context, appended, rendered };
}

test('Account Turnstile issues only the exact account action tokens', async () => {
  const { context, appended, rendered } = fixture();
  assert.equal(await context.__SOUND_CRUISE_ACCOUNT_TURNSTILE__.getToken('unknown'), null);
  assert.equal(await context.__SOUND_CRUISE_ACCOUNT_TURNSTILE__.getToken('sound_cruise_account_qa_enroll'), 'verified-token');
  assert.equal(await context.__SOUND_CRUISE_ACCOUNT_TURNSTILE__.getToken('sound_cruise_account_start'), 'verified-token');
  assert.equal(await context.__SOUND_CRUISE_ACCOUNT_TURNSTILE__.getToken('sound_cruise_account_recovery'), 'verified-token');
  assert.equal(await context.__SOUND_CRUISE_ACCOUNT_TURNSTILE__.getToken('sound_cruise_recovery_rotation'), 'verified-token');
  assert.deepEqual(rendered.map(({ options }) => options.action), [
    'sound_cruise_account_qa_enroll',
    'sound_cruise_account_start',
    'sound_cruise_account_recovery',
    'sound_cruise_recovery_rotation'
  ]);
  assert.equal(rendered.every(({ options }) => options.action.length <= 32), true,
    'every Turnstile action stays within the provider limit');
  assert.equal(rendered.every(({ options }) => options.sitekey === 'public-site-key' && options.appearance === 'interaction-only'), true);
  assert.notEqual(rendered[0].container, rendered[1].container, 'each action uses a fresh Turnstile mount node');
  assert.equal(appended.length, 0, 'an already loaded API is reused');
});

test('Account Turnstile fails closed without a configured public site key', async () => {
  const { context, rendered } = fixture({ siteKey: '' });
  assert.equal(await context.__SOUND_CRUISE_ACCOUNT_TURNSTILE__.getToken('sound_cruise_account_qa_enroll'), null);
  assert.equal(rendered.length, 0);
});

test('Account Turnstile settles when the interaction callback never fires', async () => {
  const { context } = fixture();
  let removed = 0;
  context.turnstile.render = () => 'widget-never-settles';
  context.turnstile.remove = () => { removed += 1; };
  const started = Date.now();
  const token = await context.__SOUND_CRUISE_ACCOUNT_TURNSTILE__.getToken(
    'sound_cruise_account_start', { timeoutMs: 10 }
  );
  assert.equal(token, null);
  assert.equal(Date.now() - started < 1000, true);
  assert.equal(removed, 1);
});

test('Account Turnstile can render a visible challenge inside a supplied setup dialog mount', async () => {
  const { context, rendered } = fixture();
  const mount = { textContent: 'stale', appendChild() {} };
  assert.equal(await context.__SOUND_CRUISE_ACCOUNT_TURNSTILE__.getToken(
    'sound_cruise_account_start', { mount, visible: true }
  ), 'verified-token');
  assert.equal(rendered[0].container, mount);
  assert.equal(rendered[0].options.appearance, 'always');
  assert.equal(rendered[0].options.size, 'flexible');
});
