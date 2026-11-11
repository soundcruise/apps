import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepareNews,tickerNews} from './news-data.js';
import {selectTicker,compareTicker} from './news-quality.js';
import {NEWS_BETA_ITEMS} from './data/news-beta.js';

const replay=JSON.parse(readFileSync(new URL('./test-fixtures/news-home-20261111.json',import.meta.url)));
const now=Date.parse(replay.at),ids=rows=>rows.map(i=>i.id);
const projected=replay.items.map(i=>({...i,topicKey:i.id,createdAt:i.publishedAt,updatedAt:i.publishedAt,sourceKind:'official',sourceSafety:'safe',manualReviewStatus:'approved'}));
const make=(id,age,extra={})=>({...NEWS_BETA_ITEMS[0],id,topicKey:id,publishedAt:new Date(now-age*86400000).toISOString(),label:'メーカー、限定ギターを発表',...extra});

test('real November 11 replay: newest review first; the other four and hot/manual metadata remain',()=>{
 const eligible=prepareNews(projected,{now,mode:'on'});
 const old=eligible.filter(i=>now-Date.parse(i.publishedAt)<=7*86400000).sort((a,b)=>compareTicker(a,b,now)).slice(0,5);
 assert.deepEqual(ids(old),replay.previousTickerIds);
 const result=tickerNews(eligible,now);
 assert.deepEqual(ids(result),[replay.items[0].id,...ids(old).filter(id=>id!==replay.items[0].id)]);
 assert.equal(result.find(i=>i.id===replay.items[4].id).hot,true);
 // Date-local manual order remains independent of home ticker selection.
 assert.equal(eligible.indexOf(eligible.find(i=>i.id===replay.items[4].id))<eligible.indexOf(eligible.find(i=>i.id===replay.items[3].id)),true);
 const apiRows=eligible.filter(i=>now-Date.parse(i.publishedAt)<=7*86400000).map(({publishedAt,...i})=>({...i,published_at:publishedAt}));
 assert.deepEqual(ids(selectTicker(apiRows,now)),ids(result),'API snake-case and Port camel-case share selection');
});
test('a lower-scoring new item cannot be crowded out by five older high-scoring items',()=>{
 const input=[...Array.from({length:8},(_,i)=>make('old'+i,3+i/10)),make('new',0,{label:'アコースティック・ギターの試奏・レビュー記事を公開'})];
 const copy=[...input],result=tickerNews(prepareNews(input,{now,mode:'on'}),now);
 assert.equal(result[0].id,'new');assert.equal(result.length,5);assert.deepEqual(input,copy);
 assert.equal(new Set(ids(result)).size,5);
});
test('newest JST day honors its manual order without promoting older pinned days',()=>{
 const a=make('today-first',0,{displayOrder:1}),b=make('today-pinned',0.01,{displayOrder:0,hot:true}),c=make('yesterday',1,{displayOrder:0,hot:true});
 assert.equal(selectTicker([a,c,b],now)[0].id,'today-pinned');
 assert.equal(selectTicker([a,c],now)[0].id,'today-first');
 assert.deepEqual(selectTicker([],now),[]);
});
test('selection still follows existing approval, expiry, future and 7/14-day gates',()=>{
 const prepare=input=>prepareNews(input,{now,mode:'on'});
 const valid=make('valid',6),old=make('old',8),future=make('future',-1),pending=make('pending',0,{manualReviewStatus:'pending'}),expired=make('sale',0,{category:'sale',saleEndsAt:now-1}),ended=make('ended',0,{eventEndsAt:now-1});
 assert.deepEqual(ids(tickerNews(prepare([old,future,pending,expired,ended,valid]),now)),['valid']);
 assert.deepEqual(ids(tickerNews(prepare([old,make('too-old',15)]),now)),['old']);
 assert.deepEqual(tickerNews(prepare([make('too-old',15),pending]),now),[]);
 // Removed/taken-down records are absent from the API input; no fallback adds them.
 assert.deepEqual(tickerNews(prepare([]),now),[]);
});
