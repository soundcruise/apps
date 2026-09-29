import test from 'node:test';
import assert from 'node:assert/strict';
import {loadNews,loadConfiguredNews} from './news-provider.js';
import {NEWS_BETA_ITEMS} from './data/news-beta.js';
test('default provider preserves JP2A fixture and never invokes transport',async()=>{
 assert.deepEqual(await loadNews({transport:()=>{throw new Error('unexpected transport');}}),NEWS_BETA_ITEMS);
});
test('future API boundary is explicit and projects only canonical fields',async()=>{
 await assert.rejects(loadNews({provider:'api'}));
 await assert.rejects(loadNews({provider:'api',transport:async()=>({})}));
 const items=await loadNews({provider:'api',transport:async()=>({contractVersion:1,items:[{...NEWS_BETA_ITEMS[0],publishable:true,internal:'discard'}]})});
 assert.equal(items[0].internal,undefined);assert.equal(items[0].manualReviewStatus,'approved');
});

test('API requires explicit publishability and validates unsafe fields',async()=>{
 const api=items=>loadNews({provider:'api',transport:async()=>({contractVersion:1,items})});
 for(const patch of [{publishable:false},{label:'<img src=x>'},{sourceUrl:'javascript:alert(1)'},{category:'unexpected'},{publishedAt:'invalid'}])await assert.rejects(api([{...NEWS_BETA_ITEMS[0],publishable:true,...patch}]));
});
test('disabled API does not fall back to fixture',async()=>{
 await assert.rejects(loadNews({provider:'api',transport:async()=>({disabled:true,items:[]})}),{name:'NewsDisabledError'});
});

test('production provider follows bounded canonical pagination without credentials or publisher fetch',async()=>{
 const calls=[];
 const result=await loadConfiguredNews({provider:'api',fetcher:async(url,options)=>{
  calls.push(url);assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');assert.equal(options.redirect,'error');
  const offset=Number(new URL(url).searchParams.get('offset'));
  return Response.json({contractVersion:1,items:Array.from({length:offset===0?50:1},(_,i)=>({...NEWS_BETA_ITEMS[0],id:`api-${offset+i}`,publishable:true})),nextOffset:offset===0?50:null});
 }});
 assert.equal(result.items.length,51);assert.equal(result.mode,'on');assert.equal(calls.length,2);
 assert.ok(calls.every(url=>new URL(url).hostname==='sound-cruise-news.cruise-port-requests.workers.dev'));
});
test('production failure, disabled response and invalid pagination never resurrect static fixtures',async()=>{
 await assert.rejects(loadConfiguredNews({provider:'api',fetcher:async()=>Response.json({disabled:true,items:[]},{status:503})}),{name:'NewsDisabledError'});
 await assert.rejects(loadConfiguredNews({provider:'api',fetcher:async()=>{throw Error('offline');}}),/offline/);
 await assert.rejects(loadConfiguredNews({provider:'api',fetcher:async()=>Response.json({contractVersion:1,items:[],nextOffset:0})}),/pagination/);
});
test('configured fixture mode has no request; production empty response remains empty',async()=>{
 const fixture=await loadConfiguredNews({provider:'fixture',fetcher:async()=>{throw Error('unexpected request');}});
 assert.deepEqual(fixture.items,NEWS_BETA_ITEMS);assert.equal(fixture.mode,'beta');
 const live=await loadConfiguredNews({provider:'api',fetcher:async()=>Response.json({contractVersion:1,items:[],nextOffset:null})});
 assert.deepEqual(live.items,[]);assert.equal(live.mode,'on');
});

test('API provider follows stable cursors without offsets and rejects cursor loops',async()=>{
 const cursor=JSON.stringify(['2026-09-27T00:00:00.000Z','last-id']);
 const calls=[];
 const result=await loadConfiguredNews({provider:'api',fetcher:async url=>{
  const u=new URL(url);calls.push(u);
  return Response.json({contractVersion:1,items:[{...NEWS_BETA_ITEMS[0],id:calls.length===1?'first':'second',publishable:true}],nextOffset:calls.length===1?50:null,nextCursor:calls.length===1?cursor:null});
 }});
 assert.equal(result.items.length,2);assert.equal(calls[1].searchParams.get('cursor'),cursor);assert.equal(calls[1].searchParams.has('offset'),false);
 await assert.rejects(loadConfiguredNews({provider:'api',fetcher:async()=>Response.json({contractVersion:1,items:[],nextCursor:cursor})}),/pagination/);
});
