import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createViewerLibrary} from '../../score-viewer/core/library.mjs';
import {viewerFixture} from './helpers/viewer-fixture.mjs';
const require=createRequire(process.env.STUDIO_TEST_RUNTIME||import.meta.url);
let IDBFactory;try{({IDBFactory}=require('fake-indexeddb'));}catch{}
function setup(){const fixture=viewerFixture(),indexedDB=new IDBFactory(),library=createViewerLibrary({indexedDB,codec:fixture.contract.codec,now:()=>fixture.metadata.exportedAt});return {...fixture,indexedDB,library};}
const options={skip:!IDBFactory?'fake-indexeddb runtime required':false};
test('viewer library saves original bytes and metadata atomically, then reopens after a new owner',options,async()=>{
    const f=setup(),file=await f.contract.codec.encode(f.score,f.metadata),before=JSON.stringify(f.score);
    assert.deepEqual(await f.library.list(),[]);await f.library.save(file.text);await f.library.close();
    const next=createViewerLibrary({indexedDB:f.indexedDB,codec:f.contract.codec}),rows=await next.list(),loaded=await next.read(rows[0].documentId);
    assert.equal(rows.length,1);assert.equal(rows[0].title,f.score.songInfo.title);assert.equal(new TextDecoder().decode(loaded.bytes),file.text);
    assert.deepEqual(loaded.decoded.document.score,f.score);assert.equal(JSON.stringify(f.score),before);
    assert.equal((await next.getLast()).revisionId,f.metadata.revisionId);await next.close();
});
test('same revision is idempotent; conflicting revision never overwrites bytes, pointer or earlier revision',options,async()=>{
    const f=setup(),a=await f.contract.codec.encode(f.score,f.metadata);await f.library.save(a.text);await f.library.save(a.text);
    const changed=structuredClone(f.score);changed.songInfo.title='new title';
    const conflict=await f.contract.codec.encode(changed,f.metadata);await assert.rejects(f.library.save(conflict.text),/viewer-revision-conflict/);
    assert.equal((await f.library.read(f.metadata.documentId)).decoded.byteHash,a.byteHash);
    const b=await f.contract.codec.encode(changed,{...f.metadata,revisionId:'revision-2'});await f.library.save(b.text);
    assert.equal((await f.library.read(f.metadata.documentId)).decoded.byteHash,b.byteHash);
    assert.equal((await f.library.read(f.metadata.documentId,'revision-1')).decoded.byteHash,a.byteHash);
    assert.equal((await f.library.list()).length,1);await f.library.close();
});
test('invalid input does not create or replace a library row; preferences never alter original bytes',options,async()=>{
    const f=setup(),file=await f.contract.codec.encode(f.score,f.metadata);await f.library.save(file.text);
    await assert.rejects(f.library.save('{'));await assert.rejects(f.library.save(new Uint8Array([0xff])));
    const pref={version:1,presentation:file.document.defaultPresentation,anchor:{barId:f.score.bars[3].id,ratio:.25}};
    await f.library.savePreferences(f.metadata.documentId,'revision-1',pref);pref.anchor.ratio=.8;
    assert.equal((await f.library.readPreferences(f.metadata.documentId,'revision-1')).anchor.ratio,.25);
    assert.equal(await f.library.readPreferences(f.metadata.documentId,'revision-2'),null);
    assert.equal((await f.library.read(f.metadata.documentId)).decoded.byteHash,file.byteHash);
    assert.equal((await f.library.list()).length,1);await f.library.close();
});
test('corrupt stored contents are rejected without deleting the file or its index',options,async()=>{
    const f=setup(),file=await f.contract.codec.encode(f.score,f.metadata);await f.library.save(file.text);
    await new Promise((resolve,reject)=>{const open=f.indexedDB.open('cruiseStudio.viewer.library.v1');open.onerror=()=>reject(open.error);open.onsuccess=()=>{const d=open.result,tx=d.transaction('revisions','readwrite'),store=tx.objectStore('revisions'),r=store.get([f.metadata.documentId,'revision-1']);r.onsuccess=()=>{r.result.byteHash='0'.repeat(64);store.put(r.result);};tx.oncomplete=()=>{d.close();resolve();};tx.onabort=()=>reject(tx.error);};});
    await assert.rejects(f.library.read(f.metadata.documentId),/viewer-stored-file-corrupt/);assert.equal((await f.library.list()).length,1);await f.library.close();
});
test('storage absence is a reported failure, not a fake successful save',async()=>{
    const f=viewerFixture(),file=await f.contract.codec.encode(f.score,f.metadata),library=createViewerLibrary({indexedDB:null,codec:f.contract.codec});
    await assert.rejects(library.save(file.text),/viewer-storage-unavailable/);await assert.rejects(library.list(),/viewer-storage-unavailable/);
});
test('device wake preference survives reopen without touching the file, position or last selection',options,async()=>{
    const f=setup(),file=await f.contract.codec.encode(f.score,f.metadata);await f.library.save(file.text);
    assert.deepEqual(await f.library.readDeviceSettings(),{wakeEnabled:true});await f.library.saveDeviceSettings({wakeEnabled:false});await f.library.close();
    const next=createViewerLibrary({indexedDB:f.indexedDB,codec:f.contract.codec});assert.deepEqual(await next.readDeviceSettings(),{wakeEnabled:false});assert.equal((await next.read(f.metadata.documentId)).decoded.byteHash,file.byteHash);assert.equal((await next.getLast()).revisionId,f.metadata.revisionId);await assert.rejects(next.saveDeviceSettings({wakeEnabled:'true'}));await next.close();
});
test('corrupt library metadata rejects cleanly while the original revision stays readable',options,async()=>{
    const f=setup(),file=await f.contract.codec.encode(f.score,f.metadata);await f.library.save(file.text);
    await new Promise((resolve,reject)=>{const open=f.indexedDB.open('cruiseStudio.viewer.library.v1');open.onsuccess=()=>{const d=open.result,tx=d.transaction('documents','readwrite'),store=tx.objectStore('documents'),r=store.get(f.metadata.documentId);r.onsuccess=()=>{r.result.savedAt={broken:true};store.put(r.result);};tx.oncomplete=()=>{d.close();resolve();};tx.onabort=()=>reject(tx.error);};});
    await assert.rejects(f.library.list(),/viewer-stored-file-corrupt/);assert.equal((await f.library.read(f.metadata.documentId,'revision-1')).decoded.byteHash,file.byteHash);await f.library.close();
});
test('aborted quota transaction retains the preceding file and never publishes the new index',options,async()=>{
    const f=setup(),file=await f.contract.codec.encode(f.score,f.metadata);await f.library.save(file.text);await f.library.close();
    let failSave=true;
    const factory={open(...args){const request=f.indexedDB.open(...args);request.addEventListener('success',()=>{
        const d=request.result,original=d.transaction.bind(d);d.transaction=(...args)=>{const tx=original(...args);if(args[1]==='readwrite'&&failSave){const originalStore=tx.objectStore.bind(tx);tx.objectStore=name=>{const store=originalStore(name);if(name==='revisions')store.add=()=>{throw new DOMException('test quota','QuotaExceededError');};return store;};}return tx;};
    });return request;}};
    const library=createViewerLibrary({indexedDB:factory,codec:f.contract.codec}),next=await f.contract.codec.encode(f.score,{...f.metadata,revisionId:'quota-revision'});
    await assert.rejects(library.save(next.text),e=>e.name==='QuotaExceededError');failSave=false;
    assert.equal((await library.read(f.metadata.documentId)).decoded.byteHash,file.byteHash);assert.equal((await library.getLast()).revisionId,'revision-1');await library.close();
});
test('version 1 library upgrades without changing saved bytes, revisions, preferences or last selection',options,async()=>{
    const f=setup(),file=await f.contract.codec.encode(f.score,f.metadata),documentId=f.metadata.documentId,revisionId=f.metadata.revisionId;
    const preference={version:1,anchor:{barId:f.score.bars[1].id,ratio:.3},presentation:file.document.defaultPresentation};
    await new Promise((resolve,reject)=>{
        const request=f.indexedDB.open('cruiseStudio.viewer.library.v1',1);
        request.onupgradeneeded=()=>{for(const [name,keyPath]of [['documents','documentId'],['revisions',['documentId','revisionId']],['preferences',['documentId','revisionId']],['state','key']])request.result.createObjectStore(name,{keyPath});};
        request.onerror=()=>reject(request.error);request.onsuccess=()=>{
            const db=request.result,tx=db.transaction(['documents','revisions','preferences','state'],'readwrite');
            tx.objectStore('documents').put({documentId,revisionId,title:f.score.songInfo.title,artist:f.score.songInfo.artist,bars:f.score.bars.length,byteHash:file.byteHash,savedAt:f.metadata.exportedAt});
            tx.objectStore('revisions').put({documentId,revisionId,bytes:new TextEncoder().encode(file.text),byteHash:file.byteHash});
            tx.objectStore('preferences').put({documentId,revisionId,value:preference});tx.objectStore('state').put({key:'last',documentId,revisionId});
            tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);
        };
    });
    assert.equal((await f.library.list()).length,1);assert.equal(new TextDecoder().decode((await f.library.read(documentId)).bytes),file.text);
    assert.deepEqual(await f.library.readPreferences(documentId,revisionId),preference);assert.equal((await f.library.getLast()).revisionId,revisionId);
    assert.deepEqual(await f.library.listPresets(),[]);await f.library.savePreset('演奏用','test preset');await f.library.close();
    const next=createViewerLibrary({indexedDB:f.indexedDB,codec:f.contract.codec});
    assert.deepEqual(await next.listPresets(),[{name:'演奏用',text:'test preset'}]);
    await assert.rejects(next.savePreset('演奏用','replacement'),e=>e.name==='ConstraintError');
    assert.deepEqual(await next.listPresets(),[{name:'演奏用',text:'test preset'}]);assert.equal((await next.read(documentId)).decoded.byteHash,file.byteHash);await next.close();
});
