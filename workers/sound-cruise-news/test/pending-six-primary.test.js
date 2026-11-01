// Minimal structural projections of independently inspected fields. No article body fixture.
import test from 'node:test';import assert from 'node:assert/strict';
import {parsePrimaryAnnouncement,validPrimaryAnnouncement,PRIMARY_ANNOUNCEMENT_PARSER} from '../src/primary-announcement.js';
import {getSource} from '../src/registry.js';
const p=s=>`<p class="wp-block-paragraph">${s}</p>`;
const row=(source,id,day)=>({id:String(id),source_id:source,source_url:source==='ikebe'?`https://www.ikebe-gakki-pb.com/new_product/${id}/`:`https://www.shimamura.co.jp/update/${id===103352?'amp-effector':'dtm-recording'}/2026/10/${id}/`,published_at:new Date(day+'T00:00:00+09:00').toISOString(),review_status:'pending',category:'recording_audio',event_type:'other',title_fingerprint:'{}'});
const sh=(r,title,lead,rest='')=>`<link rel="canonical" href="${r.source_url}"><div class="mb-80"><h1>${title}</h1></div><p>公開：<time datetime="${new Date(Date.parse(r.published_at)+9*3600000).toISOString().slice(0,10)}"></time></p><div class="p-content">${p(lead)}${rest}</div>`;
const ik=(r,brand,title,models,sections)=>`<link rel="canonical" href="${r.source_url}"><article id="main"><div class="blog_title"><h1>${title}</h1><time class="sub_info_date" datetime="2026-10-30">2026年10月30日公開</time><a href="https://www.ikebe-gakki-pb.com/new_product/tag/example-brand/">${brand}</a></div><div class="main_wrap">${models.map((m,i)=>`<h1 class="wp-block-heading">${brand}<br>${m}</h1>${sections[i].map(p).join('')}`).join('')}</div></article>`;
const cases=[];
{
 const r=row('shimamura',105214,'2026-10-31');cases.push({name:'EastWest',r,h:sh(r,'EastWest Hollywood Scoring Tools 発売情報','EastWest (イーストウェスト) がソフトウェア音源「Hollywood Scoring Tools」を発売します。','<table><tr><td>Hollywood Scoring ToolsJANコード：4580101328846</td></tr></table><h2>発売日</h2><p>2026年10月31日</p>'),type:'software_instrument',action:'release'});
}
{
 const r=row('shimamura',103352,'2026-10-30');cases.push({name:'Louis',r,h:sh(r,'Louis LCT-TUNE 充電式クリップチューナー','LouisよりLCT-TUNEが登場いたします。',p('大画面のクリップチューナーです。')+'<table><tr><td>LCT-TUNE BlackJANコード：4514812115952</td></tr></table>'),type:'clip_tuner',action:'appearance'});
}
{
 const r=row('shimamura',102807,'2026-10-29');cases.push({name:'Native Instruments',r,h:sh(r,'Native Instruments Massive XL ソフトウェアシンセサイザー','Native Instruments ( ネイティブインストゥルメンツ ) がソフトウェアシンセサイザー「Massive XL」を発売します。','<table><tr><td>Massive XLJANコード：4533940379999</td></tr></table><h2>発売日</h2><p>2026年10月28日</p>'),type:'software_instrument',action:'release'});
}
{
 const r=row('ikebe',173848,'2026-10-30');cases.push({name:'OLLO AUDIO',r,h:ik(r,'OLLO AUDIO','「X1」から進化したヘッドフォン「X2」が発売',['X2'],[['＝＝＝＝＝＝＝＝','★OLLO Audio 「X2 プリオーダー優待版」受注開始のお知らせ','OLLO Audio社製のレコーディング・ヘッドフォン「X2」は、2026年11月より受注を開始いたします。']]),type:'headphone',action:'reservation_start'});
}
{
 const r=row('ikebe',173861,'2026-10-30');cases.push({name:'EarthQuaker',r,h:ik(r,'EarthQuaker Devices','Earthquaker Devices オーバードライブ2機種を2026年11月4日に限定発売決定',['Plumes Mosfet Mod','Blumes Mosfet Mod'],[['Plumes（プルームス）MOSFET Modは数量限定での発売となります。','クリッピングで歪みを作ります。'],['Blumes（ブルームス）MOSFET Modは数量限定での発売となります。','クリッピングで歪みを作ります。']]),type:'effect_pedal',action:'scheduled_release'});
}
{
 const r=row('ikebe',173801,'2026-10-30');cases.push({name:'Aguilar',r,h:ik(r,'Aguilar','Aguilar「DB700」が登場、オリジナルカラー「All Black」も登場',['DB700','DB700 All Black [IKEBE ORIGINAL MODEL]'],[['DB700は700Wの出力を持ち、パワーアンプ部を搭載します。'],['DB700 All Black [IKEBE ORIGINAL MODEL]','オリジナルカラーが登場。','最新ヘッドアンプDB700にオリジナル「All Black」モデルが実現。','DB700は700Wの出力を持ち、パワーアンプ部を搭載します。']]),type:'head_amp',action:'appearance'});
}
export const pendingCases=cases;
for(const c of cases)test(`primary field projection: ${c.name}`,()=>{const parsed=parsePrimaryAnnouncement(c.h,getSource(c.r.source_id),c.r);assert(validPrimaryAnnouncement(parsed.productFacts));assert.equal(parsed.productFacts.productType,c.type);assert.equal(parsed.productFacts.announcement.action,c.action);assert.equal(parsed.publishedAt,c.r.published_at);});
// Different manufacturers and models must pass the same rules, not a per-article exception.
test('rules have no article/brand whitelist',()=>{const c=cases.find(c=>c.name==='OLLO AUDIO'),h=c.h.replaceAll('OLLO AUDIO','OTHER AUDIO').replaceAll('OLLO Audio','OTHER Audio').replaceAll('X2','Z7');assert.equal(parsePrimaryAnnouncement(h,getSource('ikebe'),c.r).productFacts.product,'Z7');});

