// Revisit only URLs already observed on the permission-scoped News listing.
// Receipts retain URLs/timestamps/reason codes, never publisher expressions.
import {agmArticleUrl} from './agm-sections.js';
import {inspectAgmArticle} from './agm-acquisition.js';
import {DAY} from './policy.js';
export const AGM_DETAIL_BUDGET=9;
export const AGM_DEFERRED='agm_detail_budget_deferred';
export async function recordAgmDeferred(store,source,entries,now){
 if(source.id!=='agm'||!source.agmSections||!source.explicitAutomationPermission)throw Error('permission_required');
 const urls=[...new Set(entries.filter(e=>e.agmDeferred&&agmArticleUrl(e.url,'news')).map(e=>e.url))];
 if(!urls.length)return;
 // Queue persistence is required collection work, not best-effort telemetry.
 // Failure must prevent the discovery watermark from advancing.
 await store.db.prepare(`INSERT INTO news_discovery_receipts(source_id,normalized_url,first_seen_at,last_seen_at,published_at,outcome,reason_code,candidate_id)
 SELECT 'agm',j.value,?,?,NULL,'not_candidate',?,NULL FROM json_each(?) j WHERE true
 ON CONFLICT(source_id,normalized_url) DO UPDATE SET last_seen_at=MAX(last_seen_at,excluded.last_seen_at),reason_code=excluded.reason_code`)
 .bind(now,now,AGM_DEFERRED,JSON.stringify(urls)).run();
}
export async function planAgmNews(store,source,entries,now,pepper){
 if(source.id!=='agm'||!source.agmSections||!source.explicitAutomationPermission)throw Error('permission_required');
 const waiting=(await store.db.prepare(`SELECT normalized_url,first_seen_at FROM news_discovery_receipts
 WHERE source_id='agm' AND reason_code=? AND candidate_id IS NULL AND first_seen_at>? AND last_seen_at<=?
 ORDER BY first_seen_at,normalized_url LIMIT 70`).bind(AGM_DEFERRED,now-90*DAY,now).all()).results;
 const byUrl=new Map(entries.map(e=>[e.url,{...e,backlog:false,firstSeenAt:now}]));
 for(const r of waiting){if(!agmArticleUrl(r.normalized_url,'news'))continue;
  const current=byUrl.get(r.normalized_url);
  byUrl.set(r.normalized_url,{...(current||{url:r.normalized_url,agmSection:'news'}),backlog:true,firstSeenAt:r.first_seen_at});
 }
 const planned=[];
 for(const e of byUrl.values()){
  const cache=await inspectAgmArticle(store,source,e.url,now,pepper,{listingTitle:e.title});
  // Valid hits cost no HTTP. Recover deferred/new evidence before spending the
  // same fixed detail budget on expired but otherwise valid known evidence.
  planned.push({...e,agmCacheInspection:cache,priority:cache.hit?0:e.backlog?1:!cache.valid?2:3});
 }
 return planned.sort((a,b)=>a.priority-b.priority||a.firstSeenAt-b.firstSeenAt);
}
