import test from 'node:test';
import assert from 'node:assert/strict';
import {subjectProductTypes,POWER_DISTRIBUTION_PATTERN} from '../src/product-type-evidence.js';
import {enrichHeadlineFacts} from '../src/headline-evidence.js';
import {parseShimamuraProductEvidence,SHIMAMURA_PRODUCT_PARSER} from '../src/shimamura-product-evidence.js';
import {verifiedHeadlineCorrection,headlineCorrectionStatements,verifiedCorrectionRobots} from '../src/headline-correction.js';
import {hash,robotsEvidence,BOT} from '../src/policy.js';
import {factualLabel} from '../src/metadata.js';
import {duplicatePredicate} from '../src/decision-policy.js';
import {getSource} from '../src/registry.js';
import {database} from './helpers.js';
import {sqlLiteral as q} from '../scripts/remote-db.mjs';

const source=getSource('shimamura'),url='https://www.shimamura.co.jp/update/dtm-recording/2026/10/94705/';
const row={id:'monster-type-regression',source_id:'shimamura',source_url:url,published_at:'2026-10-10T15:00:00.000Z',event_type:'new_product',review_status:'pending'};
const article=(title,lead,extra='')=>`<link rel="canonical" href="${url}"><div class="mb-80"><h1>${title}</h1></div><span>公開：<time datetime="2026-10-11">2026/10/11</time></span><div class="p-content"><p class="wp-block-paragraph">${lead}</p>${extra}</div>`;
const monster=()=>article('MONSTER「POWER 8000 / 8001」登場。電源保護機能を備えたパワーディストリビューター',
 'MONSTERより、サージ保護機能を備えたパワーディストリビューター「MONSTER POWER 8000」「MONSTER POWER 8001」が登場しました。',
 '<p class="wp-block-paragraph">アンプ、ミキサー、オーディオインターフェースなどの接続機器を保護します。</p><h2>商品情報</h2><h3>発売日</h3><p>2026年10月1日</p><table><tr><td>MONSTER POWER 8000<br>JANコード：0850005047728</td></tr><tr><td>MONSTER POWER 8001<br>JANコード：0850005047735</td></tr></table>');
const powerBase={brand:'Maker',product:'PDU-10',models:['PDU-10'],category:'recording_audio',version:null};

test('correction robots uses the existing reviewed canonical/legacy evidence and rejects actual rule changes',async()=>{
 const robots='User-agent: *\nDisallow: /private\n',canonical=(await robotsEvidence(robots)).digest,configured={...source,robotsHash:canonical};
 for(const stateHash of [canonical,await hash(robots)])assert.equal((await verifiedCorrectionRobots(robots,configured,stateHash,200)).isAllowed(url,BOT),true);
 await assert.rejects(()=>verifiedCorrectionRobots(robots+'Disallow: /update/\n',configured,canonical,200),/headline_robots_changed/);
 await assert.rejects(()=>verifiedCorrectionRobots(robots,{...configured,robotsHash:'robots-v1:'+'0'.repeat(64)},canonical,200),/headline_robots_changed/);
});

test('MONSTER multi-model power equipment is recovered without category/target-device guessing',()=>{
 const result=parseShimamuraProductEvidence(monster(),source,row);
 assert.equal(result.productFacts.productType,'power_distribution');
 assert.deepEqual(result.productFacts.models,['MONSTER POWER 8000','MONSTER POWER 8001']);
 assert.equal(result.productFacts.category,'recording_audio');assert.equal(result.publishedAt,row.published_at);
 assert.match(factualLabel(result.productFacts,result.eventType),/電源タップ/);
 assert.equal(SHIMAMURA_PRODUCT_PARSER,'shimamura-product-fields-8');
});

