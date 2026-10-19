import test from 'node:test';
import assert from 'node:assert/strict';
import {store,pepper} from './helpers.js';
import {setup,put,source,now} from './operator-case.js';
import {reviewReference} from '../src/review-reference.js';
import {candidateSnapshot,reviewDetail} from '../src/operator-review.js';
import {runPendingRechecks} from '../src/pending-lifecycle.js';
import {publicationValidation} from '../src/decision-policy.js';
import {getSource} from '../src/registry.js';
import {parseIkebeProductEvidence,IKEBE_PRODUCT_PARSER} from '../src/ikebe-product-evidence.js';
import {sourcePolicyReason} from '../src/source-policy-evidence.js';

const protectedRows=async s=>Promise.all(['news_decision_ledger','news_operator_feedback','news_shadow_evaluations'].map(t=>s.db.prepare('SELECT * FROM '+t).all()));
test('private review identifiers cannot manufacture a public headline, facts, readiness or duplicate identity',async()=>{
 const s=await setup(),id='a'.repeat(64);await put(s,'unverified',{id,productFacts:null});
 const row=await s.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(id).first(),before=await publicationValidation(s,row,now,[source],pepper),snap=await candidateSnapshot(row);
 await s.db.prepare('INSERT INTO news_review_references VALUES(?,?,?,?,?,?,?)').bind(id,row.source_url,row.published_at,'合成の審査用対象','owner_audit_identifier',now,'owner audit').run();
 assert.deepEqual(await reviewReference(s,row),{identifier:'合成の審査用対象',basis:'owner_audit_identifier',verifiedForPublication:false});
 const detail=await reviewDetail(s,id,now,[source],pepper);assert.equal(detail.validation.valid,false);assert.equal(detail.snapshot,snap);assert.equal(detail.facts,null);assert.deepEqual(await publicationValidation(s,row,now,[source],pepper),before);
 assert.equal(await reviewReference(s,{...row,source_url:row.source_url+'other'}),null);assert.equal(await reviewReference(s,{...row,published_at:'2025-01-01'}),null);
 await s.db.prepare("UPDATE news_review_references SET identifier='<img onerror=x>'").run();assert.equal(await reviewReference(s,row),null);
});
test('scheduled objective duplicate resolution is terminal, preserves publication and teachers, never fetches',async()=>{
 const s=await setup(),id='b'.repeat(64);await put(s,'copy',{id});await put(s,'original',{id:'c'.repeat(64)});await s.db.prepare("UPDATE candidate_items SET review_status='approved' WHERE id=?").bind('c'.repeat(64)).run();
 const before=await protectedRows(s),published=await s.db.prepare("SELECT * FROM candidate_items WHERE review_status='approved'").all();
 const r=await runPendingRechecks(s,now,[source],pepper,{resolveObjective:true,fetcher:()=>{throw Error('must_not_fetch');}});
 assert.equal(r.items.find(r=>r.id===id).systemResolved,true);const row=await s.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(id).first();assert.equal(row.review_status,'rejected');assert.equal(row.reviewed_by,'system_policy');assert.equal(row.review_reason,'duplicate');
 assert.deepEqual(await protectedRows(s),before);assert.deepEqual(await s.db.prepare("SELECT * FROM candidate_items WHERE review_status='approved'").all(),published);assert.equal((await s.db.prepare('SELECT next_recheck_at FROM news_pending_lifecycle WHERE candidate_id=?').bind(id).first()).next_recheck_at,null);
 assert.equal((await reviewDetail(s,id,now,[source],pepper)).systemDisposition.reason,'duplicate');assert.equal((await runPendingRechecks(s,now+1000,[source],pepper,{resolveObjective:true})).due,0);
});
test('evidence shortage never receives automatic reject even with objective resolution enabled',async()=>{
 const s=await setup(),id='d'.repeat(64);await put(s,'unknown',{id,productFacts:null});const before=await s.candidates();
 await runPendingRechecks(s,now,[source],pepper,{resolveObjective:true,recover:async()=>({outcome:'facts_not_recovered'}),shadow:async()=>{}});assert.deepEqual(await s.candidates(),before);assert.equal((await s.db.prepare('SELECT count(*) n FROM news_decision_ledger').first()).n,0);
});

const ik=getSource('ikebe'),ir={id:'e'.repeat(64),source_id:'ikebe',source_url:'https://www.ikebe-gakki-pb.com/new_product/190001/',published_at:'2026-10-18T15:00:00.000Z',review_status:'pending',event_type:'other',category:'media_other'};
const primary=(category,heads,title='新しい楽器用ペダルが登場')=>`<link rel="canonical" href="${ir.source_url}"><article id="main"><div class="blog_title"><h1>${title}</h1><time class="sub_info_date" datetime="2026-10-19">2026年10月19日公開</time><li class="cate-${category}"></li><a href="https://www.ikebe-gakki-pb.com/new_product/tag/synthetic/">Synthetic</a></div><div class="main_wrap">${heads.map(([model,role])=>`<h2 class="wp-block-heading">Synthetic<br>${model} [${role}]</h2><p class="wp-block-paragraph">${model}は、新しく登場した楽器用製品です。</p>`).join('')}</div></article>`;
test('primary percussion roles may finish as scope exclusion, not a guitar-effect headline; no product-specific rules',()=>{
 const parsed=parseIkebeProductEvidence(primary('drum',[['DP-20','Chain Single Pedal'],['DP-21','Chain Double Pedal'],['QB-9','Quad-beater']]),ik,ir);assert.equal(parsed.productFacts.kind,'source_policy_evidence');assert.equal(parsed.productFacts.subjectType,'percussion_equipment');
 const row={...ir,product_facts:JSON.stringify(parsed.productFacts),facts_provenance:JSON.stringify(['subjectType','usage','models','event_type'].map(factField=>({factField,sourceId:'ikebe',sourceUrl:ir.source_url,verifiedAt:now,parserVersion:IKEBE_PRODUCT_PARSER,extractionMethod:'explicit_ikebe_product_fields',responseHash:'a'.repeat(64)})))};
 assert.equal(sourcePolicyReason(row,now),'not_relevant');assert.equal(sourcePolicyReason({...row,source_url:ir.source_url+'other'},now),null);assert.equal(sourcePolicyReason({...row,facts_provenance:'[]'},now),null);
});
test('drum category alone, related equipment and mixed guitar/drum products cannot justify exclusion',()=>{
 for(const html of [primary('drum',[['ZX-20','Guitar Effect Pedal']],'Synthetic ZX-20 エフェクターが登場'),primary('effector',[['DP-20','Chain Single Pedal']]),primary('drum',[['DP-20','Chain Single Pedal'],['ZX-21','Guitar Effect Pedal']])]){
  try{const r=parseIkebeProductEvidence(html,ik,ir);assert.notEqual(r.productFacts.subjectType,'percussion_equipment');}catch(e){assert.match(e.message,/^facts_/);}
 }
});
