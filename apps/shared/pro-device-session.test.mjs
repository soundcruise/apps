import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { webcrypto, createHash } from 'node:crypto';
import { handleRequest } from '../../workers/sound-cruise-sync/src/app.js';
import { createSqliteD1 } from '../../workers/sound-cruise-sync/test/sqlite-d1.js';
const source = readFileSync(new URL('./pro-device-session.js', import.meta.url), 'utf8');
const DAY = 86400_000, ORIGIN = 'https://soundcruise.jp';
function memoryStore() {
    const values = new Map();
    return { values, read: async key => structuredClone(values.get(key)),
        write: async (key, value) => { if(value?.kind==='revoked-pro-receipt-v1'&&values.get(key)?.kind==='revoked-pro-receipt-v1')return; if (value === null) values.delete(key); else values.set(key, structuredClone(value)); },
        install: async (key, value) => {
            if (!values.has(key)) values.set(key, structuredClone(value)); return structuredClone(values.get(key));
        },
        compareAndSwap: async (key, expected, value) => {
            if (values.get(key)?.kind === 'revoked-pro-receipt-v1' || !assertEnvelopeEqual(values.get(key), expected)) return false;
            values.set(key, structuredClone(value)); return true;
        } };
}
function assertEnvelopeEqual(actual, expected) {
    if (!actual || !expected) return actual === expected;
    return Buffer.from(actual.iv).equals(Buffer.from(expected.iv)) &&
        Buffer.from(actual.ciphertext).equals(Buffer.from(expected.ciphertext));
}
async function fixture() {
    const db = createSqliteD1(), store = memoryStore();
    let now = 1_790_000_000_000, clockOffset = 0, monotonic = 0, offline = false, serverError = null, current;
    const env = { SYNC_DB: db, ALLOWED_ORIGINS: ORIGIN,
        PRO_CREDENTIAL_PEPPER: 'isolated-device-session-client-pepper-at-least-32',
        PRO_LOCKOUT_PEPPER: 'isolated-device-session-lockout-pepper-at-least-32', PRO_PASSCODE_SLOT_A: '0007',
        PRO_VERIFY_RATE_LIMITER: { limit: async () => ({ success: true }) },
        SYNC_RATE_LIMITER: { limit: async () => ({ success: true }) } };
    db.raw.prepare('UPDATE pro_auth_state SET session_lifecycle_started_at=?,unbound_backend_until=?').run(now, now + 90 * DAY);
    const requests = [];
    async function request(path, options = {}) {
        requests.push(path);
        if (offline) throw Error('offline');
        if (serverError) return { status: serverError, body: { ok: false } };
        const response = await handleRequest(new Request('https://sync.example/v2/pro-auth'+path, {
            ...options, headers: { Origin: ORIGIN, 'CF-Connecting-IP': '192.0.2.20', ...options.headers }
        }), env, null, { now: () => now, verifyProTurnstile: async () => ({ ok: true }) });
        return { status: response.status, body: await response.json() };
    }
    const window = {};
    vm.runInNewContext(source, { window, TextEncoder, TextDecoder, btoa, crypto: webcrypto, Date, Uint8Array });
    function client(otherStore = store, otherRequest = request, options = {}) {
        return window.SoundCruiseProDeviceSession.createClient({ store: otherStore, cryptoImpl: webcrypto,
            now: () => now + clockOffset, monotonicNow: () => monotonic,
            request: otherRequest, isCurrent: auth => current?.credential === auth.credential, ...options });
    }
    const session = client();
    async function login(bound = true) {
        const response = await request('/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ passcode: '0007', turnstileToken: 'isolated',
                ...(bound ? { devicePublicKey: await session.publicKey() } : {}) }) });
        assert.equal(response.status, 201);
        current = { v: 2, credential: response.body.credential, generation: response.body.generation, validatedAt: now };
        if (bound) assert.equal(await session.accept(current, response.body.session), true);
        return current;
    }
    return { db, store, requests, session, client, login, request,
        advance(ms) { now += ms; monotonic += Math.max(0, ms); }, get now() { return now; }, set current(value) { current = value; },
        set clockOffset(value) { clockOffset = value; },
        set offline(value) { offline = value; }, set serverError(value) { serverError = value; } };
}

