/** Browser-held keys and best-effort local offline time; never server/Account authority. */
(function installProDeviceSession(global) {
    'use strict';
    const DAY = 86400_000;
    const IDLE = 90 * DAY, GRACE = 7 * DAY, REVALIDATE = 12 * 3600_000;
    const CLOCK_TOLERANCE = 300_000;
    const encoder = new TextEncoder(), decoder = new TextDecoder();
    const encode = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

    function browserStore() {
        let opening;
        const open = () => opening ||= new Promise((resolve, reject) => {
            const request = global.indexedDB.open('sound-cruise-pro-device-session-v1', 1);
            request.onupgradeneeded = () => request.result.createObjectStore('state');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(Error('Pro session storage blocked'));
        });
        const sameBytes = (a, b) => {
            if (!a || !b) return false;
            const left = new Uint8Array(a), right = new Uint8Array(b);
            return left.length === right.length && left.every((byte, index) => byte === right[index]);
        };
        async function transaction(key, value, onlyIfAbsent = false, compare = false, expected) {
            const db = await open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction('state', value === undefined ? 'readonly' : 'readwrite');
                const store = tx.objectStore('state');
                let result;
                const read = store.get(key);
                read.onsuccess = () => {
                    result = read.result;
                    if (compare) {
                        result = result === undefined ? expected === undefined : Boolean(expected &&
                            sameBytes(result.iv, expected.iv) && sameBytes(result.ciphertext, expected.ciphertext));
                        if (result) store.put(value, key);
                    } else if (value !== undefined && (!onlyIfAbsent || result === undefined)) {
                        if (value === null) store.delete(key); else store.put(value, key);
                        result = value;
                    }
                };
                tx.oncomplete = () => resolve(result);
                tx.onerror = tx.onabort = () => reject(tx.error || Error('Pro session storage failed'));
            });
        }
        return { read: key => transaction(key), write: (key, value) => transaction(key, value),
            install: (key, value) => transaction(key, value, true),
            compareAndSwap: (key, expected, value) => transaction(key, value, false, true, expected) };
    }

    function createClient({ store = browserStore(), cryptoImpl = global.crypto,
        now = () => Date.now(), monotonicNow = () => global.performance?.now?.() ?? now(),
        request, isCurrent = () => true } = {}) {
        let materialPromise;
        const inflight = new Map();
        // Only useful during this document's lifetime; not a trusted cross-restart clock.
        let clockAnchor = { local: now(), monotonic: monotonicNow() };
        let observedValidation;
        const validationId = record => `${record.generation}:${record.serverValidatedAt}:${record.localTimeAtValidation}`;
        async function material() {
            if (!materialPromise) materialPromise = (async () => {
                let keys = await store.read('device-key');
                if (!keys) {
                    const pair = await cryptoImpl.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
                    const sealKey = await cryptoImpl.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
                    const publicKey = await cryptoImpl.subtle.exportKey('jwk', pair.publicKey);
                    keys = await store.install('device-key', { privateKey: pair.privateKey, publicKey, sealKey });
                }
                if (keys.privateKey?.extractable !== false || keys.sealKey?.extractable !== false) throw Error('Unsafe device key');
                return keys;
            })().catch(error => { materialPromise = null; throw error; });
            return materialPromise;
        }
        async function receiptKey(auth) {
            const digest = await cryptoImpl.subtle.digest('SHA-256', encoder.encode(auth.credential));
            return 'receipt:' + encode(digest);
        }
        function validMetadata(session, keys) {
            return session?.version === 3 &&
                ['serverTime', 'issuedAt', 'boundAt', 'lastValidatedAt', 'inactiveExpiresAt',
                    'accessExpiresAt', 'offlineUntil', 'revalidateAfter'].every(key => Number.isSafeInteger(session[key]) && session[key] >= 0) &&
                session.lastValidatedAt <= session.serverTime && session.serverTime < session.offlineUntil &&
                session.offlineUntil === session.accessExpiresAt && session.offlineUntil <= session.lastValidatedAt + GRACE &&
                session.inactiveExpiresAt === session.lastValidatedAt + IDLE &&
                session.revalidateAfter <= session.lastValidatedAt + REVALIDATE &&
                session.devicePublicKey?.x === keys.publicKey.x && session.devicePublicKey?.y === keys.publicKey.y &&
                session.devicePublicKey?.kty === 'EC' && session.devicePublicKey?.crv === 'P-256';
        }
        async function seal(auth, record, expected) {
            const keys = await material(), key = await receiptKey(auth);
            const iv = cryptoImpl.getRandomValues(new Uint8Array(12));
            const ciphertext = await cryptoImpl.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(key) },
                keys.sealKey, encoder.encode(JSON.stringify(record)));
            if (!isCurrent(auth)) return false;
            // Encrypt outside the IDB transaction, then atomically compare/write.
            // A stale tab must not erase another tab's high-water mark or block.
            const saved = await store.compareAndSwap(key, expected, { iv, ciphertext });
            return saved && isCurrent(auth);
        }
        async function unseal(auth) {
            try {
                const keys = await material(), key = await receiptKey(auth), value = await store.read(key);
                if (!value) return null;
                const plaintext = await cryptoImpl.subtle.decrypt({ name: 'AES-GCM', iv: value.iv,
                    additionalData: encoder.encode(key) }, keys.sealKey, value.ciphertext);
                const record = JSON.parse(decoder.decode(plaintext));
                if (record.timeStateVersion !== 2 || record.generation !== auth.generation ||
                    !validMetadata(record.session, keys) ||
                    record.serverValidatedAt !== record.session.lastValidatedAt ||
                    !['localTimeAtValidation', 'maxObservedLocalTime', 'serverObservedAt'].every(field =>
                        Number.isSafeInteger(record[field]) && record[field] >= 0) ||
                    record.maxObservedLocalTime < record.localTimeAtValidation ||
                    record.serverObservedAt < record.session.serverTime ||
                    typeof record.clockRollbackDetected !== 'boolean' || typeof record.offlineExpired !== 'boolean') return null;
                return { record, envelope: value };
            } catch (_) { return null; }
        }
        async function accept(auth, session) {
            const keys = await material();
            if (!validMetadata(session, keys)) throw Error('Invalid Pro session response');
            const local = now(), monotonic = monotonicNow();
            if (!Number.isSafeInteger(local) || local < 0 || !Number.isFinite(monotonic)) return false;
            for (let attempt = 0; attempt < 8 && isCurrent(auth); attempt++) {
                const expected = await store.read(await receiptKey(auth));
                const previous = await unseal(auth);
                if (previous && previous.record.serverValidatedAt > session.lastValidatedAt) return false;
                if (await seal(auth, { timeStateVersion: 2, session, generation: auth.generation,
                    serverValidatedAt: session.lastValidatedAt, localTimeAtValidation: local,
                    maxObservedLocalTime: local, serverObservedAt: session.serverTime,
                    clockRollbackDetected: false, offlineExpired: false }, expected)) {
                    clockAnchor = { local, monotonic };
                    observedValidation = validationId({ generation: auth.generation,
                        serverValidatedAt: session.lastValidatedAt, localTimeAtValidation: local });
                    return true;
                }
            }
            return false;
        }
        async function allowance(auth) {
            try {
                for (let attempt = 0; attempt < 8 && isCurrent(auth); attempt++) {
                    const snapshot = await unseal(auth);
                    if (!snapshot) return { ok: false };
                    const { record, envelope } = snapshot, local = now(), monotonic = monotonicNow();
                    if (!Number.isSafeInteger(local) || local < 0 || !Number.isFinite(monotonic)) return { ok: false };
                    const validation = validationId(record);
                    // Another app may silently validate a legitimately corrected
                    // clock. Its new server receipt also resets this tab's anchor.
                    if (observedValidation && observedValidation !== validation) clockAnchor = { local, monotonic };
                    observedValidation = validation;
                    const runningLocalTime = clockAnchor.local + Math.floor(Math.max(0, monotonic - clockAnchor.monotonic));
                    const highWater = Math.max(record.maxObservedLocalTime, runningLocalTime, local);
                    record.clockRollbackDetected ||= local < highWater - CLOCK_TOLERANCE;
                    record.maxObservedLocalTime = highWater;
                    record.serverObservedAt = Math.max(record.serverObservedAt,
                        record.session.serverTime + Math.max(0, highWater - record.localTimeAtValidation));
                    record.offlineExpired ||= record.serverObservedAt >= record.session.offlineUntil;
                    // Persist observations even when expired/rolled back. Only a
                    // successful server validation may clear these block flags.
                    if (!await seal(auth, record, envelope)) continue;
                    if (record.clockRollbackDetected) return { ok: false, clockRollback: true };
                    if (record.offlineExpired) return { ok: false, expired: true };
                    return { ok: true, offline: true, generation: auth.generation,
                        offlineRemainingMs: record.session.offlineUntil - record.serverObservedAt,
                        revalidateInMs: Math.max(0, record.session.revalidateAfter - record.serverObservedAt) };
                }
            } catch (_) { /* unavailable storage or time state never grants local Pro */ }
            return { ok: false };
        }
        async function validateOnce(auth, force) {
            if (!force) {
                const grant = await allowance(auth);
                if (grant.ok && grant.revalidateInMs > 0) return { ...grant, cached: true };
            }
            try {
                const publicKey = (await material()).publicKey;
                const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + auth.credential };
                const challenge = await request('/device-session/challenge', { method: 'POST', headers,
                    body: JSON.stringify({ publicKey }) });
                if (!isCurrent(auth)) return { ok: false, stale: true };
                // Additive rollout: an old Worker may still validate real v2
                // tokens online. It cannot issue an offline grant.
                if (challenge.status === 404) {
                    const old = await request('/session', { headers: { Authorization: 'Bearer ' + auth.credential } });
                    if (old.status === 200 && old.body?.ok && old.body.generation === auth.generation && !old.body.deviceSessionRequired) {
                        return { ok: true, online: true, compatibility: true, generation: auth.generation };
                    }
                    return { ok: false, terminal: old.status === 401 };
                }
                if (challenge.status !== 200 || !challenge.body?.ok || typeof challenge.body.message !== 'string') {
                    if (challenge.status >= 500 || challenge.status === 429) return allowance(auth);
                    return { ok: false, terminal: challenge.status === 401 };
                }
                const signature = await cryptoImpl.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' },
                    (await material()).privateKey, encoder.encode(challenge.body.message));
                const renewed = await request('/device-session/renew', { method: 'POST', headers,
                    body: JSON.stringify({ publicKey, challenge: challenge.body.challenge, mac: challenge.body.mac,
                        signature: encode(signature) }) });
                if (!isCurrent(auth)) return { ok: false, stale: true };
                if (renewed.status === 200 && renewed.body?.ok && renewed.body.generation === auth.generation) {
                    if (!await accept(auth, renewed.body.session)) return { ok: false, stale: true };
                    return { ...(await allowance(auth)), offline: false, online: true };
                }
                if (renewed.status >= 500 || renewed.status === 429) return allowance(auth);
                return { ok: false, terminal: renewed.status === 401 };
            } catch (_) { return allowance(auth); }
        }
        return Object.freeze({ publicKey: async () => (await material()).publicKey, accept, allowance,
            validate(auth, { force = true } = {}) {
                if (!inflight.has(auth.credential)) {
                    const pending = validateOnce(auth, force).finally(() => inflight.delete(auth.credential));
                    inflight.set(auth.credential, pending);
                }
                return inflight.get(auth.credential);
            },
            async forget(auth) { await store.write(await receiptKey(auth), null); }
        });
    }
    global.SoundCruiseProDeviceSession = Object.freeze({ createClient });
})(window);
