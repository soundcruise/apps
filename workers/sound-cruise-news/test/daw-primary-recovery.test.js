import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePrimaryAnnouncement,primaryParserSupports,validPrimaryAnnouncement,primaryAnnouncementLabel} from '../src/primary-announcement.js';
const url='https://www.shimamura.co.jp/update/dtm-recording/2026/10/99921/';
const row={source_id:'shimamura',source_url:url,published_at:'2026-09-30T15:00:00.000Z'};
const source={id:'shimamura',baseUrl:'https://www.shimamura.co.jp'};
const page=(body='Craft Softwareが、音楽制作ソフトウェア「Studio 20」を発売しました。')=>`<link rel="canonical" href="${url}"><div class="mb-80"><h1>Craft Software Studio 20が新発売</h1></div><div>公開：<time datetime="2026-10-01">2026/10/01</time></div><div class="p-content"><p class="wp-block-paragraph">${body}</p><h2>発売日</h2><p>2026年10月1日</p></div>`;
test('source-bound DAW definition is a software release, without borrowing bundled instruments',()=>{
 const r=parsePrimaryAnnouncement(page(),source,row);assert.equal(r.productFacts.productType,'daw');assert.equal(r.productFacts.category,'dtm_software');assert.equal(r.productFacts.product,'Studio 20');assert(validPrimaryAnnouncement(r.productFacts));assert.match(primaryAnnouncementLabel(r.productFacts),/音楽制作ソフトウェア/);assert(primaryParserSupports(r.productFacts,'primary-announcement-7'));assert(!primaryParserSupports(r.productFacts,'primary-announcement-6'));
});
for(const body of ['Craft Softwareが、プラグイン「Studio 20」を発売しました。「Studio 20」はDAWで使用するエフェクトです。','Craft Softwareが、DAW用のケース「Studio 20」を発売しました。','Craft Softwareが、「Studio 20」を発売しました。関連商品は音楽制作ソフトウェアです。','Craft Softwareが、音楽制作ソフトウェア「Different 20」を発売しました。'])test('DAW target, related or mismatching product does not qualify: '+body,()=>assert.throws(()=>parsePrimaryAnnouncement(page(body),source,row),/facts_/));
test('DAW scope does not relax source/date/optout checks',()=>{for(const h of [page().replace('datetime="2026-10-01"','datetime="2026-10-02"'),page().replace(url,'https://other.example/'),'<meta name="robots" content="noarchive">'+page()])assert.throws(()=>parsePrimaryAnnouncement(h,source,row),/facts_/);});
import {store,pepper} from './helpers.js';
import {put} from './operator-case.js';
import {getSource} from '../src/registry.js';
import {hash} from '../src/policy.js';
import {administer} from '../src/admin.js';
import {recheckFacts} from '../src/facts-recheck.js';
import {candidateSnapshot,reviewDetail} from '../src/operator-review.js';
import {recordDiscovered} from '../src/discovery-work.js';
test('missing stored facts recover through normal service to Operator READY without publication',async()=>{
 const now=Date.parse('2026-10-02T09:00:00+09:00'),robots='User-agent: *\nAllow: /',s=await store(),a={...getSource('shimamura'),enabled:true,productionEnabled:true,robotsHash:await hash(robots)};
 await administer(s,{action:'publish-on',reason:'review_complete'},now,[a]);await s.recordHealth({sourceId:a.id,status:'healthy',reasonCode:'ok',checkedAt:now,successfulAt:now});await s.db.prepare('INSERT OR REPLACE INTO source_state(source_id,last_discovery_at,robots_hash) VALUES(?,?,?)').bind(a.id,now,a.robotsHash).run();
 const item=await put(s,'daw-normal-recovery',{sourceId:a.id,sourceName:a.name,sourceUrl:url,normalizedUrl:url,publishedAt:row.published_at,productFacts:null,category:'dtm_software',eventType:'new_product'});await recordDiscovered(s,a,[{url}],now-86400000);const old=await s.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(item.id).first(),calls=[];
 const result=await recheckFacts(s,{id:old.id,revision:old.review_revision,snapshot:await candidateSnapshot(old),requestId:crypto.randomUUID()},now,[a],pepper,{type:'human_operator',id:'fixture:recovery'},{sleep:async()=>{},fetcher:async u=>{calls.push(u);assert([a.robotsUrl,url].includes(u));return new Response(u===a.robotsUrl?robots:page(),{headers:{'Content-Type':u===a.robotsUrl?'text/plain':'text/html'}});}});
 assert(result.recovered,JSON.stringify(result));const detail=await reviewDetail(s,old.id,now,[a],pepper);assert.equal(detail.preparationState,'READY');assert.equal(detail.status,'pending');assert.equal(detail.facts.productType,'daw');assert.equal(calls.length,2);assert.equal((await s.db.prepare('SELECT COUNT(*) n FROM news_decision_ledger').first()).n,0);
});
