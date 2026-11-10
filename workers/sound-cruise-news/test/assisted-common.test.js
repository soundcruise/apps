import test from 'node:test';
import assert from 'node:assert/strict';
import {store,pepper} from './helpers.js';
import {SOURCES} from '../src/registry.js';
import {assistedSource,assistedProof} from '../src/assisted-facts.js';
import {prepareAssisted,saveAssisted} from '../src/assisted-entry.js';
import {saveHint,savedWebDraft,listWebHints} from '../src/web-discovery.js';
import {publicationValidation} from '../src/decision-policy.js';
import {candidateSnapshot,operatorDecision} from '../src/operator-review.js';
import {handleNewsRequest} from '../src/worker.js';
import {assessAutomatic} from '../src/automatic.js';
const now=Date.parse('2026-11-10T00:00:00Z'),actor={type:'human_operator',id:'isolated-confirmation'};
// Real discovery identity; dates and conditions below are isolated, simulated human inputs.
// This fixture is not evidence of an actual publisher agreement or production acceptance.
const url='https://www.yamaha.com/ja/news_release/2026/26110601/';
const estimate={category:'news_hint',brand:'ヤマハ',product:'Acompass 60',event:'新製品発売',value:'high',priority:'low',relevance:'high',duplicate:'unknown',reason:'公開日未確認'};
const input={sourceId:'yamaha-newsroom',url,brand:'ヤマハ',product:'Acompass 60',productType:'guitar_amp',action:'release',publishedAt:'2026-11-06',confirmed:true,conditionsConfirmed:true,requestId:'common-human-request-0001'};
async function setup(){const s=await store();await s.db.prepare('UPDATE news_controls SET publication_enabled=1').run();return s;}
const count=async(s,t)=>(await s.db.prepare('SELECT COUNT(*) n FROM '+t).first()).n;
const decision=async(s,r,action='approve')=>operatorDecision(s,{id:r.id,action,reason:action==='approve'?'useful_product':'not_new',requestId:'common-decision-'+r.id,revision:r.review_revision,snapshot:await candidateSnapshot(r),label:r.label,category:r.category,publishedAt:r.published_at,checks:{factsChecked:true,relevanceChecked:true,duplicateChecked:true,independentLabelChecked:true}},now,SOURCES,pepper,actor);
test('saved discovery → scoped human conditions/facts → READY → existing human Ledger/API, no Bot request',async()=>{
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('external_fetch_forbidden');};
 try{const s=await setup();await saveHint(s.db,{url,title:'検索ヒント',provider:'exa',searchedAt:now},now);await s.db.prepare('UPDATE news_web_hints SET estimate_json=?').bind(JSON.stringify(estimate)).run();
 const draft=await savedWebDraft(s.db,url,now);assert(draft.registrationAllowed);assert.equal(draft.usageBasis,'public_facts_conditions_review');assert.equal(draft.fields.publishedAt,'');assert.equal(draft.fields.productType,'');
 const view=await listWebHints({NEWS_DB:s.db,NEWS_WEB_ENABLED:'true'},now);assert.equal(view.items[0].humanEntry.sourceId,'yamaha-newsroom');assert.equal(await count(s,'candidate_items'),0);
 const saved=await saveAssisted(s,{...draft.fields,...input},now,SOURCES,pepper,actor);assert(saved.validation.valid);assert.equal(saved.publisherHttpRequests,0);
 const row=(await s.candidates())[0];assert(await assistedProof(s,row,now,SOURCES));const p=JSON.parse(row.facts_provenance);assert.equal(p.method,'human_public_facts_confirmation');assert.equal(p.conditionsConfirmed,true);assert.equal(p.usageBasis,'public_facts_conditions_review');assert.equal(p.responseHash,undefined);assert.equal(await count(s,'news_decision_ledger'),0);
 const automated=await assessAutomatic(s,row,SOURCES,now,pepper);assert.equal(automated.eligible,false);
 await decision(s,row);assert.equal(await count(s,'news_decision_ledger'),1);assert.equal((await s.db.prepare('SELECT actor_type FROM news_decision_ledger').first()).actor_type,'human_operator');
 const api=await handleNewsRequest(new Request('https://news.internal/v1/news'),{NEWS_DB:s.db,NEWS_API_MODE:'production'},now,{registry:SOURCES,cache:null});assert.equal((await api.json()).items[0].id,row.id);
 assert((await saveAssisted(s,input,now,SOURCES,pepper,actor)).replayed);assert.equal(await count(s,'candidate_items'),1);assert.equal(await count(s,'news_assisted_edits'),1);assert.equal(calls,0);
 }finally{globalThis.fetch=original;}
});
for(const patch of [{confirmed:false},{conditionsConfirmed:false},{conditionsConfirmed:undefined},{sourceId:'yamaha'},{publishedAt:''},{publishedAt:'2026-02-30'},{publishedAt:'2026-11-11'},{product:''},{productType:''}])test('unknown facts/conditions cannot be confirmed by AI: '+JSON.stringify(patch),async()=>{
 const s=await setup();assert.equal((await saveAssisted(s,{...input,...patch},now,SOURCES,pepper,actor)).valid,false);assert.equal(await count(s,'candidate_items'),0);
});
for(const bad of ['https://www.yamaha.com/ja/news_release/','https://www.yamaha.com.evil.test/ja/news_release/2026/26110601/','https://user@www.yamaha.com/ja/news_release/2026/26110601/','https://www.yamaha.com/ja/news_release/2026/26110601/?a=1','https://www.yamaha.com/ja/news_release/2026/26110601/#x','http://www.yamaha.com/ja/news_release/2026/26110601/','https://www.deviser.co.jp/shop/1','https://www.takamineguitars.co.jp/news/1','https://espguitars.co.jp/support/terms/'])test('unsupported, prohibited or unsafe URL is not opened: '+bad,()=>assert.equal(assistedSource(bad),null));
test('explicit source prohibition is respected even with both human confirmations',async()=>{
 const s=await setup();for(const patch of [{legalStatus:'DO_NOT_USE'},{humanFactsProhibited:true}]){const registry=SOURCES.map(s=>s.id===input.sourceId?{...s,...patch}:s);assert.equal((await saveAssisted(s,input,now,registry,pepper,actor)).valid,false);}
});
test('human entry works for another reviewed scope while its Bot remains OFF',async()=>{
 const s=await setup(),x={...input,sourceId:'deviser',url:'https://www.deviser.co.jp/information/999999',brand:'Fixture',product:'AC-100',productType:'acoustic_guitar'};const out=await saveAssisted(s,x,now,SOURCES,pepper,actor);assert(out.validation.valid);const r=(await s.candidates())[0];assert.equal(r.source_name,'Deviser');assert.equal(r.source_id,'deviser');assert(JSON.parse(r.facts_provenance).permissionRef.endsWith(':deviser'));assert.equal(await s.db.prepare("SELECT 1 FROM source_state WHERE source_id='deviser'").first(),null);assert.equal(await count(s,'collection_runs'),0);
});
test('candidate takedown/source publication stop and revoked human scope deny publication',async()=>{
 for(const stop of ['takedown','publication_blocked']){const s=await setup();await s.db.prepare(`INSERT INTO source_state(source_id,${stop}) VALUES('yamaha-newsroom',1)`).run();await assert.rejects(saveAssisted(s,input,now,SOURCES,pepper,actor),/assisted_source_stopped/);assert.equal(await count(s,'candidate_items'),0);}
 const s=await setup();await saveAssisted(s,input,now,SOURCES,pepper,actor);const r=(await s.candidates())[0];await s.db.prepare("INSERT INTO news_takedowns(item_id,expires_at) VALUES(?,?)").bind(r.id,now+86400000).run();assert.equal((await publicationValidation(s,r,now,SOURCES,pepper)).valid,false);await assert.rejects(decision(s,r));assert.equal(await count(s,'news_decision_ledger'),0);
});
test('concurrent save is idempotent and a changed candidate cannot overwrite a human decision',async()=>{
 const s=await setup();const both=await Promise.allSettled([saveAssisted(s,input,now,SOURCES,pepper,actor),saveAssisted(s,input,now,SOURCES,pepper,actor)]);assert(both.some(x=>x.status==='fulfilled'&&x.value.saved));assert((await saveAssisted(s,input,now,SOURCES,pepper,actor)).replayed);assert.equal(await count(s,'candidate_items'),1);assert.equal(await count(s,'news_assisted_edits'),1);
 const r=(await s.candidates())[0];await s.db.prepare('UPDATE candidate_items SET review_revision=review_revision+1 WHERE id=?').bind(r.id).run();await assert.rejects(decision(s,r),/stale|candidate_changed/);
 const current=(await s.candidates())[0];await decision(s,current);const p=await prepareAssisted(s,{...input,requestId:'separate-register-request'},now,SOURCES,pepper);assert.equal(p.valid,false);assert.equal((await s.candidates())[0].review_status,'approved');assert.equal(await count(s,'news_decision_ledger'),1);
});
test('same official event is duplicate; a source condition confirmation is not machine provenance',async()=>{
 const s=await setup();await saveAssisted(s,input,now,SOURCES,pepper,actor);await decision(s,(await s.candidates())[0]);
 const duplicate=await prepareAssisted(s,{...input,url:url.replace('26110601','26110602')},now,SOURCES,pepper);assert.equal(duplicate.duplicates.length,1);
 const r=(await s.candidates())[0];const bad={...r,facts_provenance:JSON.stringify({...JSON.parse(r.facts_provenance),method:'publisher_structured'})};assert.equal(await assistedProof(s,bad,now,SOURCES),false);assert.equal((await publicationValidation(s,bad,now,SOURCES,pepper)).valid,false);
});
test('local workerd/D1: scoped audit and existing publication trigger are atomic',async()=>{
 const {mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{localDatabase}=await import('../scripts/local-db.mjs');
 const dir=await mkdtemp(join(tmpdir(),'human-facts-common-'));let runtime;
 try{runtime=await localDatabase(dir);const s=await store(runtime.db);await s.db.prepare('UPDATE news_controls SET publication_enabled=1').run();
 const out=await saveAssisted(s,input,now,SOURCES,pepper,actor);assert(out.validation.valid);await decision(s,(await s.candidates())[0]);assert.equal(await count(s,'news_decision_ledger'),1);
 await s.db.prepare("CREATE TRIGGER common_audit_failure BEFORE INSERT ON news_assisted_edits BEGIN SELECT RAISE(ABORT,'isolated audit failure'); END").run();
 await assert.rejects(saveAssisted(s,{...input,sourceId:'deviser',url:'https://www.deviser.co.jp/information/999999',product:'OTHER-200',requestId:'real-local-audit-failure-001'},now,SOURCES,pepper,actor));
 assert.equal(await count(s,'candidate_items'),1);assert.equal(await count(s,'news_assisted_edits'),1);assert.equal(await count(s,'news_decision_ledger'),1);
 }finally{await runtime?.mf.dispose();await rm(dir,{recursive:true,force:true});}
});
