import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {viewerFixture} from './helpers/viewer-fixture.mjs';
import {createViewerLibrary} from '../../score-viewer/core/library.mjs';
import {createPresetCodec} from '../../score-viewer/core/preset.mjs';
import {createSyncInbox} from '../../score-viewer/sync/store.mjs';
import {createMockSync} from '../../score-viewer/sync/client.mjs';
import {descriptor,remoteRecord,hash,MOCK_NAMESPACE,ASSETS} from '../../score-viewer/sync/contract.mjs';
const require=createRequire(process.env.STUDIO_TEST_RUNTIME||import.meta.url),{IDBFactory}=require('fake-indexeddb');
async function setup(){
 const f=viewerFixture(),file=await f.contract.codec.encode(f.score,f.metadata),bytes=new TextEncoder().encode(file.text),indexedDB=new IDBFactory();
 const library=createViewerLibrary({indexedDB,codec:f.contract.codec}),inbox=createSyncInbox({indexedDB}),presetCodec=createPresetCodec((p,s={bars:[]})=>f.contract.normalizePresentation(p,s));
 const d=descriptor({namespace:MOCK_NAMESPACE,appId:'score-viewer',recordId:'mock-record',type:'viewer_document',title:'海辺',documentId:f.metadata.documentId,revisionId:f.metadata.revisionId,asset:{kind:'viewer_score',mime:ASSETS.viewer_score.mime,size:bytes.length,sha256:await hash(bytes)}}),record={descriptor:d,version:1,deleted:false};
 const state={body:bytes,mime:d.asset.mime,rows:[record],phase:'paused',opened:[],calls:[],pdfChecks:0};
 const fetch=async(url,options)=>{state.calls.push({url,options});if(url.includes('capabilities'))return Response.json({protocol:1,namespace:MOCK_NAMESPACE,types:['viewer_document','viewer_preset']});if(url.includes('records?'))return Response.json({records:state.rows});if(url.includes('assets/'))return new Response(state.body,{headers:{'Content-Type':state.mime}});throw Error('unexpected request');};
 const options={fetch,inbox,library,codec:f.contract.codec,presetCodec,validatePDF:async()=>{state.pdfChecks++;return 2;},playback:()=>({phase:state.phase}),withReplacement:run=>run(),openBytes:async(bytes,meta)=>{state.opened.push({bytes,meta});return true;}};
 return {...f,file,bytes,indexedDB,library,inbox,presetCodec,record,state,options,sync:createMockSync(options)};
}
test('catalog is metadata only; unknown future types are preserved remotely and ignored locally',async()=>{
 const f=await setup();f.state.rows.push({descriptor:{type:'future-type',recordId:'unknown'},opaque:'keep'});
 assert.equal((await f.sync.refresh()).length,1);assert.equal(await f.sync.readInbox(f.record),null);assert.deepEqual(await f.library.list(),[]);
 assert.equal(f.state.rows.length,2);assert.equal(f.state.opened.length,0);assert(f.state.calls.every(c=>c.options.method==='GET'&&c.options.credentials==='omit'&&c.options.redirect==='error'&&c.url.startsWith('http://127.0.0.1:18874/apps/score-viewer/local/mock-sync/v1/')));
});
test('receive verifies full source bytes; separate inbox survives reopening without choosing a library file',async()=>{
 const f=await setup();await f.sync.download(f.record);assert.deepEqual(await f.library.list(),[]);assert.equal(f.state.opened.length,0);
 await f.inbox.close();const reopened=createSyncInbox({indexedDB:f.indexedDB}),entry=await reopened.read('mock-record',1);assert.deepEqual(entry.bytes,f.bytes);assert.deepEqual(entry.record,f.record);await reopened.close();
});
test('bad hash, wrong MIME, oversized/truncated bodies never become ready',async()=>{
 for(const kind of ['hash','mime','oversize','truncated']){const f=await setup();if(kind==='hash'){f.state.body=f.bytes.slice();f.state.body[10]^=1;}if(kind==='mime')f.state.mime='text/plain';if(kind==='oversize')f.state.body=new Uint8Array(f.bytes.length+1);if(kind==='truncated')f.state.body=f.bytes.slice(0,10);
 await assert.rejects(f.sync.download(f.record),/sync-(integrity|mime|size)/);assert.equal(await f.sync.readInbox(f.record),null);assert.equal(f.state.opened.length,0);}
});
test('matching hash does not bypass music codec or record identity validation',async()=>{
 const f=await setup(),bad=new TextEncoder().encode('{"not":"a score"}');f.state.body=bad;
 const r=structuredClone(f.record);r.descriptor.asset.size=bad.length;r.descriptor.asset.sha256=await hash(bad);
 await assert.rejects(f.sync.download(r));assert.equal(await f.sync.readInbox(r),null);
 const mismatch=structuredClone(f.record);mismatch.descriptor.revisionId='other';f.state.body=f.bytes;await assert.rejects(f.sync.download(mismatch),/sync-source-mismatch/);
});
test('inbox quota or interrupted download retains prior library and allows explicit retry',async()=>{
 const f=await setup();await f.library.save(f.bytes);let fail=true;
 const sync=createMockSync({...f.options,inbox:{...f.inbox,save:async value=>{if(fail)throw new DOMException('quota','QuotaExceededError');return f.inbox.save(value);}}});
 await assert.rejects(sync.download(f.record),e=>e.name==='QuotaExceededError');assert.equal(await sync.readInbox(f.record),null);assert.equal((await f.library.read(f.metadata.documentId)).decoded.byteHash,f.file.byteHash);
 fail=false;await sync.download(f.record);assert((await sync.readInbox(f.record)).bytes.length);
});
test('performing/counting/loading readers remain fixed; explicit apply preserves preferences and original source',async()=>{
 const f=await setup();await f.library.save(f.bytes);const preferences={version:1,playback:{bpm:78,tick:480},anchor:{barId:f.score.bars[0].id,ratio:.3}};await f.library.savePreferences(f.metadata.documentId,f.metadata.revisionId,preferences);await f.library.saveDeviceSettings({wakeEnabled:false});
 await f.sync.download(f.record);for(const phase of ['playing','counting','loading']){f.state.phase=phase;await assert.rejects(f.sync.apply(f.record),/sync-playing/);}assert.equal(f.state.opened.length,0);
 f.state.phase='paused';await f.sync.apply(f.record);assert.equal(f.state.opened.length,1);assert.deepEqual(await f.library.readPreferences(f.metadata.documentId,f.metadata.revisionId),preferences);assert.deepEqual(await f.library.readDeviceSettings(),{wakeEnabled:false});assert.deepEqual(f.file.document.score,f.score);
});
test('apply quota never swaps current reader or advances last selection',async()=>{
 const f=await setup();await f.library.save(f.bytes);await f.sync.download(f.record);
 const sync=createMockSync({...f.options,library:{...f.library,save:async()=>{throw new DOMException('quota','QuotaExceededError');}}});
 await assert.rejects(sync.apply(f.record),e=>e.name==='QuotaExceededError');assert.equal(f.state.opened.length,0);assert.equal((await f.library.getLast()).revisionId,'revision-1');assert(await sync.readInbox(f.record));
});
test('preset shares display only, supports explicit local name, rejects silent overwrite and never auto-applies',async()=>{
 const f=await setup(),encoded=f.presetCodec.encode('演奏用',f.file.document.defaultPresentation,f.score),bytes=new TextEncoder().encode(encoded.text),digest=await hash(bytes);
 const r={descriptor:{namespace:MOCK_NAMESPACE,appId:'score-viewer',recordId:'preset-record',type:'viewer_preset',title:'演奏用',documentId:'preset:'+digest,revisionId:digest,asset:{kind:'viewer_preset',mime:ASSETS.viewer_preset.mime,size:bytes.length,sha256:digest}},version:1,deleted:false};f.state.body=bytes;f.state.mime=ASSETS.viewer_preset.mime;
 await f.sync.download(r);await f.library.savePreset('演奏用','do not overwrite');await assert.rejects(f.sync.apply(r),/sync-preset-name-conflict/);await f.sync.apply(r,{presetName:'受信用'});await f.sync.apply(r,{presetName:'受信用'});
 assert.equal((await f.library.listPresets()).length,2);assert.equal(f.state.opened.length,0);assert(!encoded.text.includes('tick'));assert(!encoded.text.includes('wakeEnabled'));
});
test('PDF payload passes injected full parser validation before receipt; no metadata-only shortcut',async()=>{
 const f=await setup(),bytes=new TextEncoder().encode('%PDF-test'),digest=await hash(bytes),r=structuredClone(f.record);r.descriptor.documentId='pdf:'+digest;r.descriptor.revisionId=digest;r.descriptor.asset={kind:'viewer_pdf',mime:'application/pdf',size:bytes.length,sha256:digest};f.state.body=bytes;f.state.mime='application/pdf';
 const refused=createMockSync({...f.options,validatePDF:async()=>{throw Error('pdf-password');}});await assert.rejects(refused.download(r),/pdf-password/);assert.equal(await refused.readInbox(r),null);
 await f.sync.download(r);assert.equal(f.state.pdfChecks,1);await f.sync.apply(r);assert.equal((await f.library.list())[0].pages,2);
});
test('unsupported contracts/tombstones/malformed records fail without a remote destructive write',async()=>{
 const f=await setup();await assert.rejects(f.sync.download({...f.record,deleted:true}),/sync-deleted/);assert.throws(()=>remoteRecord({...f.record,version:0}));assert.throws(()=>descriptor({...f.record.descriptor,accountId:'forbidden'}));
 const sync=createMockSync({...f.options,fetch:async()=>Response.json({protocol:0,namespace:MOCK_NAMESPACE,types:[]})});await assert.rejects(sync.refresh(),/sync-capability/);assert.deepEqual(await f.inbox.catalog(),[]);
});

test('new publication ID persists across inbox reopen until commit ACK, then a new explicit send gets a new ID',async()=>{
 const f=await setup(),first=await f.inbox.publicationId('score:hash');await f.inbox.close();const next=createSyncInbox({indexedDB:f.indexedDB});assert.equal(await next.publicationId('score:hash'),first);await next.finishPublication('score:hash');assert.notEqual(await next.publicationId('score:hash'),first);await next.close();
});
test('corrupt persisted catalog fails cleanly instead of creating a ready file',async()=>{
 const f=await setup();await f.inbox.saveCatalog([{broken:true}]);await assert.rejects(f.sync.catalog());assert.equal(await f.sync.readInbox(f.record),null);assert.equal(f.state.opened.length,0);
});