for(const phrase of ['オーディオインターフェースを保護する電源タップ',
 'オーディオインターフェースに接続する電源タップ',
 'オーディオインターフェースに対応する電源タップ',
 '電源タップでオーディオインターフェースなどの接続機器を保護',
 '電源タップでアンプ、ミキサー、オーディオインターフェースを保護',
 '電源タップ。保護対象：オーディオインターフェース',
 'パワーディストリビューター','パワーコンディショナー','power conditioner']){
 test('generic primary noun: '+phrase,()=>{
  const f=enrichHeadlineFacts(powerBase,{title:`Maker PDU-10 ${phrase}を発表`});
  assert.equal(f.productType,'power_distribution');assert.equal(f.productTypeEvidence.product,powerBase.product);
 });
}

test('a genuinely connected audio interface stays an audio interface',()=>{
 const f=enrichHeadlineFacts({...powerBase,product:'INT-2',models:['INT-2']},{title:'Maker オーディオインターフェース「INT-2」は電源タップに接続して使用します'});
 assert.equal(f.productType,'audio_interface');
 const parsed=parseShimamuraProductEvidence(article('Maker「INT-2」オーディオインターフェースが登場',
 'Makerより、電源タップに接続するオーディオインターフェース「INT-2」が登場しました。'),source,row);
 assert.equal(parsed.productFacts.productType,'audio_interface');
});

test('a quoted protection/connection target is not a second main product',()=>{
 for(const relation of ['を保護する','に接続する','に対応する']){
  const parsed=parseShimamuraProductEvidence(article('Maker「PDU-10」電源タップが登場',
   `Makerより、オーディオインターフェース「INT-2」${relation}電源タップ「PDU-10」が登場しました。`),source,row);
  assert.deepEqual(parsed.productFacts.models,['PDU-10']);assert.equal(parsed.productFacts.productType,'power_distribution');
 }
});

test('a named product used only as a connection target cannot gain the type of its accessory',()=>{
 const f=enrichHeadlineFacts(powerBase,{title:'PDU-10に接続するオーディオインターフェースを発売'});
 assert.equal(f.productTypeEvidence,undefined);
});

test('unsupported supply category does not borrow the type of protected equipment',()=>{
 assert.throws(()=>parseShimamuraProductEvidence(article('Maker「SUP-20」が登場',
  'Makerより、電源ユニット「SUP-20」が登場しました。',
  '<p class="wp-block-paragraph">オーディオインターフェースを保護します。</p>'),source,row),/facts_scope_uncertain/);
});

test('related, previous, comparison and ambiguous identities never gain type evidence',()=>{
 for(const phrase of ['関連製品：オーディオインターフェース','旧製品のオーディオインターフェース',
  'オーディオインターフェースと比較','オーディオインターフェースではない',
  'オーディオインターフェースと電源タップ']){
  assert.equal(enrichHeadlineFacts(powerBase,{title:`Maker PDU-10 ${phrase}`}).productTypeEvidence,undefined);
 }
});

test('generic subject selection handles supply nouns and English target roles without brand rules',()=>{
 const types=[['power_distribution',POWER_DISTRIBUTION_PATTERN],['power_supply',/パワーサプライ|power supply/i],['audio_interface',/オーディオインターフェース|audio interface/i]];
 for(const text of ['パワーサプライでオーディオインターフェースを保護','A power supply protects audio interfaces'])assert.deepEqual(subjectProductTypes([text],types).map(t=>t[0]),['power_supply']);
 assert.deepEqual(subjectProductTypes(['An audio interface connected to a power supply'],types).map(t=>t[0]),['audio_interface']);
});

