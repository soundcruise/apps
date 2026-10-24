// Dormant Shared owner extension. Import performs no I/O. Only the explicitly
// isolated Port coordinator uses this API; it is not a writer/authorization API.
export const ACCOUNT_MUTATION_RECEIPT_VERSION = 1;
export const ACCOUNT_MUTATION_JOURNAL_KEY = 'accountMutationJournal:v1';
export const ACCOUNT_MUTATION_LIMIT = 64;
export const ACCOUNT_MUTATION_MARKER_KEY = 'accountMutationMarker:v1';
export const ACCOUNT_CANONICAL_STORE_V3='account-meta-v3';
export const ACCOUNT_BOOTSTRAP_RECEIPT_KEY='accountBootstrapReceipt:v1';
export const ACCOUNT_WRITER_FENCE_KEY='accountWriterFence:v1';
const AUX_KEYS=new Set(['qaAdmission','pendingStart','pendingConsume','pendingBridge','pendingRecovery','pendingDelete','pendingDetach','pendingEnvironmentDetach']);
function validateFence(f,scopeName,protocol=2){
    if(!exact(f,['schemaVersion','writerProtocol','scopeName','epoch','revision','legacyDigest']) || f.schemaVersion!==1 || f.writerProtocol!==protocol ||
        f.scopeName!==scopeName || !text(f.epoch) || !Number.isSafeInteger(f.revision) || f.revision<0 || !hash(f.legacyDigest)) throw reject('account-writer-fence-invalid');
    return f;
}
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
function openExisting(indexedDB,protocol=1) {
    const STORE=protocol===3?ACCOUNT_CANONICAL_STORE_V3:'meta';
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
            if (db.version !== protocol || !db.objectStoreNames.contains(STORE) || protocol===3&&db.objectStoreNames.length!==1) { db.close(); finish(null,'account-mutation-schema-unsupported'); return; }
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
async function readSnapshot(indexedDB,protocol=1,scopeName=null) {
    const STORE=protocol===3?ACCOUNT_CANONICAL_STORE_V3:'meta';
    const db = await openExisting(indexedDB,protocol);
    try {
        const tx = db.transaction(STORE,'readonly'), complete = done(tx), s = tx.objectStore(STORE);
        const a=s.get('account'), j=s.get(ACCOUNT_MUTATION_JOURNAL_KEY), m=s.get(ACCOUNT_MUTATION_MARKER_KEY), b=s.get(ACCOUNT_BOOTSTRAP_RECEIPT_KEY), f=s.get(ACCOUNT_WRITER_FENCE_KEY);
        await complete;
        const record = a.result ?? null; account(record,true);
        const journal = await validateJournal(j.result);
        if (j.result === undefined ? m.result !== undefined : !exact(m.result,['schemaVersion','revision','headChecksum']) ||
            m.result.schemaVersion !== 1 || !positive(m.result.revision) || !hash(m.result.headChecksum) || m.result.revision !== journal.revision || m.result.headChecksum !== journal.receipts.at(-1)?.checksum)
            throw reject('account-mutation-marker-invalid');
        const fence=protocol>=2?validateFence(f.result,scopeName,protocol):null;
        const bootstrap=protocol===3?await validateBootstrapReceipt(b.result):null;
        if(bootstrap&&(bootstrap.binding.authorityScope!==scopeName||bootstrap.binding.source.epoch!==fence.epoch||fence.revision<bootstrap.afterRevision+journal.revision||journal.receipts.length&&journal.receipts[0].beforeDigest!==bootstrap.afterDigest))throw reject('account-bootstrap-chain-invalid');
        return { account:record, rawJournal:j.result, rawMarker:m.result, journal, fence, bootstrap, accountDigest:await digest(record) };
    } finally { db.close(); }
}

export function createIsolatedAccountMutationStore({ indexedDB, scopeName, protocol=1, beforeAccountCommit=()=>{} } = {}) {
    if (!indexedDB?.open || !/^sound-cruise-port-authority-v1-fixture-[A-Za-z0-9_-]+$/.test(scopeName ?? ''))
        throw reject('account-mutation-isolation-required');
    const STORE=protocol===3?ACCOUNT_CANONICAL_STORE_V3:'meta';
    if(![1,2,3].includes(protocol) || typeof beforeAccountCommit!=='function')throw reject('account-writer-protocol-invalid');
    const captures = new WeakMap();
    const tokenFor=s=>{const token=Object.freeze({});captures.set(token,clone(s));return token;};
    const snapshot=()=>readSnapshot(indexedDB,protocol,scopeName);
    const matchesSnapshot=(a,b)=>same(a.account,b.account)&&same(a.journal,b.journal)&&same(a.fence,b.fence)&&same(a.bootstrap,b.bootstrap);
    const assertCaptured=(s,a,j,m,f,b)=>{
        if(!same(a??null,s.account)||!same(j??empty(),s.journal)||!same(m??null,s.rawMarker??null)||
            (protocol>=2&&!same(f,s.fence))||(protocol===3&&!same(b??null,s.bootstrap)))throw reject('account-mutation-cas-conflict');
    };
    const result = (receipt, fields = {}) => freeze({ ...fields, receipt:clone(receipt), historical:true,
        mutationProven:true, operationAuthorized:false, recoveryRequired:true, canWrite:false });
    return Object.freeze({
        async capture() {
            const s = await snapshot(); account(s.account);
            const tail = s.journal.receipts.at(-1);
            if ((tail?.afterDigest??s.bootstrap?.afterDigest??s.accountDigest) !== s.accountDigest) throw reject('account-mutation-unattributed-state');
            return tokenFor(s);
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
            if(protocol>=2&&!Number.isSafeInteger(captured.fence.revision+1))throw reject('account-writer-capacity');
            const beforeDigest=captured.accountDigest, afterDigest=await digest(replacement);
            const requestHash=await digest({binding:q,beforeDigest,afterDigest});
            const recent=await snapshot();
            const existing=recent.journal.receipts.find(r=>key(r.binding)===key(q));
            if (existing) {
                if (existing.requestHash !== requestHash || !same(existing.binding,q)) throw reject('account-mutation-operation-conflict');
                return result(existing,{ok:true,replayed:true,currentObservation:false}); // never CAS twice
            }
            if (!matchesSnapshot(recent,captured))
                throw reject('account-mutation-cas-conflict');
            if (recent.journal.revision >= ACCOUNT_MUTATION_LIMIT) throw reject('account-mutation-capacity');
            const body={schemaVersion:1,binding:q,beforeRevision:recent.journal.revision,afterRevision:recent.journal.revision+1,
                beforeDigest,afterDigest,requestHash};
            const receipt={...body,checksum:await digest(body)};
            const journal={schemaVersion:1,revision:receipt.afterRevision,receipts:[...recent.journal.receipts,receipt]};
            if (canonical(journal).length > 131072) throw reject('account-mutation-capacity');
            const db=await openExisting(indexedDB,protocol);
            try {
                const tx=db.transaction(STORE,'readwrite'), complete=done(tx), s=tx.objectStore(STORE);
                let reason=null,uiGeneration;
                const a=s.get('account'), j=s.get(ACCOUNT_MUTATION_JOURNAL_KEY), m=s.get(ACCOUNT_MUTATION_MARKER_KEY), b=s.get(ACCOUNT_BOOTSTRAP_RECEIPT_KEY), f=s.get(ACCOUNT_WRITER_FENCE_KEY);
                f.onsuccess=()=>{
                    try {
                        assertCaptured(captured,a.result,j.result,m.result,f.result,b.result);
                        if(protocol>=2){const r=beforeAccountCommit();uiGeneration=r;if(r?.then)throw reject('account-writer-async-invalidation');}
                        replacement === null ? s.delete('account') : s.put(replacement,'account');
                        s.put(journal,ACCOUNT_MUTATION_JOURNAL_KEY);
                        s.put({schemaVersion:1,revision:receipt.afterRevision,headChecksum:receipt.checksum},ACCOUNT_MUTATION_MARKER_KEY);
                        if(protocol>=2)s.put({...captured.fence,revision:captured.fence.revision+1},ACCOUNT_WRITER_FENCE_KEY);
                    } catch(error) { reason=error.code || 'account-mutation-transaction-aborted'; try {tx.abort();}catch{} }
                };
                try {await complete;} catch(error) {throw reject(reason || error.code);}
                const fields={ok:true,replayed:false,currentObservation:false};
                if(protocol>=2)fields.uiGeneration=uiGeneration;
                if(protocol>=2)fields.context=tokenFor({...captured,account:replacement,accountDigest:afterDigest,journal,rawJournal:journal,
                    rawMarker:{schemaVersion:1,revision:receipt.afterRevision,headChecksum:receipt.checksum},fence:{...captured.fence,revision:captured.fence.revision+1}});
                return result(receipt,fields);
            } finally {db.close();}
        },
        async inspect(context){const c=captures.get(context);if(!c||!matchesSnapshot(c,await snapshot()))throw reject('account-mutation-cas-conflict');return clone(c.account);},
        async current(context){const c=captures.get(context);if(!c)return false;return matchesSnapshot(c,await snapshot());},
        async auxiliary({context,key,value,remove=false,write=false}={}){
            if(protocol<2||!AUX_KEYS.has(key))throw reject('account-writer-aux-invalid');
            const captured=captures.get(context);if(!captured)throw reject('account-mutation-context-invalid');
            const next=write&&!remove?clone(value):null;
            if(write&&!remove){
                if(!next||typeof next!=='object'||Array.isArray(next)||canonical(next).length>131072)throw reject('account-writer-aux-invalid');
                if(/recoveryCode|handoffToken|joinCode/i.test(canonical(next))||/sch1\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}/.test(canonical(next))||/SCJ1(?:-?[0-9ABCDEFGHJKMNPQRSTVWXYZ]{4}){5}/.test(canonical(next))||/SAR1(?:-?[0-9ABCDEFGHJKMNPQRSTVWXYZ]{4}){5}/.test(canonical(next)))throw reject('transient_secret_persistence_blocked');
            }
            const db=await openExisting(indexedDB,protocol);
            try{
                const tx=db.transaction(STORE,write?'readwrite':'readonly'),complete=done(tx),s=tx.objectStore(STORE);
                const a=s.get('account'),j=s.get(ACCOUNT_MUTATION_JOURNAL_KEY),m=s.get(ACCOUNT_MUTATION_MARKER_KEY),b=s.get(ACCOUNT_BOOTSTRAP_RECEIPT_KEY),f=s.get(ACCOUNT_WRITER_FENCE_KEY),v=s.get(key);let reason;
                v.onsuccess=()=>{try{
                    assertCaptured(captured,a.result,j.result,m.result,f.result,b.result);
                    if(write){if(!Number.isSafeInteger(captured.fence.revision+1))throw reject('account-writer-capacity');
                        remove?s.delete(key):s.put(next,key);s.put({...captured.fence,revision:captured.fence.revision+1},ACCOUNT_WRITER_FENCE_KEY);}
                }catch(e){reason=e.code||'account-writer-aux-failed';try{tx.abort();}catch{}}};
                try{await complete;}catch(e){throw reject(reason||e.code);}
                return {value:clone(v.result??null),context:write?tokenFor({...captured,fence:{...captured.fence,revision:captured.fence.revision+1}}):context,canWrite:false};
            }finally{db.close();}
        },
        async reconcile(input) {
            const q=binding(input);
            if (q.authorityScope !== scopeName) throw reject('account-mutation-binding-invalid');
            const s=await snapshot();
            const receipt=s.journal.receipts.find(r=>key(r.binding)===key(q));
            if (!receipt) return freeze({ok:false,reason:'account-mutation-receipt-missing',mutationProven:false,recoveryRequired:true,canWrite:false});
            if (!same(receipt.binding,q)) throw reject('account-mutation-binding-mismatch');
            // Hashing/validation awaited outside IDB. Re-read one atomic snapshot
            // before returning an observation; no result is a write qualification.
            const final=await snapshot();
            if (!matchesSnapshot(s,final))
                throw reject('account-mutation-observation-stale');
            return result(receipt,{ok:true,replayed:false,currentObservation:
                s.journal.revision===receipt.afterRevision && s.accountDigest===receipt.afterDigest,
                continuityProven:false}); // legacy/uncooperative writers cannot be fenced here
        }
    });
}