import {store,pepper} from './helpers.js';import {put} from './operator-case.js';
import {hash,DAY} from '../src/policy.js';import {administer} from '../src/admin.js';
import {recheckFacts,reusablePrimaryEvidence} from '../src/facts-recheck.js';
import {reviewDetail,candidateSnapshot} from '../src/operator-review.js';
import {publicationValidation} from '../src/decision-policy.js';
import {initializePending,runPendingRechecks} from '../src/pending-lifecycle.js';
import {recordDiscovered} from '../src/discovery-work.js';import {resolvedRecoverySurface} from '../src/facts-readiness.js';
import {localDatabase} from '../scripts/local-db.mjs';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
const at=Date.parse('2026-11-01T09:00:00+09:00'),robot='User-agent: *\nAllow: /';
async function prepare(c,db,t=at){
 const s=await store(db),a={...getSource(c.r.source_id),enabled:true,productionEnabled:true,robotsHash:await hash(robot)};
 await administer(s,{action:'publish-on',reason:'review_complete'},t,[a]);
 await s.recordHealth({sourceId:a.id,status:'healthy',reasonCode:'ok',checkedAt:t,successfulAt:t});
 await s.db.prepare('INSERT OR REPLACE INTO source_state(source_id,last_discovery_at,robots_hash) VALUES(?,?,?)').bind(a.id,t,a.robotsHash).run();
 await put(s,c.r.id,{id:c.r.id,sourceId:a.id,sourceName:a.name,sourceUrl:c.r.source_url,normalizedUrl:c.r.source_url,publishedAt:c.r.published_at,collectedAt:new Date(t).toISOString(),productFacts:null,category:c.r.category,eventType:c.r.event_type});
 await recordDiscovered(s,a,[{url:c.r.source_url}],at-DAY);
 const calls=[],options={sleep:async()=>{},fetcher:async u=>{calls.push(u);assert([a.robotsUrl,c.r.source_url].includes(u));return new Response(u===a.robotsUrl?robot:c.h,{headers:{'Content-Type':u===a.robotsUrl?'text/plain':'text/html'}});}};
 const recover=async(time=t)=>{const r=await s.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(c.r.id).first();return recheckFacts(s,{id:r.id,revision:r.review_revision,snapshot:await candidateSnapshot(r),requestId:crypto.randomUUID()},time,[a],pepper,{type:'human_operator',id:'access:local-fixture'},options);};
 return {s,a,calls,options,recover};
}
for(const c of cases)test(`formal recovery and Operator READY, no publication: ${c.name}`,async()=>{
 const {s,a,calls,recover}=await prepare(c);const out=await recover();assert.equal(out.recovered,true,JSON.stringify(out));assert.equal(out.validation.valid,true,JSON.stringify(out));
 const d=await reviewDetail(s,c.r.id,at,[a],pepper);assert.equal(d.factsReview.reviewability,'READY_FOR_HUMAN_DECISION');assert.equal(d.status,'pending');assert.equal(calls.length,2);
 assert(d.validation.publishableLabel);assert.equal((await s.db.prepare('SELECT COUNT(*) n FROM news_decision_ledger').first()).n,0);
 const before=calls.length;await recover();assert.equal(calls.length,before);
});
for(const c of cases)test(`primary proof boundaries: ${c.name}`,()=>{
 for(const h of [c.h.replace(c.r.source_url,'https://invalid.test/'),c.h.replace('class="p-content"','class="p-content" hidden').replace('class="main_wrap"','class="main_wrap" hidden')])assert.throws(()=>parsePrimaryAnnouncement(h,getSource(c.r.source_id),c.r),/facts_/);
});
test('short identity must name the exact announced device, not X20, another manufacturer or hidden evidence',()=>{
 const c=cases.find(c=>c.name==='OLLO AUDIO');for(const [i,h] of [c.h.replace('ヘッドフォン「X2」は','ヘッドフォン「X20」は'),c.h.replace('OLLO Audio社製','Other Audio社製'),c.h.replace('ヘッドフォン「X2」は','関連商品ヘッドフォン「X2」は'),c.h.replace('ヘッドフォン「X2」は','<span hidden>ヘッドフォン「X2」は</span>'),c.h.replace('class="wp-block-heading"','class="wp-block-heading" hidden'),c.h.replace('受注を開始いたします','受注を開始しません')].entries())assert.throws(()=>parsePrimaryAnnouncement(h,getSource('ikebe'),c.r),/facts_/,String(i));
});
test('two unrelated model definitions require the explicit typed group and every own release statement',()=>{
 const c=cases.find(c=>c.name==='EarthQuaker');for(const h of [c.h.replace('2機種','3機種'),c.h.replace('オーバードライブ2機種','機材2機種'),c.h.replace('Blumes（ブルームス）MOSFET Modは数量限定での発売','Other（アザー）MOSFET Modは数量限定での発売'),c.h.replace('Blumes（ブルームス）MOSFET Modは数量限定での発売','関連商品Blumes（ブルームス）MOSFET Modは数量限定での発売')])assert.throws(()=>parsePrimaryAnnouncement(h,getSource('ikebe'),c.r),/facts_/);
});
test('colour variant cannot borrow a type from an unrelated amplifier',()=>{
 const c=cases.find(c=>c.name==='Aguilar');for(const h of [c.h.replace('ヘッドアンプDB700に','ヘッドアンプDB900に'),c.h.replace('「All Black」モデルが実現','「All Red」モデルが実現'),c.h.replace('最新ヘッドアンプ','関連商品ヘッドアンプ')])assert.throws(()=>parsePrimaryAnnouncement(h,getSource('ikebe'),c.r),/facts_/);
});
test('release date differs from article publication, conflicting date fields remain held',()=>{
 const c=cases.find(c=>c.name==='Native Instruments'),r=parsePrimaryAnnouncement(c.h,getSource('shimamura'),c.r);assert.equal(r.productFacts.announcement.date,'2026-10-28');assert.equal(r.publishedAt,'2026-10-28T15:00:00.000Z');
 assert.throws(()=>parsePrimaryAnnouncement(c.h.replace('</div>','</div>').replace('</p></div>','</p><h2>発売日</h2><p>2026年10月27日</p></div>'),getSource('shimamura'),c.r),/facts_date_changed/);
});
test('new bounded evidence cannot claim an old parser or lose its source proof',async()=>{
 const c=cases.find(c=>c.name==='OLLO AUDIO'),x=await prepare(c);await x.recover();let r=await x.s.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(c.r.id).first();
 const currentProof=JSON.parse(r.facts_provenance)[0],cache={outcome:'verified_surface',lease_until:0,proof_json:JSON.stringify(currentProof),items_json:JSON.stringify([{id:r.id,sourceUrl:r.source_url,publishedAt:r.published_at,eventType:r.event_type,productFacts:JSON.parse(r.product_facts)}])};
 assert(await reusablePrimaryEvidence(cache,r,x.a,at));assert(!await reusablePrimaryEvidence({...cache,proof_json:JSON.stringify({...currentProof,parserVersion:'primary-announcement-3'})},r,x.a,at));
 const proof=JSON.parse(r.facts_provenance).map(p=>({...p,parserVersion:'primary-announcement-3'}));assert((await publicationValidation(x.s,{...r,facts_provenance:JSON.stringify(proof)},at,[x.a],pepper)).errors.includes('facts_provenance_invalid'));
 assert((await publicationValidation(x.s,{...r,facts_provenance:'[]'},at,[x.a],pepper)).errors.includes('facts_provenance_invalid'));
 await x.s.db.prepare('INSERT INTO news_takedowns(item_id,expires_at) VALUES(?,?)').bind(r.id,at+DAY).run();assert((await publicationValidation(x.s,r,at,[x.a],pepper)).errors.includes('candidate_takedown'));
});
// Real migrations and persistent workerd D1 exercise the same recovery/Operator contract.
test('persistent workerd D1: all six recover to READY and survive restart without approval',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'news-six-d1-'));let rt;
 try{rt=await localDatabase(dir);let shimaDay=0;for(const c of cases){const t=at+(c.r.source_id==='shimamura'?shimaDay++:0)*DAY;const x=await prepare(c,rt.db,t);const out=await x.recover();assert(out.validation.valid,c.name+JSON.stringify(out));}
 const finalTime=at+2*DAY;for(const id of ['shimamura','ikebe'])await rt.store.recordHealth({sourceId:id,status:'healthy',reasonCode:'ok',checkedAt:finalTime,successfulAt:finalTime});
 assert.equal((await rt.db.prepare("SELECT COUNT(*) n FROM candidate_items WHERE product_facts IS NOT NULL AND review_status='pending'").first()).n,6);
 await rt.mf.dispose();rt=null;rt=await localDatabase(dir);
 for(const c of cases){const a={...getSource(c.r.source_id),enabled:true,productionEnabled:true};const d=await reviewDetail(rt.store,c.r.id,at+2*DAY,[a],pepper);assert(d.validation.valid,c.name+JSON.stringify(d.validation));assert.equal(d.status,'pending');}
 assert.equal((await rt.db.prepare('SELECT COUNT(*) n FROM news_decision_ledger').first()).n,0);
 }finally{await rt?.mf.dispose();await rm(dir,{recursive:true,force:true});}
});

