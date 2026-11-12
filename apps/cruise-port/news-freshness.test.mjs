import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepareNews,tickerNews} from './news-data.js';
import {selectTicker} from './news-quality.js';
import {NEWS_BETA_ITEMS} from './data/news-beta.js';

const replay=JSON.parse(readFileSync(new URL('./test-fixtures/news-home-20261111.json',import.meta.url)));
const current=JSON.parse(readFileSync(new URL('./test-fixtures/news-home-20261112.json',import.meta.url)));
const now=Date.parse(replay.at),ids=rows=>rows.map(i=>i.id);
const projected=replay.items.map(i=>({...i,topicKey:i.id,createdAt:i.publishedAt,updatedAt:i.publishedAt,sourceKind:'official',sourceSafety:'safe',manualReviewStatus:'approved'}));
const make=(id,age,extra={})=>({...NEWS_BETA_ITEMS[0],id,topicKey:id,publishedAt:new Date(now-age*86400000).toISOString(),label:'メーカー、限定ギターを発表',...extra});

test('real November 11 replay: all five follow publication time while hot/manual metadata remain',()=>{
 const eligible=prepareNews(projected,{now,mode:'on'});
 const result=tickerNews(eligible,now);
 assert.deepEqual(ids(result),ids(replay.items.slice(0,5)));
 assert.notDeepEqual(ids(result),replay.previousTickerIds);
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
test('manual order, HOT and registration timestamps never promote an older article, even within one JST day',()=>{
 const a=make('today-first',0,{displayOrder:1}),b=make('today-pinned',0.01,{displayOrder:0,hot:true}),c=make('yesterday',1,{displayOrder:0,hot:true});
 b.createdAt=b.updatedAt=new Date(now+86400000).toISOString();
 b.collected_at=now+86400000;
 assert.deepEqual(ids(selectTicker([c,b,a],now)),['today-first','today-pinned','yesterday']);
 assert.equal(selectTicker([a,c],now)[0].id,'today-first');
 assert.deepEqual(selectTicker([],now),[]);
});
test('November 12 replay: five newer records displace HOT only from the five-slot home, never from the NEWS list',()=>{
 const at=Date.parse(current.at),input=current.items.map(i=>({...i,topicKey:i.id,createdAt:i.publishedAt,updatedAt:i.publishedAt,sourceKind:'official',sourceSafety:'safe',manualReviewStatus:'approved'}));
 const before=structuredClone(input),list=prepareNews(input,{now:at,mode:'on'}),result=tickerNews(list,at);
 assert.deepEqual(ids(result),ids(current.items.slice(0,5)));
 const hot=list.find(i=>i.id===current.items[5].id);
 assert.equal(hot.hot,true);assert.equal(hot.displayOrder,0);
 assert.ok(!result.some(i=>i.id===hot.id));
 const apiRows=current.items.map(({publishedAt,...i})=>({...i,published_at:publishedAt,collected_at:at}));
 assert.deepEqual(ids(selectTicker(apiRows,at)),ids(result));
 assert.deepEqual(input,before);
});
test('timestamp ties use a stable ID order, ignore value/metadata, and never mutate either API or Port inputs',()=>{
 const a=make('a',0,{label:'一般的な製品情報'}),z=make('z',0,{label:'メーカー、限定ギターを発表',hot:true,displayOrder:0});
 // Different offset spellings represent the same publication instant.
 z.publishedAt=new Date(now+9*3600000).toISOString().replace('Z','+09:00');
 const input=Object.freeze([Object.freeze(z),Object.freeze(a)]);
 assert.deepEqual(ids(selectTicker(input)),['a','z']);
 assert.equal(input[0],z);assert.equal(selectTicker(input)[1].hot,true);
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
