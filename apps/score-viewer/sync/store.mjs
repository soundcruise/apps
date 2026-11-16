// Separate inbox: receiving bytes never selects a library revision or changes
// the performing reader. Original editor/viewer databases are not migrated.
export const MOCK_DB='cruiseStudio.viewer.mockSync.v1';
export function createSyncInbox({indexedDB,dbName=MOCK_DB}){
    let opening;
    const db=()=>opening||=new Promise((resolve,reject)=>{const r=indexedDB.open(dbName,1);r.onupgradeneeded=()=>{r.result.createObjectStore('catalog',{keyPath:'key'});r.result.createObjectStore('files',{keyPath:['recordId','version']});};r.onerror=()=>{opening=null;reject(r.error);};r.onblocked=()=>{reject(Error('sync-storage-blocked'));};r.onsuccess=()=>{r.result.onversionchange=()=>{r.result.close();opening=null;};resolve(r.result);};});
    async function transaction(store,mode,run){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction(store,mode);let result;tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(tx.error||Error('sync-inbox-aborted'));tx.onerror=()=>{};try{run(tx.objectStore(store),value=>result=value);}catch(error){tx.abort();reject(error);}});}
    return Object.freeze({
        saveCatalog:records=>transaction('catalog','readwrite',(s,done)=>{s.put({key:'remote',records});done(true);}),
        catalog:()=>transaction('catalog','readonly',(s,done)=>{const r=s.get('remote');r.onsuccess=()=>done(r.result?.records||[]);}),
        save:entry=>transaction('files','readwrite',(s,done)=>{s.put(entry);done(true);}),
        read:(recordId,version)=>transaction('files','readonly',(s,done)=>{const r=s.get([recordId,version]);r.onsuccess=()=>done(r.result||null);}),
        publicationId:key=>transaction('catalog','readwrite',(s,done)=>{const r=s.get('outgoing:'+key);r.onsuccess=()=>{const id=r.result?.recordId||crypto.randomUUID();s.put({key:'outgoing:'+key,recordId:id});done(id);};}),
        finishPublication:key=>transaction('catalog','readwrite',(s,done)=>{s.delete('outgoing:'+key);done(true);}),
        async close(){if(opening){(await opening).close();opening=null;}}
    });
}