test('same-article correction uses explicit past release date and leaves routine discovery semantics intact',()=>{
 const extracted=parseShimamuraProductEvidence(monster(),source,row).productFacts;
 const wrong={...extracted,productType:'audio_interface'};
 const before={...row,review_status:'approved',product_facts:JSON.stringify(wrong),label:factualLabel(wrong,row.event_type)};
 const correction=verifiedHeadlineCorrection(monster(),before,source);
 assert.equal(correction.facts.productType,'power_distribution');
 assert.equal(correction.label,'MONSTER、電源タップ「MONSTER POWER 8000 / MONSTER POWER 8001」を発売');
 assert.deepEqual(correction.facts.releaseEvent,{action:'release',basis:'verified_primary_article',date:'2026-10-01'});
 assert.equal(extracted.releaseEvent,undefined);
 assert.deepEqual(duplicatePredicate(before,wrong),duplicatePredicate(before,correction.facts));
 assert.throws(()=>verifiedHeadlineCorrection(monster().replaceAll('MONSTER POWER 8001','MONSTER POWER 8999'),before,source),/headline_evidence_identity/);
 const unrelated=monster().replaceAll('MONSTER POWER 8001','MONSTER POWER 8999').replace('</div>','<aside><table><tr><td>MONSTER POWER 8001 JANコード：1</td></tr></table></aside></div>');
 assert.throws(()=>verifiedHeadlineCorrection(unrelated,before,source),/headline_evidence_identity/);
 const related=monster().replaceAll('MONSTER POWER 8001','MONSTER POWER 8999').replace('</div>','<h2>関連製品</h2><table><tr><td>MONSTER POWER 8001 JANコード：1</td></tr></table></div>');
 assert.throws(()=>verifiedHeadlineCorrection(related,before,source),/headline_evidence_identity/);
});

test('full-row CAS corrects only presentation facts and audit, retaining human decisions, Shadow and other articles',()=>{
 const db=database().raw,wrong={...parseShimamuraProductEvidence(monster(),source,row).productFacts,productType:'audio_interface'};
 const insert=db.prepare('INSERT INTO candidate_items(id,source_id,source_name,source_url,normalized_url,published_at,category,label,topic_key,collected_at,review_status,review_reason,reviewed_by,expires_at,event_type,product_facts,review_revision) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
 for(const id of [row.id,'unrelated-published']){
  const ownUrl=id===row.id?url:url.replace('94705/','94706/');
  insert.run(id,'shimamura','島村楽器',ownUrl,ownUrl,row.published_at,'recording_audio',factualLabel(wrong,'new_product'),'retained-topic-'+id,'2026-10-12T00:00:00Z','approved','operator_surface_verified','human_operator',Date.parse('2027-01-09'),'new_product',JSON.stringify(wrong),2);
 }
 const before=db.prepare('SELECT * FROM candidate_items WHERE id=?').get(row.id),other=db.prepare('SELECT * FROM candidate_items WHERE id=?').get('unrelated-published');
 const auditsBefore=db.prepare('SELECT COUNT(*) n FROM news_admin_audit').get().n;
 const correction=verifiedHeadlineCorrection(monster(),before,source),provenance=[{factField:'headlineEvidence',parserVersion:'headline-evidence-2'}];
 const p={...correction,provenance,at:Date.parse('2026-10-13'),requestId:'system-type-correction'};
 db.exec(headlineCorrectionStatements(before,p,q).join(';')+';');
 const after=db.prepare('SELECT * FROM candidate_items WHERE id=?').get(row.id);
 for(const key of Object.keys(before).filter(k=>!['product_facts','label','facts_provenance','review_revision'].includes(k)))assert.deepEqual(after[key],before[key],key);
 assert.deepEqual(db.prepare('SELECT * FROM candidate_items WHERE id=?').get(other.id),other);
 for(const table of ['news_decision_ledger','news_shadow_evaluations','news_operator_feedback'])assert.equal(db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n,0);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM candidate_items').get().n,2);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM news_admin_audit').get().n,auditsBefore+1);
 db.exec(headlineCorrectionStatements(before,{...p,requestId:'stale-replay'},q).join(';')+';');
 assert.equal(db.prepare('SELECT COUNT(*) n FROM news_admin_audit').get().n,auditsBefore+1);
});
