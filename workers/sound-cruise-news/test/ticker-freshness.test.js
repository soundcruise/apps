import test from 'node:test';
import assert from 'node:assert/strict';
import {collectSource} from '../src/collector.js';
import {reviewCandidate} from '../src/review.js';
import {handleNewsRequest} from '../src/worker.js';
import {administer} from '../src/admin.js';
import {store,source,registry,now,options,approval,pepper,env} from './helpers.js';

test('public ticker reserves latest, shares Port selection, and cannot resurrect deleted/stopped rows',async()=>{
 const s=await store();await collectSource(source.id,s,options());const original=(await s.candidates())[0];await reviewCandidate(s,approval(original),now,registry,pepper);
 const row=await s.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(original.id).first();
 // Isolated API fixture only: these clones do not establish publicationValidation.
 await s.db.prepare('DELETE FROM candidate_items').run();
 const ids=[];
 for(let i=0;i<7;i++){
  const id=(i+1).toString(16).padStart(64,'0');ids.push(id);
  const copy={...row,id,source_url:source.baseUrl+'ticker-'+i+'/',normalized_url:source.baseUrl+'ticker-'+i+'/',topic_key:'ticker-'+i,published_at:new Date(now-(i?3+i/10:0.1)*86400000).toISOString(),label:i?'合成メーカー、限定ギターを発表':'合成ギターの試奏記事を公開',product_facts:null};
  const keys=Object.keys(copy);await s.db.prepare('INSERT INTO candidate_items('+keys.join(',')+') VALUES('+keys.map(()=>'?').join(',')+')').bind(...keys.map(k=>copy[k])).run();
 }
 const map=new Map(),cache={match:async k=>map.get(k.url)?.clone(),put:async(k,v)=>{assert.match(k.url,/category-editor-2-fresh-slot/);map.set(k.url,v.clone());}};
 const get=async()=>handleNewsRequest(new Request('http://localhost/v1/news/ticker'),env(s.db),now,{registry,cache});
 const before=(await s.db.prepare('SELECT COUNT(*) n FROM news_decision_ledger').first()).n;
 const result=await (await get()).json();assert.equal(result.items.length,5);assert.equal(result.items[0].id,ids[0]);
 const {tickerNews,prepareNews}=await import('../../../apps/cruise-port/news-data.js');
 const port=prepareNews(result.items.map(i=>({...i,topicKey:i.id,createdAt:i.publishedAt,updatedAt:i.publishedAt,sourceSafety:'safe',sourceKind:'official',manualReviewStatus:'approved'})),{now,mode:'on'});
 assert.deepEqual(tickerNews(port,now).map(i=>i.id),result.items.map(i=>i.id));
 assert.equal((await s.db.prepare('SELECT COUNT(*) n FROM news_decision_ledger').first()).n,before);
 await administer(s,{action:'item-delete',target:ids[0],reason:'owner_request'},now,registry);
 assert.ok(!(await (await get()).json()).items.some(i=>i.id===ids[0]));
 await administer(s,{action:'source-disable',target:source.id,reason:'owner_request'},now,registry);
 assert.deepEqual((await (await get()).json()).items,[]);
 await administer(s,{action:'api-off',reason:'operator_stop'},now,registry);
 const off=await get();assert.equal(off.status,503);assert.equal((await off.json()).disabled,true);
});
