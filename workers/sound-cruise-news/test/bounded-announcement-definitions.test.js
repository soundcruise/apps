import test from 'node:test';import assert from 'node:assert/strict';
import {parsePrimaryAnnouncement,primaryParserSupports,PRIMARY_ANNOUNCEMENT_PARSER} from '../src/primary-announcement.js';
const url='https://www.shimamura.co.jp/update/amp-effector/2026/10/99931/',row={source_id:'shimamura',source_url:url,review_status:'pending',published_at:'2026-09-30T15:00:00.000Z'},source={id:'shimamura',baseUrl:'https://www.shimamura.co.jp'};
const p=t=>`<p class="wp-block-paragraph">${t}</p>`;
const page=(title,body,rows)=>`<link rel="canonical" href="${url}"><div class="mb-80"><h1>${title}</h1></div><p>公開：<time datetime="2026-10-01"></time></p><div class="p-content">${body}<table>${rows.map(x=>`<tr><td>${x}JANコード：1234567890123</td></tr>`).join('')}</table></div>`;
const kit=()=>page('【Craft】「ソルダーレス DCケーブル キット」が登場',`<div>${p('配線に関する一般説明。')}${p('導入に関する背景。')}${p('Craft（クラフト）より、長さを選べる「ソルダーレス DCケーブル キット（DCK9）」が登場しました。')}</div>`,['Craft DCK9（ソルダーレス DCケーブル キット）','Craft PLUG9（DCプラグ）']);
const consolePage=()=>page('Craft Audio DESKシリーズ | デジタルミキサー3モデルが登場',p('Craft Audioが、48チャンネルのデジタルミキサー「DESK-BK」「DESK COMPACT」「DESK RACK」を発売します。')+p('DESKシリーズの3モデルは、48チャンネルのデジタルミキサーです。')+'<h2>発売日</h2><p>2026年10月1日</p>',['DESK-BK','DESK COMPACT','DESK RACK']);
test('nested third paragraph binds English manufacturer, Japanese descriptor, kit model and independent table',()=>{const x=parsePrimaryAnnouncement(kit(),source,row);assert.equal(x.productFacts.brand,'Craft');assert.deepEqual(x.productFacts.models,['DCK9']);assert.equal(x.productFacts.productType,'dc_cable_kit');assert(!primaryParserSupports(x.productFacts,'primary-announcement-7'));});
test('all explicitly launched mixer models map to a corroborated family without truncating variants',()=>{const x=parsePrimaryAnnouncement(consolePage(),source,row);assert.deepEqual(x.productFacts.models,['DESK-BK','DESK COMPACT','DESK RACK']);assert.equal(x.productFacts.productType,'digital_mixer');assert(!primaryParserSupports(x.productFacts,'primary-announcement-7'));});
for(const [name,mutate]of Object.entries({brand:h=>h.replace('【Craft】','【Other】'),model:h=>h.replace('Craft DCK9（','Craft DCK8（'),scope:h=>h.replace('DCケーブル キット（DCK9）','接続用アダプター（DCK9）'),negation:h=>h.replace('が登場しました','が登場しない'),related:h=>h.replace('<div><p','<div class="related"><p'),canonical:h=>h.replace(url,'https://other.example/'),hidden:h=>h.replace('<div><p','<div hidden><p')}))test('kit rejects '+name,()=>assert.throws(()=>parsePrimaryAnnouncement(mutate(kit()),source,row),/facts_/));
for(const [name,mutate]of Object.entries({count:h=>h.replace('3モデルが登場','2モデルが登場'),family:h=>h.replace('DESKシリーズ |','OTHERシリーズ |'),table:h=>h.replace('DESK RACKJANコード','OTHER RACKJANコード'),definition:h=>h.replace('デジタルミキサーです','デジタルミキサーではありません'),missing:h=>h.replace('<tr><td>DESK RACKJANコード：1234567890123</td></tr>',''),extra:h=>h.replace('</table>','<tr><td>OTHERJANコード：1234567890123</td></tr></table>')}))test('console rejects '+name,()=>assert.throws(()=>parsePrimaryAnnouncement(mutate(consolePage()),source,row),/facts_/));
import {store,pepper} from './helpers.js';import {put} from './operator-case.js';import {getSource} from '../src/registry.js';import {hash} from '../src/policy.js';import {administer} from '../src/admin.js';import {recheckFacts} from '../src/facts-recheck.js';import {candidateSnapshot,reviewDetail} from '../src/operator-review.js';import {recordDiscovered} from '../src/discovery-work.js';
for(const [type,html,priorFailure]of [['dc_cable_kit',kit()],['digital_mixer',consolePage()],['dc_cable_kit',joinedKit(),true]])test(type+' formal recheck preserves pending status and reaches READY without publication',async()=>{
 const now=Date.parse('2026-10-02T09:00:00+09:00'),robots='User-agent: *\nAllow: /',s=await store(),a={...getSource('shimamura'),enabled:true,productionEnabled:true,robotsHash:await hash(robots)};
 await administer(s,{action:'publish-on',reason:'review_complete'},now,[a]);await s.recordHealth({sourceId:a.id,status:'healthy',reasonCode:'ok',checkedAt:now,successfulAt:now});await s.db.prepare('INSERT OR REPLACE INTO source_state(source_id,last_discovery_at,robots_hash) VALUES(?,?,?)').bind(a.id,now,a.robotsHash).run();const item=await put(s,'bounded-'+type,{sourceId:a.id,sourceName:a.name,sourceUrl:url,normalizedUrl:url,publishedAt:row.published_at,productFacts:null,category:'recording_audio',eventType:'new_product'});await recordDiscovered(s,a,[{url}],now-86400000);const old=await s.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(item.id).first(),calls=[];
 if(priorFailure)await s.db.prepare('INSERT INTO news_facts_sources(source_id,lease_token,checked_at,outcome,items_json,proof_json) VALUES(?,?,?,?,?,?)').bind(a.id+':retained:'+item.id,'fixture-prior',now-60000,'facts_extraction_incomplete','[]',JSON.stringify({sourceId:a.id,sourceUrl:url,verifiedAt:now-60000,parserVersion:'shimamura-product-fields-13',pipelineVersion:'primary-announcement-8',responseHash:'a'.repeat(64),evidenceKey:await hash(old.title_fingerprint||''),failureReason:'facts_extraction_incomplete',failureKind:'extraction',parserFailures:[{parser:'shimamura-product-fields-13',reason:'facts_extraction_incomplete'}]})).run();
 const result=await recheckFacts(s,{id:old.id,revision:old.review_revision,snapshot:await candidateSnapshot(old),requestId:crypto.randomUUID()},now,[a],pepper,{type:'human_operator',id:'fixture:recovery'},{sleep:async()=>{},fetcher:async u=>{calls.push(u);assert([a.robotsUrl,url].includes(u));return new Response(u===a.robotsUrl?robots:html,{headers:{'Content-Type':u===a.robotsUrl?'text/plain':'text/html'}});}});
 assert(result.recovered,JSON.stringify(result));const detail=await reviewDetail(s,old.id,now,[a],pepper);assert.equal(detail.preparationState,'READY');assert.equal(detail.status,'pending');assert.equal(detail.facts.productType,type);assert.equal(calls.length,2);assert.equal((await s.db.prepare('SELECT COUNT(*) n FROM news_decision_ledger').first()).n,0);assert(detail.factsReview.provenance.every(p=>p.parserVersion===PRIMARY_ANNOUNCEMENT_PARSER));
});

