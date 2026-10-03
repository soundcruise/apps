import test from 'node:test';
import assert from 'node:assert/strict';
import {parseOfficialListing} from '../src/official-listing.js';
import {candidateFrom,parseMetadata} from '../src/metadata.js';
import {getSource} from '../src/registry.js';
import {handleNewsRequest} from '../src/worker.js';
import {store,pepper} from './helpers.js';
import {DAY} from '../src/policy.js';

const now=Date.parse('2026-10-03T09:00:00Z');
const zoom={...getSource('zoom'),enabled:true,productionEnabled:true};
const allow={isAllowed:()=>true};
const card=(written,path='synthetic-h5-update')=>`<article class="card"><h2 class="card-title"><a href="/ja/jp/news/${path}/">H5studio ファームウェア更新</a></h2><time>${written}</time></article>`;
const entry=(date,path='synthetic-h5-update')=>({title:'H5studio ファームウェア更新',url:`https://zoomcorp.com/ja/jp/news/${path}/`,date,listingSection:'official_news'});

test('publication date: old official ZOOM date with new collection is rejected, not made fresh',async()=>{
 const e=parseOfficialListing(card('November 12, 2025'),zoom).entries[0];
 assert.equal(e.date,'2025-11-11T15:00:00.000Z');
 assert.deepEqual(await candidateFrom(e,zoom,allow,now,pepper),{decision:'REJECT',reason:'date_outside_window'});
});

test('publication date: ZOOM calendar rollover is invalid, never today',()=>{
 assert.throws(()=>parseOfficialListing(card('September 31, 2026'),zoom),/listing_structure_changed/);
});

test('publication date: declared ZOOM October 2 remains distinct from October 3 discovery',async()=>{
 const e=parseOfficialListing(card('October 02, 2026'),zoom).entries[0];
 const {item}=await candidateFrom(e,zoom,allow,now,pepper);
 assert.equal(item.publishedAt,'2026-10-01T15:00:00.000Z');
 assert.equal(item.feedPublishedAt,item.publishedAt);
 assert.equal(item.collectedAt,new Date(now).toISOString());
 assert.notEqual(item.publishedAt,item.collectedAt);
 assert.equal(item.publicationDecision,'PUBLISH_REVIEW');
});

for(const [name,date] of [['missing',''],['invalid','not-a-publication-date']])test(`publication date: ${name} stays null and REVIEW without collection fallback`,async()=>{
 const {item}=await candidateFrom(entry(date),zoom,allow,now,pepper);
 assert.equal(item.publishedAt,null);
 assert.equal(item.feedPublishedAt,null);
 assert.equal(item.publicationDecision,'PUBLISH_REVIEW');
});

test('publication date: future official date cannot enter storage',async()=>{
 assert.equal((await candidateFrom(entry('2026-10-04T00:00:00+09:00'),zoom,allow,now,pepper)).reason,'date_outside_window');
});

test('publication date: Atom publication wins over updated timestamp',()=>{
 const [e]=parseMetadata('<feed><entry><title>Synthetic</title><link href="https://example.invalid/"/><published>2025-11-12T00:00:00Z</published><updated>2026-10-03T00:00:00Z</updated></entry></feed>','atom');
 assert.equal(e.date,'2025-11-12T00:00:00Z');
});

test('publication date: updated-only Atom and ordinary sitemap lastmod are not publication',()=>{
 assert.equal(parseMetadata('<feed><entry><title>Synthetic</title><updated>2026-10-03T00:00:00Z</updated></entry></feed>','atom')[0].date,'');
 assert.equal(parseMetadata('<urlset><url><loc>https://example.invalid/</loc><lastmod>2026-10-03</lastmod></url></urlset>','sitemap')[0].date,'');
});

test('publication date: same URL rediscovery cannot overwrite date, collection, expiry or approval',async()=>{
 const s=await store();
 const {item}=await candidateFrom(entry('2026-08-07T00:00:00+09:00'),zoom,allow,now,pepper);
 assert.equal(await s.put(item),true);
 await s.db.prepare("UPDATE candidate_items SET review_status='approved' WHERE id=?").bind(item.id).run();
 const before=(await s.candidates())[0];
 const {item:rediscovered}=await candidateFrom(entry('2026-10-02T00:00:00+09:00'),zoom,allow,now+DAY,pepper);
 assert.equal(await s.put(rediscovered),false);
 assert.deepEqual((await s.candidates())[0],before);
 assert.equal(before.expires_at,Date.parse(item.publishedAt)+90*DAY);
});

test('publication date: public API uses article date for 7/14 day ticker and 90 day visibility',async()=>{
 const s=await store();
 const {item}=await candidateFrom(entry('2026-09-23T00:00:00+09:00'),zoom,allow,now,pepper);
 await s.put(item);
 await s.db.prepare("UPDATE candidate_items SET review_status='approved' WHERE id=?").bind(item.id).run();
 const api=async(path,at)=>{
  const response=await handleNewsRequest(new Request('https://news.example.invalid'+path),{NEWS_DB:s.db,NEWS_API_MODE:'production'},at,{registry:[zoom],cache:null});
  assert.equal(response.status,200);return (await response.json()).items;
 };
 assert.equal((await api('/v1/news/ticker',now)).length,1); // 14-day fallback, not discovery freshness
 assert.equal((await api('/v1/news/ticker',now+5*DAY)).length,0);
 assert.equal((await api('/v1/news',now+80*DAY)).length,0);
 const {item:fresh}=await candidateFrom({...entry('2026-10-02T00:00:00+09:00','synthetic-fresh'),title:'TCA-1 ファームウェア更新'},zoom,allow,now,pepper);
 await s.put(fresh);
 await s.db.prepare("UPDATE candidate_items SET review_status='approved' WHERE id=?").bind(fresh.id).run();
 assert.deepEqual((await api('/v1/news/ticker',now)).map(x=>x.id),[fresh.id]);
 await s.purge(now+90*DAY);
 assert.equal((await s.candidates()).length,0);
});

test('publication date: after retention, old declared date is still rejected; publisher redating remains a review boundary',async()=>{
 const s=await store();
 const {item}=await candidateFrom(entry('2026-08-07T00:00:00+09:00'),zoom,allow,now,pepper);
 await s.put(item);
 const later=now+100*DAY;
 await s.purge(later);
 assert.equal((await s.candidates()).length,0);
 assert.equal((await candidateFrom(entry('2026-08-07T00:00:00+09:00'),zoom,allow,later,pepper)).reason,'date_outside_window');
 // A source can reuse the URL while declaring a new date. Projection cannot infer
 // the original content date after expiry. Firmware stays REVIEW, not auto reject.
 const {item:redated}=await candidateFrom(entry(new Date(later-DAY).toISOString()),zoom,allow,later,pepper);
 assert.equal(redated.publicationDecision,'PUBLISH_REVIEW');
 assert.equal(redated.publishedAt,new Date(later-DAY).toISOString());
});