// Explicit isolated enrollment only. This never runs from an import or normal
// Account startup. Unknown/legacy rows are included in the exact upgrade CAS.
export async function enrollIsolatedAccountWriters({indexedDB,scopeName}={}){
    if(!indexedDB?.open||!/^sound-cruise-port-authority-v1-fixture-[A-Za-z0-9_-]+$/.test(scopeName??''))throw reject('account-mutation-isolation-required');
    const validated=await readSnapshot(indexedDB); // validate physical1 + existing Account/receipt schema
    const old=await openExisting(indexedDB);
    let entries;
    try{const tx=old.transaction(STORE,'readonly'),complete=done(tx),s=tx.objectStore(STORE),keys=s.getAllKeys(),values=s.getAll();await complete;
        entries=keys.result.map((key,n)=>[key,values.result[n]]);
        const fields=new Map(entries);
        if(!same(fields.get('account')??null,validated.account)||!same(fields.get(ACCOUNT_MUTATION_JOURNAL_KEY)??null,validated.rawJournal??null)||!same(fields.get(ACCOUNT_MUTATION_MARKER_KEY)??null,validated.rawMarker??null))throw reject('account-writer-enrollment-stale');
        if(entries.some(([key])=>key===ACCOUNT_WRITER_FENCE_KEY)||canonical(entries).length>1048576)throw reject('account-writer-enrollment-unsupported');
    }finally{old.close();}
    const legacyDigest=await digest(entries),epoch=crypto.randomUUID();
    return new Promise((resolve,fail)=>{
        let settled=false,reason,didUpgrade=false;
        const finish=(error,value)=>{if(settled)return;settled=true;error?fail(reject(error)):resolve(freeze(value));};
        const request=indexedDB.open(DATABASE,2);
        request.onblocked=()=>finish('account-writer-upgrade-blocked');
        request.onerror=()=>finish(reason||'account-writer-upgrade-aborted');
        request.onupgradeneeded=event=>{
            const tx=request.transaction,db=request.result;
            if(settled||event.oldVersion!==1||db.objectStoreNames.length!==1||!db.objectStoreNames.contains(STORE)){reason='account-writer-enrollment-unsupported';tx.abort();return;}
            didUpgrade=true;
            const s=tx.objectStore(STORE),keys=s.getAllKeys(),values=s.getAll();
            values.onsuccess=()=>{try{
                const actual=keys.result.map((key,n)=>[key,values.result[n]]);
                if(!same(actual,entries))throw reject('account-writer-enrollment-stale');
                s.add({schemaVersion:1,writerProtocol:2,scopeName,epoch,revision:0,legacyDigest},ACCOUNT_WRITER_FENCE_KEY);
            }catch(e){reason=e.code||'account-writer-enrollment-unsupported';tx.abort();}};
        };
        request.onsuccess=()=>{const db=request.result;db.close();if(!didUpgrade){finish('account-writer-enrollment-raced');return;}finish(null,{ok:true,writerProtocol:2,legacyDigest,canWrite:false,recoveryRequired:true});};
    });
}

