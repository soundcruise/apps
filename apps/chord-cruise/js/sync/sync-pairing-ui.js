(function (global) {
    'use strict';

    function tokenForPairing() {
        var provider = global.__SOUND_CRUISE_SYNC_PILOT_GET_TURNSTILE_TOKEN__;
        if (typeof provider === 'function') return Promise.resolve(provider('sound_cruise_sync_pair'));
        return Promise.resolve(global.__SOUND_CRUISE_SYNC_PILOT_TURNSTILE_TOKEN__ || null);
    }

    function messageFor(code) {
        var labels = {
            pairing_expired: 'コードの有効期限が切れました。新しいコードを発行してください。',
            pairing_already_used: 'このコードはすでに使用されています。',
            pairing_cancelled: 'このコードは無効になりました。新しいコードを発行してください。',
            pairing_attempts_exhausted: '試行回数の上限に達しました。新しいコードを発行してください。',
            device_limit: 'この同期には接続できる端末数の上限があります。',
            rate_limited: '少し時間をおいてからもう一度お試しください。',
            turnstile_failed: '認証を完了できませんでした。もう一度お試しください。',
            client_storage_failed: 'この端末に同期情報を保存できませんでした。コードを再発行してやり直してください。'
        };
        return labels[code] || '接続を完了できませんでした。';
    }

    function install(client) {
        if (!global.document || global.document.getElementById('cc-sync-pairing-section')) return false;
        var anchor = global.document.querySelector('.cc-settings-refresh-bar');
        if (!anchor) return false;
        var section = global.document.createElement('section');
        section.id = 'cc-sync-pairing-section';
        section.className = 'cc-settings-reset';
        section.setAttribute('aria-labelledby', 'cc-sync-pairing-title');
        section.innerHTML = '<h4 id="cc-sync-pairing-title">クラウド同期</h4><p class="cc-settings-note" data-sync-pairing-status>確認中…</p><div data-sync-pairing-actions></div><p class="cc-settings-note" data-sync-pairing-result aria-live="polite"></p>';
        anchor.parentNode.insertBefore(section, anchor);
        var status = section.querySelector('[data-sync-pairing-status]');
        var actions = section.querySelector('[data-sync-pairing-actions]');
        var result = section.querySelector('[data-sync-pairing-result]');

        function button(label, action, className) {
            var element = global.document.createElement('button');
            element.type = 'button';
            element.className = className || 'cc-settings-reset-trigger';
            element.textContent = label;
            element.addEventListener('click', action);
            return element;
        }

        async function render() {
            var store = await client.openStore();
            var credential = await store.getMeta('deviceCredential');
            var syncState = await store.getMeta('syncState');
            actions.textContent = '';
            result.textContent = '';
            if (credential && credential.credential) {
                status.textContent = syncState === 'paired_pending' ? '同期接続済み（データ統合は次のPilotで行います）' : '同期済み';
                actions.appendChild(button('別のアプリと同期', issueCode));
                return;
            }
            status.textContent = 'この端末はまだクラウド同期に接続していません。';
            actions.appendChild(button('同期をはじめる', function () {
                result.textContent = '新規同期の開始は既存Pilot導線から実行してください。';
            }));
            actions.appendChild(button('すでに同期しています', showPairForm, 'cc-settings-reset-trigger cc-settings-pro-link'));
        }

        async function issueCode() {
            var issued = await client.issuePairingCode();
            if (!issued.ok) { result.textContent = messageFor(issued.code); return; }
            status.textContent = '別のChord Cruiseで、この8桁コードを入力してください。';
            actions.textContent = '';
            var output = global.document.createElement('output');
            output.className = 'cc-settings-note';
            output.textContent = issued.displayCode;
            actions.appendChild(output);
            actions.appendChild(button('コードをコピー', async function () {
                try {
                    if (global.navigator && global.navigator.clipboard) await global.navigator.clipboard.writeText(issued.pairingCode);
                    result.textContent = 'コードをコピーしました。';
                } catch (error) { result.textContent = 'コピーできませんでした。表示中のコードを入力してください。'; }
            }));
            actions.appendChild(button('新しいコードを発行', issueCode, 'cc-settings-reset-trigger cc-settings-pro-link'));
        }

        function showPairForm() {
            actions.textContent = '';
            var input = global.document.createElement('input');
            input.type = 'text'; input.inputMode = 'numeric'; input.autocomplete = 'one-time-code';
            input.maxLength = 9; input.placeholder = '1234 5678'; input.setAttribute('aria-label', '8桁の同期コード');
            input.addEventListener('input', function () {
                var code = global.ChordCruiseSync.client.normalizePairingCode(input.value);
                input.value = code ? global.ChordCruiseSync.client.formatPairingCode(code) : input.value.replace(/[^0-9\s-]/g, '');
            });
            actions.appendChild(input);
            actions.appendChild(button('接続する', async function () {
                var token = await tokenForPairing();
                if (!token) { result.textContent = '認証を完了してから接続してください。'; return; }
                var paired = await client.pairWithCode({ pairingCode: input.value, turnstileToken: token });
                if (!paired.ok) { result.textContent = messageFor(paired.code); return; }
                result.textContent = paired.localState === 'empty'
                    ? '接続しました。クラウドデータの導入は次のPilotで安全に確認します。'
                    : '接続しました。この端末のデータは統合待ちです。どちらのデータも変更していません。';
                render();
            }));
        }

        render().catch(function () { status.textContent = '同期状態を確認できませんでした。'; });
        return true;
    }

    global.ChordCruiseSync = global.ChordCruiseSync || {};
    global.ChordCruiseSync.pairingUi = Object.freeze({ install: install });
}(typeof window !== 'undefined' ? window : globalThis));
