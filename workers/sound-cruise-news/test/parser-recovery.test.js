import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {setup,cases,at,html} from './discovery-case.js';
import {pepper} from './helpers.js';
import {localDatabase} from '../scripts/local-db.mjs';
import {recheckFacts} from '../src/facts-recheck.js';
import {candidateSnapshot} from '../src/operator-review.js';
import {resolvedRecoverySurface} from '../src/facts-readiness.js';
import {recoveryBudget} from '../src/recovery-budget.js';
import {PRIMARY_ANNOUNCEMENT_PARSER} from '../src/primary-announcement.js';
import {initializePending} from '../src/pending-lifecycle.js';
const actor={type:'system_repair',id:'news-approved-recovery'};
async function prepare(db){
 const x=await setup({list:[cases[0]],db,render:()=>'<html>no recoverable facts</html>'});await x.run();
 const row=await x.s.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(cases[0].id).first();
 const input={id:row.id,revision:row.review_revision,snapshot:await candidateSnapshot(row),requestId:crypto.randomUUID()};
 const surface=await resolvedRecoverySurface(x.s,row,x.source);
 const approval={id:crypto.randomUUID(),candidateId:row.id,sourceId:row.source_id,sourceUrl:row.source_url,snapshot:input.snapshot,revision:input.revision,parserVersion:surface.parser,pipelineVersion:PRIMARY_ANNOUNCEMENT_PARSER,issuedAt:at+1,expiresAt:at+60001,maxArticleRequests:1,reason:'Explicit operator permission for one recovery request'};
 let requests=0;
 const options={recoveryApproval:approval,sleep:async()=>{},fetcher:async u=>{if(u===row.source_url){requests++;return new Response(html(cases[0]),{headers:{'content-type':'text/html'}});}assert.equal(u,x.source.robotsUrl);return new Response('User-agent: *\nAllow: /');}};
 return {...x,row,input,approval,options,requests:()=>requests};
}
async function spend(x){for(let i=1;i<6;i++)await x.s.db.prepare("INSERT INTO news_facts_sources(source_id,lease_token,checked_at,outcome) VALUES(?,?,?,'facts_timeout')").bind(x.source.id+':spent:'+i,'test',at).run();}
async function run(x,options=x.options,input=x.input,time=at+2){return recheckFacts(x.s,input,time,x.registry,pepper,actor,options);}
test('persistent D1: approved single recovery bypasses only internal budget, READY, replay and restart preserve publication/ledger',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'news-parser-recovery-'));let runtime;
 try{runtime=await localDatabase(dir);const x=await prepare(runtime.db);await spend(x);
 const normal=await run(x,{...x.options,recoveryApproval:undefined},{...x.input,requestId:crypto.randomUUID()});assert.equal(normal.outcome,'facts_primary_evidence_unchanged');assert.equal(x.requests(),0);
 const result=await run(x);assert.equal(result.outcome,'facts_recovered');assert.equal(result.validation.valid,true);assert.equal(x.requests(),1);assert.equal((await recoveryBudget(x.s,x.source,at+2)).used,6);
 assert.equal((await run(x)).replayed,true);assert.equal(x.requests(),1);
 const after=await x.s.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(x.row.id).first();assert.equal(after.review_status,'pending');
 const attempt=await x.s.db.prepare('SELECT proof_json FROM news_facts_sources WHERE source_id=?').bind(x.source.id+':recovery:'+x.approval.id).first();assert.equal(JSON.parse(attempt.proof_json).recoveryApproval.actorType,'system_repair');
 await runtime.mf.dispose();runtime=await localDatabase(dir);x.s.db=runtime.db;assert.equal((await run(x)).replayed,true);assert.equal(x.requests(),1);
 for(const table of ['news_decision_ledger','news_operator_feedback'])assert.equal((await runtime.db.prepare('SELECT COUNT(*) n FROM '+table).first()).n,0);
 }finally{await runtime?.mf.dispose();await rm(dir,{recursive:true,force:true});}
});
for(const patch of [{expiresAt:at},{expiresAt:at+3600002},{candidateId:'other'},{revision:9},{sourceUrl:'https://evil.test/'},{snapshot:'0'.repeat(64)},{parserVersion:'unknown'},{pipelineVersion:'other'},{maxArticleRequests:2}])test('recovery grant rejects invalid scope/expiry '+JSON.stringify(patch),async()=>{const x=await prepare();await assert.rejects(run(x,{...x.options,recoveryApproval:{...x.approval,...patch}}),/facts_recovery_approval_invalid/);assert.equal(x.requests(),0);});
test('public input cannot grant recovery, nor can system_recheck or fixture actor',async()=>{
 const x=await prepare();await assert.rejects(run(x,x.options,{...x.input,recoveryApproval:x.approval}),/facts_request_invalid/);
 for(const type of ['system_recheck','fixture'])await assert.rejects(recheckFacts(x.s,x.input,at+2,x.registry,pepper,{type,id:'test'},x.options),/facts_recovery_approval_invalid/);
 assert.equal(x.requests(),0);
});
test('failed grant is consumed; concurrent execution and alternate request ID cannot multiply GETs',async()=>{
 const x=await prepare();let count=0;const options={...x.options,fetcher:async u=>{if(u===x.row.source_url){count++;return new Response('<html>no facts</html>',{headers:{'content-type':'text/html'}});}return new Response('User-agent: *\nAllow: /');}};
 const outputs=await Promise.allSettled([run(x,options),run(x,options,{...x.input,requestId:crypto.randomUUID()})]);assert.equal(count,1);assert(outputs.some(r=>r.status==='fulfilled'));
 await run(x,options,{...x.input,requestId:crypto.randomUUID()});assert.equal(count,1);
 assert.equal((await x.s.db.prepare('SELECT COUNT(*) n FROM news_facts_sources WHERE source_id=?').bind(x.source.id+':recovery:'+x.approval.id).first()).n,1);
});
for(const state of ['disabled=1','takedown=1','backoff_until='+String(at+86400000)])test('recovery never bypasses source protection '+state,async()=>{
 const x=await prepare();await x.s.db.prepare('UPDATE source_state SET '+state+' WHERE source_id=?').bind(x.source.id).run();await assert.rejects(run(x),/facts_source_gate/);assert.equal(x.requests(),0);
});
test('robots prohibition remains effective under an approved recovery',async()=>{
 const x=await prepare();const result=run(x,{...x.options,fetcher:async()=>new Response('User-agent: *\nDisallow: /')});await assert.rejects(result,/facts_source_gate/);assert.equal(x.requests(),0);
});
test('parser upgrade requeues a week-long backoff promptly; spent normal budget schedules next calendar day instead',async()=>{
 const x=await prepare(),old=JSON.parse((await x.s.db.prepare('SELECT provenance_json FROM news_facts_rechecks WHERE candidate_id=? ORDER BY checked_at DESC LIMIT 1').bind(x.row.id).first()).provenance_json);old[0].parserVersion='shimamura-product-fields-7';old[0].extractionMethod='explicit_shimamura_product_fields';
 await x.s.db.prepare('UPDATE news_facts_rechecks SET provenance_json=? WHERE candidate_id=?').bind(JSON.stringify(old),x.row.id).run();
 await x.s.db.prepare("UPDATE news_pending_lifecycle SET next_recheck_at=?,last_recheck_result='facts_identity_changed' WHERE candidate_id=?").bind(at+7*86400000,x.row.id).run();
 await initializePending(x.s,at+2);assert.equal((await x.s.db.prepare('SELECT next_recheck_at FROM news_pending_lifecycle WHERE candidate_id=?').bind(x.row.id).first()).next_recheck_at,at+2);
 await spend(x);await x.s.db.prepare('UPDATE news_pending_lifecycle SET next_recheck_at=? WHERE candidate_id=?').bind(at+7*86400000,x.row.id).run();await initializePending(x.s,at+3);
 assert.equal((await x.s.db.prepare('SELECT next_recheck_at FROM news_pending_lifecycle WHERE candidate_id=?').bind(x.row.id).first()).next_recheck_at,(await recoveryBudget(x.s,x.source,at+3)).nextAt);
});
for(const fallback of [false,true])test('a prior upgrade of another parser does not consume this parser upgrade; fallback diagnostics also invalidate old failures '+fallback,async()=>{
 const x=await prepare(),surface=await resolvedRecoverySurface(x.s,x.row,x.source),oldParser=surface.parser.replace(/\d+$/,n=>Number(n)-1);
 const previous=await x.s.db.prepare('SELECT * FROM news_facts_sources WHERE instr(source_id,?)=1 ORDER BY checked_at DESC LIMIT 1').bind(x.source.id+':').first();
 const proof=JSON.parse(previous.proof_json);proof.failureReason='facts_identity_changed';
 if(fallback){proof.extractionMethod='explicit_primary_announcement_fields';proof.parserVersion=PRIMARY_ANNOUNCEMENT_PARSER;proof.parserFailures=[{parser:oldParser,reason:'facts_identity_changed'}];}
 else {proof.extractionMethod=surface.method;proof.parserVersion=oldParser;delete proof.parserFailures;}
 await x.s.db.prepare('UPDATE news_facts_sources SET source_id=?,proof_json=? WHERE source_id=?').bind(x.source.id+':upgrade:'+x.row.id+':old-upgrade',JSON.stringify(proof),previous.source_id).run();
 const r=await run(x,{...x.options,recoveryApproval:undefined});assert.equal(r.outcome,'facts_recovered');assert.equal(r.validation.valid,true);assert.equal(x.requests(),1);
});
test('valid retained success bypasses acquisition even with an approved recovery; no grant is spent unnecessarily',async()=>{
 const x=await prepare();const result=await run(x);assert(result.validation.valid);assert.equal(x.requests(),1);
 const row=await x.s.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(x.row.id).first();
 const input={...x.input,revision:row.review_revision,snapshot:await candidateSnapshot(row),requestId:crypto.randomUUID()};
 const approval={...x.approval,id:crypto.randomUUID(),snapshot:input.snapshot,revision:input.revision};
 const r=await run(x,{...x.options,recoveryApproval:approval},input);assert.equal(r.outcome,'facts_already_complete');assert.equal(x.requests(),1);
 assert.equal((await x.s.db.prepare('SELECT COUNT(*) n FROM news_facts_sources WHERE source_id=?').bind(x.source.id+':recovery:'+approval.id).first()).n,0);
});
test('fallback parser diagnostics requeue a future backoff without replacing evidence',async()=>{
 const x=await prepare();const proof={sourceId:x.source.id,sourceUrl:x.row.source_url,pipelineVersion:PRIMARY_ANNOUNCEMENT_PARSER,parserVersion:PRIMARY_ANNOUNCEMENT_PARSER,extractionMethod:'explicit_primary_announcement_fields',failureReason:'facts_identity_changed',parserFailures:[{parser:'shimamura-product-fields-7',reason:'facts_identity_changed'}]};
 await x.s.db.prepare('UPDATE news_facts_rechecks SET provenance_json=? WHERE candidate_id=?').bind(JSON.stringify([proof]),x.row.id).run();
 await x.s.db.prepare("UPDATE news_pending_lifecycle SET next_recheck_at=?,last_recheck_result='facts_identity_changed' WHERE candidate_id=?").bind(at+7*86400000,x.row.id).run();
 await initializePending(x.s,at+2);assert.equal((await x.s.db.prepare('SELECT next_recheck_at FROM news_pending_lifecycle WHERE candidate_id=?').bind(x.row.id).first()).next_recheck_at,at+2);assert.equal(x.requests(),0);
});
test('recovery expiry is checked again after robots delay, before the article GET',async()=>{
 const x=await prepare();const options={...x.options,recoveryApproval:{...x.approval,expiresAt:at+10},sleep:async()=>new Promise(r=>setTimeout(r,20))};
 const r=await run(x,options);assert.equal(r.outcome,'facts_recovery_approval_expired');assert.equal(x.requests(),0);
});
