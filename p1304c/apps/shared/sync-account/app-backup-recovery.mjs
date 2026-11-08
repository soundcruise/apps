// Additive pinned archive owner API using the EXISTING app-backup DB/store.
// No boot installation, automatic pruning, live restore or Account payloads.
const fail=code=>Object.assign(new Error(code),{code});
const database='sound-cruise-sync-app-backups',store='backups';
const done=tx=>new Promise((r,j)=>{tx.oncomplete=r;tx.onabort=tx.onerror=()=>j(tx.error||fail('recovery-backup-aborted'));});
export function createIsolatedRecoveryBackupStore({indexedDB,scopeName}={}){
    if(!indexedDB?.open||!/^sound-cruise-port-authority-v1-fixture-[A-Za-z0-9_-]+$/.test(scopeName??'')||
        typeof window!=='undefined'&&(!['127.0.0.1','localhost','[::1]'].includes(location.hostname)||!location.pathname.startsWith('/apps/cruise-port/tests/')))throw fail('recovery-backup-isolation-required');
    async function open(create=false){
        const db=await new Promise((r,j)=>{let absent=false;const q=indexedDB.open(database);
            q.onupgradeneeded=()=>{absent=true;q.transaction.abort();};q.onerror=()=>absent?r(null):j(q.error);q.onsuccess=()=>r(q.result);});
        if(db)return db;
        if(!create)return null;
        return new Promise((r,j)=>{let created=false;const q=indexedDB.open(database,1);
            q.onupgradeneeded=e=>{if(e.oldVersion!==0){q.transaction.abort();return;}created=true;const s=q.result.createObjectStore(store,{keyPath:'id'});s.createIndex('byAppCreated',['appId','createdAt']);};
            q.onerror=()=>j(q.error);q.onblocked=()=>j(fail('recovery-backup-blocked'));q.onsuccess=()=>{if(!created){q.result.close();j(fail('recovery-backup-create-raced'));}else r(q.result);};});
    }
    function validate(db){
        if(db.version!==1||db.objectStoreNames.length!==1||!db.objectStoreNames.contains(store))throw fail('recovery-backup-schema-unsupported');
        const s=db.transaction(store,'readonly').objectStore(store);
        if(s.keyPath!=='id'||s.autoIncrement||s.indexNames.length!==1||!s.indexNames.contains('byAppCreated')||
            JSON.stringify(s.index('byAppCreated').keyPath)!=='["appId","createdAt"]'||s.index('byAppCreated').unique||s.index('byAppCreated').multiEntry)throw fail('recovery-backup-schema-unsupported');
    }
    function key(archiveId){if(typeof archiveId!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(archiveId))throw fail('recovery-archive-id-invalid');return 'port-recovery-v1:'+scopeName+':'+archiveId;}
    return Object.freeze({
        // Read-only inventory for explicit isolated recovery. Unknown pins are
        // returned, never normalized, pruned or silently declared resolved.
        async inventory(){const db=await open();if(!db)return [];try{validate(db);const tx=db.transaction(store,'readonly'),c=done(tx),q=tx.objectStore(store).getAll(undefined,513);await c;
            if(q.result.length>512)throw fail('recovery-inventory-capacity');return q.result;
        }finally{db.close();}},
        async read(archiveId){key(archiveId);const db=await open();if(!db)return null;try{validate(db);const tx=db.transaction(store,'readonly'),c=done(tx),q=tx.objectStore(store).get(key(archiveId));await c;return q.result??null;}finally{db.close();}},
        async add(archiveId,packet){
            // No appId/createdAt top-level: legacy latest/prune index cannot
            // select or remove this pin. Normal backups retain their contract.
            const row=structuredClone({id:key(archiveId),kind:'port-recovery-v1',scopeName,packet});
            const db=await open(true);try{validate(db);const tx=db.transaction(store,'readwrite'),c=done(tx),s=tx.objectStore(store),q=s.get(row.id);let conflict=false,failure;
                q.onsuccess=()=>{try{if(q.result){if(JSON.stringify(q.result)!==JSON.stringify(row)){conflict=true;tx.abort();}}else s.add(row);}catch(e){failure=e;try{tx.abort();}catch{}}};
                try{await c;}catch(e){throw failure||(conflict?fail('recovery-archive-conflict'):e);}
            }finally{db.close();}
            const actual=await this.read(archiveId);if(JSON.stringify(actual)!==JSON.stringify(row))throw fail('recovery-backup-readback-mismatch');return actual;
        }
    });
}
