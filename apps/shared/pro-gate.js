/**
 * 共通 Pro ゲート
 * パスワード設定は各アプリの pro_x9v7q2m8/index.html にインラインで定義:
 *   window.__SOUNDCRUISE_PRO_GATE__ = { password: '0000' };
 * password を変更すると全ユーザーが自動的に再入力を求められます。
 */
(function () {
    // ---- パスワード設定を index.html のインラインスクリプトから読み込む ----
    var _g = window.__SOUNDCRUISE_PRO_GATE__;
    var CONFIG = (_g && typeof _g.password === 'string')
        ? { password: String(_g.password).trim() }
        : null;
    // -----------------------------------------------------------------------

    const STORAGE_KEY_LEGACY = 'pitchTrainerProGateOk';
    const LS_AUTH_KEY = 'soundcruise_pro_gate_rotation';
    const COOKIE_NAME = 'soundcruise_pro_gate_rid';
    const SW_GATE_VERSION_KEY = 'soundcruise_pro_sw_gate_v';

    function authToken(password) {
        try { return btoa(password); } catch (_) { return password; }
    }

    function sharedDomainForCookie() {
        const h = location.hostname;
        if (h === 'localhost' || h.endsWith('.local')) return null;
        if (h.endsWith('soundcruise.jp')) return '.soundcruise.jp';
        return null;
    }

    function getStoredAuth() {
        const d = sharedDomainForCookie();
        if (d) {
            const re = new RegExp('(?:^|; )' + COOKIE_NAME + '=([^;]*)');
            const m = document.cookie.match(re);
            if (m) return decodeURIComponent(m[1]);
        }
        try {
            const s = localStorage.getItem(LS_AUTH_KEY);
            if (s != null) return s;
        } catch (_) { /* ignore */ }
        return null;
    }

    function setStoredAuth(token) {
        const d = sharedDomainForCookie();
        if (d) {
            const sec = location.protocol === 'https:' ? '; Secure' : '';
            document.cookie =
                COOKIE_NAME +
                '=' +
                encodeURIComponent(token) +
                '; Path=/; Domain=' +
                d +
                '; Max-Age=31536000; SameSite=Lax' +
                sec;
        }
        try {
            localStorage.setItem(LS_AUTH_KEY, token);
        } catch (_) { /* ignore */ }
    }

    function clearGateStorage() {
        const d = sharedDomainForCookie();
        if (d) {
            const sec = location.protocol === 'https:' ? '; Secure' : '';
            document.cookie =
                COOKIE_NAME +
                '=; Path=/; Domain=' +
                d +
                '; Max-Age=0' +
                sec;
        }
        try {
            localStorage.removeItem(LS_AUTH_KEY);
            localStorage.removeItem(STORAGE_KEY_LEGACY);
        } catch (_) { /* ignore */ }
    }

    function isUnlocked() {
        return getStoredAuth() === authToken(CONFIG.password);
    }

    function dismissOverlay(overlay) {
        document.body.classList.remove('pro-gate-active');
        if (overlay && overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }
    }

    function showMissingConfigOverlay() {
        const overlay = document.createElement('div');
        overlay.id = 'pro-gate-overlay';
        overlay.className = 'pro-gate-overlay pro-gate-overlay--missing';
        overlay.setAttribute('role', 'alert');
        overlay.innerHTML =
            '<div class="pro-gate-panel">' +
            '<h2 id="pro-gate-title">設定エラー</h2>' +
            '<p class="pro-gate-hint"><strong>window.__SOUNDCRUISE_PRO_GATE__</strong> が定義されていません。<br>' +
            'index.html にインラインスクリプトを追加してください。</p>' +
            '</div>';
        document.body.classList.add('pro-gate-active');
        document.body.insertBefore(overlay, document.body.firstChild);
    }

    function attachResetButton() {
        const btn = document.getElementById('pro-gate-reset');
        if (!btn) return;
        btn.addEventListener('click', () => {
            clearGateStorage();
            window.location.reload();
        });
    }

    function mountGate() {
        var isPasswordReset = false;
        try {
            const q = new URLSearchParams(location.search || '');
            if (q.get('resetGate') === '1') {
                isPasswordReset = true;
                clearGateStorage();
                q.delete('resetGate');
                const qs = q.toString();
                const clean = location.pathname + (qs ? '?' + qs : '') + (location.hash || '');
                history.replaceState(null, '', clean);
            }
        } catch (_) { /* ignore */ }

        if (!CONFIG) {
            showMissingConfigOverlay();
            return;
        }

        if (isUnlocked()) {
            attachResetButton();
            return;
        }

        const overlay = document.createElement('div');
        overlay.id = 'pro-gate-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'pro-gate-title');
        const resetMessageHTML = isPasswordReset
            ? '<div class="pro-gate-reset-message-popup">パスワードがリセットされました</div>'
            : '';
        overlay.innerHTML =
            '<div class="pro-gate-box">' +
            '<div class="pro-gate-panel">' +
            '<h2 id="pro-gate-title">音感クルーズ <span style="color:#ffe566;">PRO</span></h2>' +
            '<p class="pro-gate-hint">会員向けのページです。<br>4桁のパスワードを入力(初回のみ)</p>' +
            '<input type="password" id="pro-gate-input" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="one-time-code" aria-describedby="pro-gate-error" />' +
            '<p id="pro-gate-error" aria-live="polite"></p>' +
            '<button type="button" id="pro-gate-submit" class="btn-primary">入る</button>' +
            '</div>' +
            '<div class="pro-gate-password-section">' +
            resetMessageHTML +
            '<a class="pro-gate-password-link" href="https://www.youtube.com/post/UgkxGGd0QKGyDd3-mMWvhusmK4ZvqmH8I6Er" target="_blank" rel="noopener noreferrer">パスワードはこちら(メンバーのみ閲覧可能)</a>' +
            '</div>' +
            '<div class="pro-gate-password-updated">2026.5.1更新</div>' +
            '</div>';

        document.body.classList.add('pro-gate-active');
        document.body.insertBefore(overlay, document.body.firstChild);

        const input = document.getElementById('pro-gate-input');
        const err = document.getElementById('pro-gate-error');
        const submit = document.getElementById('pro-gate-submit');

        function trySubmit() {
            const v = (input.value || '').replace(/\D/g, '').slice(0, 4);
            input.value = v;
            err.textContent = '';
            if (v.length !== 4) {
                err.textContent = '4桁の数字を入力してください。';
                return;
            }
            if (v !== CONFIG.password) {
                err.textContent = 'パスワードが違います。';
                input.select();
                return;
            }
            try {
                localStorage.removeItem(STORAGE_KEY_LEGACY);
            } catch (_) { /* ignore */ }
            setStoredAuth(authToken(CONFIG.password));
            dismissOverlay(overlay);
            attachResetButton();
        }

        input.addEventListener('input', () => {
            input.value = (input.value || '').replace(/\D/g, '').slice(0, 4);
            err.textContent = '';
        });

        submit.addEventListener('click', trySubmit);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') trySubmit();
        });

        requestAnimationFrame(() => {
            input.focus();
        });
    }

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', function (event) {
            if (!event.data || event.data.type !== 'PRO_GATE_INVALIDATE') return;
            var newVer = event.data.version;
            var knownVer = NaN;
            try {
                var s = localStorage.getItem(SW_GATE_VERSION_KEY);
                if (s != null) knownVer = parseInt(s, 10);
            } catch (_) {}
            if (Number.isNaN(knownVer) || newVer > knownVer) {
                try { localStorage.setItem(SW_GATE_VERSION_KEY, String(newVer)); } catch (_) {}
                clearGateStorage();
                var url = location.href;
                if (event.data.resetGate) {
                    var sep = url.indexOf('?') > -1 ? '&' : '?';
                    url += sep + 'resetGate=1';
                }
                window.location.href = url;
            }
        });
    }

    function boot() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', mountGate);
        } else {
            mountGate();
        }
    }

    boot();
})();
