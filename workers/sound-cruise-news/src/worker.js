import { SOURCES, evidenceGate } from './registry.js';
import { NewsStore } from './store.js';
import { scheduledPurge } from './retention.js';
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
 if(url.pathname==='/health')return finish(json({ok:true,version:'0.1.0',collection:'off'}));
 if(!['/v1/news','/v1/news/ticker'].includes(url.pathname))return finish(json({error:'not_found'},404));
 const limit=Number(url.searchParams.get('limit')||20),offset=Number(url.searchParams.get('offset')||0);
 if(!Number.isInteger(limit)||limit<1||limit>50||!Number.isInteger(offset)||offset<0||offset>10000)return finish(json({error:'invalid_pagination'},400));
 try {
  const controls=await new NewsStore(env.NEWS_DB).controls();
  if(!controls.api_enabled)return finish(json({disabled:true,items:[]},503));
  const active=registry.filter(s=>s.enabled&&!evidenceGate(s,now)).map(s=>s.id);
  if(!active.length)return finish(json({contractVersion:1,items:[],nextOffset:null}));
  // Read controls before cache. Every takedown changes revision atomically, invalidating all old keys.
  const key=new Request('https://news-cache.invalid'+url.pathname+'?'+new URLSearchParams({limit:String(limit),offset:String(offset),revision:String(controls.revision),sources:active.join(','),bucket:String(Math.floor(now/300000))}));
  const hit=await cache?.match(key);if(hit)return finish(hit);
  const ticker=url.pathname.endsWith('/ticker');
  const select=async(days,count,start)=>{
   const {results}=await env.NEWS_DB.prepare(`SELECT c.id,c.label,c.source_name,c.source_url,c.published_at,c.category,c.expires_at FROM candidate_items c
    LEFT JOIN source_state s ON s.source_id=c.source_id
    WHERE c.review_status='approved' AND c.expires_at>? AND c.published_at<=? AND c.published_at>=?
    AND COALESCE(s.disabled,0)=0 AND COALESCE(s.takedown,0)=0 AND c.source_id IN (${active.map(()=>'?').join(',')})
    ORDER BY c.published_at DESC,c.id LIMIT ? OFFSET ?`)
   .bind(now,new Date(now).toISOString(),new Date(now-days*DAY).toISOString(),...active,count,start).all();
   return results;
  };
  let rows=await select(ticker?7:90,ticker?5:limit+1,ticker?0:offset);
  if(ticker&&!rows.length)rows=await select(14,5,0);
  const nextOffset=!ticker&&rows.length>limit?offset+limit:null;
  if(!ticker)rows=rows.slice(0,limit);
  const response=json({contractVersion:1,items:rows.map(i=>({id:i.id,label:i.label,sourceName:i.source_name,sourceUrl:i.source_url,publishedAt:i.published_at,category:i.category,publishable:true})),nextOffset});
  // Only the internal edge cache stores payloads; browser/downstream caches must revalidate kill state.
  const ttl=Math.min(300,...rows.map(i=>Math.max(0,Math.floor((i.expires_at-now)/1000))));
  if(cache&&ttl>0){const cached=response.clone();cached.headers.set('Cache-Control',`public, max-age=${ttl}`);await cache.put(key,cached);}
  return finish(response);
 }catch{return finish(json({error:'news_unavailable'},503));}
}
export default {fetch:(request,env)=>handleNewsRequest(request,env),scheduled:scheduledPurge};
