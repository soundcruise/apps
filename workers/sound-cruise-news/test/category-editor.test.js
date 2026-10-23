import test from 'node:test';import assert from 'node:assert/strict';
import {categoryDetail,saveCategory,effectiveCategory,categoryOptions}from'../src/category-editor.js';
import {setup,put,source,now,approveInput}from'./operator-case.js';import{pepper}from'./helpers.js';
import{publicationValidation,duplicatePredicate}from'../src/decision-policy.js';
import{reviewDetail,operatorDecision}from'../src/operator-review.js';import{handleNewsRequest}from'../src/worker.js';
import{publishedPresentation,savePresentation}from'../src/news-presentation.js';
import{kikutaniListingFacts,kikutaniListingLabel,KIKUTANI_LISTING_PARSER}from'../src/kikutani-listing-evidence.js';
import{candidateFrom,CATEGORIES}from'../src/metadata.js';import{getSource}from'../src/registry.js';
const actor={type:'human_operator',id:'access:category-test'};
async function input(s,id,category='acoustic_guitar'){const d=await categoryDetail(s,id,now);return{id,category,revision:d.revision,snapshot:d.snapshot,requestId:crypto.randomUUID()};}
const protectedTables=['news_decision_ledger','news_operator_feedback','news_shadow_evaluations','news_presentation_days','news_presentation_requests'];
async function protectedData(s){const r={};for(const t of protectedTables)r[t]=(await s.db.prepare('SELECT * FROM '+t).all()).results;return JSON.stringify(r);}
async function publicRead(s,query=''){const r=await handleNewsRequest(new Request('http://localhost/v1/news'+query),{NEWS_DB:s.db,NEWS_API_MODE:'local'},now,{registry:[source],cache:null});assert.equal(r.status,200);return(await r.json()).items;}
test('published category edits preserve facts, identities, HOT/order and teachers; API filters use the override',async()=>{
 const s=await setup(),i=await put(s);await s.db.prepare("UPDATE candidate_items SET review_status='approved' WHERE id=?").bind(i.id).run();
 const env={NEWS_DB:s.db,NEWS_API_MODE:'local'},d=(await publishedPresentation(s,env,now,[source])).days[0];
 await savePresentation(s,{day:d.day,revision:d.revision,snapshot:d.snapshot,items:d.items.map(x=>({id:x.id,hot:true})),requestId:crypto.randomUUID()},env,now,[source],{type:'fixture',id:'layout'});
 const before=(await s.candidates())[0],teachers=await protectedData(s),apiBefore=(await publicRead(s))[0],p=duplicatePredicate(before,JSON.parse(before.product_facts));
 const r=await saveCategory(s,await input(s,i.id),now,actor);assert(r.saved);const after=(await s.candidates())[0];assert.deepEqual(JSON.parse(JSON.stringify(after)),{...before,review_revision:before.review_revision+1});assert.equal(await protectedData(s),teachers);assert.deepEqual(duplicatePredicate(after,JSON.parse(after.product_facts)),p);
 const a=(await publicRead(s))[0];assert.deepEqual(a,{...apiBefore,category:'acoustic_guitar'});assert.equal(a.hot,true);assert.equal((await publicRead(s,'?category=acoustic_guitar')).length,1);assert.equal((await publicRead(s,'?category=recording_audio')).length,0);
 const detail=await categoryDetail(s,i.id,now);assert.equal(detail.manual,true);assert.equal(detail.history.length,1);assert.deepEqual(detail.options.map(x=>x.id),CATEGORIES);assert.equal(detail.history[0].actor_id,actor.id);assert.equal(detail.history[0].operation_type,'manual_category_edit');
});
test('pending and READY edits do not satisfy missing facts or execute a decision',async()=>{
 const s=await setup();for(const [id,facts]of[['complete',undefined],['incomplete',null]]){await put(s,id,facts===undefined?{}:{productFacts:facts});const row=(await s.candidates()).find(r=>r.id===id),v=await publicationValidation(s,row,now,[source],pepper);await saveCategory(s,await input(s,id),now,actor);const d=await reviewDetail(s,id,now,[source],pepper);assert.equal(d.category,'acoustic_guitar');assert.equal(d.status,'pending');assert.equal(d.validation.valid,v.valid);assert.deepEqual(d.validation.errors,v.errors);}
 assert.equal((await s.db.prepare('SELECT COUNT(*) n FROM news_decision_ledger').first()).n,0);
});
test('display override survives collector updates, replay, reanalysis and administrative raw category repair',async()=>{
 const s=await setup(),i=await put(s);await saveCategory(s,await input(s,i.id),now,actor);
 await s.put({...i,category:'dtm_software',productFacts:{...i.productFacts,category:'dtm_software'}});
 assert.equal(await effectiveCategory(s,(await s.candidates())[0]),'acoustic_guitar');
 await s.db.prepare("UPDATE candidate_items SET category='amps_effects',product_facts=json_set(product_facts,'$.category','amps_effects') WHERE id=?").bind(i.id).run();
 assert.equal((await reviewDetail(s,i.id,now,[source],pepper)).category,'acoustic_guitar');assert.equal((await categoryDetail(s,i.id,now)).history.length,1);
});
test('save is idempotent; concurrent edits and actor/payload reuse cannot overwrite',async()=>{
 const s=await setup(),i=await put(s),a=await input(s,i.id),b=await input(s,i.id,'media_other');await saveCategory(s,a,now,actor);assert.equal((await saveCategory(s,a,now,actor)).replayed,true);
 await assert.rejects(saveCategory(s,b,now,actor),/category_changed/);await assert.rejects(saveCategory(s,{...a,category:'sale'},now,actor),/idempotency_payload_changed/);await assert.rejects(saveCategory(s,a,now,{...actor,id:'access:other'}),/idempotency_payload_changed/);assert.equal((await categoryDetail(s,i.id,now)).history.length,1);
});
test('invalid categories, extra fields, system actors, rejected, expired and takedown articles fail closed',async()=>{
 const s=await setup(),i=await put(s),a=await input(s,i.id);
 for(const patch of[{category:'new-category'},{headline:'changed'},{revision:-1},{snapshot:'bad'}])await assert.rejects(saveCategory(s,{...a,...patch},now,actor));
 for(const type of['system_repair','fixture','service'])await assert.rejects(saveCategory(s,a,now,{...actor,type}),/operator_denied/);
 for(const sql of["review_status='rejected'",`review_status='pending',expires_at=${now}`]){await s.db.prepare('UPDATE candidate_items SET '+sql+' WHERE id=?').bind(i.id).run();await assert.rejects(saveCategory(s,await input(s,i.id),now,actor),/category_not_editable/);}
 await s.db.prepare("UPDATE candidate_items SET review_status='pending',expires_at=? WHERE id=?").bind(now+86400000,i.id).run();await s.db.prepare('INSERT INTO source_state(source_id,publication_blocked) VALUES(?,1) ON CONFLICT(source_id) DO UPDATE SET publication_blocked=1').bind(source.id).run();await assert.rejects(saveCategory(s,await input(s,i.id),now,actor),/category_not_editable/);
});
test('trigger failure atomically rolls back override, history, cache revision and candidate revision',async()=>{
 const s=await setup(),i=await put(s),before=(await s.candidates())[0],controls=await s.controls();s.db.raw.exec("CREATE TRIGGER category_fixture_failure BEFORE INSERT ON news_category_overrides BEGIN SELECT RAISE(ABORT,'fixture_failure'); END;");
 await assert.rejects(saveCategory(s,await input(s,i.id),now,actor),/category_transaction_failed/);assert.deepEqual((await s.candidates())[0],before);assert.deepEqual(await s.controls(),controls);assert.equal((await categoryDetail(s,i.id,now)).history.length,0);assert.equal((await categoryDetail(s,i.id,now)).manual,false);
});
test('a lost post-commit response resolves from the exact request receipt without duplicate edits',async()=>{
 const s=await setup(),i=await put(s),a=await input(s,i.id),original=s.db.prepare;let lose=true;
 s.db.prepare=(sql)=>{const stmt=original(sql);if(!sql.startsWith('INSERT INTO news_category_edits'))return stmt;return {bind:(...args)=>({run:async()=>{const r=await stmt.bind(...args).run();if(lose){lose=false;throw Error('lost_after_commit');}return r;}})};};
 assert.equal((await saveCategory(s,a,now,actor)).replayed,true);assert.equal((await categoryDetail(s,i.id,now)).history.length,1);
});
test('an edited READY candidate accepts a fresh explicit human decision, not a stale pre-edit decision',async()=>{
 const s=await setup(),i=await put(s),old=await approveInput(s,i);await saveCategory(s,await input(s,i.id),now,actor);await assert.rejects(operatorDecision(s,old,now,[source],pepper,actor),/candidate_changed/);
 const fresh=await approveInput(s,i,{category:'acoustic_guitar'});assert.equal((await operatorDecision(s,fresh,now,[source],pepper,{type:'fixture',id:'test-publication'})).action,'approve');
});
test('manual category alone does not bypass sale expiry or change duplicate / formal validation',async()=>{
 const s=await setup(),i=await put(s);await s.db.prepare("UPDATE candidate_items SET review_status='approved',sale_ends_at=? WHERE id=?").bind(now-1,i.id).run();await saveCategory(s,await input(s,i.id),now,actor);assert.equal((await publicRead(s)).length,0);
});
const ksource={...getSource('kikutani'),enabled:true,productionEnabled:true};
const entry=title=>({title,url:ksource.discoveryUrl+'synthetic-acoustic-new/',date:'2026-10-01T00:00:00+09:00',listingTags:['新製品情報'],listingSection:'official_news',listingProof:{sourceId:'kikutani',sourceUrl:ksource.discoveryUrl,verifiedAt:now,extractionMethod:'explicit_kikutani_listing_card',parserVersion:KIKUTANI_LISTING_PARSER,responseHash:'a'.repeat(64)}});
for(const [name,title,expected]of[['acoustic','アコースティックギター「Future Guitars AC100 & AC200」','acoustic_guitar'],['short acoustic','アコギ「Future Guitars AC300」','acoustic_guitar'],['electro acoustic','カッタウェイ付きエレアコ「Future Guitars AC400 bk」','acoustic_guitar'],['generic','豊かな鳴りの「Future Guitars AC500」','media_other'],['related acoustic','アコギにも使えるエレキギター「Future Guitars AC600」','media_other'],['tone analogy','アコギのようなサウンドの「Future Guitars AC700」','media_other']])test('product-bound category without model/brand hardcoding: '+name,()=>{const f=kikutaniListingFacts(entry(title),ksource);assert.equal(f.category,expected);if(name==='acoustic')assert.match(kikutaniListingLabel(f,'new_product'),/アコースティックギター/);});
test('multipurpose fret tools remain guitar/bass; acoustic accessories cannot become acoustic guitars',()=>{
 const f=kikutaniListingFacts(entry('Craft Toolsからフレットのすり合わせに役立つメンテナンスツール「FT-500 – Fret Tool Kit」が登場'),ksource);assert.equal(f.category,'electric_guitar_bass');assert.equal(kikutaniListingFacts(entry('アコースティックギター用ケース「Future Guitars AC100」'),ksource),null);
});
test('initial acoustic discovery reaches formal READY with unchanged provenance and legacy parser compatibility',async()=>{
 const s=await setup();await s.recordHealth({sourceId:'kikutani',status:'healthy',reasonCode:'ok',checkedAt:now,successfulAt:now});const r=await candidateFrom(entry('アコースティックギター「Future Guitars AC100 & AC200」'),ksource,{isAllowed:()=>true},now,pepper);assert(await s.put(r.item));const row=(await s.candidates())[0];assert.equal(row.category,'acoustic_guitar');assert.equal((await publicationValidation(s,row,now,[ksource],pepper)).valid,true);
 const bad={...row,facts_provenance:row.facts_provenance.replaceAll(KIKUTANI_LISTING_PARSER,'kikutani-listing-product-2')};assert((await publicationValidation(s,bad,now,[ksource],pepper)).errors.includes('facts_provenance_invalid'));
});
