/* Theme Contract v1. This classic script also exports pure Node-test entry points.
   Loading it registers the API only; the entry HTML explicitly applies the bootstrap. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var contract = factory();
        root.CruiseStudio = root.CruiseStudio || {};
        root.CruiseStudio.colorTheme = contract.createColorThemeRuntime({
            getStorage: function () { return root.localStorage; },
            document: root.document
        });
    }
})(typeof globalThis === 'object' ? globalThis : this, function () {
    'use strict';
    var STORAGE_KEY = 'cruiseStudio.appSettings';
    var SETTING_NAME = 'colorTheme';
    var DEFAULT_THEME = 'dark';
    var themes = Object.freeze([
        Object.freeze({ id: 'dark', displayName: 'ダーク', colorScheme: 'dark', themeColor: '#090806' }),
        Object.freeze({ id: 'midnight', displayName: 'ミッドナイト', colorScheme: 'dark', themeColor: '#10151c' }),
        Object.freeze({ id: 'charcoal', displayName: 'チャコール', colorScheme: 'dark', themeColor: '#424346' }),
        Object.freeze({ id: 'gray', displayName: 'グレー', colorScheme: 'light', themeColor: '#c8cbd0' }),
        Object.freeze({ id: 'light', displayName: 'ライト', colorScheme: 'light', themeColor: '#f7f6f2' })
    ]);

    function resolveColorTheme(value) {
        return themes.some(function (theme) { return theme.id === value; }) ? value : DEFAULT_THEME;
    }
    function listColorThemes() { return themes; }
    function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }

    function createColorThemeRuntime(environment) {
        environment = environment || {};
        var current = null;
        var listeners = new Set();
        function storage() { return environment.getStorage ? environment.getStorage() : environment.storage; }
        function readSettings() {
            var raw = storage().getItem(STORAGE_KEY);
            if (raw === null) return {};
            var settings = JSON.parse(raw);
            if (!isRecord(settings)) throw new TypeError('appSettings must be a JSON object');
            return settings;
        }
        function getColorTheme() {
            if (current === null) {
                try {
                    var settings = readSettings();
                    current = resolveColorTheme(Object.hasOwn(settings, SETTING_NAME) ? settings[SETTING_NAME] : undefined);
                } catch (_) { current = DEFAULT_THEME; }
            }
            return current;
        }
        function applyColorTheme(value) {
            var themeId = resolveColorTheme(value);
            var previous = current;
            current = themeId;
            var theme = themes.find(function (entry) { return entry.id === themeId; });
            var doc = environment.document;
            if (doc) {
                doc.documentElement.setAttribute('data-theme', themeId);
                var meta = doc.querySelector('meta[name="theme-color"]');
                if (meta) meta.setAttribute('content', theme.themeColor);
            }
            // Native color-scheme is scoped to a future Shell consumer, not legacy screens.
            if (previous !== current) listeners.forEach(function (listener) {
                try { listener(current); } catch (_) { /* one subscriber cannot block application */ }
            });
            return current;
        }
        function setColorTheme(value) {
            var themeId = resolveColorTheme(value);
            var result;
            try {
                // Read the latest object on every save; preserve Loupe / Pre-DTM / unknown fields.
                // Malformed or unreadable settings are never replaced with an empty object.
                var settings = readSettings();
                settings[SETTING_NAME] = themeId;
                storage().setItem(STORAGE_KEY, JSON.stringify(settings));
                result = { ok: true, theme: themeId, error: null };
            } catch (error) {
                result = { ok: false, theme: themeId, error: String(error && error.message || error) };
            }
            applyColorTheme(themeId); // A failed save changes only this runtime; the caller receives failure.
            return result;
        }
        function subscribeColorTheme(listener) {
            if (typeof listener !== 'function') throw new TypeError('theme listener must be a function');
            listeners.add(listener);
            return function () { listeners.delete(listener); };
        }
        return Object.freeze({
            getColorTheme: getColorTheme, setColorTheme: setColorTheme, applyColorTheme: applyColorTheme,
            resolveColorTheme: resolveColorTheme, listColorThemes: listColorThemes,
            subscribeColorTheme: subscribeColorTheme
        });
    }
    return Object.freeze({
        STORAGE_KEY: STORAGE_KEY, SETTING_NAME: SETTING_NAME, DEFAULT_THEME: DEFAULT_THEME,
        resolveColorTheme: resolveColorTheme, listColorThemes: listColorThemes,
        createColorThemeRuntime: createColorThemeRuntime
    });
});