test('same browser restarts and several-day returns silently renew through the real Worker', async () => {
    const f = await fixture();
    try {
        const auth = await f.login();
        for (const days of [0, 3, 8, 28, 28, 28]) {
            f.advance(days * DAY);
            const response = await f.client().validate(auth);
            assert.equal(response.ok, true); assert.equal(response.online, true);
        }
        assert.equal(f.requests.filter(path => path === '/verify').length, 1);
        assert.equal(f.db.raw.prepare('SELECT count(*) AS n FROM pro_credentials').get().n, 1);
        const keys = f.store.values.get('device-key');
        assert.equal(keys.privateKey.extractable, false); assert.equal(keys.sealKey.extractable, false);
        await assert.rejects(webcrypto.subtle.exportKey('jwk', keys.privateKey));
    } finally { f.db.close(); }
});

test('temporary outage/503/429 keep a recent device session; seven-day grace cannot be extended', async () => {
    for (const failure of ['offline', 503, 429]) {
        const f = await fixture();
        try {
            const auth = await f.login(); f.advance(3 * DAY);
            if (failure === 'offline') f.offline = true; else f.serverError = failure;
            assert.equal((await f.session.validate(auth)).ok, true);
            f.advance(4 * DAY);
            auth.validatedAt = f.now; // An edited localStorage timestamp is not a grant.
            assert.equal((await f.session.validate(auth)).ok, false);
            f.offline = false; f.serverError = null;
            assert.equal((await f.session.validate(auth)).ok, true, 'network recovery needs no passcode');
            assert.equal(f.requests.filter(path => path === '/verify').length, 1);
        } finally { f.db.close(); }
    }
});

test('copied localStorage cannot renew in another browser or create an offline grant', async () => {
    const f = await fixture();
    try {
        const auth = await f.login(); const other = f.client(memoryStore());
        assert.equal((await other.validate({ ...auth, validatedAt: f.now })).ok, false);
        assert.equal((await other.allowance(auth)).ok, false);
        assert.equal((await f.session.validate(auth)).ok, true);
    } finally { f.db.close(); }
});

test('copied/tampered receipts and detected backward clock fail closed', async () => {
    const f = await fixture();
    try {
        const auth = await f.login();
        const [key, receipt] = [...f.store.values].find(([key]) => key.startsWith('receipt:'));
        const otherStore = memoryStore(); otherStore.values.set(key, structuredClone(receipt));
        assert.equal((await f.client(otherStore).allowance(auth)).ok, false);
        const corrupted = structuredClone(receipt); new Uint8Array(corrupted.ciphertext)[0] ^= 1;
        f.store.values.set(key, corrupted);
        assert.equal((await f.session.allowance(auth)).ok, false);
        await f.session.validate(auth); f.advance(-600_000);
        assert.equal((await f.session.allowance(auth)).ok, false);
    } finally { f.db.close(); }
});

test('returning a running browser clock to validation time after eight days does not restore grace', async () => {
    const f = await fixture();
    try {
        const auth = await f.login(); f.offline = true;
        f.advance(8 * DAY); f.clockOffset = -8 * DAY;
        assert.equal((await f.session.validate(auth)).ok, false);
        assert.equal((await f.client().validate(auth)).ok, false, 'reload retains the detected rollback');
        for (const offset of [-8 * DAY, 0, -8 * DAY, -9 * DAY]) {
            f.clockOffset = offset;
            assert.equal((await f.client().validate(auth)).ok, false, 'repeated rollback cannot clear the block');
        }
    } finally { f.db.close(); }
});

test('observed expiry stays blocked after rollback and reload until server validation', async () => {
    const f = await fixture();
    try {
        const auth = await f.login(); f.offline = true; f.advance(8 * DAY);
        assert.equal((await f.session.allowance(auth)).ok, false);
        f.clockOffset = -8 * DAY;
        assert.equal((await f.client().allowance(auth)).ok, false);
        f.offline = false;
        assert.equal((await f.client().validate(auth)).online, true, 'a still-active credential recovers silently');
        assert.equal(f.requests.filter(path => path === '/verify').length, 1);
    } finally { f.db.close(); }
});

test('small clock corrections do not lock or replenish offline grace across reloads', async () => {
    const f = await fixture();
    try {
        const auth = await f.login(); f.offline = true; f.advance(DAY);
        const first = await f.session.allowance(auth);
        assert.equal(first.ok, true);
        for (const offset of [-1000, -30_000, -120_000, 0]) {
            f.clockOffset = offset;
            const next = await f.client().allowance(auth);
            assert.equal(next.ok, true);
            assert.ok(next.offlineRemainingMs <= first.offlineRemainingMs, 'tolerance does not move the deadline');
        }
    } finally { f.db.close(); }
});

