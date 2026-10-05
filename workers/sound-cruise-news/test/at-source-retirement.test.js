import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,put,source,now} from './operator-case.js';
import {pepper} from './helpers.js';
import {getSource} from '../src/registry.js';
import {administer} from '../src/admin.js';
import {initializePending,runPendingRechecks} from '../src/pending-lifecycle.js';
import {candidateFrom} from '../src/metadata.js';
import {collectSource} from '../src/collector.js';
import {handleNewsRequest} from '../src/worker.js';
import {collectionHealth,intentionalSourceStop} from '../src/source-health.js';
const at={...getSource('at-distribution'),enabled:true,productionEnabled:true};
const registry=[source,at];
const stop=s=>administer(s,{action:'source-collection-stop',target:at.id,reason:'policy_change'},now,registry);
const publicItems=async s=>(await (await handleNewsRequest(new Request('https://example.invalid/v1/news'),{NEWS_DB:s.db,NEWS_API_MODE:'production'},now,{registry})).json()).items;
async function fixture(){
 const s=await setup();
 await s.recordHealth({sourceId:at.id,status:'healthy',reasonCode:'ok',checkedAt:now,successfulAt:now});
 const url='https://atdistribution.net/information/1047/';
 await put(s,'at-published',{sourceId:at.id,sourceName:at.name,sourceUrl:url,normalizedUrl:url,publishedAt:'2026-08-18T15:00:00.000Z',label:'Harrison Audio、FLEX 10を発表',productFacts:{brand:'Harrison Audio',product:'FLEX 10',version:null,category:'recording_audio',identifierBasis:'assessed_recording_listing',manufacturerSource:at.id}});
 await s.db.prepare("UPDATE candidate_items SET review_status='approved' WHERE id='at-published'").run();
 return s;
}
test('AT retirement preserves public article, all candidate fields, controls and other sources without teacher decisions',async()=>{
 const s=await fixture(),before=JSON.stringify(await s.candidates()),feed=await publicItems(s),controls=await s.controls(),other=await s.state(source.id);
 assert.equal(feed.length,1);await stop(s);
 assert.equal(JSON.stringify(await s.candidates()),before);assert.deepEqual(await publicItems(s),feed);
 assert.deepEqual(await s.state(source.id),other);
 const after=await s.controls();for(const key of ['api_enabled','collection_enabled','publication_enabled'])assert.equal(after[key],controls[key]);
 assert.equal((await s.state(at.id)).disabled,true);assert.equal((await s.state(at.id)).publicationBlocked,false);assert.equal(!!(await s.state(at.id)).takedown,false);
 for(const table of ['news_decision_ledger','news_operator_feedback','news_shadow_evaluations'])assert.equal((await s.db.prepare(`SELECT COUNT(*) n FROM ${table}`).first()).n,0);
});
test('scheduled AT collection performs zero fetches and intentional pause is healthy while real errors still warn',async()=>{
 const s=await fixture();await stop(s);
 const r=await collectSource(at.id,s,{mode:'production',requestMode:'scheduled',now,clock:()=>now,registry,pepper,fetcher:async()=>{throw Error('unexpected publisher fetch');},sleep:async()=>{}});
 assert.equal(r.requests,0);assert.equal(r.outcome,'source_disabled');
 assert.equal(await intentionalSourceStop(s,at.id),true);
 assert.equal(collectionHealth([{...r,intentionalDisabled:true}]).status,'healthy');
 assert.equal(collectionHealth([{outcome:'source_disabled',intentionalDisabled:false}]).status,'warning');
 assert.equal(collectionHealth([{outcome:'request_timeout'}]).status,'warning');
 const health=(await s.sourceHealth()).find(x=>x.source_id===at.id);assert.equal(health.status,'paused');assert.equal(health.reason_code,'source_disabled');
});
test('AT pending lifecycle terminates idempotently without recovery or Shadow and other-source Harrison stays eligible',async()=>{
 const s=await fixture();
 await put(s,'at-pending',{sourceId:at.id,sourceName:at.name,sourceUrl:'https://atdistribution.net/information/99999/',productFacts:null});
 await put(s,'other-harrison',{productFacts:{brand:'Harrison Audio',product:'FLEX 10',version:null,category:'recording_audio',identifierBasis:'assessed_recording_listing',manufacturerSource:at.id}});
 await initializePending(s,now);const candidates=JSON.stringify(await s.candidates());await stop(s);
 const row=()=>s.db.prepare("SELECT * FROM news_pending_lifecycle WHERE candidate_id='at-pending'").first();
 const closed=await row();assert.equal(closed.recheck_status,'SOURCE_EXCLUDED');assert.equal(closed.next_recheck_at,null);assert.equal(closed.lease_until,0);assert.equal(closed.lease_token,null);assert.equal(JSON.parse(closed.history_json).at(-1).actor,'source_policy');
 await stop(s);assert.equal((await row()).history_json,closed.history_json);
 let evaluations=[];await runPendingRechecks(s,now,registry,pepper,{recover:async(_s,item)=>{assert.notEqual(item.source_id,at.id);return {outcome:'facts_source_gate'};},shadow:async(_s,item)=>evaluations.push(item.id)});
 assert.ok(!evaluations.includes('at-pending'));assert.equal((await row()).recheck_attempt_count,0);assert.equal(JSON.stringify(await s.candidates()),candidates);
 // Other-source discovery is unchanged; its normal facts/review checks still apply.
 const entry={title:'Harrison Audio FLEX10 USBオーディオインターフェースを発表',url:'https://www.shimamura.co.jp/update/dtm-recording/2026/10/99999/',date:'2026-10-01T00:00:00+09:00',listingSection:'product_news',listingCategory:'dtm-recording'};
 const robots={isAllowed:()=>true};const before=await candidateFrom(entry,source,robots,now,pepper);assert.ok(before.item,JSON.stringify(before));
 const independent=await setup();await stop(independent);assert.equal(!!(await independent.state(source.id)).disabled,false);
 const after=await candidateFrom(entry,source,robots,now,pepper);assert.deepEqual(after,before);assert.ok(after.item);

 for(const table of ['news_decision_ledger','news_operator_feedback'])assert.equal((await s.db.prepare(`SELECT COUNT(*) n FROM ${table}`).first()).n,0);
});
