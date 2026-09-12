(function (global) {
    'use strict';

    var DEFAULT_ENABLED = false;
    var SESSION_FLAG_KEY = 'soundCruise.syncPilot.enabled';
    var LOCAL_HOSTS = ['127.0.0.1', 'localhost', '::1'];
    var currentScript = global.document && global.document.currentScript;
    var baseUrl = currentScript && currentScript.src
        ? currentScript.src.slice(0, currentScript.src.lastIndexOf('/') + 1)
        : '';

    function isLocalQaHost() {
        return Boolean(global.location && LOCAL_HOSTS.indexOf(global.location.hostname) !== -1);
    }

    function sessionFlagEnabled() {
        if (!isLocalQaHost()) return false;
        try { return global.sessionStorage.getItem(SESSION_FLAG_KEY) === 'enabled'; } catch (error) { return false; }
    }

    function isEnabled() {
        if (!isLocalQaHost()) return false;
        return global.__SOUND_CRUISE_SYNC_PILOT__ === true || sessionFlagEnabled() || DEFAULT_ENABLED;
    }

    function setSessionEnabled(enabled) {
        if (!isLocalQaHost()) return false;
        try {
            if (enabled === true) global.sessionStorage.setItem(SESSION_FLAG_KEY, 'enabled');
            else global.sessionStorage.removeItem(SESSION_FLAG_KEY);
            return true;
        } catch (error) {
            return false;
        }
    }

    function loadScript(relativePath) {
        return new Promise(function (resolve, reject) {
            var script = global.document.createElement('script');
            script.src = baseUrl + relativePath;
            script.async = false;
            script.onload = resolve;
            script.onerror = function () { reject(new Error('Failed to load Sound Cruise Sync Pilot')); };
            global.document.head.appendChild(script);
        });
    }

    var ready = Promise.resolve({ enabled: false });
    if (isEnabled() && global.document && baseUrl) {
        ready = loadScript('sync-core.js')
            .then(function () { return loadScript('sync-db.js'); })
            .then(function () { return loadScript('sync-merge.js'); })
            .then(function () { return loadScript('sync-client.js'); })
            .then(function () {
                var endpoint = global.__SOUND_CRUISE_SYNC_PILOT_ENDPOINT__ || 'http://127.0.0.1:8787';
                var client = global.ChordCruiseSync.client.createClient({ enabled: true, endpoint: endpoint });
                global.ChordCruiseSync.pilotClient = client;
                return client.initialize().then(async function (result) {
                    client.watchLocalMutations(global.ChordCruise && global.ChordCruise.storage);
                    var store = await client.openStore();
                    if (await store.getMeta('datasetState') === 'ready') client.startBackgroundSync();
                    return loadScript('sync-pairing-ui.js').then(function () {
                        if (global.ChordCruiseSync.pairingUi) global.ChordCruiseSync.pairingUi.install(client);
                        return result;
                    });
                });
            })
            .catch(function () {
                return { enabled: true, ready: false, code: 'pilot_initialization_failed' };
            });
    }

    var api = Object.freeze({
        enabled: isEnabled(),
        defaultEnabled: DEFAULT_ENABLED,
        databaseName: 'soundCruiseSync',
        setSessionEnabled: setSessionEnabled,
        ready: ready
    });
    global.ChordCruiseSyncPilot = api;
}(typeof window !== 'undefined' ? window : globalThis));