test('detected rollback offline locks temporarily, keeps the credential, and online validation clears it', async () => {
    const f = await fixture();
    try {
        const auth = await f.login(); f.advance(DAY);
        assert.equal((await f.session.allowance(auth)).ok, true);
        f.clockOffset = -DAY; f.offline = true;
        assert.equal((await f.session.validate(auth, { force: false })).ok, false);
        f.clockOffset = 0;
        assert.equal((await f.client().validate(auth)).ok, false, 'restoring the clock alone does not clear detection');
        assert.equal(f.db.raw.prepare('SELECT count(*) AS n FROM pro_credentials WHERE revoked_at IS NULL').get().n, 1);
        f.offline = false;
        const recovery = await f.client().validate(auth, { force: false });
        assert.equal(recovery.ok, true); assert.equal(recovery.online, true);
        assert.equal(f.requests.filter(path => path === '/verify').length, 1);
    } finally { f.db.close(); }
});

test('time anchors and block flags are authenticated under the nonexportable device key', async () => {
    const f = await fixture();
    try {
        const auth = await f.login(); f.offline = true; f.advance(DAY);
        await f.session.allowance(auth);
        const [key, envelope] = [...f.store.values].find(([name]) => name.startsWith('receipt:'));
        const keys = f.store.values.get('device-key');
        const plaintext = await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: envelope.iv,
            additionalData: new TextEncoder().encode(key) }, keys.sealKey, envelope.ciphertext);
        const record = JSON.parse(new TextDecoder().decode(plaintext));
        assert.equal(record.serverValidatedAt, f.now - DAY);
        assert.equal(record.localTimeAtValidation, f.now - DAY);
        assert.equal(record.maxObservedLocalTime, f.now);
        assert.equal(record.clockRollbackDetected, false);
        assert.equal(record.offlineExpired, false);
        assert.equal(envelope.maxObservedLocalTime, undefined, 'no unauthenticated time override');
        const corrupted = structuredClone(envelope); new Uint8Array(corrupted.ciphertext)[0] ^= 1;
        f.store.values.set(key, corrupted);
        assert.equal((await f.client().allowance(auth)).ok, false);
    } finally { f.db.close(); }
});

test('an expired receipt from an idle tab cannot overwrite a newer silent server recovery', async () => {
    const f = await fixture();
    try {
        const auth = await f.login(); const other = f.client();
        assert.equal((await other.allowance(auth)).ok, true);
        f.advance(DAY); await f.session.allowance(auth);
        f.clockOffset = -DAY; f.offline = true;
        assert.equal((await other.validate(auth)).ok, false);
        f.offline = false;
        assert.equal((await f.session.validate(auth)).online, true);
        f.offline = true;
        assert.equal((await other.allowance(auth)).ok, true, 'the other app respects the new authoritative validation');
    } finally { f.db.close(); }
});

test('concurrent apps cannot rewind the sealed maximum observed time', async () => {
    const f = await fixture();
    try {
        const auth = await f.login(); f.offline = true;
        let release, entered;
        const paused = new Promise(resolve => { entered = resolve; });
        let once = true;
        const slowStore = { ...f.store, compareAndSwap: async (...args) => {
            if (once) { once = false; entered(); await new Promise(resolve => { release = resolve; }); }
            return f.store.compareAndSwap(...args);
        } };
        const slow = f.client(slowStore); f.advance(DAY);
        const pending = slow.allowance(auth); await paused;
        f.advance(DAY);
        const newer = await f.client().allowance(auth);
        assert.equal(newer.offlineRemainingMs, 5 * DAY);
        release();
        const result = await pending;
        assert.equal(result.offlineRemainingMs, newer.offlineRemainingMs);
        assert.equal((await f.client().allowance(auth)).offlineRemainingMs, 5 * DAY);
    } finally { f.db.close(); }
});

