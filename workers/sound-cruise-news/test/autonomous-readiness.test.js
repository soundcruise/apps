import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {cases,at,setup as daily,html} from './discovery-case.js';
import {setup,put,approveInput,source,now} from './operator-case.js';
import {pepper,store} from './helpers.js';
import {localDatabase} from '../scripts/local-db.mjs';
import {NewsStore} from '../src/store.js';
import {getSource,evidenceGate} from '../src/registry.js';
import {hash,DAY} from '../src/policy.js';
import {publicationValidation} from '../src/decision-policy.js';
import {reviewDetail,reviewQueue,candidateSnapshot,operatorDecision} from '../src/operator-review.js';
import {runPendingRechecks,initializePending} from '../src/pending-lifecycle.js';
import {recheckFacts,verifiedSurface} from '../src/facts-recheck.js';
import {recoveryBudget} from '../src/recovery-budget.js';
import {restoreSystemResolution} from '../src/pending-resolution.js';
import {resumeTransientSource,publicationHealthAllowed,publicationHealthSQL} from '../src/source-health.js';
import {candidateFrom} from '../src/metadata.js';
import {preparationState} from '../src/preparation-state.js';
import {eventEndsAt} from '../src/event.js';
import {SHIMAMURA_PRODUCT_PARSER} from '../src/shimamura-product-evidence.js';
import {PRIMARY_ANNOUNCEMENT_PARSER} from '../src/primary-announcement.js';
const human={type:'human_operator',id:'access:fixture-owner'};
const row=(s,id)=>s.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(id).first();
async function request(s,r){return {id:r.id,revision:r.review_revision,snapshot:await candidateSnapshot(r),requestId:crypto.randomUUID()};}
async function freshCases(count){
 const list=[];for(let i=0;i<count;i++){
  const c=structuredClone(cases[0]);c.sourceUrl=c.sourceUrl.replace(/\d+\/$/,`${800001+i}/`);c.id=await hash(c.sourceUrl);
  c.facts.brand='Craft Instruments';c.facts.product=`NX${200+i}`;c.facts.models=[c.facts.product];list.push(c);
 }return list;
}
test('persistent D1: daily collection prepares six new articles, carries seventh, survives restart; never publishes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'news-autonomous-ready-'));let runtime;
 try{
  runtime=await localDatabase(dir);const list=await freshCases(7),x=await daily({list,db:runtime.db});
  const out=await x.run();assert.equal(out.results.find(r=>r.sourceId==='shimamura').initialRecovery.ready,6);
  let queue=await reviewQueue(x.s,{now:at,registry:x.registry,pepper});assert.equal(queue.filter(r=>r.preparationState==='READY').length,6);
  assert.equal(queue.filter(r=>r.preparationState==='RETRY').length,1);
  assert.equal(x.calls.filter(u=>list.some(c=>c.sourceUrl===u)).length,6);
  assert.equal((await recoveryBudget(x.s,x.registry.find(s=>s.id==='shimamura'),at)).used,6);
  assert.equal((await runtime.db.prepare('SELECT COUNT(*) n FROM candidate_items WHERE review_status<>\'pending\'').first()).n,0);
  await runtime.mf.dispose();runtime=await localDatabase(dir);
  const resumed=await daily({list,db:runtime.db});await resumed.run(at+DAY);
  queue=await reviewQueue(resumed.s,{now:at+DAY,registry:resumed.registry,pepper});assert.equal(queue.filter(r=>r.preparationState==='READY').length,7);
  assert.equal(resumed.calls.filter(u=>list.some(c=>c.sourceUrl===u)).length,1);
  for(const table of ['news_decision_ledger','news_operator_feedback','news_presentation_days'])assert.equal((await runtime.db.prepare('SELECT COUNT(*) n FROM '+table).first()).n,0);
  // Each Shadow is evidence about the current snapshot, never an approval.
  assert((await runtime.db.prepare('SELECT COUNT(*) n FROM news_shadow_evaluations').first()).n>0);
 }finally{await runtime?.mf.dispose();await rm(dir,{recursive:true,force:true});}
});
test('primary reservation is atomic across competing recoveries; sixth slot cannot be spent twice',async()=>{
 const list=await freshCases(2),x=await daily({list});await x.run();
 await x.s.db.prepare('DELETE FROM news_facts_sources').run();await x.s.db.prepare('DELETE FROM news_facts_rechecks').run();
 await x.s.db.prepare('UPDATE news_discovery_work SET evidence_json=NULL').run();
 await x.s.db.prepare('UPDATE candidate_items SET product_facts=NULL,facts_provenance=NULL,review_revision=review_revision+1').run();
 for(let i=0;i<5;i++)await x.s.db.prepare("INSERT INTO news_facts_sources(source_id,lease_token,checked_at,outcome) VALUES(?,?,?,'facts_timeout')").bind('shimamura:spent:'+i,'test',at).run();
 const rows=await Promise.all(list.map(c=>row(x.s,c.id))),a=x.registry.find(s=>s.id==='shimamura');let articleCalls=0;
 const options={sleep:async()=>{},fetcher:async u=>{const c=list.find(c=>c.sourceUrl===u);if(c)articleCalls++;return new Response(c?html(c):'User-agent: *\nAllow: /',{headers:{'content-type':c?'text/html':'text/plain'}});}};
 const results=await Promise.all(rows.map(async r=>recheckFacts(x.s,await request(x.s,r),at,x.registry,pepper,human,options)));
 assert.equal(articleCalls,1);assert.equal((await recoveryBudget(x.s,a,at)).used,6);assert.equal(results.filter(r=>r.outcome==='facts_daily_budget_deferred').length,1);
});
test('a large pending queue is processed in bounded, progressing windows instead of validating every proof before the first repair',async()=>{
 const s=await setup();for(let i=0;i<100;i++)await put(s,'queued-'+String(i).padStart(3,'0'),{productFacts:null});
 const options={recover:async()=>({outcome:'facts_not_recovered',publisherAttempted:false}),shadow:async()=>{}};
 const first=await runPendingRechecks(s,now,[source],pepper,options);assert.equal(first.due,100);assert.equal(first.scanned,16);assert.equal(first.scanLimited,true);assert.equal(first.items.length,4);
 const second=await runPendingRechecks(s,now,[source],pepper,options);assert.equal(second.due,96);assert.equal(second.scanned,16);assert(second.items.every(r=>!first.items.some(old=>old.id===r.id)));
 assert.equal((await s.db.prepare('SELECT COUNT(*) n FROM candidate_items WHERE review_status<>\'pending\'').first()).n,0);
});
test('parser failure is retried after a bounded interval and repairs itself without a manual confirmation',async()=>{
 const x=await daily({list:[cases[0]],render:c=>html(c).replace('ボディ、ネック、指板、フレット、ピックアップ、ブリッジ','補足情報')});await x.run();
 const r=await row(x.s,cases[0].id),l=await x.s.db.prepare('SELECT * FROM news_pending_lifecycle WHERE candidate_id=?').bind(r.id).first();
 assert.equal(l.recheck_status,'PARSER_RETRY');assert.equal(l.recheck_attempt_count,0,'cached failure did not make another publisher request');assert(l.next_recheck_at>at);const before=x.calls.length;
 await x.run(at+DAY,'17 * * * *');assert.equal(x.calls.length,before);
 x.render=html;await x.run(l.next_recheck_at,'17 * * * *');
 const detail=await reviewDetail(x.s,r.id,l.next_recheck_at,x.registry,pepper);assert.equal(detail.preparationState,'READY');
 assert.equal(x.calls.filter(u=>u===r.source_url).length,2);assert.equal((await row(x.s,r.id)).review_status,'pending');
});
test('source transient failure resumes after backoff, but operator stop and permission failures do not',async()=>{
 for(const reason of ['upstream_error','request_timeout','http_403','robots_changed_review','redirect_blocked','listing_optout','manual']){
  const s=await store(),a={...getSource('shimamura'),enabled:true,productionEnabled:true};assert.equal(evidenceGate(a,at),null);
  await s.db.prepare('INSERT INTO source_state(source_id,disabled,backoff_until) VALUES(?,1,?)').bind(a.id,at+100).run();
  await s.log({sourceId:a.id,startedAt:at,requests:1,candidates:0,pending:0,rejected:0,duplicates:0,outcome:reason==='manual'?'upstream_error':reason,durationMs:1});
  await s.recordHealth({sourceId:a.id,status:'warning',reasonCode:'upstream_error',checkedAt:at,successfulAt:at-1000});
  if(reason==='manual')await s.db.prepare("INSERT INTO news_admin_audit VALUES(?,'source-collection-stop',?,?,'operator_stop')").bind(crypto.randomUUID(),a.id,at).run();
  assert.equal(await resumeTransientSource(s,a,at+50),false);
  assert.equal(await resumeTransientSource(s,a,at+101),['upstream_error','request_timeout'].includes(reason));
 }
});
test('an actual scheduled 503 recovers through the next normal collection and produces READY without a manual source-enable',async()=>{
 const x=await daily({list:[cases[0]]});let failedCalls=0;
 const failed=await x.run(at,'0 21 * * *',{fetcher:async()=>{failedCalls++;return new Response(null,{status:503});}});
 assert.equal(failed.results.find(r=>r.sourceId==='shimamura').outcome,'upstream_error');assert.equal(failedCalls,1);assert.equal((await x.s.state('shimamura')).disabled,false);
 await x.run(at+1000);assert.equal(x.calls.length,0);
 await x.run(at+DAY);assert.equal((await x.s.state('shimamura')).failures,0);assert.equal(x.calls.length,3);
 assert.equal((await reviewDetail(x.s,cases[0].id,at+DAY,x.registry,pepper)).preparationState,'READY');
 assert.equal((await x.s.db.prepare('SELECT COUNT(*) n FROM news_decision_ledger').first()).n,0);
});
test('verified candidate remains READY during transient health warning; permission/robots stop still blocks final decision',async()=>{
 const s=await setup(),item=await put(s);await s.db.prepare('INSERT OR REPLACE INTO source_state(source_id,backoff_until,failures,next_at) VALUES(?,?,3,?)').bind(source.id,now+DAY,now+DAY).run();
 await s.recordHealth({sourceId:source.id,status:'warning',reasonCode:'upstream_error',checkedAt:now});
 assert((await publicationValidation(s,await row(s,item.id),now,[source],pepper)).valid);
 const input=await approveInput(s,item);
 await s.recordHealth({sourceId:source.id,status:'http_blocked',reasonCode:'http_403',checkedAt:now+1});
 await assert.rejects(operatorDecision(s,input,now+1,[source],pepper,human),/operator_source_gate/);
 assert.equal((await s.db.prepare('SELECT COUNT(*) n FROM news_decision_ledger').first()).n,0);
});
test('JS health eligibility matches the final atomic SQL health predicate',async()=>{
 const s=await setup();for(const [status,reason]of [['healthy','ok'],['warning','upstream_error'],['error','collector_repeated_failure'],['structure_changed','listing_structure_changed'],['http_blocked','http_403'],['warning','maintenance_redirect'],['robots_changed','robots_changed_review']]){
  await s.recordHealth({sourceId:source.id,status,reasonCode:reason,checkedAt:now});
  const health=(await s.sourceHealth())[0],sql=await s.db.prepare('SELECT 1 FROM source_health WHERE source_id=? AND '+publicationHealthSQL+' AND last_successful_run_at<=?').bind(source.id,now).first();
  assert.equal(publicationHealthAllowed(health,now),!!sql,reason);
 }
});
test('stable provenance accepts compatible parser evolution, rejects changed facts, missing fields, bad versions and malformed JSON',async()=>{
 const x=await daily({list:[cases[0]]});await x.run();const original=await row(x.s,cases[0].id),proof=JSON.parse(original.facts_provenance);
 const evolved=proof.map(p=>({...p,parserVersion:p.extractionMethod==='explicit_primary_announcement_fields'?'primary-announcement-6':'shimamura-product-fields-13'}));
 const compatible={...original,facts_provenance:JSON.stringify(evolved)};assert((await publicationValidation(x.s,compatible,at,x.registry,pepper)).valid);
 const changes=[{...compatible,product_facts:JSON.stringify({...JSON.parse(original.product_facts),brand:'Other Instruments'})},
  {...compatible,facts_provenance:JSON.stringify(evolved.slice(1))},
  {...compatible,facts_provenance:JSON.stringify(evolved.map(p=>({...p,parserVersion:p.extractionMethod==='explicit_primary_announcement_fields'?'shimamura-product-fields-13':'primary-announcement-6',extractionMethod:p.extractionMethod==='explicit_primary_announcement_fields'?'explicit_shimamura_product_fields':'explicit_primary_announcement_fields'})))},
  {...compatible,facts_provenance:JSON.stringify(evolved.map(p=>({...p,parserVersion:'shimamura-product-fields-4'})))},
  {...compatible,facts_provenance:'{broken'}];
 for(const r of changes)assert((await publicationValidation(x.s,r,at,x.registry,pepper)).errors.includes('facts_provenance_invalid'));
 await x.s.db.prepare('UPDATE candidate_items SET facts_provenance=? WHERE id=?').bind('{broken',original.id).run();
 assert.equal((await reviewDetail(x.s,original.id,at,x.registry,pepper)).validation.valid,false);
});
test('objective duplicate cleanup has a protected, authenticated return-to-review path; human verdicts are never reopened',async()=>{
 const s=await setup(),id=await hash('autonomous-cleanup');await put(s,'first',{id});await put(s,'second',{id:await hash('retained-original')});
 await s.db.prepare("UPDATE candidate_items SET review_status='approved' WHERE id<>?").bind(id).run();
 await runPendingRechecks(s,now,[source],pepper,{resolveObjective:true,fetcher:()=>{throw Error('unnecessary_fetch');}});
 let r=await row(s,id);assert.equal(r.reviewed_by,'system_policy');assert.equal(r.review_status,'rejected');
 const input={id,snapshot:await candidateSnapshot(r),requestId:crypto.randomUUID()};
 await assert.rejects(restoreSystemResolution(s,input,now,[source],pepper,human),/still_blocked/);
 await s.db.prepare('DELETE FROM candidate_items WHERE id<>?').bind(id).run();
 await assert.rejects(restoreSystemResolution(s,input,now,[source],pepper,{type:'system_repair'}),/operator_resolution_invalid/);
 assert.equal((await restoreSystemResolution(s,input,now,[source],pepper,human)).replayed,false);
 assert.equal((await restoreSystemResolution(s,input,now,[source],pepper,human)).replayed,true);
 r=await row(s,id);assert.equal(r.review_status,'reopened');assert.equal(preparationState(r,await publicationValidation(s,r,now,[source],pepper)),'READY');
 const reject={id,revision:r.review_revision,snapshot:await candidateSnapshot(r),requestId:crypto.randomUUID(),action:'reject',reason:'operator_review'};
 await operatorDecision(s,reject,now,[source],pepper,human);
 await assert.rejects(restoreSystemResolution(s,{...input,requestId:crypto.randomUUID(),snapshot:await candidateSnapshot(await row(s,id))},now,[source],pepper,human),/not_system/);
});
test('Kikutani official new-product card survives unsupported brand/type grammar without fabricated facts or new HTTP surfaces',async()=>{
 const a={...getSource('kikutani'),enabled:true,productionEnabled:true},entry={title:'新興工房の「Studio Frame」の取扱いが始まります',url:a.discoveryUrl+'new-workshop-recorder/',date:'2026-10-01T00:00:00+09:00',listingSection:'official_news',listingTags:['新製品情報']};
 const {item}=await candidateFrom(entry,a,{isAllowed:()=>true},now,pepper);assert(item);assert.equal(item.productFacts,null);assert.equal(item.publicationDecision,'PUBLISH_REVIEW');
 assert.equal((await candidateFrom({...entry,listingTags:[]},a,{isAllowed:()=>true},now,pepper)).item,undefined);
 const s=await setup();await s.recordHealth({sourceId:a.id,status:'healthy',reasonCode:'ok',checkedAt:now,successfulAt:now});assert(await s.put(item));
 await runPendingRechecks(s,now,[a],pepper,{fetcher:()=>{throw Error('unapproved_detail_fetch');}});
 const detail=await reviewDetail(s,item.id,now,[a],pepper);assert.equal(detail.preparationState,'HUMAN_REVIEW');assert.equal(detail.lifecycle.next_recheck_at,null);
});
test('a known source-parser upgrade requeues an old terminal failure even when the shared pipeline is unchanged',async()=>{
 const x=await daily({list:[cases[0]]});await x.run();const r=await row(x.s,cases[0].id),previous='shimamura-product-fields-'+(Number(SHIMAMURA_PRODUCT_PARSER.split('-').at(-1))-1);
 const proof={sourceId:r.source_id,sourceUrl:r.source_url,pipelineVersion:PRIMARY_ANNOUNCEMENT_PARSER,parserVersion:previous,extractionMethod:'explicit_shimamura_product_fields',failureReason:'facts_parser_failure'};
 await x.s.db.prepare("UPDATE news_facts_rechecks SET provenance_json=?,checked_at=? WHERE candidate_id=?").bind(JSON.stringify([proof]),at+1,r.id).run();
 await x.s.db.prepare("UPDATE news_pending_lifecycle SET next_recheck_at=NULL,last_recheck_result='facts_parser_failure' WHERE candidate_id=?").bind(r.id).run();
 await initializePending(x.s,at+2);assert.equal((await x.s.db.prepare('SELECT next_recheck_at FROM news_pending_lifecycle WHERE candidate_id=?').bind(r.id).first()).next_recheck_at,at+2);
});
test('an ended, date-bound event is automatically excluded, without changing a human verdict',async()=>{
 const s=await setup(),facts={kind:'guitar_event',category:'live_guitar',eventName:'Synthetic Guitar Show',eventDate:'2026-10-01',endDate:'2026-10-01',venue:'Synthetic Hall',artist:'Synthetic Artist'},id=await hash('ended-event');
 await put(s,'ended',{id,productFacts:facts,category:'live_guitar',eventType:'guitar_event',eventEndsAt:eventEndsAt(facts)});
 await runPendingRechecks(s,now,[source],pepper,{resolveObjective:true,fetcher:()=>{throw Error('must_not_fetch');}});
 const r=await row(s,id);assert.equal(r.review_status,'rejected');assert.equal(r.review_reason,'event_ended');assert.equal(r.reviewed_by,'system_policy');
 assert.equal((await s.db.prepare('SELECT COUNT(*) n FROM news_decision_ledger').first()).n,0);
});
test('persistent D1 system restoration rolls back on failed audit; replay and restart keep a single restoration and no publication',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'news-auto-restore-'));let runtime;
 try{
  runtime=await localDatabase(dir);const s=await store(runtime.db),id=await hash('restore-real-d1'),peer=await hash('restore-real-original');
  await s.db.prepare('UPDATE news_controls SET publication_enabled=1').run();await s.recordHealth({sourceId:source.id,status:'healthy',reasonCode:'ok',checkedAt:now,successfulAt:now});
  await put(s,'target',{id});await put(s,'original',{id:peer});await s.db.prepare("UPDATE candidate_items SET review_status='approved' WHERE id=?").bind(peer).run();
  await runPendingRechecks(s,now,[source],pepper,{resolveObjective:true});assert.equal((await row(s,id)).review_status,'rejected');
  await s.db.prepare('DELETE FROM candidate_items WHERE id=?').bind(peer).run();const input={id,snapshot:await candidateSnapshot(await row(s,id)),requestId:crypto.randomUUID()};
  await s.db.prepare("CREATE TRIGGER fixture_audit_fail BEFORE INSERT ON news_admin_audit WHEN NEW.action='pending-system-restore' BEGIN SELECT RAISE(ABORT,'fixture');END").run();
  await assert.rejects(restoreSystemResolution(s,input,now,[source],pepper,human));assert.equal((await row(s,id)).review_status,'rejected');
  await s.db.prepare('DROP TRIGGER fixture_audit_fail').run();await restoreSystemResolution(s,input,now,[source],pepper,human);
  assert.equal((await restoreSystemResolution(s,input,now,[source],pepper,human)).replayed,true);
  await runtime.mf.dispose();runtime=await localDatabase(dir);const restored=await row(new NewsStore(runtime.db),id);assert.equal(restored.review_status,'reopened');
  assert.equal((await runtime.db.prepare("SELECT COUNT(*) n FROM news_admin_audit WHERE action='pending-system-restore'").first()).n,1);
  assert.equal((await runtime.db.prepare('SELECT COUNT(*) n FROM news_decision_ledger').first()).n,0);
  const history=JSON.parse((await runtime.db.prepare('SELECT history_json FROM news_pending_lifecycle WHERE candidate_id=?').bind(id).first()).history_json);assert.equal(history.at(-1).actorId,human.id);
 }finally{await runtime?.mf.dispose();await rm(dir,{recursive:true,force:true});}
});
