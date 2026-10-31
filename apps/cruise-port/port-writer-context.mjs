// Local compatibility fence only. This is NOT a Cloud authorization or Owner adoption.
const slot = Symbol.for('sound-cruise.port-writer-context.v1');
const fail = code => { throw Object.assign(new Error(code), { code }); };
let identitySeen = false;
// Identity presence is deliberately sticky: dispose/failed authentication cannot
// downgrade an Account-bound Studio document to an anonymous Port writer.
if (globalThis.document && !Object.hasOwn(globalThis, slot)) {
    Object.defineProperty(globalThis, slot, { value: Object.freeze({ hasIdentity: () => identitySeen, register: () => { identitySeen = true; } }) });
}
export function registerStudioPortContext() {
    globalThis[slot]?.register();
    return () => {}; // retirement requires a new document, never authority downgrade
}
export function createPortWriterContext({ root = globalThis, storage } = {}) {
    const account = root.SoundCruiseSyncAccount?.storage;
    const getGeneration = () => account?.getGeneration?.() ?? 0;
    const generation = getGeneration();
    let ready = !account, blocked = false, accountIdentity = null;
    const initialized = account ? Promise.resolve().then(() => account.getAccount()).then(value => {
        accountIdentity = JSON.stringify(value ?? null); ready = true;
        if (getGeneration() !== generation) blocked = true;
    }, () => { blocked = true; }) : Promise.resolve();
    account?.subscribeAccount?.(() => { blocked = true; });
    const pro = () => JSON.stringify([storage?.getItem('soundCruiseProAuth'),
        storage?.getItem('soundCruiseProOperationEpoch'), storage?.getItem('soundCruiseProRevokePending')]);
    const initialPro = pro();
    function assertCurrent() {
        if ((root.SoundCruiseSyncAccount?.storage ?? null) !== (account ?? null)) fail('port-account-source-changed');
        if (!ready || blocked || getGeneration() !== generation) fail('port-account-context-changed');
        // A Project session is not Port authorization. Native Port may use
        // its existing Account DB and Pro contract inside Studio; Project-only
        // contexts without that shared source remain rejected. Publication
        // still reads the exact Account row in the existing IDB transaction.
        try {
            const studio = root[slot]?.hasIdentity() || root.parent !== root && root.parent?.[slot]?.hasIdentity();
            if (studio && (!account?.DATABASE_NAME || typeof account.getAccount !== 'function' || !root.indexedDB?.open))
                fail('port-owner-admission-required');
        } catch (e) { fail(e.code || 'port-parent-context-unavailable'); }
        if (pro() !== initialPro) fail('port-pro-context-changed');
        const proSource = root.SoundCruiseProOperationSource;
        if (proSource && typeof proSource.read !== 'function') fail('port-pro-source-unavailable');
        let pending;
        try { pending = JSON.parse(storage?.getItem('soundCruiseProRevokePending') || '[]'); } catch { fail('port-pro-source-unavailable'); }
        if (!Array.isArray(pending)) fail('port-pro-source-unavailable');
        const source = proSource?.read();
        if (proSource && source === undefined) fail('port-pro-source-unavailable');
        if (source?.then || source !== undefined && (!source || typeof source.revoked !== 'boolean')) fail('port-pro-source-unavailable');
        if (storage?.getItem('soundCruiseProAuth') !== null && storage?.getItem('soundCruiseProAuth') !== undefined
            && (!source?.auth || source.revoked)) fail('port-pro-revoked');
    }
    function assertLocalAccount() {
        assertCurrent();
        let binding, selected;
        try { binding = JSON.parse(storage?.getItem('cruisePort.syncLocalAccount.v1') || 'null'); selected = JSON.parse(accountIdentity || 'null'); }
        catch { fail('port-local-account-invalid'); }
        const selectedId = selected?.accountId || selected?.accountCredential?.split('.')[1];
        if (binding?.accountId && selectedId && binding.accountId !== selectedId) fail('port-local-account-mismatch');
    }
    const reads = new WeakSet();
    return Object.freeze({
        assertCurrent, assertLocalAccount, initialized,
        captureRead() {
            const token = Object.freeze({});
            if (ready && !blocked) reads.add(token);
            return token;
        },
        assertRead(token) {
            if (!reads.has(token)) fail('port-read-admission-required');
            assertCurrent();
        },
        // Called under the existing Port dataset Web Lock, after asynchronous
        // draft preparation. The Account readonly transaction serializes with
        // Account readwrite transactions; commit runs synchronously in onsuccess.
        commit(commit) {
            assertCurrent();
            if (!account) return commit();
            return new Promise((resolve, reject) => {
                const request = root.indexedDB.open(account.DATABASE_NAME);
                request.onupgradeneeded = () => { request.transaction.abort(); };
                request.onerror = () => reject(Object.assign(Error('port-account-unavailable'), { code: 'port-account-unavailable' }));
                request.onsuccess = () => {
                    const db = request.result;
                    let tx, result, published = false;
                    try {
                        tx = db.transaction('meta', 'readonly');
                        const read = tx.objectStore('meta').get('account');
                        read.onsuccess = () => {
                            try {
                                if (JSON.stringify(read.result ?? null) !== accountIdentity) {
                                    blocked = true; fail('port-account-context-changed');
                                }
                                assertCurrent(); result = commit();
                                if (result?.then) fail('port-commit-must-be-synchronous');
                                published = true;
                            } catch (e) { reject(e); tx.abort(); }
                        };
                        tx.oncomplete = () => { db.close(); resolve(result); };
                        tx.onabort = tx.onerror = () => {
                            db.close();
                            // Never retry or roll back an already published local fact.
                            if (published) resolve(result);
                            else reject(Object.assign(Error('port-account-read-unknown'), { code: 'port-account-read-unknown' }));
                        };
                    } catch (e) { db.close(); reject(e); }
                };
            });
        }
    });
}
