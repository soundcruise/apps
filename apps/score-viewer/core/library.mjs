import {insist, clone} from './json.mjs';
import {MAX_FILE_BYTES} from './file-format.mjs';
import {pdfBytes,pdfHash,pdfName,MAX_PDF_PAGES} from './pdf-contract.mjs';

export const VIEWER_DB = 'cruiseStudio.viewer.library.v1';
// Own database/transactions only. No editor repository, Account, Sync or network.
export function createViewerLibrary({indexedDB, codec, now = () => new Date().toISOString(), dbName = VIEWER_DB}) {
    let opening = null;
    function db() {
        if (!opening) opening = new Promise((resolve,reject) => {
            if (!indexedDB) { reject(Error('viewer-storage-unavailable')); return; }
            const request = indexedDB.open(dbName,2);
            let rejected = false;
            request.onupgradeneeded = () => {
                const d = request.result;
                for(const [name,keyPath]of [['documents','documentId'],['revisions',['documentId','revisionId']],['preferences',['documentId','revisionId']],['state','key'],['presets','name']])
                    if(!d.objectStoreNames.contains(name))d.createObjectStore(name,{keyPath});
            };
            request.onblocked = () => { rejected = true; opening = null; reject(Error('viewer-storage-blocked')); };
            request.onerror = () => { opening = null; reject(request.error); };
            request.onsuccess = () => {
                if (rejected) { request.result.close(); return; }
                request.result.onversionchange = () => { request.result.close(); opening = null; };
                resolve(request.result);
            };
        });
        return opening;
    }
    async function transact(stores, mode, run) {
        const d = await db();
        return new Promise((resolve,reject) => {
            const tx = d.transaction(stores,mode); let result, error;
            tx.oncomplete = () => resolve(result);
            tx.onabort = () => reject(error || tx.error || Error('viewer-storage-aborted'));
            tx.onerror = () => {}; // onabort is the single final failure result.
            try { run(tx, value => { result = value; }, e => { error = e; tx.abort(); }); }
            catch(e) { error = e; tx.abort(); }
        });
    }
    async function save(input,{select=true}={}) {
        const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input).slice();
        insist(bytes.byteLength <= MAX_FILE_BYTES,'file-budget');
        const decoded = await codec.decode(bytes), doc = decoded.document, documentId = doc.viewerDocumentId, revisionId = doc.revisionId;
        return transact(['documents','revisions','state'],'readwrite',(tx,done,fail) => {
            const revisions = tx.objectStore('revisions'), request = revisions.get([documentId,revisionId]);
            request.onsuccess = () => {
                try {
                if (request.result && request.result.byteHash !== decoded.byteHash) { fail(Error('viewer-revision-conflict')); return; }
                // Do not overwrite any existing revision. Pointer changes and new bytes
                // commit atomically; quota/abort leaves the preceding file available.
                if (!request.result) revisions.add({documentId,revisionId,bytes,byteHash:decoded.byteHash});
                const row = {documentId,revisionId,title:doc.score.songInfo.title || '無題',artist:doc.score.songInfo.artist,
                    bars:doc.score.bars.length,byteHash:decoded.byteHash,savedAt:now()};
                tx.objectStore('documents').put(row);if(select)tx.objectStore('state').put({key:'last',documentId,revisionId});done(row);
                } catch(error) { fail(error); }
            };
        });
    }
    async function list() {
        return transact(['documents'],'readonly',(tx,done,fail) => {
            const request = tx.objectStore('documents').getAll();
            request.onsuccess = () => {try{
                insist(request.result.every(row=>['documentId','revisionId','title','artist','savedAt','byteHash'].every(key=>typeof row[key]==='string')&&Number.isInteger(row.bars)&&row.bars>=0&&row.bars<=2048),'viewer-stored-file-corrupt');
                done(request.result.sort((a,b) => b.savedAt.localeCompare(a.savedAt)));
            }catch(error){fail(error);}};
        });
    }
    async function read(documentId, revisionId) {
        const record = await transact(['documents','revisions'],'readonly',(tx,done,fail) => {
            const get = revision => {
                try {
                insist(typeof revision==='string'&&revision.length>0,'viewer-stored-file-corrupt');
                const r = tx.objectStore('revisions').get([documentId,revision]);
                r.onsuccess = () => r.result ? done(r.result) : fail(Error('viewer-file-missing'));
                }catch(error){fail(error);}
            };
            if (revisionId) get(revisionId);
            else { const request = tx.objectStore('documents').get(documentId);
                request.onsuccess = () => request.result ? get(request.result.revisionId) : fail(Error('viewer-file-missing')); }
        });
        if(record.kind==='pdf'){
            const bytes=pdfBytes(record.bytes),hash=await pdfHash(bytes);
            insist(hash===record.byteHash&&documentId==='pdf:'+hash&&record.revisionId===hash&&Number.isInteger(record.pages)&&record.pages>=1&&record.pages<=MAX_PDF_PAGES,'viewer-stored-file-corrupt');
            return {kind:'pdf',bytes,byteHash:hash,name:pdfName(record.name),pages:record.pages};
        }
        insist(record.kind===undefined,'viewer-stored-file-corrupt');
        const decoded = await codec.decode(record.bytes);
        insist(decoded.byteHash === record.byteHash && decoded.document.viewerDocumentId === documentId &&
            decoded.document.revisionId === record.revisionId,'viewer-stored-file-corrupt');
        return {bytes:record.bytes.slice(),decoded};
    }
    async function readPreferences(documentId,revisionId) {
        return transact(['preferences'],'readonly',(tx,done) => {
            const r = tx.objectStore('preferences').get([documentId,revisionId]); r.onsuccess = () => done(r.result?.value ?? null);
        });
    }
    async function savePreferences(documentId,revisionId,value) {
        const copy = clone(value);
        insist(JSON.stringify(copy).length <= 65536,'viewer-preferences-budget');
        return transact(['preferences'],'readwrite',(tx,done) => {
            tx.objectStore('preferences').put({documentId,revisionId,value:copy}); done(true);
        });
    }
    async function close() { if (opening) { const d = await opening; d.close(); opening = null; } }
    async function setLast(documentId,revisionId) {return transact(['state'],'readwrite',(tx,done)=>{tx.objectStore('state').put({key:'last',documentId,revisionId});done(true);});}
    async function getLast() {return transact(['state'],'readonly',(tx,done)=>{const r=tx.objectStore('state').get('last');r.onsuccess=()=>done(r.result||null);});}
    async function readDeviceSettings(){return transact(['state'],'readonly',(tx,done)=>{const r=tx.objectStore('state').get('viewer-device');r.onsuccess=()=>done({wakeEnabled:r.result?.wakeEnabled!==false});});}
    async function saveDeviceSettings(value){insist(typeof value?.wakeEnabled==='boolean','invalid-device-settings');return transact(['state'],'readwrite',(tx,done)=>{tx.objectStore('state').put({key:'viewer-device',wakeEnabled:value.wakeEnabled});done(true);});}
    async function listPresets(){return transact(['presets'],'readonly',(tx,done)=>{const r=tx.objectStore('presets').getAll();r.onsuccess=()=>done(r.result);});}
    async function savePDF(input,{name,pages},{select=true}={}){
        const bytes=pdfBytes(input),hash=await pdfHash(bytes),documentId='pdf:'+hash,revisionId=hash;
        insist(Number.isInteger(pages)&&pages>=1&&pages<=MAX_PDF_PAGES,'pdf-page-limit');
        const row={kind:'pdf',documentId,revisionId,title:pdfName(name),artist:'',bars:0,pages,byteHash:hash,savedAt:now()};
        return transact(['documents','revisions','state'],'readwrite',(tx,done)=>{
            tx.objectStore('revisions').put({kind:'pdf',documentId,revisionId,bytes,byteHash:hash,name:row.title,pages});
            tx.objectStore('documents').put(row);if(select)tx.objectStore('state').put({key:'last',documentId,revisionId});done(row);
        });
    }
    async function savePreset(name,text){
        insist(typeof name==='string'&&name.trim().length>0&&name.length<=40&&typeof text==='string'&&new TextEncoder().encode(text).length<=65536,'invalid-viewer-preset');
        return transact(['presets'],'readwrite',(tx,done,fail)=>{const store=tx.objectStore('presets'),r=store.count();r.onsuccess=()=>{if(r.result>=20){fail(Error('preset-count-limit'));return;}try{store.add({name:name.trim(),text});done(true);}catch(error){fail(error);}};});
    }
    return Object.freeze({save,savePDF,list,read,readPreferences,savePreferences,setLast,getLast,listPresets,savePreset,readDeviceSettings,saveDeviceSettings,close});
}
