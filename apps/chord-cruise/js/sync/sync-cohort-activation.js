(function (global) {
    'use strict';

    var STORAGE_KEY = 'chordCruise.syncProductionCohort';
    var STATE_VERSION = 1;
    var ENTRY_TAP_COUNT = 7;
    var ENTRY_TAP_WINDOW_MS = 5000;

    function disabledState() {
        return { version: STATE_VERSION, enabled: false };
    }

    function readState() {
        try {
            var raw = global.localStorage.getItem(STORAGE_KEY);
            if (!raw) return disabledState();
            var parsed = JSON.parse(raw);
            if (!parsed || parsed.version !== STATE_VERSION || typeof parsed.enabled !== 'boolean') {
                return disabledState();
            }
            return { version: STATE_VERSION, enabled: parsed.enabled === true };
        } catch (error) {
            return disabledState();
        }
    }

    function isEnabled() {
        return readState().enabled === true;
    }

    function setEnabled(enabled) {
        try {
            global.localStorage.setItem(STORAGE_KEY, JSON.stringify({
                version: STATE_VERSION,
                enabled: enabled === true
            }));
            return true;
        } catch (error) {
            return false;
        }
    }

    function isProPage() {
        var root = global.document && global.document.documentElement;
        return Boolean(root && root.getAttribute('data-app-edition') === 'Pro');
    }

    function openActivationPage() {
        global.location.assign('./sync-cohort.html');
    }

    function installPrivateEntry() {
        if (!isProPage() || !global.document || global.document.querySelector('[data-sync-cohort-page]')) return;
        Array.prototype.forEach.call(global.document.querySelectorAll('.cc-app-version-display'), function (display) {
            var tapCount = 0;
            var firstTapAt = 0;
            display.addEventListener('click', function () {
                var now = Date.now();
                if (!firstTapAt || now - firstTapAt > ENTRY_TAP_WINDOW_MS) {
                    tapCount = 0;
                    firstTapAt = now;
                }
                tapCount += 1;
                if (tapCount < ENTRY_TAP_COUNT) return;
                tapCount = 0;
                firstTapAt = 0;
                openActivationPage();
            });
        });
    }

    function installActivationPage() {
        if (!isProPage() || !global.document || !global.document.querySelector('[data-sync-cohort-page]')) return;
        var status = global.document.getElementById('sync-cohort-status');
        var enableButton = global.document.getElementById('sync-cohort-enable');
        var disableButton = global.document.getElementById('sync-cohort-disable');

        function render() {
            var enabled = isEnabled();
            if (status) status.textContent = enabled
                ? 'このブラウザでは先行テスト表示が有効です。'
                : 'このブラウザでは先行テスト表示は無効です。';
            if (enableButton) enableButton.hidden = enabled;
            if (disableButton) disableButton.hidden = !enabled;
        }

        if (enableButton) enableButton.addEventListener('click', function () {
            if (!setEnabled(true)) {
                if (status) status.textContent = '設定を保存できませんでした。ブラウザの保存設定を確認してください。';
                return;
            }
            global.location.replace('./');
        });
        if (disableButton) disableButton.addEventListener('click', function () {
            var confirmed = !global.confirm || global.confirm(
                'このブラウザでクラウド同期の先行テスト表示を解除しますか？\n同期資格情報や端末内のコードは削除されません。'
            );
            if (!confirmed) return;
            if (!setEnabled(false)) {
                if (status) status.textContent = '設定を保存できませんでした。ブラウザの保存設定を確認してください。';
                return;
            }
            global.location.replace('./');
        });
        render();
    }

    function install() {
        installPrivateEntry();
        installActivationPage();
    }

    var api = Object.freeze({
        storageKey: STORAGE_KEY,
        stateVersion: STATE_VERSION,
        readState: readState,
        isEnabled: isEnabled,
        setEnabled: setEnabled
    });
    global.ChordCruiseSyncCohortActivation = api;

    if (global.document) {
        if (global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', install, { once: true });
        else install();
    }
}(typeof window !== 'undefined' ? window : globalThis));
