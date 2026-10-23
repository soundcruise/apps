import test from 'node:test';import assert from 'node:assert/strict';
import {KIKUTANI_LISTING_PARSER,kikutaniListingFacts,kikutaniListingProvenance} from '../src/kikutani-listing-evidence.js';
import {candidateFrom,factualLabel} from '../src/metadata.js';import {parseOfficialListing} from '../src/official-listing.js';import {getSource} from '../src/registry.js';import {hash} from '../src/policy.js';import {setup,now} from './operator-case.js';import {pepper} from './helpers.js';import {publicationValidation} from '../src/decision-policy.js';import {publishAutomatic} from '../src/automatic.js';
const source={...getSource('kikutani'),enabled:true,productionEnabled:true};
const url='https://www.kikutani.co.jp/news/synthetic-new-tool/';
const proof={sourceId:'kikutani',sourceUrl:source.discoveryUrl,verifiedAt:now,extractionMethod:'explicit_kikutani_listing_card',parserVersion:KIKUTANI_LISTING_PARSER,responseHash:'a'.repeat(64)};
const entry=(title,extra={})=>({title,url,date:'2026-10-01T00:00:00+09:00',listingTags:['新製品情報'],listingSection:'official_news',listingProof:proof,...extra});
const tool='Craft Toolsからフレットのすり合わせに役立つメンテナンスツール「FT-500 – Fret Tool Kit」が登場';
const guitars='豊かな鳴りの「Example Guitars AA100 & AA200」';
for(const [title,type] of [[tool,'guitar_maintenance_tool'],[guitars,'guitar'],['カッタウェイ付きエレアコ「Example Guitars AC500 bk」','acoustic_guitar']])test('explicit new-product card: '+type,async()=>{const r=await candidateFrom(entry(title),source,{isAllowed:()=>true},now,pepper);assert.equal(r.item.productFacts.productType,type);assert(r.item.label.startsWith(r.item.productFacts.brand+'の'));assert.match(r.item.label,/(を紹介|が登場)$/);assert(!/発表|発売|公開/.test(r.item.label));assert.equal(r.item.publicationDecision,'PUBLISH_REVIEW');assert(r.item.factsProvenance);assert.notEqual(r.item.label,title);assert(!r.item.productFacts.releaseEvent);});
test('unverified guitar subtype remains generic, not an inferred acoustic/electric type',()=>{const f=kikutaniListingFacts(entry(guitars),source);assert.equal(f.productType,'guitar');assert.equal(f.category,'media_other');});
for(const extra of [{listingTags:[]},{listingTags:['キャンペーン']},{listingSection:'related'}])test('missing new-product card evidence cannot produce formal facts '+JSON.stringify(extra),()=>assert.equal(kikutaniListingFacts(entry(tool,extra),source),null));
for(const title of ['Craft Toolsからフレットすり合わせ工具「FT-500 – Kit」が登場予定', 'Other Toolsの関連商品 Craft Toolsからフレットすり合わせ工具「FT-500 – Kit」が登場', 'Craft Toolsからドラム用工具「FT-500 – Kit」が登場', 'Example Guitars AA100が登場','他社のギター「Example Guitars AA100」'])test('ambiguous or unrelated listing stays incomplete: '+title,()=>assert.equal(kikutaniListingFacts(entry(title),source),null));
test('other sources cannot use distributor-only evidence',()=>{assert.equal(kikutaniListingFacts(entry(tool),{...source,id:'zoom'}),null);});
test('card tag parser retains only controlled tags, no original title persistence',()=>{const h=`<div class="link-card"><a href="${url}"><time>2026/10/01</time><span class="link-card__tag">新製品情報</span><h3 class="link-card__title">${tool}</h3></a></div>`;const p=parseOfficialListing(h,source);assert.deepEqual(p.entries[0].listingTags,['新製品情報']);});
test('initial listing → facts → label → formal validation → READY, no approval/teacher mutation',async()=>{
 const s=await setup();await s.recordHealth({sourceId:source.id,status:'healthy',reasonCode:'ok',checkedAt:now,successfulAt:now});
 const r=await candidateFrom(entry(tool),source,{isAllowed:()=>true},now,pepper);assert(await s.put(r.item));let row=await s.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(r.item.id).first();
 const v=await publicationValidation(s,row,now,[source],pepper);assert.deepEqual(v.errors,[]);assert.equal(v.valid,true);assert.equal(row.review_status,'pending');assert.equal(await publishAutomatic(s,source,[source],now,pepper),0);
 for(const t of ['news_decision_ledger','news_operator_feedback','news_shadow_evaluations'])assert.equal((await s.db.prepare('SELECT COUNT(*) n FROM '+t).first()).n,0);
 for(const patch of [{facts_provenance:null},{facts_provenance:row.facts_provenance.replaceAll(url,url+'neighbor/')},{facts_provenance:row.facts_provenance.replaceAll('a'.repeat(64),'bad')}])assert((await publicationValidation(s,{...row,...patch},now,[source],pepper)).errors.includes('facts_provenance_invalid'));
 assert.equal((await candidateFrom(entry(tool,{date:'2026-06-01'}),source,{isAllowed:()=>true},now,pepper)).reason,'date_outside_window');
 await s.db.prepare("UPDATE candidate_items SET review_status='approved' WHERE id=?").bind(row.id).run();const another={...r.item,id:await hash('another'),sourceUrl:source.discoveryUrl+'other-tool/',normalizedUrl:source.discoveryUrl+'other-tool/'};assert(await s.put(another));const duplicate=await s.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(another.id).first();assert((await publicationValidation(s,duplicate,now,[source],pepper)).errors.includes('duplicate'));
});
test('guitar accessories and generic deburring tools cannot become complete guitars/fret tools',()=>{
 for(const t of ['エレアコ用ケース「Example Guitars AC500」','Craft Toolsからバリ取りに役立つ工具「AB-500 – Industrial Tool」が登場'])assert.equal(kikutaniListingFacts(entry(t),source),null);
});