test('a completely unobserved clock reset across restart is outside best-effort local protection; server lease still rejects', async () => {
    const f = await fixture();
    try {
        const auth = await f.login(); f.offline = true;
        f.advance(8 * DAY); f.clockOffset = -8 * DAY;
        // No running client/expiry timer observed the elapsed time. A new document
        // starts with the old wall clock; browsers provide no trusted history here.
        assert.equal((await f.client().allowance(auth)).ok, true);
        const { inspectProCredentialReadOnly } = await import('../../workers/sound-cruise-sync/src/pro-auth-app.js');
        const result = await inspectProCredentialReadOnly('Bearer ' + auth.credential,
            { SYNC_DB: f.db, PRO_CREDENTIAL_PEPPER: 'isolated-device-session-client-pepper-at-least-32' }, { now: () => f.now });
        assert.equal(result.ok, false); assert.equal(result.code, 'pro_revalidation_required');
    } finally { f.db.close(); }
});

test('90-day server inactivity cannot be evaded by local clock rollback', async () => {
    const f = await fixture();
    try {
        const auth = await f.login(); f.advance(90 * DAY); f.clockOffset = -90 * DAY;
        const result = await f.client().validate(auth);
        assert.equal(result.ok, false); assert.equal(result.terminal, true);
    } finally { f.db.close(); }
});

test('safe v2 migration has no password; legacy flags and an unvalidated old token cannot grant offline access', async () => {
    const f = await fixture();
    try {
        const auth = await f.login(false);
        f.offline = true;
        assert.equal((await f.session.validate(auth)).ok, false);
        f.offline = false;
        assert.equal((await f.session.validate(auth)).ok, true);
        assert.equal(f.requests.filter(path => path === '/verify').length, 1);
        f.current = { credential: 'legacy-pro-ok', generation: 1 };
        assert.equal((await f.session.validate({ credential: 'legacy-pro-ok', generation: 1 })).ok, false);
    } finally { f.db.close(); }
});

test('five apps share the browser key, receipt and token without redundant password entries', async () => {
    const f = await fixture();
    try {
        const auth = await f.login();
        for (const app of ['pitch','fretboard','rhythm','chord','port']) {
            const session = f.client();
            assert.equal((await session.validate(auth)).ok, true, app);
            assert.equal((await session.allowance(auth)).ok, true, app);
        }
        assert.equal(f.requests.filter(path => path === '/verify').length, 1);
    } finally { f.db.close(); }
});

test('revocation/generation changes fail authoritatively even inside offline grace', async () => {
    for (const mutation of ['revoked_at=1790000000001', 'generation=generation+1']) {
        const f = await fixture();
        try {
            const auth = await f.login();
            f.db.raw.exec('UPDATE pro_credentials SET ' + mutation);
            const result = await f.session.validate(auth);
            assert.equal(result.ok, false); assert.equal(result.terminal, true);
            await f.session.forget(auth);
            assert.equal((await f.session.allowance(auth)).ok, false);
        } finally { f.db.close(); }
    }
});

test('explicit reset and delayed network responses cannot restore a removed local session', async () => {
    const f = await fixture();
    try {
        const auth = await f.login();
        let release;
        const delayed = f.client(f.store, async (...args) => {
            const result = await f.request(...args);
            await new Promise(resolve => { release = resolve; }); return result;
        });
        const pending = delayed.validate(auth);
        while (!release) await new Promise(resolve => setImmediate(resolve));
        f.current = null; await f.session.forget(auth); release();
        assert.equal((await pending).ok, false);
        assert.equal((await f.session.allowance(auth)).ok, false);
    } finally { f.db.close(); }
});

test('cached allowance throttles background validation but never creates a new lease', async () => {
    const f = await fixture();
    try {
        const auth = await f.login(), before = f.requests.length;
        assert.equal((await f.session.validate(auth, { force: false })).cached, true);
        assert.equal(f.requests.length, before);
        f.advance(12 * 3600_000);
        assert.equal((await f.session.validate(auth, { force: false })).online, true);
        assert.equal(f.requests.length, before + 2);
    } finally { f.db.close(); }
});

test('storage unavailable fails closed; old Worker rollout supports online v2 without unlimited offline fallback', async () => {
    const f = await fixture();
    try {
        const auth = await f.login(false);
        const badStore = { read: async () => { throw Error('storage denied'); } };
        assert.equal((await f.client(badStore).validate(auth)).ok, false);
        const oldWorker = f.client(f.store, async path => path.includes('/challenge')
            ? { status: 404 } : { status: 200, body: { ok: true, generation: 1 } });
        assert.equal((await oldWorker.validate(auth)).compatibility, true);
        assert.equal((await oldWorker.allowance(auth)).ok, false);
    } finally { f.db.close(); }
});


