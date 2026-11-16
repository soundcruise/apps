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
            const request = indexedDB.open(dbName,3);
            let rejected = false;
            request.onupgradeneeded = () => {
                const d = request.result;
                const tx=request.transaction;
                for(const [name,keyPath]of [['documents','documentId'],['revisions',['documentId','revisionId']],['preferences',['documentId','revisionId']],['state','key'],['presets','name'],['entries','entryId'],['folders','folderId']])
                    if(!d.objectStoreNames.contains(name))d.createObjectStore(name,{keyPath});
                {const cursor=tx.objectStore('documents').openCursor();cursor.onsuccess=()=>{const c=cursor.result;if(c){tx.objectStore('entries').put({...c.value,entryId:c.value.documentId,folderId:'',version:1});c.continue();}};}
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
    const title=value=>{insist(typeof value==='string'&&value.trim().length>0&&value.trim().length<=180&&!/[\u0000-\u001f\u007f]/.test(value),'invalid-library-name');return value.trim();};
    async function commitFile(row,revision,{select=true,canSave=()=>true,entryId=row.documentId,name,folderId,expectedVersion,newEntry=false,requireUniqueName=false}={}){
        insist(typeof entryId==='string'&&entryId.length>0&&entryId.length<=200,'invalid-entry-id');if(name!==undefined)name=title(name);
        return transact(['documents','revisions','state','entries','folders'],'readwrite',(tx,done,fail)=>{
            const entries=tx.objectStore('entries'),get=entries.get(entryId);
            get.onsuccess=()=>{try{
                const old=get.result;insist(!newEntry||!old,'viewer-entry-conflict');insist(expectedVersion===undefined||old?.version===expectedVersion,'viewer-entry-conflict');
                const folder=folderId===undefined?old?.folderId||'':folderId;insist(typeof folder==='string','invalid-folder');
                const folderCheck=tx.objectStore('folders').get(folder);
                folderCheck.onsuccess=()=>{try{
                    insist(!folder||!!folderCheck.result,'folder-missing');insist(canSave(),'viewer-export-stale');
                    const revisions=tx.objectStore('revisions'),check=revisions.get([row.documentId,row.revisionId]);
                    check.onsuccess=()=>{try{
                        const entry={...row,entryId,title:name||old?.title||row.title,folderId:folder,version:(old?.version||0)+1};
                        function write(){try{insist(canSave(),'viewer-export-stale');insist(!check.result||check.result.byteHash===revision.byteHash,'viewer-revision-conflict');if(!check.result)revisions.add(revision);tx.objectStore('documents').put(row);entries.put(entry);if(select)tx.objectStore('state').put({key:'last',documentId:entryId,revisionId:row.revisionId});done(entry);}catch(e){fail(e);}}
                        if(requireUniqueName){const all=entries.getAll();all.onsuccess=()=>{try{insist(!all.result.some(e=>e.entryId!==entryId&&e.title===entry.title),'viewer-name-conflict');write();}catch(e){fail(e);}};}else write();
                    }catch(e){fail(e);}};
                }catch(e){fail(e);}};
            }catch(e){fail(e);}};
        });
    }
    async function save(input,options={}){
        const bytes=typeof input==='string'?new TextEncoder().encode(input):new Uint8Array(input).slice();insist(bytes.byteLength<=MAX_FILE_BYTES,'file-budget');
        const decoded=await codec.decode(bytes),doc=decoded.document,documentId=doc.viewerDocumentId,revisionId=doc.revisionId;
        const row={documentId,revisionId,title:doc.score.songInfo.title||'無題',artist:doc.score.songInfo.artist,bars:doc.score.bars.length,byteHash:decoded.byteHash,savedAt:now()};
        return commitFile(row,{documentId,revisionId,bytes,byteHash:decoded.byteHash},options);
    }
    async function list(){return transact(['entries'],'readonly',(tx,done,fail)=>{const r=tx.objectStore('entries').getAll();r.onsuccess=()=>{try{insist(r.result.every(row=>['entryId','documentId','revisionId','title','artist','savedAt','byteHash','folderId'].every(k=>typeof row[k]==='string')&&Number.isInteger(row.bars)&&row.bars>=0&&row.bars<=2048&&Number.isSafeInteger(row.version)&&row.version>0),'viewer-stored-file-corrupt');done(r.result.sort((a,b)=>b.savedAt.localeCompare(a.savedAt)));}catch(e){fail(e);}};});}
    async function entry(entryId){return transact(['entries'],'readonly',(tx,done)=>{const r=tx.objectStore('entries').get(entryId);r.onsuccess=()=>done(r.result||null);});}
    async function read(documentId, revisionId) {
        let alias=await entry(documentId);const requestedRevision=revisionId;if(alias){if(requestedRevision&&requestedRevision!==alias.revisionId)alias=null;else{documentId=alias.documentId;revisionId=revisionId||alias.revisionId;}}
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
        insist(!alias||alias.byteHash===record.byteHash,'viewer-stored-file-corrupt');
        if(record.kind==='pdf'){
            const bytes=pdfBytes(record.bytes),hash=await pdfHash(bytes);
            insist(hash===record.byteHash&&documentId==='pdf:'+hash&&record.revisionId===hash&&Number.isInteger(record.pages)&&record.pages>=1&&record.pages<=MAX_PDF_PAGES,'viewer-stored-file-corrupt');
            return {kind:'pdf',bytes,byteHash:hash,name:alias?.title||pdfName(record.name),pages:record.pages,entry:alias};
        }
        insist(record.kind===undefined,'viewer-stored-file-corrupt');
        const decoded = await codec.decode(record.bytes);
        insist(decoded.byteHash === record.byteHash && decoded.document.viewerDocumentId === documentId &&
            decoded.document.revisionId === record.revisionId,'viewer-stored-file-corrupt');
        return {bytes:record.bytes.slice(),decoded,entry:alias};
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
    async function savePDF(input,{name,pages},options={}){
        const bytes=pdfBytes(input),hash=await pdfHash(bytes),documentId='pdf:'+hash,revisionId=hash;insist(Number.isInteger(pages)&&pages>=1&&pages<=MAX_PDF_PAGES,'pdf-page-limit');
        const row={kind:'pdf',documentId,revisionId,title:pdfName(name),artist:'',bars:0,pages,byteHash:hash,savedAt:now()};
        return commitFile(row,{kind:'pdf',documentId,revisionId,bytes,byteHash:hash,name:row.title,pages},options);
    }
    async function listFolders(){return transact(['folders'],'readonly',(tx,done)=>{const r=tx.objectStore('folders').getAll();r.onsuccess=()=>done(r.result);});}
    async function organize({kind,id,name,parentId,expectedVersion}){
        insist(['entry','folder'].includes(kind),'invalid-library-kind');
        if(name!==undefined)name=title(name);insist(typeof parentId==='string'||parentId===undefined,'invalid-folder');
        return transact(['entries','folders'],'readwrite',(tx,done,fail)=>{
            const folders=tx.objectStore('folders'),all=folders.getAll();all.onsuccess=()=>{try{
                const map=new Map(all.result.map(f=>[f.folderId,f]));if(parentId)insist(map.has(parentId),'folder-missing');
                const store=tx.objectStore(kind==='folder'?'folders':'entries'),r=store.get(id);r.onsuccess=()=>{try{
                    const old=r.result;insist(old,'viewer-file-missing');insist(expectedVersion===undefined||old.version===expectedVersion,'viewer-entry-conflict');
                    const parent=parentId===undefined?(kind==='folder'?old.parentId:old.folderId):parentId;
                    let at=parent,depth=0;while(at){insist(kind!=='folder'||at!==id,'folder-cycle');insist(++depth<=16,'folder-depth');at=map.get(at)?.parentId||'';}
                    if(kind==='folder'){insist(!all.result.some(f=>f.folderId!==id&&f.parentId===parent&&(name||old.name)===f.name),'folder-name-conflict');function subtree(root,seen=new Set()){insist(!seen.has(root),'folder-cycle');seen.add(root);return Math.max(0,...all.result.filter(f=>f.parentId===root).map(f=>1+subtree(f.folderId,new Set(seen))));}insist(depth+1+subtree(id)<=16,'folder-depth');}
                    const next={...old,title:kind==='folder'?undefined:name||old.title,version:old.version+1,savedAt:now(),...(kind==='folder'?{name:name||old.name,parentId:parent}:{folderId:parent})};if(kind==='folder')delete next.title;
                    store.put(next);done(next);
                }catch(e){fail(e);}};
            }catch(e){fail(e);}};
        });
    }
    async function createFolder(name,parentId=''){
        name=title(name);return transact(['folders'],'readwrite',(tx,done,fail)=>{const store=tx.objectStore('folders'),r=store.getAll();r.onsuccess=()=>{try{
            insist(r.result.length<200,'folder-limit');insist(!r.result.some(f=>f.parentId===parentId&&f.name===name),'folder-name-conflict');const map=new Map(r.result.map(f=>[f.folderId,f]));let at=parentId,depth=1;while(at){insist(map.has(at),'folder-missing');insist(++depth<=16,'folder-depth');at=map.get(at).parentId;}
            const f={folderId:crypto.randomUUID(),name,parentId,version:1};store.add(f);done(f);
        }catch(e){fail(e);}};});
    }
    async function duplicate(entryId,name){
        const named=name!==undefined;if(named)name=title(name);
        return transact(['entries'],'readwrite',(tx,done,fail)=>{const store=tx.objectStore('entries'),r=store.getAll();r.onsuccess=()=>{try{
            const old=r.result.find(e=>e.entryId===entryId);insist(old,'viewer-file-missing');let nextName=name||old.title.slice(0,160)+' コピー',n=2;
            const used=value=>r.result.some(e=>e.folderId===old.folderId&&e.title===value);if(named)insist(!used(nextName),'viewer-name-conflict');else while(used(nextName))nextName=old.title.slice(0,160)+' コピー ('+(n++)+')';
            const copy={...old,entryId:crypto.randomUUID(),title:nextName,savedAt:now(),version:1};store.add(copy);done(copy);
        }catch(e){fail(e);}};});
    }
    async function remove(kind,id,expectedVersion){
        insist(['entry','folder'].includes(kind),'invalid-library-kind');
        return transact(['entries','folders','state'],'readwrite',(tx,done,fail)=>{
            const store=tx.objectStore(kind==='folder'?'folders':'entries'),r=store.get(id);r.onsuccess=()=>{try{
                const old=r.result;insist(old,'viewer-file-missing');insist(expectedVersion===undefined||old.version===expectedVersion,'viewer-entry-conflict');
                function erase(){store.delete(id);const last=tx.objectStore('state').get('last');last.onsuccess=()=>{if(kind!=='folder'&&last.result?.documentId===id)tx.objectStore('state').delete('last');done(true);};}
                if(kind!=='folder'){erase();return;}
                const folders=tx.objectStore('folders').getAll();folders.onsuccess=()=>{try{insist(!folders.result.some(f=>f.parentId===id),'folder-not-empty');const entries=tx.objectStore('entries').getAll();entries.onsuccess=()=>{try{insist(!entries.result.some(e=>e.folderId===id),'folder-not-empty');erase();}catch(e){fail(e);}};}catch(e){fail(e);}};
            }catch(e){fail(e);}};
        });
    }
    async function savePreset(name,text){
        insist(typeof name==='string'&&name.trim().length>0&&name.length<=40&&typeof text==='string'&&new TextEncoder().encode(text).length<=65536,'invalid-viewer-preset');
        return transact(['presets'],'readwrite',(tx,done,fail)=>{const store=tx.objectStore('presets'),r=store.count();r.onsuccess=()=>{if(r.result>=20){fail(Error('preset-count-limit'));return;}try{store.add({name:name.trim(),text});done(true);}catch(error){fail(error);}};});
    }
    return Object.freeze({save,savePDF,list,read,readPreferences,savePreferences,setLast,getLast,listPresets,savePreset,readDeviceSettings,saveDeviceSettings,entry,listFolders,organize,createFolder,duplicate,remove,close});
}
