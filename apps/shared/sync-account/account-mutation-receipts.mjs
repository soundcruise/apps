// Dormant Shared owner extension. Import performs no I/O. Only the explicitly
// isolated Port coordinator uses this API; it is not a writer/authorization API.
export const ACCOUNT_MUTATION_RECEIPT_VERSION = 1;
export const ACCOUNT_MUTATION_JOURNAL_KEY = 'accountMutationJournal:v1';
export const ACCOUNT_MUTATION_LIMIT = 64;
export const ACCOUNT_MUTATION_MARKER_KEY = 'accountMutationMarker:v1';
const DATABASE = 'sound-cruise-sync-account', STORE = 'meta';
const reject = code => Object.assign(new Error(code), { code });
const exact = (v, names) => v && typeof v === 'object' && !Array.isArray(v) &&
    JSON.stringify(Object.keys(v).sort()) === JSON.stringify([...names].sort());
const text = v => typeof v === 'string' && v.length > 0 && v.length <= 128;
const positive = v => Number.isSafeInteger(v) && v > 0;
const hash = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function canonical(value) {
    if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number' && Number.isFinite(value)) return Object.is(value,-0) ? '-0' : JSON.stringify(value);
    if (Array.isArray(value)) {
        if (Object.keys(value).length !== value.length || Reflect.ownKeys(value).length !== value.length+1 ||
            Array.from({length:value.length},(_,n)=>n).some(n=>!Object.hasOwn(value,n))) throw reject('account-mutation-value-invalid');
        return '[' + value.map(canonical).join(',') + ']';
    }
    if (value && typeof value === 'object' && Reflect.ownKeys(value).length === Object.keys(value).length &&
        [Object.prototype, null].includes(Object.getPrototypeOf(value)))
        return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
    throw reject('account-mutation-value-invalid');
}
const same = (a, b) => canonical(a) === canonical(b);
const clone = value => structuredClone(value);
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
async function digest(value) {
    if (!globalThis.crypto?.subtle) throw reject('account-mutation-crypto-unavailable');
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)));
    return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
}
function account(value, nullable = false) {
    if (nullable && value === null) return;
    if (!value || !text(value.accountId) || typeof value.accountCredential !== 'string' ||
        !value.accountCredential || value.accountCredential.length > 4096 ||
        (value.accountDeviceId != null && !text(value.accountDeviceId)) || canonical(value).length > 16384)
        throw reject('account-mutation-identity-invalid');
    if (/recoveryCode|handoffToken|joinCode/i.test(canonical(value)) || /sch1\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}/.test(canonical(value)) ||
        /SCJ1(?:-?[0-9ABCDEFGHJKMNPQRSTVWXYZ]{4}){5}/.test(canonical(value)) ||
        /SAR1(?:-?[0-9ABCDEFGHJKMNPQRSTVWXYZ]{4}){5}/.test(canonical(value))) throw reject('transient_secret_persistence_blocked');
}
function binding(input) {
    const q = clone(input);
    if (!exact(q, ['schemaVersion','authorityScope','partitionId','authorityGeneration','operationId','intentFingerprint','account','kind','destination']) ||
        q.schemaVersion !== 1 || !text(q.authorityScope) || !text(q.partitionId) || !text(q.authorityGeneration) || !text(q.operationId) || !hash(q.intentFingerprint) ||
        !exact(q.account, ['accountId','accountGeneration','membershipId','membershipGeneration']) || !text(q.account.accountId) ||
        !positive(q.account.accountGeneration) || !text(q.account.membershipId) || !positive(q.account.membershipGeneration) ||
        !['switch','detach','revoke'].includes(q.kind)) throw reject('account-mutation-binding-invalid');
    if (q.kind === 'switch' ? !exact(q.destination,['accountId','accountDeviceId']) || !text(q.destination.accountId) ||
        (q.destination.accountDeviceId !== null && !text(q.destination.accountDeviceId)) : q.destination !== null)
        throw reject('account-mutation-binding-invalid');
    return q;
}
const key = b => canonical([b.authorityScope,b.partitionId,b.authorityGeneration,b.operationId]);
const empty = () => ({ schemaVersion:1, revision:0, receipts:[] });
async function validateJournal(raw) {
    if (raw === undefined) return empty();
    if (!exact(raw,['schemaVersion','revision','receipts']) || raw.schemaVersion !== 1 || !Array.isArray(raw.receipts) ||
        raw.receipts.length > ACCOUNT_MUTATION_LIMIT || !positive(raw.revision) || raw.revision !== raw.receipts.length || canonical(raw).length > 131072)
        throw reject('account-mutation-journal-invalid');
    const seen = new Set(); let prior = null;
    for (let n=0;n<raw.receipts.length;n++) {
        const r = raw.receipts[n];
        if (!exact(r,['schemaVersion','binding','beforeRevision','afterRevision','beforeDigest','afterDigest','requestHash','checksum']) ||
            r.schemaVersion !== 1 || r.beforeRevision !== n || r.afterRevision !== n+1 ||
            !hash(r.beforeDigest) || !hash(r.afterDigest) || !hash(r.requestHash) || !hash(r.checksum))
            throw reject('account-mutation-receipt-invalid');
        binding(r.binding);
        const id = key(r.binding);
        if (seen.has(id) || (prior !== null && prior !== r.beforeDigest)) throw reject('account-mutation-receipt-invalid');
        seen.add(id); prior = r.afterDigest;
        if (r.requestHash !== await digest({ binding:r.binding, beforeDigest:r.beforeDigest, afterDigest:r.afterDigest }))
            throw reject('account-mutation-receipt-invalid');
        const { checksum, ...body } = r;
        if (checksum !== await digest(body)) throw reject('account-mutation-receipt-invalid');
    }
    return raw;
}
function openExisting(indexedDB) {
    return new Promise((resolve, fail) => {
        let absent = false, settled = false;
        const request = indexedDB.open(DATABASE);
        const finish = (db, error) => {
            if (settled) { db?.close(); return; }
            settled = true;
            error ? fail(reject(error)) : resolve(db);
        };
        request.onupgradeneeded = () => { absent = true; request.transaction.abort(); };
        request.onblocked = () => finish(null,'account-mutation-storage-blocked');
        request.onerror = () => finish(null,absent ? 'account-mutation-storage-absent' : 'account-mutation-storage-failed');
        request.onsuccess = () => {
            const db = request.result;
            if (db.version !== 1 || !db.objectStoreNames.contains(STORE)) { db.close(); finish(null,'account-mutation-schema-unsupported'); return; }
            db.onversionchange = () => db.close(); finish(db);
        };
    });
}
function done(tx) {
    return new Promise((resolve, fail) => {
        tx.oncomplete = resolve;
        tx.onabort = tx.onerror = () => fail(reject('account-mutation-transaction-aborted'));
    });
}
async function readSnapshot(indexedDB) {
    const db = await openExisting(indexedDB);
    try {
        const tx = db.transaction(STORE,'readonly'), complete = done(tx), s = tx.objectStore(STORE);
        const a=s.get('account'), j=s.get(ACCOUNT_MUTATION_JOURNAL_KEY), m=s.get(ACCOUNT_MUTATION_MARKER_KEY);
        await complete;
        const record = a.result ?? null; account(record,true);
        const journal = await validateJournal(j.result);
        if (j.result === undefined ? m.result !== undefined : !exact(m.result,['schemaVersion','revision','headChecksum']) ||
            m.result.schemaVersion !== 1 || !positive(m.result.revision) || !hash(m.result.headChecksum) || m.result.revision !== journal.revision || m.result.headChecksum !== journal.receipts.at(-1)?.checksum)
            throw reject('account-mutation-marker-invalid');
        return { account:record, rawJournal:j.result, rawMarker:m.result, journal, accountDigest:await digest(record) };
    } finally { db.close(); }
}

