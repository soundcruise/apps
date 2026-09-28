import test from 'node:test';
import assert from 'node:assert/strict';
import {loadNews} from './news-provider.js';
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