// Atomic in-place cutover, not a second Account database or a copied正本.
export async function cutoverIsolatedAccountStore({indexedDB,scopeName}={}){
    if(!indexedDB?.open||!/^sound-cruise-port-authority-v1-fixture-[A-Za-z0-9_-]+$/.test(scopeName??''))throw reject('account-mutation-isolation-required');
    const validated=await readSnapshot(indexedDB,2,scopeName),db=await openExisting(indexedDB,2);let entries;
    try{const tx=db.transaction('meta','readonly'),complete=done(tx),s=tx.objectStore('meta'),k=s.getAllKeys(),v=s.getAll();await complete;
        if(s.keyPath!==null||s.autoIncrement||s.indexNames.length)throw reject('account-cutover-unsupported');entries=k.result.map((key,n)=>[key,v.result[n]]);
        const fields=new Map(entries);
        if(!same(fields.get('account')??null,validated.account)||!same(fields.get(ACCOUNT_WRITER_FENCE_KEY),validated.fence)||!same(fields.get(ACCOUNT_MUTATION_JOURNAL_KEY)??null,validated.rawJournal??null)||!same(fields.get(ACCOUNT_MUTATION_MARKER_KEY)??null,validated.rawMarker??null))throw reject('account-cutover-stale');
        if(entries.some(([key])=>key===ACCOUNT_BOOTSTRAP_RECEIPT_KEY))throw reject('account-cutover-unsupported');
        if(canonical(entries).length>1048576)throw reject('account-cutover-capacity');
    }finally{db.close();}
    const legacyDigest=await digest(entries),epoch=crypto.randomUUID();
    return new Promise((resolve,fail)=>{let settled=false,reason,didUpgrade=false;const finish=(code,value)=>{if(settled)return;settled=true;code?fail(reject(code)):resolve(freeze(value));};const q=indexedDB.open(DATABASE,3);
        q.onblocked=()=>finish('account-cutover-blocked');q.onerror=()=>finish(reason||'account-cutover-aborted');
        q.onupgradeneeded=e=>{const tx=q.transaction,db=q.result;if(settled||e.oldVersion!==2||db.objectStoreNames.length!==1||!db.objectStoreNames.contains('meta')){reason='account-cutover-unsupported';tx.abort();return;}didUpgrade=true;
            const s=tx.objectStore('meta'),k=s.getAllKeys(),v=s.getAll();v.onsuccess=()=>{try{if(!same(k.result.map((key,n)=>[key,v.result[n]]),entries))throw reject('account-cutover-stale');
                s.name=ACCOUNT_CANONICAL_STORE_V3;s.put({...validated.fence,writerProtocol:3,epoch,legacyDigest},ACCOUNT_WRITER_FENCE_KEY);
            }catch(e){reason=e.code||'account-cutover-aborted';try{tx.abort();}catch{};}};};
        q.onsuccess=()=>{q.result.close();if(!didUpgrade){finish('account-cutover-raced');return;}finish(null,{ok:true,writerProtocol:3,epoch,legacyDigest,canWrite:false,recoveryRequired:true});};
    });
}

