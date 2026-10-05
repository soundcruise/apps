import {compareTicker} from '../../../apps/cruise-port/news-quality.js';
import {preferredIndependentLabel} from './label-quality.js';
import {manualPredicate} from './manual-sources.js';
import {legacyPredicate} from './legacy.js';
import { SOURCES, evidenceGate } from './registry.js';
import { NewsStore } from './store.js';
import { scheduledNews } from './scheduled.js';
import { runtimeSources } from './runtime.js';
import { CATEGORIES } from './metadata.js';
const DAY=86400000;
const localHost=url=>['localhost','127.0.0.1','[::1]'].includes(url.hostname);
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function cors(request,env) {
 const origin=request.headers.get('Origin');if(!origin)return null;
 if(origin==='https://soundcruise.jp')return origin;
 if(env.NEWS_API_MODE==='local'){
  let configured=[];try{configured=JSON.parse(env.NEWS_LOCAL_ORIGINS||'[]');}catch{}
  if(Array.isArray(configured)&&configured.includes(origin)){try{if(localHost(new URL(origin)))return origin;}catch{}}
 }
 return false;
}
export async function handleNewsRequest(request,env,now=Date.now(),{registry=SOURCES,cache=globalThis.caches?.default}={}) {
 const origin=cors(request,env);
 if(origin===false)return json({error:'origin_denied'},403);
 const finish=response=>{
  const headers=new Headers(response.headers);headers.set('Vary','Origin');headers.set('Cache-Control','no-store');
  if(origin){headers.set('Access-Control-Allow-Origin',origin);headers.set('Access-Control-Allow-Methods','GET, OPTIONS');}
  return new Response(response.body,{status:response.status,headers});
 };
 const url=new URL(request.url);
 if(!['local','production'].includes(env.NEWS_API_MODE)||(env.NEWS_API_MODE==='local'&&!localHost(url)))return finish(json({disabled:true,items:[]},503));
 if(request.method==='OPTIONS')return finish(new Response(null,{status:204}));
 if(request.method!=='GET')return finish(json({error:'method_not_allowed'},405));
 if(url.pathname==='/health'){
  try{const controls=await new NewsStore(env.NEWS_DB).controls();return finish(json({ok:true,version:'0.20.7',collection:env.NEWS_COLLECTION_MODE==='production'&&!!controls.collection_enabled,publication:!!controls.publication_enabled,api:!!controls.api_enabled}));}
  catch{return finish(json({ok:false,error:'news_unavailable'},503));}
 }
 if(!['/v1/news','/v1/news/ticker'].includes(url.pathname))return finish(json({error:'not_found'},404));
 const category=url.searchParams.get('category');
 if(category!==null&&!CATEGORIES.includes(category))return finish(json({error:'invalid_category'},400));
 let cursor=null;
 if(url.searchParams.has('cursor')){
  try{const raw=url.searchParams.get('cursor');if(raw.length>400)throw Error();cursor=JSON.parse(raw);
   if(!Array.isArray(cursor)||cursor.length!==2||typeof cursor[0]!=='string'||!Number.isFinite(Date.parse(cursor[0]))||new Date(cursor[0]).toISOString()!==cursor[0]||typeof cursor[1]!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(cursor[1]))throw Error();
  }catch{return finish(json({error:'invalid_pagination'},400));}
 }
 const limit=Number(url.searchParams.get('limit')||20),offset=Number(url.searchParams.get('offset')||0);
 if(!Number.isInteger(limit)||limit<1||limit>50||!Number.isInteger(offset)||offset<0||offset>10000||(cursor&&offset!==0))return finish(json({error:'invalid_pagination'},400));
 try {
  const controls=await new NewsStore(env.NEWS_DB).controls();
  if(!controls.api_enabled)return finish(json({disabled:true,items:[]},503));
  const active=registry.filter(s=>s.enabled&&!evidenceGate(s,now)).map(s=>s.id);
  const eligible=`(c.source_id IN (${(active.length?active:['__none__']).map(()=>'?').join(',')}) OR ${legacyPredicate()} OR ${manualPredicate(now)})`;
  const activeBindings=active.length?active:['__none__'];
  // A page can change when any preceding sale/event expires. Bound all cached pages by that
  // transition; do not trust only the deadlines of the rows returned on this page.
  const boundary=await env.NEWS_DB.prepare(`SELECT MIN(CASE WHEN c.sale_ends_at IS NULL THEN c.event_ends_at WHEN c.event_ends_at IS NULL THEN c.sale_ends_at ELSE MIN(c.sale_ends_at,c.event_ends_at) END) AS deadline FROM candidate_items c
   LEFT JOIN source_state s ON s.source_id=c.source_id
   WHERE c.review_status='approved' AND c.expires_at>? AND (c.sale_ends_at>=? OR c.event_ends_at>=?)
   AND COALESCE(s.publication_blocked,0)=0 AND COALESCE(s.takedown,0)=0 AND ${eligible}`).bind(now,now,now,...activeBindings).first();
  const validUntil=Math.min(now+300000,boundary?.deadline==null?Infinity:boundary.deadline+1);
  // Read controls before cache. Every takedown changes revision atomically, invalidating all old keys.
  const key=new Request('https://news-cache.invalid'+url.pathname+'?'+new URLSearchParams({limit:String(limit),offset:String(offset),cursor:JSON.stringify(cursor),category:category||'',format:'core-quality-1',revision:String(controls.revision),sources:active.join(','),manual:manualPredicate(now),bucket:String(Math.floor(now/300000))}));
  const hit=await cache?.match(key);if(hit&&Number(hit.headers.get('X-News-Valid-Until'))>now)return finish(hit);
  const ticker=url.pathname.endsWith('/ticker');
  const select=async(days,count,start)=>{
   const {results}=await env.NEWS_DB.prepare(`SELECT c.id,c.label,c.source_name,c.source_url,c.published_at,c.category,c.expires_at,c.sale_ends_at,c.event_ends_at,c.product_facts,c.event_type,c.review_status FROM candidate_items c
    LEFT JOIN source_state s ON s.source_id=c.source_id
    WHERE c.review_status='approved' AND c.expires_at>? AND c.published_at<=? AND c.published_at>=?
    AND (c.sale_ends_at IS NULL OR c.sale_ends_at>=?) AND (c.event_ends_at IS NULL OR c.event_ends_at>=?)
    ${category?'AND c.category=?':''}
    ${cursor&&!ticker?'AND (c.published_at<? OR (c.published_at=? AND c.id>?))':''}
    AND COALESCE(s.publication_blocked,0)=0 AND COALESCE(s.takedown,0)=0 AND ${eligible}
    ORDER BY c.published_at DESC,c.id LIMIT ? OFFSET ?`)
   .bind(now,new Date(now).toISOString(),new Date(now-days*DAY).toISOString(),now,now,...(category?[category]:[]),...(cursor&&!ticker?[cursor[0],cursor[0],cursor[1]]:[]),...activeBindings,count,start).all();
   return results;
  };
  let rows=await select(ticker?7:90,ticker?100:limit+1,ticker?0:offset);
  if(ticker&&!rows.length)rows=await select(14,100,0);
  rows=rows.map(i=>({...i,label:preferredIndependentLabel(i)}));
  if(ticker)rows.sort((a,b)=>compareTicker(a,b,now));
  if(ticker)rows=rows.slice(0,5);
  const more=!ticker&&rows.length>limit;
  const nextOffset=more&&!cursor?offset+limit:null;
  if(!ticker)rows=rows.slice(0,limit);
  const last=rows.at(-1),nextCursor=more?JSON.stringify([last.published_at,last.id]):null;
  const response=json({contractVersion:1,items:rows.map(i=>({id:i.id,label:i.label,sourceName:i.source_name,sourceUrl:i.source_url,publishedAt:i.published_at,category:i.category,publishable:true,...(i.category==='sale'?{saleEndsAt:i.sale_ends_at}: {}),...(i.event_ends_at!=null?{eventEndsAt:i.event_ends_at}:{})})),nextOffset,nextCursor});
  response.headers.set('X-News-Valid-Until',String(validUntil));
  // Only the internal edge cache stores payloads; browser/downstream caches must revalidate kill state.
  const ttl=Math.min(Math.floor((validUntil-now)/1000),...rows.map(i=>Math.max(0,Math.floor((i.expires_at-now)/1000))));
  if(cache&&ttl>0){const cached=response.clone();cached.headers.set('Cache-Control',`public, max-age=${ttl}`);await cache.put(key,cached);}
  return finish(response);
 }catch{return finish(json({error:'news_unavailable'},503));}
}
export default {fetch:(request,env)=>handleNewsRequest(request,env,Date.now(),{registry:env.NEWS_API_MODE==='production'?runtimeSources(env):SOURCES}),scheduled:scheduledNews};