test('read-only session inspection has no key/session creation, mutation or request surface', async () => {
    const f = await fixture();
    try {
        const auth = await f.login(), requests = f.requests.length;
        const before = structuredClone(f.store.values);
        const reader = f.client({ read: f.store.read, write() { throw Error('write'); }, install() { throw Error('install'); }, compareAndSwap() { throw Error('CAS'); } }, () => { throw Error('network'); }, { readOnly: true });
        assert.deepEqual(Object.keys(reader), ['allowance']);
        assert.equal((await reader.allowance(auth)).ok, true);
        assert.deepEqual(f.store.values, before);
        f.clockOffset = 8 * DAY;
        assert.equal((await reader.allowance(auth)).expired, true);
        f.clockOffset = 0;
        assert.equal((await reader.allowance(auth)).ok, false, 'read-only memory observation cannot regain validity by rolling back the clock');
        f.advance(8 * DAY);
        assert.equal((await reader.allowance(auth)).ok, false);
        assert.deepEqual(f.store.values, before);
        assert.equal(f.requests.length, requests);
        const missing = f.client({ read: async () => null }, undefined, { readOnly: true });
        assert.equal((await missing.allowance(auth)).ok, false);
        f.current = null;
        assert.equal((await reader.allowance(auth)).ok, false);
    } finally { f.db.close(); }
});

async function savedSession(f, auth) {
    const key = 'receipt:' + createHashForTest(auth.credential);
    const envelope = await f.store.read(key), keys = await f.store.read('device-key');
    const bytes = await webcrypto.subtle.decrypt({name:'AES-GCM',iv:envelope.iv,
        additionalData:new TextEncoder().encode(key)},keys.sealKey,envelope.ciphertext);
    return JSON.parse(new TextDecoder().decode(bytes)).session;
}
function createHashForTest(value) {
    return createHash('sha256').update(value).digest('base64url');
}
test('durable receipt-key revocation survives fresh clients and cannot be cleared by a valid old session', async () => {
    const f=await fixture();
    try {
        const a=await f.login(), session=await savedSession(f,a);
        await f.session.forget(a,{advanceOperationRevision:false});
        const fresh=f.client();
        assert(await fresh.isRevoked(a));assert.equal(await fresh.accept(a,session),false);
        assert.equal((await fresh.allowance(a)).ok,false);assert.equal((await fresh.validate(a)).ok,false);
        assert.equal(f.requests.filter(p=>p==='/device-session/renew').length,0);
    } finally {f.db.close();}
});
test('a receipt CAS queued before revocation cannot overwrite the tombstone', async () => {
    const f=await fixture();let release;
    try {
        const a=await f.login();let entered;const begun=new Promise(r=>entered=r),held=new Promise(r=>release=r);
        const slow=f.client({...f.store,compareAndSwap:async(...args)=>{entered();await held;return f.store.compareAndSwap(...args);}});
        const write=slow.allowance(a);await begun;await f.session.forget(a,{advanceOperationRevision:false});release();
        assert.equal((await write).ok,false);assert(await f.client().isRevoked(a));
    } finally {release?.();f.db.close();}
});
test('retiring A preserves the separately issued B receipt and normal renewal', async () => {
    const f=await fixture();
    try {
        const a=await f.login(),b=await f.login();
        await f.session.forget(a,{advanceOperationRevision:false});
        assert((await f.client().allowance(b)).ok);assert((await f.client().validate(b)).ok);
        assert(await f.client().isRevoked(a));assert.equal(await f.client().isRevoked(b),false);
    } finally {f.db.close();}
});
test('failed durable revocation reports failure and latches the observing client closed', async () => {
    const f=await fixture();
    try {
        const a=await f.login(),session=await savedSession(f,a);
        const client=f.client({...f.store,write:async()=>{throw Error('isolated persistence failure');}});
        await assert.rejects(client.forget(a),/persistence failure/);
        assert.equal((await client.allowance(a)).ok,false);assert.equal(await client.accept(a,session),false);
        assert.equal((await client.validate(a)).ok,false);
        assert.equal(await f.client().isRevoked(a),false,'failed persistence is never reported as durable');
    } finally {f.db.close();}
});
test('same-credential revision changes cannot retire the revocation; old-Worker success cannot grant it', async () => {
    const f=await fixture();
    try {
        const a=await f.login();await f.session.forget({...a,operationRevision:'before'});
        let requests=0;const fresh=f.client(f.store,async()=>{requests++;return {status:200,body:{ok:true,generation:a.generation}};});
        assert.equal((await fresh.validate({...a,operationRevision:'after'})).ok,false);assert.equal(requests,0);
        await fresh.forget({...a,operationRevision:'after'});assert(await fresh.isRevoked(a));
    } finally {f.db.close();}
});
test('malformed revocation identity fails closed without online compatibility fallback', async () => {
    const f=await fixture();
    try {
        const a=await f.login();await f.session.forget(a);
        const key='receipt:'+createHashForTest(a.credential),row=await f.store.read(key);row.receiptIdentity='wrong';f.store.values.set(key,row);
        const fresh=f.client();assert.equal((await fresh.validate(a)).ok,false);assert.equal((await fresh.allowance(a)).ok,false);
        await assert.rejects(fresh.isRevoked(a),/Invalid Pro revocation/);
    } finally {f.db.close();}
});

