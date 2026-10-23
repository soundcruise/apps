import test from 'node:test';import assert from 'node:assert/strict';
import {getSource,SOURCES,phaseOneSourceReady} from '../src/registry.js';
import {runtimeSources} from '../src/runtime.js';import {collectSource} from '../src/collector.js';
import {parseMetadata} from '../src/metadata.js';import {store,pepper} from './helpers.js';
const now=Date.parse('2026-10-23T00:00:00Z');
test('Deviser RSS preserves dates, source URL and Headway categories without inventing product facts',()=>{
 // Synthetic format case, not a claim that a current publisher response was fetched.
 const xml='<rss><channel><item><title>Headwayのギターに関する公式のお知らせ</title><link>https://www.deviser.co.jp/information/900001</link><pubDate>Thu, 22 Oct 2026 00:00:00 GMT</pubDate><category>Headway Guitars</category><category>お知らせ</category><description>UNVERIFIED_BODY</description></item></channel></rss>';
 const [entry]=parseMetadata(xml,'rss');assert.equal(entry.date,'Thu, 22 Oct 2026 00:00:00 GMT');assert.equal(entry.url,'https://www.deviser.co.jp/information/900001');assert.deepEqual(entry.metadataCategories,['Headway Guitars','お知らせ']);assert.equal(entry.productFacts,undefined);assert(!JSON.stringify(entry).includes('UNVERIFIED_BODY'));
});
test('an env allowlist cannot enable incomplete Deviser discovery or turn policy silence into permission',async()=>{
 const source=getSource('deviser');assert.equal(source.discoveryType,'rss');assert.equal(source.discoveryValid,false);assert.equal(source.explicitAutomationPermission,false);assert.equal(phaseOneSourceReady(source,now),false);
 const registry=runtimeSources({NEWS_SOURCE_IDS:'["deviser"]'},SOURCES,now),s=await store();let calls=0;
 const r=await collectSource('deviser',s,{mode:'production',registry,now,pepper,fetcher:()=>{calls++;assert.fail('OFF source HTTP')}});assert.equal(calls,0);assert.equal(r.requests,0);assert.equal((await s.candidates()).length,0);
});
test('Martin preparation does not create a live source, acquire pages or borrow another grant',async()=>{
 assert.equal(getSource('martin-club-japan'),undefined);
 const registry=runtimeSources({NEWS_SOURCE_IDS:'["martin-club-japan"]'},SOURCES,now);assert(registry.every(s=>!s.enabled&&!s.productionEnabled));
 const s=await store(),r=await collectSource('martin-club-japan',s,{mode:'production',registry,now,pepper,fetcher:()=>assert.fail('permission required')});assert.equal(r.requests,0);assert.equal((await s.candidates()).length,0);
});
