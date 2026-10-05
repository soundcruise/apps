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
    const TOKEN_RE = /^scp1\.[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[A-Za-z0-9_-]{43}$/;
    let overlay;
    let releaseGateFocus = null;
    let resetInFlight = false;
    let helperPromise = null;
    let showPasscode = null;
    let backendAuthRequired = false;
    const backendAuthWaiters = new Set();
    let sessionClient;
    let accessGranted = false;
    let expiryTimer;
    let validationPromise;
    let authEpoch = 0;
    let lastHandledCredential = null;
    let bootValidation;
    let gateMessage;

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
    function deviceSession() {
        if (!sessionClient) sessionClient = window.SoundCruiseProDeviceSession?.createClient({
            request, isCurrent: existing => auth()?.credential === existing.credential && !resetInFlight
        });
        if (!sessionClient) throw Error('Pro session helper unavailable');
        return sessionClient;
    }
    async function forget(existing) {
        try { if (existing) await deviceSession().forget(existing); } catch (_) { /* failed storage never grants access */ }
    }
    function scheduleExpiry(result) {
        clearTimeout(expiryTimer);
        if (Number.isFinite(result.offlineRemainingMs)) {
            expiryTimer = setTimeout(() => {
                accessGranted = false; lock('passcode');
                if (gateMessage) gateMessage.textContent = '認証の再確認が必要です。オンラインに接続すると自動で確認します。';
            }, result.offlineRemainingMs);
            expiryTimer?.unref?.();
        }
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
        authEpoch++;
        const existing = auth();
        if (existing) {
            // Persist a revoke attempt before dropping UI access, including offline resets.
            queuePending(existing.credential);
            put(MIGRATED_KEY, '1');
            remove(AUTH_KEY);
        }
        clearLegacy();
        accessGranted = false;
        clearTimeout(expiryTimer);
        lock('passcode');
        await forget(existing);
        await flushPending();
        resetInFlight = false;
    }
    window.__soundCruiseClearGate = reset;
    window.__soundCruiseRequireProBackendAuth = () => {
        if (auth() && accessGranted) return Promise.resolve();
        backendAuthRequired = true;
        lock('passcode');
        return new Promise((resolve) => { backendAuthWaiters.add(resolve); });
    };
    window.__soundCruiseRejectProBackendAuth = (credential) => {
        // A delayed response for an older token must not invalidate a new one.
        const current = auth();
        if (current && current.credential !== credential) return;
        if (current) { remove(AUTH_KEY); put(MIGRATED_KEY, '1'); void forget(current); }
        accessGranted = false;
        clearTimeout(expiryTimer);
        authEpoch++;
        backendAuthRequired = true;
        lock('passcode');
    };
    window.addEventListener('online', () => { void flushPending(); if (auth()) void initialize(true); });
    window.__soundCruiseEnsureProSession = async () => {
        if (!auth()) { await window.__soundCruiseRequireProBackendAuth(); return accessGranted; }
        await initialize(false);
        return accessGranted;
    };
    window.addEventListener('focus', () => { if (auth()) void initialize(false); });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && auth()) void initialize(false);
        else if (auth()) {
            try { void deviceSession().allowance(auth()); } catch (_) { /* no grant from a missing helper */ }
        }
    });
    let lastActivityCheck = -Infinity;
    document.addEventListener('pointerdown', () => {
        if (!accessGranted || !auth()) return;
        const observed = window.performance?.now?.() ?? Date.now();
        if (observed - lastActivityCheck < 5000) return;
        lastActivityCheck = observed;
        void initialize(false);
    }, true);
    // Checkpoint time during local use; the helper still throttles network renewal
    // until 12 hours have elapsed. No password or extra server lease is issued here.
    const renewalTimer = setInterval(() => {
        if (document.visibilityState !== 'hidden' && auth()) void initialize(false);
    }, 60_000);
    renewalTimer?.unref?.();
    window.addEventListener('storage', (event) => {
        // A different Pro app/tab can complete the same shared authentication.
        if (event.key !== AUTH_KEY) return;
        const current = auth();
        if (current?.credential === lastHandledCredential && accessGranted && !backendAuthRequired) return;
        authEpoch++;
        if (current) {
            if (validationPromise) void validationPromise.finally(() => initialize(true));
            else void initialize(true);
        } else { accessGranted = false; clearTimeout(expiryTimer); lock('passcode'); }
    });

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
            return [...overlay.querySelectorAll('a[href], button, input, select, textarea, summary, [tabindex]')]
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

    // 'checking' covers the app without showing the passcode until access is actually required.
    function lock(state = 'checking') {
        if (overlay) {
            if (state === 'passcode') showPasscode?.();
            return;
        }
        overlay = document.createElement('div');
        overlay.id = 'pro-gate-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'pro-gate-checking-title');
        overlay.setAttribute('aria-busy', 'true');
        const checking = document.createElement('div');
        checking.className = 'pro-gate-checking';
        const checkingTitle = document.createElement('p');
        checkingTitle.id = 'pro-gate-checking-title';
        checkingTitle.className = 'pro-gate-checking-title';
        checkingTitle.textContent = appName + ' PRO';
        const checkingText = document.createElement('p');
        checkingText.className = 'pro-gate-checking-text';
        checkingText.setAttribute('role', 'status');
        checkingText.textContent = '確認しています…';
        checking.appendChild(checkingTitle);
        checking.appendChild(checkingText);
        overlay.appendChild(checking);
        const box = document.createElement('div');
        box.className = 'pro-gate-box';
        box.hidden = true;
        box.innerHTML = '<div class="pro-gate-panel">' +
            '<h2 id="pro-gate-title"></h2>' +
            '<p class="pro-gate-hint">会員向けのページです。<br>4桁の番号を入力してください。</p>' +
            '<input type="password" id="pro-gate-input" aria-label="4桁の番号" inputmode="numeric" maxlength="4" autocomplete="one-time-code" aria-describedby="pro-gate-error" />' +
            '<p id="pro-gate-error" aria-live="polite"></p>' +
            '<div id="pro-gate-turnstile"></div>' +
            '<button type="button" id="pro-gate-submit" class="btn-primary">入る</button></div>' +
            '<div class="pro-gate-password-section">' +
            (window.SoundCruiseProPostHelp?.primaryLinkMarkup() || '<p>番号の案内を表示できません。ページを更新してください。</p>') +
            '<div class="pro-gate-password-updated">2026.10.5更新</div>' +
            (window.SoundCruiseProPostHelp?.helpMarkup() || '') +
            '</div>';
        window.SoundCruiseProPostHelp?.bind(box);
        overlay.appendChild(box);
        box.querySelector('#pro-gate-title').textContent = appName + ' PRO';
        document.body.classList.add('pro-gate-active');
        document.body.insertBefore(overlay, document.body.firstChild);
        releaseGateFocus = containGateFocus(overlay);
        const input = box.querySelector('#pro-gate-input');
        const submit = box.querySelector('#pro-gate-submit');
        const message = box.querySelector('#pro-gate-error');
        gateMessage = message;
        input.addEventListener('input', () => { message.textContent = ''; });
        input.addEventListener('keydown', (event) => { if (event.key === 'Enter') void submitCode(); });
        submit.addEventListener('click', () => { void submitCode(); });
        showPasscode = () => {
            if (!box.hidden) return;
            checking.hidden = true;
            box.hidden = false;
            overlay.removeAttribute('aria-busy');
            overlay.setAttribute('aria-labelledby', 'pro-gate-title');
            input.focus();
        };
        if (state === 'passcode') showPasscode();
        async function submitCode() {
            const passcode = input.value;
            const submittedEpoch = authEpoch;
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
                const devicePublicKey = await deviceSession().publicKey();
                const result = await request('/verify', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ passcode, turnstileToken, devicePublicKey })
                });
                if (submittedEpoch !== authEpoch || resetInFlight) return;
                if (result.status === 201 && result.body?.ok === true &&
                    typeof result.body.credential === 'string' && TOKEN_RE.test(result.body.credential) &&
                    Number.isSafeInteger(result.body.generation) && result.body.generation > 0) {
                    const saved = put(AUTH_KEY, JSON.stringify({ v: 2, credential: result.body.credential,
                        generation: result.body.generation, sessionVersion: result.body.session?.version === 3 ? 3 : 2, validatedAt: Date.now() }));
                    if (!saved) { message.textContent = 'このブラウザーに認証を保存できません。'; return; }
                    let accepted = false;
                    try {
                        const current = auth();
                        accepted = result.body.session ? await deviceSession().accept(current, result.body.session) : false;
                        if (!accepted) {
                            const validation = await deviceSession().validate(current);
                            accepted = validation.ok === true;
                            if (accepted) scheduleExpiry(validation);
                        } else {
                            const grant = await deviceSession().allowance(current);
                            accepted = grant.ok === true;
                            if (accepted) scheduleExpiry(grant);
                        }
                    } catch (_) { /* no unchecked offline access */ }
                    if (submittedEpoch !== authEpoch || resetInFlight ||
                        auth()?.credential !== result.body.credential) return;
                    if (!accepted) { message.textContent = '端末の認証を確認できません。オンラインで再度お試しください。'; return; }
                    accessGranted = true;
                    if (!migrated()) {
                        remove(AUTH_KEY);
                        message.textContent = 'このブラウザーに認証を保存できません。';
                        return;
                    }
                    retireLegacy();
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
        if (backendAuthRequired && !auth()) return;
        if (auth()) {
            backendAuthRequired = false;
            for (const resolve of backendAuthWaiters) resolve();
            backendAuthWaiters.clear();
        }
        if (!overlay) return;
        releaseGateFocus?.();
        releaseGateFocus = null;
        overlay.remove();
        overlay = null;
        showPasscode = null;
        gateMessage = null;
        document.body.classList.remove('pro-gate-active');
    }
    // Silent renewal never displays a passcode while a valid grant remains.
    async function initialize(force = true) {
        if (validationPromise) return validationPromise;
        validationPromise = resolveAccess(force).catch(() => {
            accessGranted = false;
        }).finally(() => {
            validationPromise = null;
            if (!accessGranted) lock('passcode');
        });
        return validationPromise;
    }
    async function resolveAccess(force) {
        if (!accessGranted) lock();
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
        if (!existing) { accessGranted = false; retireLegacy(); return; }
        if (!migrated()) { accessGranted = false; return; }
        const result = bootValidation?.credential === existing.credential
            ? await bootValidation.promise : await deviceSession().validate(existing, { force });
        bootValidation = null;
        // Reset, backend denial or a new login wins over every delayed result.
        if (auth()?.credential !== existing.credential || resetInFlight || result.stale) return;
        if (result.ok && result.generation === existing.generation) {
            if (result.online) {
                existing.validatedAt = Date.now(); // Informational only; never an offline grant.
                existing.sessionVersion = result.compatibility ? 2 : 3;
                if (!put(AUTH_KEY, JSON.stringify(existing))) { accessGranted = false; return; }
            }
            retireLegacy();
            accessGranted = true;
            lastHandledCredential = existing.credential;
            scheduleExpiry(result);
            unlock();
            return;
        }
        accessGranted = false;
        clearTimeout(expiryTimer);
        if (result.terminal) { remove(AUTH_KEY); put(MIGRATED_KEY, '1'); await forget(existing); }
        if (!result.terminal) {
            lock('passcode');
            if (gateMessage) gateMessage.textContent = '認証の再確認が必要です。オンラインに接続すると自動で確認します。';
        }
        // Outages retain the credential, so coming online renews silently.
    }
    document.addEventListener('click', (event) => {
        if (!event.target.closest?.('#pro-gate-reset')) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        void reset().finally(() => window.location.reload());
    }, true);
    // A cached service worker must never invalidate a server credential by its old gate version.
    if (document.body) lock();
    const bootAuth = auth();
    if (bootAuth) {
        try { bootValidation = { credential: bootAuth.credential, promise: deviceSession().validate(bootAuth) };
            bootValidation.promise.catch(() => {}); } catch (_) { /* missing storage/helper fails closed */ }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
    else void initialize();
})();