// Empty storage provisioning is explicit and isolated. It does not create an
// Account, receipt or qualification. Existing DBs are NEVER reinitialized.
export async function provisionEmptyIsolatedAccountStore({indexedDB,scopeName}={}){
    if(!indexedDB?.open||!/^sound-cruise-port-authority-v1-fixture-[A-Za-z0-9_-]+$/.test(scopeName??''))throw reject('account-mutation-isolation-required');
    const legacyDigest=await digest([]),epoch=crypto.randomUUID();
    return new Promise((resolve,fail)=>{let settled=false,created=false,reason;const finish=(code,value)=>{if(settled)return;settled=true;code?fail(reject(code)):resolve(freeze(value));};const q=indexedDB.open(DATABASE,3);
        q.onblocked=()=>finish('account-bootstrap-storage-blocked');q.onerror=()=>finish(reason||'account-bootstrap-storage-aborted');
        q.onupgradeneeded=e=>{if(settled||e.oldVersion!==0){reason='account-bootstrap-storage-exists';q.transaction.abort();return;}created=true;
            q.result.createObjectStore(ACCOUNT_CANONICAL_STORE_V3).add({schemaVersion:1,writerProtocol:3,scopeName,epoch,revision:0,legacyDigest},ACCOUNT_WRITER_FENCE_KEY);};
        q.onsuccess=()=>{q.result.close();if(!created){finish('account-bootstrap-storage-exists');return;}finish(null,{ok:true,canWrite:false,epoch});};
    });
}

