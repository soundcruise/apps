(function installSyncAccountTurnstile(global) {
  'use strict';

  const API_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  const SCRIPT_ID = 'sound-cruise-account-turnstile-api';
  const CONTAINER_PREFIX = 'sound-cruise-account-turnstile';
  const DEFAULT_TIMEOUT_MS = 20_000;
  const ACTIONS = new Set([
    'sound_cruise_account_qa_enroll',
    'sound_cruise_account_start',
    'sound_cruise_account_recovery',
    'sound_cruise_account_recovery_rotation'
  ]);
  let scriptPromise = null;
  let activeWidget = null;
  let containerSequence = 0;

  function siteKey() {
    const value = global.__SOUND_CRUISE_ACCOUNT_TURNSTILE_SITE_KEY__;
    return typeof value === 'string' ? value.trim() : '';
  }

  function loadApi() {
    if (global.turnstile && typeof global.turnstile.render === 'function') {
      return Promise.resolve(global.turnstile);
    }
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise((resolve, reject) => {
      const existing = global.document?.getElementById(SCRIPT_ID);
      const script = existing || global.document?.createElement('script');
      if (!script) return reject(new Error('turnstile_document_unavailable'));
      const ready = () => global.turnstile && typeof global.turnstile.render === 'function'
        ? resolve(global.turnstile) : reject(new Error('turnstile_api_unavailable'));
      script.addEventListener('load', ready, { once: true });
      script.addEventListener('error', () => reject(new Error('turnstile_api_failed')), { once: true });
      if (!existing) {
        script.id = SCRIPT_ID;
        script.src = API_URL;
        script.async = true;
        script.defer = true;
        global.document.head.appendChild(script);
      }
    }).catch((error) => {
      scriptPromise = null;
      throw error;
    });
    return scriptPromise;
  }

  // Do not reuse a Turnstile mount node. Safari Private can retain an
  // interaction-only iframe after remove(), which prevents a later action
  // from issuing a token in the same document.
  function container() {
    const element = global.document.createElement('div');
    element.id = `${CONTAINER_PREFIX}-${++containerSequence}`;
    element.setAttribute('aria-live', 'polite');
    global.document.body.appendChild(element);
    return element;
  }

  function reset(api, widget = activeWidget) {
    if (widget?.id !== null && widget?.id !== undefined && typeof api.remove === 'function') {
      try { api.remove(widget.id); } catch (_) { /* best effort UI cleanup */ }
    }
    if (widget?.element?.parentNode?.removeChild) {
      try { widget.element.parentNode.removeChild(widget.element); } catch (_) { /* best effort UI cleanup */ }
    } else if (widget?.element) {
      widget.element.textContent = '';
    }
    if (widget === activeWidget) activeWidget = null;
  }

  function withTimeout(promise, timeoutMs, onTimeout = () => {}) {
    let timeoutId;
    const timeout = new Promise((resolve) => {
      timeoutId = global.setTimeout(() => {
        onTimeout();
        resolve(null);
      }, timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => global.clearTimeout(timeoutId));
  }

  async function getToken(action, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    if (!ACTIONS.has(action) || !siteKey() || !global.document) return null;
    try {
      const api = await withTimeout(loadApi(), timeoutMs, () => { scriptPromise = null; });
      if (!api) return null;
      return await withTimeout(new Promise((resolve) => {
        let settled = false;
        const element = container();
        const widget = { id: null, element };
        const finish = (value) => {
          if (settled) return;
          settled = true;
          reset(api, widget);
          resolve(typeof value === 'string' && value ? value : null);
        };
        reset(api);
        try {
          widget.id = api.render(element, {
            sitekey: siteKey(),
            action,
            appearance: 'interaction-only',
            theme: 'auto',
            retry: 'auto',
            callback: finish,
            'error-callback': () => finish(null),
            'expired-callback': () => finish(null),
            'timeout-callback': () => finish(null)
          });
          activeWidget = widget;
          if (settled) reset(api, widget);
        } catch (_) { finish(null); }
      }), timeoutMs, () => reset(api));
    } catch (_) {
      return null;
    }
  }

  global.__SOUND_CRUISE_ACCOUNT_TURNSTILE__ = Object.freeze({ getToken });
})(globalThis);