// P2 regressions use generated qualifications and in-memory request callbacks only.
// No Worker, HTTP request, Account, or production identity participates here.
function compatibilityFixture() {
    const store = memoryStore(), window = {}, now = 100000;
    vm.runInNewContext(source, { window, TextEncoder, TextDecoder, btoa, crypto: webcrypto, Date, Uint8Array });
    const qualification = () => ({ credential: 'isolated-compat-' + webcrypto.randomUUID(), generation: 1, sessionVersion: 3 });
    let current = qualification();
    const client = (options = {}) => window.SoundCruiseProDeviceSession.createClient({ store, cryptoImpl: webcrypto,
        now: () => now, monotonicNow: () => 0, isCurrent: auth => current?.credential === auth.credential, ...options });
    function hold(auth = current, options = {}, reply = { status: 200, body: { ok: true, generation: auth.generation } }) {
        let begin, release, delivered = false;
        const started = new Promise(resolve => { begin = resolve; }), held = new Promise(resolve => { release = resolve; });
        const calls = [], response = structuredClone(reply);
        const heldClient = client({ ...options, request: async path => {
            calls.push(path);
            if (path === '/device-session/challenge') return { status: 404 };
            assert.equal(path, '/session'); begin(); await held; delivered = true; return response;
        } });
        const result = heldClient.validate(auth, { force: true });
        return { client: heldClient, result, started, release, calls, get delivered() { return delivered; } };
    }
    async function seed(auth) {
        const c = client(), publicKey = await c.publicKey();
        assert.equal(await c.accept(auth, { version: 3, serverTime: now, issuedAt: now, boundAt: now, lastValidatedAt: now,
            inactiveExpiresAt: now + 90 * DAY, accessExpiresAt: now + 60000, offlineUntil: now + 60000,
            revalidateAfter: now + 1000, devicePublicKey: publicKey }), true);
    }
    return { store, client, hold, seed, qualification, get current() { return current; }, set current(auth) { current = auth; } };
}

for (const mode of ['same-client', 'same-client-write-failure', 'peer-client']) {
    test('compatibility success held during revocation is rejected: ' + mode, async t => {
        const f = compatibilityFixture(), a = f.current;
        const otherStore = mode === 'same-client-write-failure' ? { ...f.store, write: async () => { throw Error('isolated fence write failure'); } } : f.store;
        const h = f.hold(a, { store: otherStore, isCurrent: () => true }); t.after(h.release);
        await h.started; assert.equal(h.delivered, false);
        assert.deepEqual(h.calls, ['/device-session/challenge', '/session']);
        if (mode === 'same-client-write-failure') {
            await assert.rejects(h.client.forget(a), /isolated fence write failure/);
            assert.equal(await f.client().isRevoked(a), false, 'failed persistence is not durable success');
        } else {
            await (mode === 'same-client' ? h.client : f.client()).forget(a, { advanceOperationRevision: false });
            assert.equal(await f.client().isRevoked(a), true, 'fence is durable before response delivery');
        }
        assert.equal(h.delivered, false); h.release(); const result = await h.result;
        assert.equal(h.delivered, true); assert.equal(result.ok, false); assert.equal(result.revoked, true);
        assert.equal((await h.client.allowance(a)).ok, false);
        t.diagnostic(JSON.stringify({ heldBeforeRevocation: true, durable: mode !== 'same-client-write-failure', released: true, rejected: true }));
    });
}

