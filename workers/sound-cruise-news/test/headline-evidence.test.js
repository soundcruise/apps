import test from 'node:test';import assert from 'node:assert/strict';
import {enrichHeadlineFacts,validHeadlineEvidence,productTypeLabel,articleHeadlineFacts} from '../src/headline-evidence.js';
import {factualLabel,contentType,candidateFrom,validatedProductFacts} from '../src/metadata.js';
import {preferredIndependentLabel} from '../src/label-quality.js';
import {getSource} from '../src/registry.js';import {pepper,database} from './helpers.js';
import {verifiedHeadlineCorrection,headlineCorrectionStatements} from '../src/headline-correction.js';
import {sqlLiteral as q} from '../scripts/remote-db.mjs';
const publishedAt='2026-09-30T15:00:00.000Z',base={brand:'SHURE',product:'MV6 Gen 2',version:null,category:'recording_audio',identifierBasis:'explicit_model_code'};
const source=getSource('shimamura'),row={id:'headline-test',source_id:'shimamura',source_url:'https://www.shimamura.co.jp/update/dtm-recording/2026/10/90252/',published_at:publishedAt,event_type:'release',review_status:'approved',product_facts:JSON.stringify(base),label:'SHURE、MV6 Gen 2を発売'};
const article=(title='SHURE MV6 Gen 2 USBマイク',lead='SHUREがUSBマイク「MV6 Gen 2」を発売します。',date='2026年10月22日（木）')=>`<link rel="canonical" href="${row.source_url}"><h1 class="title">ignored navigation</h1><div class="mb-80"><h1>${title}</h1></div><span>公開：<time datetime="2026-10-01">2026/10/01</time></span><span>更新：<time datetime="2026-10-05">2026/10/05</time></span><article><div class="p-content"><p>${lead}</p><h2>MV6 Gen 2</h2><h2>発売日</h2><p>${date}</p><aside><p>別製品のワイヤレスマイク</p></aside></div></article>`;
test('primary release date produces scheduled release, publication date stays separate',()=>{
 const result=verifiedHeadlineCorrection(article(),row,source);
 assert.equal(result.label,'SHURE、USBマイク「MV6 Gen 2」を10月22日に発売予定');
 assert.equal(result.facts.releaseEvent.date,'2026-10-22');assert.equal(result.facts.releaseEvent.action,'scheduled_release');
 assert.equal(result.facts.product,base.product);assert.equal(result.facts.brand,base.brand);assert.equal(result.facts.category,base.category);
});
for(const [name,type] of [['USBダイナミックマイクロホン','usb_microphone'],['パッドコントローラー','pad_controller'],['シグネチャーピック','signature_pick'],['ギタースタンド','guitar_stand'],['チューナー・メトロノーム','tuner_metronome'],['オーバードライブ／ディストーションペダル','distortion_pedal'],['ベース専用エフェクター','bass_effect_pedal'],['オクターブペダル','octave_pedal'],['電源タップ','power_distribution']])test('generic explicit type: '+name,()=>{
 const facts={brand:'Synthetic Maker',product:'XYZ-710',version:null,category:'electric_guitar_bass'};
 const f=enrichHeadlineFacts(facts,{title:`Synthetic Maker ${name}「XYZ-710」を発表`});
 assert.equal(f.productType,type);assert(productTypeLabel(f));assert.equal(f.category,facts.category);assert(!JSON.stringify(f).includes('を発表'));
});
for(const title of ['SHURE MV6 Gen 2 発売予定','SHURE MV6 Gen 2 発売を延期','SHURE MV6 Gen 2 予約受付を開始'])test('specific lifecycle precedes coarse release classifier: '+title,()=>{
 assert.equal(contentType(title),'release');const facts=enrichHeadlineFacts(base,{title});
 assert(facts.releaseEvent);assert(!factualLabel(facts,'release').endsWith('を発売'));
});
test('redesign delay keeps tentative year, never a current launch',()=>{
 const f=enrichHeadlineFacts({...base,product:'XYZ-710'},{title:'XYZ-710の再設計に伴う、発売延期のお知らせ',statements:['XYZ-710の発売時期は2027年の予定です。'],basis:'verified_primary_article'});
 assert.equal(factualLabel(f,'release'),'SHURE、XYZ-710の再設計に伴い発売を延期（2027年予定）');
});
test('without explicit evidence no category guess or unproven stored type',()=>{
 assert.equal(productTypeLabel({...base,productType:'electric_guitar'}),null);
 assert.equal(enrichHeadlineFacts(base,{title:'SHURE MV6 Gen 2 新製品発売'}).productType,undefined);
 assert.equal(productTypeLabel({...base,productType:'imagined',productTypeEvidence:{product:base.product,basis:'verified_primary_article'}}),null);
 assert(!validatedProductFacts({...base,productType:'imagined',productTypeEvidence:{product:base.product,basis:'verified_primary_article'}}));
});
test('dated primary schedule/reservation preserves an explicit date without using a publication/collection date',()=>{
 const planned=enrichHeadlineFacts(base,{title:'SHURE MV6 Gen 2を2026年10月22日に発売予定'});
 assert.equal(planned.releaseEvent.date,'2026-10-22');
 const reserved=enrichHeadlineFacts(base,{title:'SHURE MV6 Gen 2の予約受付を2026年10月9日に開始'});
 assert.equal(reserved.releaseEvent.date,'2026-10-09');
 const explicit=enrichHeadlineFacts(base,{title:'SHURE MV6 Gen 2 2026年10月9日 予約受付開始'});
 assert.equal(factualLabel(explicit,'release'),'SHURE、MV6 Gen 2の予約受付を10月9日に開始');
});
test('accessory and related-product mentions cannot become the main product type',()=>{
 for(const title of ['SHURE USBマイク MV6 Gen 2用アームを発売','SHURE MV6 Gen 2 関連製品のUSBマイクを発表'])assert.equal(enrichHeadlineFacts(base,{title}).productTypeEvidence,undefined);
});
test('existing listing category/type validation is not relaxed by additive evidence',()=>{
 const f={brand:'Fender',product:'AB-123',identifierBasis:'explicit_listing_facts',listingSource:'ikebe',category:'electric_guitar_bass',productType:'electric_guitar',productTypeEvidence:{product:'AB-123',basis:'explicit_primary_title'}};
 assert(validatedProductFacts(f));assert(!validatedProductFacts({...f,category:'recording_audio'}));assert(!validatedProductFacts({...f,category:'acoustic_guitar',productType:'guitar_amp'}));
});
for(const title of ['SHURE USBマイク','SHURE MV6 Gen 2 USBマイク比較レビュー','SHURE MV6 Gen 2 再入荷 USBマイク','SHURE MV6 Gen 2 セール USBマイク','SHURE MV6 Gen 2はUSBマイクではない','SHURE MV6 Gen 2 旧製品USBマイク紹介'])test('unsafe/identity-less type does not gain proof: '+title,()=>assert.equal(enrichHeadlineFacts(base,{title}).productTypeEvidence,undefined));
test('related, hidden, wrong-model, mixed types and date headings cannot invent a refinement',()=>{
 for(const lead of ['別製品 XYZ-710 はパッドコントローラーです。','SHUREのUSBマイクとパッドコントローラーを比較。'])assert.equal(articleHeadlineFacts(article('SHURE MV6 Gen 2',lead,''),base,row,source).productTypeEvidence,undefined);
 const hidden=article('SHURE MV6 Gen 2','MV6 Gen 2を発売します。','').replace('<h2>MV6 Gen 2</h2>','<p hidden>SHURE USBマイク MV6 Gen 2</p><h2>MV6 Gen 2</h2>');assert.equal(articleHeadlineFacts(hidden,base,row,source).productTypeEvidence,undefined);
 assert.throws(()=>articleHeadlineFacts(article().replace('datetime="2026-10-01"','datetime="2026-10-02"'),base,row,source));
 assert.equal(articleHeadlineFacts(article('SHURE MV6 Gen 2','SHURE MV6 Gen 2を発売します。','2026年99月99日'),base,row,source).releaseEvent,undefined);
 assert.equal(articleHeadlineFacts(article('SHURE MV6 Gen 2','SHURE MV6 Gen 2を発売しました。','2026年10月1日'),base,row,source).releaseEvent,undefined);
});
test('specific product events combine with typed subjects, delay/schedule retain variants',()=>{
 const event={action:'limited_edition',basis:'verified_primary_article',signal:'explicit_limited_edition'};
 const f={...enrichHeadlineFacts(base,{title:'SHURE USBマイク MV6 Gen 2'}),productEvent:event,editionMarket:'Japan'};
 assert.equal(factualLabel(f,'new_product'),'SHURE、USBマイク「MV6 Gen 2」の限定モデルを発表');
 assert.match(factualLabel({...f,releaseEvent:{action:'scheduled_release',basis:'verified_primary_article',date:'2026-10-22'}},'release'),/日本限定モデルを10月22日に発売予定$/);
 for(const eventType of ['update','firmware'])assert.match(factualLabel({...f,productEvent:undefined},eventType),/USBマイク/);
 assert.equal(factualLabel({...f,releaseEvent:{action:'release_delay',basis:'verified_primary_article'}},'firmware'),null);
});
for(const [action,signal,phrase] of [['new_color','explicit_new_color','新色'],['collaboration','explicit_collaboration_color','コラボカラー'],['limited_edition','explicit_limited_color','限定カラー'],['special_edition','explicit_special_edition','特別仕様'],['reissue','explicit_reissue','復刻版'],['rerelease','explicit_rerelease','再発売モデル'],['new_variant','explicit_variant','新仕様']])test('scheduled headline preserves specific refinement '+signal,()=>{
 const f={...enrichHeadlineFacts(base,{title:'SHURE USBマイク MV6 Gen 2 発売予定'}),productEvent:{action,signal,basis:'verified_primary_article'}};
 assert.match(factualLabel(f,'release'),new RegExp(phrase+'.*発売予定$'));
});
test('invalid proof/date/lifecycle cannot generate an approvable headline',()=>{
 for(const releaseEvent of [{action:'guess',basis:'verified_primary_article'},{action:'scheduled_release',basis:'category'},{action:'release_delay',basis:'verified_primary_article',date:'2026-99-99'},{action:'scheduled_release',basis:'verified_primary_article',reason:'redesign'}])assert.equal(validHeadlineEvidence({...base,releaseEvent}),false);
 assert.equal(validatedProductFacts({...base,productType:'usb_microphone',productTypeEvidence:{product:'different',basis:'verified_primary_article'}}),false);
});
test('listing scheduled/delay/reservation remain human review, no auto-publish policy expansion',async()=>{
 for(const suffix of ['発売予定','発売を延期','予約受付を開始']){
  const r=await candidateFrom({url:row.source_url,date:publishedAt,title:`SHURE USBマイク MV6 Gen 2 ${suffix}`,listingSection:'product_news',listingCategory:'dtm-recording'},source,{isAllowed:()=>true},Date.parse('2026-10-05'),pepper);
  assert.equal(r.item.publicationDecision,'PUBLISH_REVIEW');assert(r.item.productFacts.releaseEvent);assert(!r.item.label.endsWith('を発売'));
 }
});
test('verified headline preferred over legacy generic independent label',()=>{
 const f=enrichHeadlineFacts(base,{title:'SHURE USBマイク MV6 Gen 2 発売予定'});
 assert.equal(preferredIndependentLabel({...row,product_facts:JSON.stringify(f),label:factualLabel(f,'release')}),factualLabel(f,'release'));
});
test('full-row CAS correction preserves status/date/topic and Ledger/Shadow, races cannot overwrite',()=>{
 const db=database().raw;
 db.prepare('INSERT INTO candidate_items(id,source_id,source_name,source_url,normalized_url,published_at,category,label,topic_key,collected_at,review_status,review_reason,expires_at,event_type,product_facts,review_revision) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(row.id,row.source_id,'島村楽器',row.source_url,row.source_url,row.published_at,base.category,row.label,'topic','2026-10-03T00:00:00Z','approved','automatic_factual_template',Date.parse('2026-12-30'),row.event_type,row.product_facts,0);
 const before=db.prepare('SELECT * FROM candidate_items WHERE id=?').get(row.id);
 const p={...verifiedHeadlineCorrection(article(),row,source),provenance:[{factField:'headlineEvidence',responseHash:'test'}],at:1,requestId:'headline-quality-test'};
 db.exec(headlineCorrectionStatements(before,p,q).join(';')+';');
 const after=db.prepare('SELECT * FROM candidate_items WHERE id=?').get(row.id);
 for(const k of Object.keys(before).filter(k=>!['label','product_facts','facts_provenance','review_revision'].includes(k)))assert.deepEqual(after[k],before[k],k);
 for(const table of ['news_decision_ledger','news_shadow_evaluations','news_operator_feedback'])assert.equal(db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n,0);
 const audits=db.prepare('SELECT COUNT(*) n FROM news_admin_audit').get().n;
 db.exec(headlineCorrectionStatements(before,{...p,requestId:'race'},q).join(';')+';');assert.equal(db.prepare('SELECT COUNT(*) n FROM news_admin_audit').get().n,audits);
 assert.throws(()=>headlineCorrectionStatements(before,{...p,facts:{...p.facts,category:'electric_guitar_bass'}},q));
});
