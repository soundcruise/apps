/** S2-A common Pro UI gate. This is UI access only, never Account authority. */
(function () {
    'use strict';
    const config = window.__SOUNDCRUISE_PRO_GATE__ || {};
    const appName = typeof config.appName === 'string' && config.appName.trim()
        ? config.appName.trim() : 'Sound Cruise';
    const API = 'https://sound-cruise-sync.cruise-port-requests.workers.dev/v2/pro-auth';
    const SITE_KEY = '0x4AAAAAAEyUW3_hNe2DPgWr'; // Public Turnstile site key.
    const AUTH_KEY = 'soundCruiseProAuth';
    const MIGRATED_KEY = 'soundCruiseProAuthMigrated';
    const RETIRED_KEY = 'soundCruiseProLegacyRetired';
    const PENDING_KEY = 'soundCruiseProRevokePending';
    const LEGACY_COOKIE = 'soundcruise_pro_gate_rid';
    const LEGACY_PITCH_TOKEN = 'pitch-cruise-pro-gate-v8';
    const TOKEN_RE = /^scp1\.[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[A-Za-z0-9_-]{43}$/;
    let overlay;
    let releaseGateFocus = null;
    let resetInFlight = false;
    let helperPromise = null;

    function get(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
    function put(key, value) { try { localStorage.setItem(key, value); return true; } catch (_) { return false; } }
    function remove(key) { try { localStorage.removeItem(key); } catch (_) { /* storage unavailable */ } }
    function auth() {
        try {
            const value = JSON.parse(get(AUTH_KEY) || 'null');
            return value && value.v === 2 && typeof value.credential === 'string' &&
                TOKEN_RE.test(value.credential) && Number.isSafeInteger(value.generation) && value.generation > 0 ? value : null;
        } catch (_) { return null; }
    }
    function clearLegacy() {
        if (!auth()) remove(AUTH_KEY);
        remove('soundcruise_pro_gate_rotation');
        remove('pitchTrainerProGateOk');
        const secure = location.protocol === 'https:' ? '; Secure' : '';
        try {
            document.cookie = LEGACY_COOKIE + '=; Path=/; Max-Age=0' + secure;
            if (location.hostname === 'soundcruise.jp' || location.hostname.endsWith('.soundcruise.jp')) {
                document.cookie = LEGACY_COOKIE + '=; Path=/; Domain=.soundcruise.jp; Max-Age=0' + secure;
            }
        } catch (_) { /* cookie access is optional for server credentials */ }
    }
    function legacyPresent() {
        if (get(MIGRATED_KEY) === '1' || get(RETIRED_KEY) === '1') return false;
        try { if (JSON.parse(get(AUTH_KEY) || 'null')?.v === 1) return true; } catch (_) { /* invalid old state */ }
        if (get('soundcruise_pro_gate_rotation') === LEGACY_PITCH_TOKEN) return true;
        try {
            return document.cookie.split(';').some((part) =>
                part.trim() === LEGACY_COOKIE + '=' + encodeURIComponent(LEGACY_PITCH_TOKEN));
        } catch (_) { return false; }
    }
    function retireLegacy() { clearLegacy(); put(RETIRED_KEY, '1'); }
    function migrated() { clearLegacy(); return put(MIGRATED_KEY, '1'); }
    function queuePending(token) {
        let pending = [];
        try { pending = JSON.parse(get(PENDING_KEY) || '[]'); } catch (_) { /* malformed queue */ }
        if (!Array.isArray(pending)) pending = [];
        if (!pending.includes(token)) pending.push(token);
        put(PENDING_KEY, JSON.stringify(pending));
    }
    async function request(path, options = {}) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        let response;
        try {
            response = await fetch(API + path, { mode: 'cors', cache: 'no-store', credentials: 'omit', signal: controller.signal, ...options });
        } finally { clearTimeout(timeout); }
        let body = null;
        try { body = await response.json(); } catch (_) { /* non-JSON upstream */ }
        return { status: response.status, body };
    }
    async function turnstileHelper() {
        if (window.__SOUND_CRUISE_ACCOUNT_TURNSTILE__) return window.__SOUND_CRUISE_ACCOUNT_TURNSTILE__;
        if (!helperPromise) helperPromise = new Promise((resolve) => {
            const script = document.createElement('script');
            let finished = false;
            const finish = () => {
                if (finished) return;
                finished = true;
                clearTimeout(timeout);
                resolve(window.__SOUND_CRUISE_ACCOUNT_TURNSTILE__ || null);
            };
            const timeout = setTimeout(finish, 8000);
            script.src = '../../shared/sync-account/sync-account-turnstile.js?v=8';
            script.onload = finish;
            script.onerror = finish;
            document.head.appendChild(script);
        }).finally(() => { helperPromise = null; });
        return helperPromise;
    }
    async function flushPending() {
        let pending;
        try { pending = JSON.parse(get(PENDING_KEY) || '[]'); } catch (_) { return; }
        if (!Array.isArray(pending) || !pending.length) return;
        const completed = new Set();
        for (const token of pending) {
            if (typeof token !== 'string') continue;
            try {
                const result = await request('/revoke', {
                    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: '{}'
                });
                if (result.status < 500 && result.status !== 429) completed.add(token);
            } catch (_) { /* retry when online */ }
        }
        let current;
        try { current = JSON.parse(get(PENDING_KEY) || '[]'); } catch (_) { return; }
        if (!Array.isArray(current)) return;
        const remaining = current.filter((token) => !completed.has(token));
        if (remaining.length) put(PENDING_KEY, JSON.stringify(remaining)); else remove(PENDING_KEY);
    }
    async function reset() {
        if (resetInFlight) return;
        resetInFlight = true;
        const existing = auth();
        if (existing) {
            // Persist a revoke attempt before dropping UI access, including offline resets.
            queuePending(existing.credential);
            put(MIGRATED_KEY, '1');
            remove(AUTH_KEY);
        }
        clearLegacy();
        lock();
        await flushPending();
    }
    window.__soundCruiseClearGate = reset;
    window.addEventListener('online', () => { void flushPending(); });

    function containGateFocus(overlay) {
        const backgrounds = new Map();
        function isolateBackground() {
            for (const element of document.body.children) {
                if (element === overlay || backgrounds.has(element)) continue;
                backgrounds.set(element, element.hasAttribute('inert'));
                element.setAttribute('inert', '');
            }
        }
        function focusable() {
            return [...overlay.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')]
                .filter(element => element.tabIndex >= 0 && !element.matches(':disabled')
                    && !element.closest('[hidden], [inert]') && element.getClientRects().length
                    && getComputedStyle(element).visibility === 'visible');
        }
        overlay.tabIndex = -1;
        function focusFirst() { (focusable()[0] || overlay).focus({ preventScroll: true }); }
        function onKeydown(event) {
            if (event.key !== 'Tab') return;
            const targets = focusable();
            const index = targets.indexOf(document.activeElement);
            if (!targets.length || index < 0 || (event.shiftKey ? index === 0 : index === targets.length - 1)) {
                event.preventDefault();
                (event.shiftKey ? targets[targets.length - 1] || overlay : targets[0] || overlay)
                    .focus({ preventScroll: true });
            }
        }
        function onFocus(event) { if (!overlay.contains(event.target)) focusFirst(); }
        isolateBackground();
        const observer = new MutationObserver(isolateBackground);
        observer.observe(document.body, { childList: true });
        document.addEventListener('keydown', onKeydown, true);
        document.addEventListener('focusin', onFocus, true);
        const frame = requestAnimationFrame(focusFirst);
        return () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
            document.removeEventListener('keydown', onKeydown, true);
            document.removeEventListener('focusin', onFocus, true);
            for (const [element, wasInert] of backgrounds) if (!wasInert) element.removeAttribute('inert');
        };
    }

    function lock() {
        if (overlay) return;
        overlay = document.createElement('div');
        overlay.id = 'pro-gate-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'pro-gate-title');
        const box = document.createElement('div');
        box.className = 'pro-gate-box';
        box.innerHTML = '<div class="pro-gate-panel">' +
            '<h2 id="pro-gate-title"></h2>' +
            '<p class="pro-gate-hint">会員向けのページです。<br>4桁の番号を入力してください。</p>' +
            '<input type="password" id="pro-gate-input" aria-label="4桁の番号" inputmode="numeric" maxlength="4" autocomplete="one-time-code" aria-describedby="pro-gate-error" />' +
            '<p id="pro-gate-error" aria-live="polite"></p>' +
            '<div id="pro-gate-turnstile"></div>' +
            '<button type="button" id="pro-gate-submit" class="btn-primary">入る</button></div>' +
            '<div class="pro-gate-password-section">' +
            '<a class="pro-gate-password-link" href="https://www.youtube.com/post/UgkxGGd0QKGyDd3-mMWvhusmK4ZvqmH8I6Er" target="_blank" rel="noopener noreferrer">番号はこちら（メンバーのみ閲覧可能）</a>' +
            '<div class="pro-gate-password-updated">2026.5.1更新</div>' +
            (config.troubleshootHref === './troubleshoot.html'
                ? '<div class="pro-gate-troubleshoot-link"><a href="./troubleshoot.html">メンバーなのに見られない方</a></div>' : '') +
            '</div>';
        overlay.appendChild(box);
        box.querySelector('#pro-gate-title').textContent = appName + ' PRO';
        document.body.classList.add('pro-gate-active');
        document.body.insertBefore(overlay, document.body.firstChild);
        releaseGateFocus = containGateFocus(overlay);
        const input = box.querySelector('#pro-gate-input');
        const submit = box.querySelector('#pro-gate-submit');
        const message = box.querySelector('#pro-gate-error');
        input.addEventListener('input', () => { message.textContent = ''; });
        input.addEventListener('keydown', (event) => { if (event.key === 'Enter') void submitCode(); });
        submit.addEventListener('click', () => { void submitCode(); });
        input.focus();
        async function submitCode() {
            const passcode = input.value;
            if (!/^[0-9]{4}$/.test(passcode)) { message.textContent = '半角数字4桁を入力してください。'; return; }
            submit.disabled = true;
            try {
                if (!window.__SOUND_CRUISE_ACCOUNT_TURNSTILE_SITE_KEY__) {
                    window.__SOUND_CRUISE_ACCOUNT_TURNSTILE_SITE_KEY__ = SITE_KEY;
                }
                const turnstile = await turnstileHelper();
                const turnstileToken = await turnstile?.getToken('sound_cruise_pro_verify',
                    { mount: box.querySelector('#pro-gate-turnstile'), visible: true });
                if (!turnstileToken) { message.textContent = '確認を完了できませんでした。通信状態をご確認ください。'; return; }
                const result = await request('/verify', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ passcode, turnstileToken })
                });
                if (result.status === 201 && result.body?.ok === true &&
                    typeof result.body.credential === 'string' && TOKEN_RE.test(result.body.credential) &&
                    Number.isSafeInteger(result.body.generation) && result.body.generation > 0) {
                    const saved = put(AUTH_KEY, JSON.stringify({ v: 2, credential: result.body.credential,
                        generation: result.body.generation, validatedAt: Date.now() }));
                    if (!saved) { message.textContent = 'このブラウザーに認証を保存できません。'; return; }
                    if (!migrated()) {
                        remove(AUTH_KEY);
                        message.textContent = 'このブラウザーに認証を保存できません。';
                        return;
                    }
                    unlock();
                    return;
                }
                message.textContent = result.status === 401 ? '番号が違います。' :
                    result.status === 429 ? '試行回数が多いため、少し待ってからお試しください。' :
                    '確認に失敗しました。通信状態をご確認のうえ、再度お試しください。';
            } catch (_) { message.textContent = '接続できません。オンラインで再度お試しください。'; }
            finally { input.value = ''; submit.disabled = false; }
        }
    }
    function unlock() {
        if (!overlay) return;
        releaseGateFocus?.();
        releaseGateFocus = null;
        overlay.remove();
        overlay = null;
        document.body.classList.remove('pro-gate-active');
    }
    async function initialize() {
        lock();
        // Old service workers use this query flag for legacy invalidation. It must not revoke a v2 token.
        try {
            const url = new URL(location.href);
            if (url.searchParams.get('resetGate') === '1') {
                if (!auth()) clearLegacy();
                url.searchParams.delete('resetGate');
                history.replaceState(null, '', url.pathname + url.search + url.hash);
            }
        } catch (_) { /* leave gate locked */ }
        void flushPending();
        const existing = auth();
        if (existing) {
            if (!migrated()) return;
            try {
                const result = await request('/session', { headers: { Authorization: 'Bearer ' + existing.credential } });
                if (result.status === 200 && result.body?.ok === true && Number.isSafeInteger(result.body.generation)) {
                    if (result.body.generation !== existing.generation) {
                        remove(AUTH_KEY);
                        return;
                    }
                    existing.generation = result.body.generation;
                    existing.validatedAt = Date.now();
                    put(AUTH_KEY, JSON.stringify(existing));
                    if (!migrated()) return;
                    if (result.body.legacyCompatibilityEnabled === false) retireLegacy();
                    unlock();
                    return;
                }
                if (result.status === 401) { remove(AUTH_KEY); put(MIGRATED_KEY, '1'); return; }
                if (result.status < 500 && result.status !== 429) return;
            } catch (_) { /* network outage */ }
            if (Number.isFinite(existing.validatedAt) && existing.validatedAt > 0) unlock();
            return;
        }
        if (!legacyPresent()) return;
        try {
            const result = await request('/policy');
            if (result.status === 200 && result.body?.ok === true) {
                if (result.body.legacyCompatibilityEnabled === false) { retireLegacy(); return; }
                unlock();
                return;
            }
            if (result.status < 500) return;
        } catch (_) { /* network outage */ }
        if (get(RETIRED_KEY) !== '1') unlock();
    }
    document.addEventListener('click', (event) => {
        if (!event.target.closest?.('#pro-gate-reset')) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        void reset().finally(() => window.location.reload());
    }, true);
    // A cached service worker must never invalidate a server credential by its old gate version.
    if (document.body) lock();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
    else void initialize();
})();