test('compatibility success held during qualification replacement cannot be adopted', async t => {
    const f = compatibilityFixture(), a = f.current, h = f.hold(a); t.after(h.release);
    await h.started; assert.equal(h.delivered, false); f.current = f.qualification();
    h.release(); const result = await h.result;
    assert.equal(result.ok, false); assert.equal(result.stale, true);
    assert.equal(await f.client().isRevoked(f.current), false, 'replacement is not retired');
});

test('compatibility fence read failure cannot fall back to an otherwise valid allowance', async t => {
    const f = compatibilityFixture(), a = f.current; await f.seed(a);
    let failNextRead = false;
    const store = { ...f.store, read: async key => {
        if (failNextRead && key.startsWith('receipt:')) { failNextRead = false; throw Error('isolated fence read failure'); }
        return f.store.read(key);
    } };
    const h = f.hold(a, { store }); t.after(h.release); await h.started;
    failNextRead = true; h.release(); const result = await h.result;
    assert.equal(result.ok, false); assert.equal(result.storageUnavailable, true);
    assert.equal((await f.client().allowance(a)).ok, true, 'a later independent healthy read still has its bounded grant');
});

test('healthy old-Worker compatibility remains online-only and creates no receipt', async t => {
    const f = compatibilityFixture(), a = f.current, h = f.hold(a); t.after(h.release);
    await h.started; assert.equal(h.delivered, false); h.release(); const result = await h.result;
    assert.equal(result.ok, true); assert.equal(result.compatibility, true); assert.equal(result.online, true);
    assert.equal(result.generation, a.generation); assert.equal((await f.client().allowance(a)).ok, false);
    assert.equal([...f.store.values.keys()].some(key => key.startsWith('receipt:')), false);
});

test('retiring unrelated A while B compatibility waits preserves B receipt and success', async t => {
    const f = compatibilityFixture(), a = f.current, b = f.qualification(); f.current = b; await f.seed(b);
    const receiptKey = 'receipt:' + createHashForTest(b.credential), before = await f.store.read(receiptKey);
    const h = f.hold(b); t.after(h.release); await h.started; assert.equal(h.delivered, false);
    await f.client().forget(a, { advanceOperationRevision: false }); assert.equal(await f.client().isRevoked(a), true);
    h.release(); const result = await h.result;
    assert.equal(result.ok, true); assert.equal(result.compatibility, true); assert.equal(f.current, b);
    assert.deepEqual(await f.store.read(receiptKey), before); assert.equal(await f.client().isRevoked(b), false);
    assert.equal((await f.client().allowance(b)).ok, true);
});

test('stale old-Worker terminal response retains the original denial identity', async t => {
    const f = compatibilityFixture(), a = { ...f.current, operationRevision: 'original-A' };
    const h = f.hold(a, {}, { status: 401, body: { ok: false, code: 'invalid_credential' } }); t.after(h.release);
    await h.started; f.current = f.qualification(); h.release(); const result = await h.result;
    assert.equal(result.ok, false); assert.equal(result.terminal, true); assert.equal(result.stale, true);
    assert.equal(result.denial.endpoint, 'session'); assert.equal(result.denial.reason, 'invalid_credential');
    assert.equal(result.denial.credentialFingerprint, createHash('sha256').update(a.credential).digest('hex'));
    assert.equal(result.denial.operationRevisionFingerprint, createHash('sha256').update(a.operationRevision).digest('hex'));
    assert.equal(result.denial.receiptIdentity, 'receipt:' + createHashForTest(a.credential));
    assert.equal(result.denial.generation, a.generation); assert.equal(result.denial.sessionVersion, a.sessionVersion);
    assert.equal(typeof result.denial.validationId, 'string'); assert(result.denial.validationId);
});

test('compatibility adoption rechecks current qualification after the asynchronous fence read', async t => {
    const f = compatibilityFixture(), a = f.current;
    let intercept = false, begin, releaseRead;
    const reading = new Promise(resolve => { begin = resolve; }), heldRead = new Promise(resolve => { releaseRead = resolve; });
    const store = { ...f.store, read: async key => {
        const value = await f.store.read(key);
        if (intercept && key.startsWith('receipt:')) { intercept = false; begin(); await heldRead; }
        return value;
    } };
    const h = f.hold(a, { store }); t.after(() => { h.release(); releaseRead(); }); await h.started;
    intercept = true; h.release(); await reading; assert.equal(h.delivered, true);
    f.current = f.qualification(); releaseRead(); const result = await h.result;
    assert.equal(result.ok, false); assert.equal(result.stale, true);
});
