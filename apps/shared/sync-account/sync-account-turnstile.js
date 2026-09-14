(function installSyncAccountTurnstile(global) {
  'use strict';

  const API_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  const SCRIPT_ID = 'sound-cruise-account-turnstile-api';
  const CONTAINER_ID = 'sound-cruise-account-turnstile';
  const ACTIONS = new Set(['sound_cruise_account_qa_enroll', 'sound_cruise_account_start']);
  let scriptPromise = null;
  let activeWidgetId = null;

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

  function container() {
    let element = global.document.getElementById(CONTAINER_ID);
    if (!element) {
      element = global.document.createElement('div');
      element.id = CONTAINER_ID;
      element.setAttribute('aria-live', 'polite');
      global.document.body.appendChild(element);
    }
    return element;
  }

  function reset(api) {
    if (activeWidgetId !== null && typeof api.remove === 'function') {
      try { api.remove(activeWidgetId); } catch (_) { /* best effort UI cleanup */ }
    }
    activeWidgetId = null;
    const element = global.document?.getElementById(CONTAINER_ID);
    if (element) element.textContent = '';
  }

  async function getToken(action) {
    if (!ACTIONS.has(action) || !siteKey() || !global.document) return null;
    try {
      const api = await loadApi();
      return await new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
          if (settled) return;
          settled = true;
          resolve(typeof value === 'string' && value ? value : null);
        };
        reset(api);
        try {
          activeWidgetId = api.render(container(), {
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
        } catch (_) { finish(null); }
      });
    } catch (_) {
      return null;
    }
  }

  global.__SOUND_CRUISE_ACCOUNT_TURNSTILE__ = Object.freeze({ getToken });
})(globalThis);