function bootstrapBinding(input){
    const q=clone(input);
    if(!exact(q,['schemaVersion','authorityScope','partitionId','authorityGeneration','operationId','intentFingerprint','kind','destination','source','candidateDigest'])||q.schemaVersion!==1||
       !text(q.authorityScope)||!text(q.partitionId)||!text(q.authorityGeneration)||!text(q.operationId)||!hash(q.intentFingerprint)||!hash(q.candidateDigest)||!['create','recover'].includes(q.kind)||
       !exact(q.source,['epoch','revision'])||!text(q.source.epoch)||!Number.isSafeInteger(q.source.revision)||q.source.revision<0||
       !exact(q.destination,['accountId','accountDeviceId'])||!text(q.destination.accountId)||(q.destination.accountDeviceId!==null&&!text(q.destination.accountDeviceId)))throw reject('account-bootstrap-binding-invalid');return q;
}
async function validateBootstrapReceipt(r){
    if(r===undefined)return null;
    if(!exact(r,['schemaVersion','binding','beforeRevision','afterRevision','beforeDigest','afterDigest','checksum'])||r.schemaVersion!==1||!Number.isSafeInteger(r.beforeRevision)||r.beforeRevision<0||r.afterRevision!==r.beforeRevision+1||!hash(r.beforeDigest)||!hash(r.afterDigest)||!hash(r.checksum))throw reject('account-bootstrap-receipt-invalid');
    const q=bootstrapBinding(r.binding),{checksum,...body}=r;
    if(q.source.revision!==r.beforeRevision||q.candidateDigest!==r.afterDigest||r.beforeDigest!==await digest(null)||checksum!==await digest(body))throw reject('account-bootstrap-receipt-invalid');return r;
}
export const accountCandidateDigest=value=>{const copy=clone(value);account(copy);return digest(copy);};
export function createIsolatedAccountBootstrapStore({indexedDB,scopeName}={}){
    // Reuse owner snapshot validation and the same sole canonical store.
    createIsolatedAccountMutationStore({indexedDB,scopeName,protocol:3});
    const captures=new WeakMap();
    async function entries(){const db=await openExisting(indexedDB,3);try{const tx=db.transaction(ACCOUNT_CANONICAL_STORE_V3,'readonly'),complete=done(tx),s=tx.objectStore(ACCOUNT_CANONICAL_STORE_V3),k=s.getAllKeys(),v=s.getAll();await complete;return k.result.map((key,n)=>[key,v.result[n]]);}finally{db.close();}}
    return Object.freeze({
        async capture(){const rows=await entries(),f=new Map(rows).get(ACCOUNT_WRITER_FENCE_KEY);validateFence(f,scopeName,3);
            // A null account is not enough: old pending/QA/unknown rows, prior
            // receipts and tombstoned removals are NEVER a new empty identity.
            if(rows.length!==1||rows[0][0]!==ACCOUNT_WRITER_FENCE_KEY||f.revision!==0)throw reject('account-bootstrap-not-empty');
            const token=Object.freeze({});captures.set(token,clone(rows));return token;},
        describe(context){const rows=captures.get(context);if(!rows)throw reject('account-bootstrap-context-invalid');const f=new Map(rows).get(ACCOUNT_WRITER_FENCE_KEY);return freeze({epoch:f.epoch,revision:f.revision});},
        async current(context){const rows=captures.get(context);return !!rows&&same(rows,await entries());},
        async commit({context,binding:input,nextAccount,commitGuard}={}){
            const rows=captures.get(context),q=bootstrapBinding(input),candidate=clone(nextAccount);account(candidate);
            if(!rows||typeof commitGuard!=='function')throw reject('account-bootstrap-context-invalid');const f=new Map(rows).get(ACCOUNT_WRITER_FENCE_KEY);
            if(q.authorityScope!==scopeName||!same(q.source,{epoch:f.epoch,revision:f.revision})||q.destination.accountId!==candidate.accountId||(candidate.accountDeviceId??null)!==q.destination.accountDeviceId||q.candidateDigest!==await digest(candidate))throw reject('account-bootstrap-binding-invalid');
            const body={schemaVersion:1,binding:q,beforeRevision:f.revision,afterRevision:f.revision+1,beforeDigest:await digest(null),afterDigest:q.candidateDigest},receipt={...body,checksum:await digest(body)};
            const db=await openExisting(indexedDB,3);try{const tx=db.transaction(ACCOUNT_CANONICAL_STORE_V3,'readwrite'),complete=done(tx),s=tx.objectStore(ACCOUNT_CANONICAL_STORE_V3),k=s.getAllKeys(),v=s.getAll();let reason;
                v.onsuccess=()=>{try{if(!same(k.result.map((key,n)=>[key,v.result[n]]),rows))throw reject('account-bootstrap-cas-conflict');if(commitGuard()!==true)throw reject('account-bootstrap-qualification-stale');
                    s.add(candidate,'account');s.add(receipt,ACCOUNT_BOOTSTRAP_RECEIPT_KEY);s.put({...f,revision:f.revision+1},ACCOUNT_WRITER_FENCE_KEY);
                }catch(e){reason=e.code||'account-bootstrap-transaction-aborted';try{tx.abort();}catch{};}};
                try{await complete;}catch(e){throw reject(reason||e.code);}captures.delete(context);
                return freeze({ok:true,receipt,historical:true,mutationProven:true,operationAuthorized:false,continuityProven:false,recoveryRequired:true,canWrite:false});
            }finally{db.close();}
        },
        async reconcile(input){const q=bootstrapBinding(input),validated=await readSnapshot(indexedDB,3,scopeName);const rows=await entries(),fields=new Map(rows);
            if(!same(fields.get('account')??null,validated.account)||!same(fields.get(ACCOUNT_MUTATION_JOURNAL_KEY)??null,validated.rawJournal??null)||!same(fields.get(ACCOUNT_MUTATION_MARKER_KEY)??null,validated.rawMarker??null)||!same(fields.get(ACCOUNT_WRITER_FENCE_KEY),validated.fence)||!same(fields.get(ACCOUNT_BOOTSTRAP_RECEIPT_KEY)??null,validated.bootstrap))throw reject('account-bootstrap-observation-stale');
            validateFence(fields.get(ACCOUNT_WRITER_FENCE_KEY),scopeName,3);
            const receipt=await validateBootstrapReceipt(fields.get(ACCOUNT_BOOTSTRAP_RECEIPT_KEY));
            if(!receipt)return freeze({ok:false,mutationProven:false,recoveryRequired:true,canWrite:false});
            if(!same(receipt.binding,q)||q.authorityScope!==scopeName)throw reject('account-bootstrap-binding-invalid');
            const currentObservation=fields.get('account')!==undefined&&await digest(fields.get('account'))===receipt.afterDigest;
            if(!same(rows,await entries()))throw reject('account-bootstrap-observation-stale');
            return freeze({ok:true,receipt,historical:true,mutationProven:true,currentObservation,operationAuthorized:false,continuityProven:false,recoveryRequired:true,canWrite:false});
        }
    });
}
