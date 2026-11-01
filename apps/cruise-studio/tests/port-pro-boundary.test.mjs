import test from 'node:test';
import assert from 'node:assert/strict';
import {createPortProBoundary} from '../js/core/port-pro-boundary.mjs';

test('component stays closed without the formal entrance, regardless of a Pro UI flag',async()=>{
 const boundary=createPortProBoundary();assert.deepEqual(await boundary.authorize(),{ok:false,reason:'studio-entry-required'});boundary.dispose();assert.equal((await boundary.authorize()).ok,false);
});
test('failed entrance, disposal and invalidation cannot adopt a pending authorization',async t=>{
 const original=globalThis.CruiseStudio;t.after(()=>{if(original)globalThis.CruiseStudio=original;else delete globalThis.CruiseStudio;});
 let release;globalThis.CruiseStudio={entryAuth:{check:()=>new Promise(r=>release=r),isAuthorized:()=>true}};
 const boundary=createPortProBoundary(),pending=boundary.authorize();boundary.invalidate();release(true);assert.equal((await pending).ok,false);
 const second=boundary.authorize();boundary.dispose();release(true);assert.equal((await second).ok,false);
 globalThis.CruiseStudio.entryAuth={check:async()=>false,isAuthorized:()=>true};assert.equal((await createPortProBoundary().authorize()).ok,false);
});