export function createIsolatedAccountMutationStore({ indexedDB, scopeName } = {}) {
    if (!indexedDB?.open || !/^sound-cruise-port-authority-v1-fixture-[A-Za-z0-9_-]+$/.test(scopeName ?? ''))
        throw reject('account-mutation-isolation-required');
    const captures = new WeakMap();
    const result = (receipt, fields = {}) => freeze({ ...fields, receipt:clone(receipt), historical:true,
        mutationProven:true, operationAuthorized:false, recoveryRequired:true, canWrite:false });
    return Object.freeze({
        async capture() {
            const s = await readSnapshot(indexedDB); account(s.account);
            const tail = s.journal.receipts.at(-1);
            if (tail && tail.afterDigest !== s.accountDigest) throw reject('account-mutation-unattributed-state');
            const token = Object.freeze({}); captures.set(token,clone(s));
            return token;
        },
        matches(context, record) { const s=captures.get(context); return !!s && same(s.account,record); },
        async mutate({ context, binding:input, nextAccount } = {}) {
            const captured=captures.get(context), q=binding(input), replacement=clone(nextAccount);
            if (!captured) throw reject('account-mutation-context-invalid');
            account(replacement,true);
            if (q.account.accountId !== captured.account.accountId ||
                (q.kind === 'switch' ? replacement === null || replacement.accountId !== q.destination.accountId ||
                    (replacement.accountDeviceId ?? null) !== q.destination.accountDeviceId : replacement !== null))
                throw reject('account-mutation-binding-invalid');
            if (q.authorityScope !== scopeName) throw reject('account-mutation-binding-invalid');
            const beforeDigest=captured.accountDigest, afterDigest=await digest(replacement);
            const requestHash=await digest({binding:q,beforeDigest,afterDigest});
            const recent=await readSnapshot(indexedDB);
            const existing=recent.journal.receipts.find(r=>key(r.binding)===key(q));
            if (existing) {
                if (existing.requestHash !== requestHash || !same(existing.binding,q)) throw reject('account-mutation-operation-conflict');
                return result(existing,{ok:true,replayed:true,currentObservation:false}); // never CAS twice
            }
            if (!same(recent.account,captured.account) || !same(recent.journal,captured.journal))
                throw reject('account-mutation-cas-conflict');
            if (recent.journal.revision >= ACCOUNT_MUTATION_LIMIT) throw reject('account-mutation-capacity');
            const body={schemaVersion:1,binding:q,beforeRevision:recent.journal.revision,afterRevision:recent.journal.revision+1,
                beforeDigest,afterDigest,requestHash};
            const receipt={...body,checksum:await digest(body)};
            const journal={schemaVersion:1,revision:receipt.afterRevision,receipts:[...recent.journal.receipts,receipt]};
            if (canonical(journal).length > 131072) throw reject('account-mutation-capacity');
            const db=await openExisting(indexedDB);
            try {
                const tx=db.transaction(STORE,'readwrite'), complete=done(tx), s=tx.objectStore(STORE);
                let reason=null;
                const a=s.get('account'), j=s.get(ACCOUNT_MUTATION_JOURNAL_KEY), m=s.get(ACCOUNT_MUTATION_MARKER_KEY);
                m.onsuccess=()=>{
                    try {
                        if (!same(a.result ?? null,captured.account) || !same(j.result ?? empty(),captured.journal) || !same(m.result ?? null,captured.rawMarker ?? null))
                            throw reject('account-mutation-cas-conflict');
                        replacement === null ? s.delete('account') : s.put(replacement,'account');
                        s.put(journal,ACCOUNT_MUTATION_JOURNAL_KEY);
                        s.put({schemaVersion:1,revision:receipt.afterRevision,headChecksum:receipt.checksum},ACCOUNT_MUTATION_MARKER_KEY);
                    } catch(error) { reason=error.code || 'account-mutation-transaction-aborted'; try {tx.abort();}catch{} }
                };
                try {await complete;} catch(error) {throw reject(reason || error.code);}
                return result(receipt,{ok:true,replayed:false,currentObservation:false});
            } finally {db.close();}
        },
        async reconcile(input) {
            const q=binding(input);
            if (q.authorityScope !== scopeName) throw reject('account-mutation-binding-invalid');
            const s=await readSnapshot(indexedDB);
            const receipt=s.journal.receipts.find(r=>key(r.binding)===key(q));
            if (!receipt) return freeze({ok:false,reason:'account-mutation-receipt-missing',mutationProven:false,recoveryRequired:true,canWrite:false});
            if (!same(receipt.binding,q)) throw reject('account-mutation-binding-mismatch');
            // Hashing/validation awaited outside IDB. Re-read one atomic snapshot
            // before returning an observation; no result is a write qualification.
            const final=await readSnapshot(indexedDB);
            if (!same(s.account,final.account) || !same(s.journal,final.journal))
                throw reject('account-mutation-observation-stale');
            return result(receipt,{ok:true,replayed:false,currentObservation:
                s.journal.revision===receipt.afterRevision && s.accountDigest===receipt.afterDigest,
                continuityProven:false}); // legacy/uncooperative writers cannot be fenced here
        }
    });
}
