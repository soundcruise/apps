/** Browser-held keys and best-effort local offline time; never server/Account authority. */
(function installProDeviceSession(global) {
    'use strict';
    const DAY = 86400_000;
    const IDLE = 90 * DAY, GRACE = 7 * DAY, REVALIDATE = 12 * 3600_000;
    const CLOCK_TOLERANCE = 300_000;
    const REVOKED_RECEIPT = 'revoked-pro-receipt-v1';
    const encoder = new TextEncoder(), decoder = new TextDecoder();
    const encode = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

    function browserStore({ readOnly = false } = {}) {
        let opening;
        const open = () => opening ||= new Promise((resolve, reject) => {
            const request = global.indexedDB.open('sound-cruise-pro-device-session-v1', 1);
            request.onupgradeneeded = () => { if (readOnly) request.transaction.abort(); else request.result.createObjectStore('state'); };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => { opening = null; reject(request.error); };
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
                        // A revocation occupies the same key as the receipt. The
                        // check and CAS share this RW transaction, across clients.
                        if (result?.kind === REVOKED_RECEIPT) { result = false; return; }
                        result = result === undefined ? expected === undefined : Boolean(expected &&
                            sameBytes(result.iv, expected.iv) && sameBytes(result.ciphertext, expected.ciphertext));
                        if (result) store.put(value, key);
                    } else if (value !== undefined && (!onlyIfAbsent || result === undefined)) {
                        if (value?.kind === REVOKED_RECEIPT && result?.kind === REVOKED_RECEIPT) return;
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

    // Identity hashing is neither password verification nor a qualification grant.
    async function operationIdentity(auth, cryptoImpl = global.crypto) {
        const hash = await cryptoImpl.subtle.digest('SHA-256', encoder.encode(auth.credential));
        const revision = typeof auth.operationRevision === 'string'
            ? await cryptoImpl.subtle.digest('SHA-256', encoder.encode(auth.operationRevision)) : null;
        const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
        return Object.freeze({ credentialFingerprint: hex(hash), receiptIdentity: 'receipt:' + encode(hash),
            generation: auth.generation, sessionVersion: auth.sessionVersion ?? null,
            operationRevisionFingerprint: revision ? hex(revision) : null });
    }

    function createClient({ store, cryptoImpl = global.crypto,
        now = () => Date.now(), monotonicNow = () => global.performance?.now?.() ?? now(),
        request, isCurrent = () => true, readOnly = false } = {}) {
        store ||= browserStore({ readOnly });
        let materialPromise;
        const inflight = new Map();
        const revokedCredentials = new Set();
        // Only useful during this document's lifetime; not a trusted cross-restart clock.
        let clockAnchor = { local: now(), monotonic: monotonicNow() };
        let observedValidation, readOnlyObservation;
        const validationId = record => `${record.generation}:${record.serverValidatedAt}:${record.localTimeAtValidation}`;
        async function material() {
            if (!materialPromise) materialPromise = (async () => {
                let keys = await store.read('device-key');
                if (!keys) {
                    if (readOnly) throw Error('No cached device key');
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
        async function isRevoked(auth) {
            const key = await receiptKey(auth), value = await store.read(key);
            if (value?.kind !== REVOKED_RECEIPT) return false;
            const identity = await operationIdentity(auth, cryptoImpl);
            if (value.receiptIdentity !== key || value.credentialFingerprint !== identity.credentialFingerprint)
                throw Error('Invalid Pro revocation record');
            return true;
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
            if (revokedCredentials.has(auth.credential) || !isCurrent(auth)) return false;
            // Encrypt outside the IDB transaction, then atomically compare/write.
            // A stale tab must not erase another tab's high-water mark or block.
            const saved = await store.compareAndSwap(key, expected, { iv, ciphertext });
            return saved && isCurrent(auth);
        }
        async function unseal(auth) {
            try {
                const keys = await material(), key = await receiptKey(auth), value = await store.read(key);
                if (!value || value.kind === REVOKED_RECEIPT || revokedCredentials.has(auth.credential)) return null;
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
                if (expected?.kind === REVOKED_RECEIPT || revokedCredentials.has(auth.credential)) return false;
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
                    const observationKey = auth.credential + ':' + validation;
                    if (readOnly && readOnlyObservation?.key === observationKey) {
                        record.maxObservedLocalTime = Math.max(record.maxObservedLocalTime, readOnlyObservation.maxObservedLocalTime);
                        record.serverObservedAt = Math.max(record.serverObservedAt, readOnlyObservation.serverObservedAt);
                        record.clockRollbackDetected ||= readOnlyObservation.clockRollbackDetected;
                        record.offlineExpired ||= readOnlyObservation.offlineExpired;
                    }
                    const runningLocalTime = clockAnchor.local + Math.floor(Math.max(0, monotonic - clockAnchor.monotonic));
                    const highWater = Math.max(record.maxObservedLocalTime, runningLocalTime, local);
                    record.clockRollbackDetected ||= local < highWater - CLOCK_TOLERANCE;
                    record.maxObservedLocalTime = highWater;
                    record.serverObservedAt = Math.max(record.serverObservedAt,
                        record.session.serverTime + Math.max(0, highWater - record.localTimeAtValidation));
                    record.offlineExpired ||= record.serverObservedAt >= record.session.offlineUntil;
                    // Persist observations even when expired/rolled back. Only a
                    // successful server validation may clear these block flags.
                    if (readOnly) {
                        readOnlyObservation = { key: observationKey, maxObservedLocalTime: record.maxObservedLocalTime,
                            serverObservedAt: record.serverObservedAt, clockRollbackDetected: record.clockRollbackDetected,
                            offlineExpired: record.offlineExpired };
                        if (!isCurrent(auth)) return { ok: false, stale: true };
                    } else if (!await seal(auth, record, envelope)) continue;
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
            auth = Object.freeze({ ...auth });
            // No successful network result, including old-Worker compatibility,
            // can retire a locally observed revocation of this qualification.
            try {
                if (revokedCredentials.has(auth.credential) || await isRevoked(auth)) return { ok: false, revoked: true };
            } catch (_) { return { ok: false, storageUnavailable: true }; }
            const validationId = cryptoImpl.randomUUID();
            let pinnedIdentity;
            async function denial(response, endpoint) {
                const codes = ['invalid_credential', 'reauth_required'];
                if (response.status !== 401 || response.body?.ok !== false || !codes.includes(response.body.code))
                    return { ok: false, terminal: false, ambiguous: true };
                return { ok: false, terminal: true, denial: Object.freeze({ reason: response.body.code, endpoint, validationId,
                    ...pinnedIdentity }) };
            }
            if (!force) {
                const grant = await allowance(auth);
                if (grant.ok && grant.revalidateInMs > 0) return { ...grant, cached: true };
            }
            // Bind before the request; a recognized denial needs no asynchronous hashing.
            pinnedIdentity = await operationIdentity(auth, cryptoImpl);
            try {
                const publicKey = (await material()).publicKey;
                const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + auth.credential };
                const challenge = await request('/device-session/challenge', { method: 'POST', headers,
                    body: JSON.stringify({ publicKey }) });
                if (!isCurrent(auth)) return { ...await denial(challenge, 'challenge'), stale: true };
                // Additive rollout: an old Worker may still validate real v2
                // tokens online. It cannot issue an offline grant.
                if (challenge.status === 404) {
                    const old = await request('/session', { headers: { Authorization: 'Bearer ' + auth.credential } });
                    if (!isCurrent(auth)) return { ...await denial(old, 'session'), stale: true };
                    if (old.status === 200 && old.body?.ok && old.body.generation === auth.generation && !old.body.deviceSessionRequired) {
                        // Compatibility is online-only, but its delayed success must
                        // still respect revocation completed while /session waited.
                        try {
                            if (revokedCredentials.has(auth.credential) || await isRevoked(auth)) return { ok: false, revoked: true };
                        } catch (_) { return { ok: false, storageUnavailable: true }; }
                        if (revokedCredentials.has(auth.credential) || !isCurrent(auth)) return { ok: false, stale: true };
                        return { ok: true, online: true, compatibility: true, generation: auth.generation };
                    }
                    return denial(old, 'session');
                }
                if (challenge.status !== 200 || !challenge.body?.ok || typeof challenge.body.message !== 'string') {
                    if (challenge.status >= 500 || challenge.status === 429) return allowance(auth);
                    return denial(challenge, 'challenge');
                }
                const signature = await cryptoImpl.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' },
                    (await material()).privateKey, encoder.encode(challenge.body.message));
                const renewed = await request('/device-session/renew', { method: 'POST', headers,
                    body: JSON.stringify({ publicKey, challenge: challenge.body.challenge, mac: challenge.body.mac,
                        signature: encode(signature) }) });
                if (!isCurrent(auth)) return { ...await denial(renewed, 'renew'), stale: true };
                if (renewed.status === 200 && renewed.body?.ok && renewed.body.generation === auth.generation) {
                    if (!await accept(auth, renewed.body.session)) return { ok: false, stale: true };
                    return { ...(await allowance(auth)), offline: false, online: true };
                }
                if (renewed.status >= 500 || renewed.status === 429) return allowance(auth);
                return denial(renewed, 'renew');
            } catch (_) { return allowance(auth); }
        }
        // Inspection has no key/session creation, high-water persistence or network
        // entry point. Its result is presentation evidence, never backend authority.
        if (readOnly) return Object.freeze({ allowance });
        return Object.freeze({ publicKey: async () => (await material()).publicKey, accept, allowance, isRevoked,
            validate(auth, { force = true } = {}) {
                const identity = JSON.stringify([auth.credential, auth.generation, auth.sessionVersion ?? null, auth.operationRevision ?? null]);
                if (!inflight.has(identity)) {
                    const pending = validateOnce(auth, force).finally(() => inflight.delete(identity));
                    inflight.set(identity, pending);
                }
                return inflight.get(identity);
            },
            async forget(auth, { advanceOperationRevision = true } = {}) {
                // Invalidate outstanding operation proofs before async receipt-key fencing.
                if (advanceOperationRevision) try { global.localStorage?.setItem('soundCruiseProOperationEpoch', cryptoImpl.randomUUID()); } catch (_) { /* source reads/credential deletion remain fail-closed */ }
                revokedCredentials.add(auth.credential);
                const identity = await operationIdentity(auth, cryptoImpl);
                // Non-secret tombstone; no key/DB schema change and no second ledger.
                // This key must never become absent again for the retired credential.
                await store.write(identity.receiptIdentity, { kind: REVOKED_RECEIPT,
                    ...identity, generation: auth.generation ?? null });
                if (!await isRevoked(auth)) throw Error('Pro revocation was not persisted');
                return true;
            }
        });
    }
    global.SoundCruiseProDeviceSession = Object.freeze({ operationIdentity, createClient, createReadOnlyClient: options => createClient({ ...options, readOnly: true }) });
})(window);
