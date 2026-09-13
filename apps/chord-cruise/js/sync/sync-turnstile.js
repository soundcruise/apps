(function (global) {
    'use strict';

    var API_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    var SCRIPT_ID = 'sound-cruise-sync-turnstile-api';
    var CONTAINER_ID = 'sound-cruise-sync-turnstile';
    var ACTIONS = [
        'sound_cruise_sync_start',
        'sound_cruise_sync_pair',
        'sound_cruise_sync_recover'
    ];
    var scriptPromise = null;
    var activeWidgetId = null;

    function configuredSiteKey() {
        var value = global.__SOUND_CRUISE_SYNC_PRODUCTION_TURNSTILE_SITE_KEY__;
        return typeof value === 'string' ? value.trim() : '';
    }

    function loadApi() {
        if (global.turnstile && typeof global.turnstile.render === 'function') return Promise.resolve(global.turnstile);
        if (scriptPromise) return scriptPromise;
        scriptPromise = new Promise(function (resolve, reject) {
            var existing = global.document.getElementById(SCRIPT_ID);
            var script = existing || global.document.createElement('script');
            function ready() {
                if (global.turnstile && typeof global.turnstile.render === 'function') resolve(global.turnstile);
                else reject(new Error('Turnstile API unavailable'));
            }
            script.addEventListener('load', ready, { once: true });
            script.addEventListener('error', function () { reject(new Error('Turnstile API failed')); }, { once: true });
            if (!existing) {
                script.id = SCRIPT_ID;
                script.src = API_URL;
                script.async = true;
                script.defer = true;
                global.document.head.appendChild(script);
            }
        }).catch(function (error) {
            scriptPromise = null;
            throw error;
        });
        return scriptPromise;
    }

    function container() {
        var element = global.document.getElementById(CONTAINER_ID);
        if (element) return element;
        element = global.document.createElement('div');
        element.id = CONTAINER_ID;
        element.setAttribute('aria-live', 'polite');
        var section = global.document.getElementById('cc-sync-pairing-section');
        (section || global.document.body).appendChild(element);
        return element;
    }

    function removeActiveWidget(api) {
        if (activeWidgetId !== null && typeof api.remove === 'function') {
            try { api.remove(activeWidgetId); } catch (error) {}
        }
        activeWidgetId = null;
        var element = global.document.getElementById(CONTAINER_ID);
        if (element) element.textContent = '';
    }

    function tokenFor(action) {
        var siteKey = configuredSiteKey();
        if (!siteKey || ACTIONS.indexOf(action) === -1 || !global.document) return Promise.resolve(null);
        return loadApi().then(function (api) {
            return new Promise(function (resolve) {
                var settled = false;
                function finish(token) {
                    if (settled) return;
                    settled = true;
                    resolve(typeof token === 'string' && token ? token : null);
                }
                removeActiveWidget(api);
                try {
                    activeWidgetId = api.render(container(), {
                        sitekey: siteKey,
                        action: action,
                        appearance: 'interaction-only',
                        theme: 'auto',
                        retry: 'auto',
                        callback: finish,
                        'error-callback': function () { finish(null); },
                        'expired-callback': function () { finish(null); },
                        'timeout-callback': function () { finish(null); }
                    });
                } catch (error) {
                    finish(null);
                }
            });
        }).catch(function () { return null; });
    }

    global.__SOUND_CRUISE_SYNC_GET_TURNSTILE_TOKEN__ = tokenFor;
}(typeof window !== 'undefined' ? window : globalThis));