async function failedEvidence(x,c,pipeline='primary-announcement-3',checked=at-DAY){
 const r=await x.s.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(c.r.id).first();
 const surface=await resolvedRecoverySurface(x.s,r,x.a);
 const proof={sourceId:x.a.id,sourceUrl:r.source_url,publishedAt:r.published_at,verifiedAt:checked,responseHash:'a'.repeat(64),evidenceKey:await hash(r.title_fingerprint),extractionMethod:surface.method,parserVersion:surface.parser,pipelineVersion:pipeline,failureReason:'facts_primary_type_unbound',factField:'_extraction_failure'};
 await x.s.db.prepare('INSERT INTO news_facts_rechecks(request_id,request_payload_hash,candidate_id,checked_at,outcome,provenance_json) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),'fixture',r.id,checked,'facts_primary_evidence_unchanged',JSON.stringify([proof])).run();
 await x.s.db.prepare('UPDATE news_discovery_work SET parser_version=?,evidence_json=? WHERE candidate_id=? OR normalized_url=?').bind(pipeline,JSON.stringify({outcome:'facts_primary_evidence_unchanged',items:[],proof}),r.id,r.source_url).run();
 await initializePending(x.s,at);
 await x.s.db.prepare("UPDATE news_pending_lifecycle SET next_recheck_at=NULL,last_recheck_result='facts_primary_evidence_unchanged' WHERE candidate_id=?").bind(r.id).run();
 return proof;
}
test('parser upgrade requeues a terminal old failure and normal hourly recovery reaches READY',async()=>{
 const c=cases.find(c=>c.name==='OLLO AUDIO'),x=await prepare(c);await failedEvidence(x,c);
 await initializePending(x.s,at);assert.equal((await x.s.db.prepare('SELECT next_recheck_at FROM news_pending_lifecycle WHERE candidate_id=?').bind(c.r.id).first()).next_recheck_at,at);
 const out=await runPendingRechecks(x.s,at,[x.a],pepper,x.options);assert.equal(out.newlyReady,1,JSON.stringify(out));assert.equal(x.calls.length,2);
 assert.equal((await x.s.db.prepare('SELECT COUNT(*) n FROM news_decision_ledger').first()).n,0);
});
test('unchanged current parser does not requeue or refetch a terminal failure',async()=>{
 const c=cases.find(c=>c.name==='OLLO AUDIO'),x=await prepare(c);await failedEvidence(x,c,PRIMARY_ANNOUNCEMENT_PARSER);await initializePending(x.s,at);
 assert.equal((await x.s.db.prepare('SELECT next_recheck_at FROM news_pending_lifecycle WHERE candidate_id=?').bind(c.r.id).first()).next_recheck_at,null);
 const out=await x.recover();assert.equal(out.outcome,'facts_primary_evidence_unchanged');assert.equal(x.calls.length,0);
});
test('parser upgrade never retries a URL already fetched today',async()=>{
 const c=cases.find(c=>c.name==='OLLO AUDIO'),x=await prepare(c),p=await failedEvidence(x,c,'primary-announcement-3',at-1000);
 await x.s.db.prepare("INSERT INTO news_facts_sources(source_id,lease_token,checked_at,outcome,proof_json) VALUES(?,'old',?,'facts_primary_type_unbound',?)").bind('ikebe:old:'+c.r.id,at-1000,JSON.stringify(p)).run();
 const out=await runPendingRechecks(x.s,at,[x.a],pepper,x.options);assert.equal(out.newlyReady,0);assert.equal(x.calls.length,0);
});
test('one primary article per JST day is preserved and a deferred URL uses the next normal slot',async()=>{
 const first=await prepare(cases.find(c=>c.name==='EastWest'));assert((await first.recover()).validation.valid);
 const c=cases.find(c=>c.name==='Louis'),x=await prepare(c,first.s.db);const deferred=await x.recover();assert.equal(deferred.outcome,'facts_daily_budget_deferred');assert.equal(x.calls.length,0);
 const out=await x.recover(at+DAY);assert.equal(out.validation.valid,true,JSON.stringify(out));assert.equal(x.calls.length,2);
});
test('reject, source block and duplicate guards remain authoritative',async()=>{
 const c=cases.find(c=>c.name==='EarthQuaker'),x=await prepare(c);await x.recover();const r=await x.s.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(c.r.id).first();
 await put(x.s,'published-peer',{sourceId:x.a.id,sourceName:x.a.name,sourceUrl:'https://www.ikebe-gakki-pb.com/new_product/999999/',normalizedUrl:'https://www.ikebe-gakki-pb.com/new_product/999999/',productFacts:JSON.parse(r.product_facts),category:r.category,eventType:r.event_type,publishedAt:r.published_at,collectedAt:new Date(at).toISOString()});
 await x.s.db.prepare("UPDATE candidate_items SET review_status='approved' WHERE id='published-peer'").run();assert((await publicationValidation(x.s,r,at,[x.a],pepper)).errors.includes('duplicate'));
 await x.s.db.prepare('UPDATE source_state SET publication_blocked=1 WHERE source_id=?').bind(x.a.id).run();assert((await publicationValidation(x.s,r,at,[x.a],pepper)).errors.includes('operator_source_gate'));
 await x.s.db.prepare("UPDATE candidate_items SET review_status='rejected' WHERE id=?").bind(r.id).run();await assert.rejects(x.recover(),/already_decided/);
});
