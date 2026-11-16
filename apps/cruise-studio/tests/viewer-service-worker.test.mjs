import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash,webcrypto} from 'node:crypto';
const origin='http://127.0.0.1:18874',root=origin+'/apps/score-viewer/local/';
function setup(){
    const handlers={},stores=new Map(),requests=[],responses=new Map([['/apps/score-viewer/local/index.html','viewer'],['/apps/score-viewer/core/example.mjs','module']]);let claims=0;
    const assets=[...responses].map(([path,text])=>({path,sha256:createHash('sha256').update(text).digest('hex')}));
    const caches={async open(name){if(!stores.has(name))stores.set(name,new Map());const data=stores.get(name);return {async match(key){return data.get(key)?.clone();},async put(key,response){data.set(key,response.clone());}};},async keys(){return [...stores.keys()];},async delete(name){return stores.delete(name);}};
    const self={location:{origin},registration:{scope:root},clients:{async claim(){claims++;}},addEventListener(type,handler){handlers[type]=handler;}};
    vm.runInNewContext(fs.readFileSync(new URL('../../score-viewer/local/sw.js',import.meta.url),'utf8'),{self,importScripts(){self.VIEWER_LOCAL_ASSETS={version:'test',assets};},crypto:webcrypto,URL,Map,Promise,caches,fetch:async key=>{requests.push(key);const value=responses.get(new URL(key).pathname);if(value===undefined)throw Error('offline');return new Response(value);}});
    async function event(type,input={}){let promise;handlers[type]({...input,waitUntil(value){promise=value;}});return promise;}
    async function message(type,client=root+'index.html'){let answer;await event('message',{source:{url:client},ports:[{postMessage(value){answer=value;}}],data:{type}});return answer;}
    return {stores,caches,responses,requests,event,message,handlers,get claims(){return claims;}};
}
test('failed new offline installation cannot delete the complete preceding version or another app cache',async()=>{
    const f=setup();f.stores.set('cruise.viewer.local.old',new Map());f.stores.set('another-app',new Map());f.responses.delete('/apps/score-viewer/core/example.mjs');await assert.rejects(f.event('install'));
    assert(f.stores.has('cruise.viewer.local.old'));assert(f.stores.has('another-app'));assert.equal((await f.message('STATUS')).ready,false);assert.equal(f.claims,0);
});
test('complete activation retires only this viewer caches; corrupt contents are not ready until repaired',async()=>{
    const f=setup();f.stores.set('cruise.viewer.local.old',new Map());f.stores.set('another-app',new Map());await f.event('install');await f.event('activate');assert.equal(f.claims,1);assert(!f.stores.has('cruise.viewer.local.old'));assert(f.stores.has('another-app'));assert.equal((await f.message('STATUS')).ready,true);
    (await f.caches.open('cruise.viewer.local.test')).put(origin+'/apps/score-viewer/core/example.mjs',new Response('tampered'));assert.equal((await f.message('STATUS')).ready,false);assert.equal((await f.message('PREPARE')).ready,true);
});
test('worker ignores API/foreign/POST fetches and messages from outside the local viewer scope',async()=>{
    const f=setup();await f.event('install');let handled=0;
    for(const [url,method]of [[origin+'/v2/pro-auth','GET'],['https://example.invalid/a','GET'],[root+'index.html','POST']])f.handlers.fetch({request:{url,method},respondWith(){handled++;}});
    assert.equal(handled,0);assert.equal(await f.message('PREPARE',origin+'/'),undefined);assert(f.requests.every(u=>u.startsWith(origin+'/apps/')));
});
