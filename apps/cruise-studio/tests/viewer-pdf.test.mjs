import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {createPDFClock,pdfBytes,pdfHash,normalizePDFSettings,MAX_PDF_BYTES} from '../../score-viewer/core/pdf-contract.mjs';
import {createViewerLibrary} from '../../score-viewer/core/library.mjs';
import {viewerFixture} from './helpers/viewer-fixture.mjs';
const near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('PDF clock requires explicit settings and uses page fractions across pause, mode, tempo and per-page overrides',()=>{
    let now=0;const clock=createPDFClock({pages:3,now:()=>now});assert.throws(()=>clock.play(),/settings-required/);
    clock.configure({configured:true,mode:'seconds',seconds:10});clock.play();now=2.5;near(clock.snapshot().position,.25);
    clock.pause();now=20;near(clock.snapshot().position,.25);clock.play();now=22.5;near(clock.snapshot().position,.5);
    clock.configure({mode:'beats',bpm:120,beats:8,pageBeats:{1:4}});near(clock.snapshot().position,.5);
    now=24.5;near(clock.snapshot().position,1);now=25.5;near(clock.snapshot().position,1.5);
    clock.configure({bpm:60});near(clock.snapshot().position,1.5);now=27.5;near(clock.snapshot().position,2);
    now=35.5;assert.equal(clock.snapshot().phase,'ended');assert.equal(clock.snapshot().position,3);clock.play();assert.equal(clock.snapshot().phase,'ended');
    clock.seek(0);clock.play();assert.equal(clock.snapshot().phase,'playing');
});
test('PDF clock survives long pauses and rejects invalid inputs without moving',()=>{
    let now=0;const clock=createPDFClock({pages:200,now:()=>now,settings:{configured:true,seconds:1}});clock.play();now=99.25;near(clock.snapshot().position,99.25);clock.pause();now=999;near(clock.snapshot().position,99.25);
    assert.throws(()=>clock.seek(201));near(clock.snapshot().position,99.25);assert.throws(()=>createPDFClock({pages:201,now:()=>0}));
    const options=normalizePDFSettings({bpm:NaN,seconds:0,pageBeats:{'-1':4,200:4,2:8}},200);assert.deepEqual(options.pageBeats,{'2':8});assert.equal(options.bpm,100);assert.equal(normalizePDFSettings(null).mode,'seconds');
});
test('PDF byte budget, header and digest are independent of names and preserve exact bytes',async()=>{
    const raw=fs.readFileSync(new URL('./fixtures/viewer-pdf/mixed.pdf',import.meta.url)),a=pdfBytes(raw),hash=await pdfHash(a);raw[0]=0;assert.equal(a[0],37);assert.equal(hash.length,64);
    assert.throws(()=>pdfBytes(new Uint8Array(MAX_PDF_BYTES+1)),/byte-limit/);assert.throws(()=>pdfBytes(new Uint8Array([37,80])),/invalid-pdf/);
});
const require=createRequire(process.env.STUDIO_TEST_RUNTIME||import.meta.url);let IDBFactory;try{({IDBFactory}=require('fake-indexeddb'));}catch{}
test('PDF originals and preferences share the dedicated library without changing native records or presets',{skip:!IDBFactory},async()=>{
    const f=viewerFixture(),library=createViewerLibrary({indexedDB:new IDBFactory(),codec:f.contract.codec}),raw=fs.readFileSync(new URL('./fixtures/viewer-pdf/mixed.pdf',import.meta.url)),score=await f.contract.codec.encode(f.score,f.metadata);
    await library.save(score.text);await library.savePreset('test','preset');const row=await library.savePDF(raw,{name:'test.pdf',pages:3});await library.savePDF(raw,{name:'test.pdf',pages:3});
    assert.equal((await library.list()).length,2);assert.deepEqual(Buffer.from((await library.read(row.documentId)).bytes),raw);assert.equal((await library.read(row.documentId)).kind,'pdf');
    assert.equal((await library.read(f.metadata.documentId)).decoded.byteHash,score.byteHash);assert.equal((await library.listPresets()).length,1);
    await library.savePreferences(row.documentId,row.revisionId,{kind:'pdf',zoom:1.5,settings:{seconds:30}});assert.equal((await library.readPreferences(row.documentId,row.revisionId)).zoom,1.5);
    assert.deepEqual(Buffer.from((await library.read(row.documentId)).bytes),raw);await library.close();
});
