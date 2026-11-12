import test from 'node:test';
import assert from 'node:assert/strict';
import {readBookSource,bookSourceCurrent} from '../js/modules/sheet-cruise/book-source.mjs';
import {createMockAccountBookshelf} from '../scripts/mock-account-bookshelf.mjs';
const local={protocol:'http:',hostname:'127.0.0.1',port:'18874'};
const mock=()=>createMockAccountBookshelf(local,true);
test('synthetic read returns detached immutable folders and explicit forms without writing source',async()=>{
 const source=mock(),before=await source.read(),result=await readBookSource(source);
 assert.equal(result.catalogue.folders.length,2);assert.equal(result.catalogue.chords.length,4);
 assert.equal(result.catalogue.chords.filter(c=>c.name==='C').length,2);
 assert(Object.isFrozen(result.catalogue.chords[0].form.strings));
 assert.throws(()=>result.catalogue.chords[0].form.strings[0].relativeFret=8);
 assert.deepEqual(await source.read(),before);assert(bookSourceCurrent(source,result));
});
test('mock refuses other host, scheme, port and missing local marker',()=>{
 for(const location of [{...local,hostname:'soundcruise.jp'},{...local,protocol:'https:'},{...local,port:'18873'}])assert.throws(()=>createMockAccountBookshelf(location,true),/refused/);
 assert.throws(()=>createMockAccountBookshelf(local,false),/refused/);
});
test('read rejects changed account generation, source revision, revoked source and mismatched response',async()=>{
 for(const key of ['generation','revision','phase']){
  let current={...mock().getState()};const payload=await mock().read();
  const source={getState:()=>current,read:async()=>{current={...current,[key]:'changed'};return payload;}};
  await assert.rejects(readBookSource(source));assert(!bookSourceCurrent(source,payload));
 }
 const payload=await mock().read();await assert.rejects(readBookSource({getState:mock().getState,read:async()=>({...payload,revision:'other'})}));
});
test('late or aborted reads cannot publish to an old editing target',async()=>{
 for(const reason of ['abort','target']){
  let resolve,current=true;const controller=new AbortController(),source={getState:mock().getState,read:()=>new Promise(r=>resolve=r)};
  const request=readBookSource(source,{signal:controller.signal,isCurrent:()=>current});
  if(reason==='abort')controller.abort();else current=false;
  resolve(await mock().read());await assert.rejects(request);
 }
});
test('read rejects unexpected credential fields, malformed forms and oversized payloads',async()=>{
 for(const mutate of [v=>v.unexpected='reject',v=>v.catalogue.credentials='reject',v=>v.catalogue.chords[0].form.strings[0].relativeFret=99,v=>v.catalogue.folders[0].name='x'.repeat(600000)]){
  const payload=await mock().read();mutate(payload);
  await assert.rejects(readBookSource({getState:mock().getState,read:async()=>payload}));
 }
});