test('related-only product tables cannot corroborate an own announcement',()=>{for(const h of [kit(),consolePage()])assert.throws(()=>parsePrimaryAnnouncement(h.replace('<table>','<div class="related"><table>').replace('</table>','</table></div>'),source,row),/facts_/);});

// Synthetic text preserves the observed one-paragraph topology without storing
// the publisher's introduction or article body.
function joinedKit(){return kit().replace(/<\/p><p class="wp-block-paragraph">/g,'<br><br>').replace('配線に関する一般説明。','比較は導入の説明です。');}
test('complete kit definition survives introductory sentences in one paragraph',()=>{
 const x=parsePrimaryAnnouncement(joinedKit(),source,row);
 assert.equal(x.productFacts.brand,'Craft');assert.deepEqual(x.productFacts.models,['DCK9']);
 assert.equal(x.productFacts.productType,'dc_cable_kit');
});
for(const [name,mutate]of Object.entries({
 negated:h=>h.replace('が登場しました','が登場しない'),
 quoted:h=>h.replace('Craft（クラフト）より、長さを選べる', '引用：「過去の説明。Craft（クラフト）より、長さを選べる').replace('が登場しました。', 'が登場しました。」これは引用です。'),
 fragments:h=>h.replace('Craft（クラフト）より、','Craft（クラフト）より。'),
 tableMismatch:h=>h.replace('Craft DCK9（','Other DCK9（'),
 related:h=>h.replace('<div><p','<div class="related"><p'),
 ambiguous:h=>h.replace('が登場しました。','が登場しました。Craft（クラフト）より、選べる「ソルダーレス DCケーブル キット（DCK9）」が登場しました。')
}))test('one-paragraph kit rejects '+name,()=>assert.throws(()=>parsePrimaryAnnouncement(mutate(joinedKit()),source,row),/facts_/));
test('parser 8 sealed kit, console and DAW proofs remain supported',()=>{
 for(const h of [kit(),consolePage()])assert(primaryParserSupports(parsePrimaryAnnouncement(h,source,row).productFacts,'primary-announcement-8'));
 assert(primaryParserSupports({productType:'daw'},'primary-announcement-8'));
});
