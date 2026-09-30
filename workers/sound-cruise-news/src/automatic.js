import {independentTopicUrls} from './label-quality.js';
import {legalGate} from './registry.js';
import {factualLabel,allowedArticlePath} from './metadata.js';
import {sourceUrl,DAY} from './policy.js';
import {saleEndsAt,saleAuthorized,isSaleRecord} from './sale.js';
import {requirePepper,validatedFingerprint} from './fingerprint.js';

// Only a successful collector run can enter this boundary. It never performs a publisher request.
export async function publishAutomatic(store,source,registry,now,pepper){
 requirePepper(pepper);
 // Resolve the current registry entry, never a stale candidate-time source object.
 source=registry.find(s=>s.id===source?.id);
 if(!source)return 0;
 if(legalGate(source,{...await store.state(source.id),nextAt:0,lastPublisherRequestAt:0},now,'production',registry))return 0;
 const health=(await store.sourceHealth()).find(s=>s.source_id===source.id);
 if(health?.status!=='healthy'||!Number.isSafeInteger(health.last_successful_run_at)||health.last_successful_run_at>now)return 0;
 const rows=(await store.db.prepare("SELECT * FROM candidate_items WHERE source_id=? AND publication_decision='AUTO_PUBLISHABLE' AND review_status='pending' ORDER BY published_at DESC,id LIMIT 100").bind(source.id).all()).results;
 let published=0;
 for(const row of rows){
  let facts;try{facts=JSON.parse(row.product_facts);}catch{continue;}
  const stamp=Date.parse(row.published_at),label=factualLabel(facts,row.event_type);
  const sale=isSaleRecord(row,facts),deadline=saleEndsAt(facts?.endDate,facts?.endTime);
  if(sale&&(!saleAuthorized(source)||row.category!=='sale'||row.event_type!=='sale'||facts?.kind!=='sale'||
   facts.seller!==source.name||facts.scope!=='broad'||facts.nature!=='sale'||!facts.equipment?.length||!Number.isFinite(deadline)||deadline<now))continue;
  if(row.event_type==='other'||!label||row.label!==label||row.category!==facts.category||!Number.isFinite(stamp)||stamp>now||now-stamp>=90*DAY||row.expires_at<=now||!sourceUrl(row.source_url,source)||!allowedArticlePath(row.source_url,source))continue;
  // Validate keyed provenance; similarity is advisory for this facts-only label.
  if(!await validatedFingerprint(row.title_fingerprint,pepper))continue;
  // Recheck immediately before approval; DB controls/health/state are checked atomically below.
  const current=registry.find(s=>s.id===source.id);
  if(legalGate(current,{...await store.state(source.id),nextAt:0,lastPublisherRequestAt:0},now,'production',registry)||(sale&&!saleAuthorized(current)))continue;
  const legacyUrls=independentTopicUrls(row);
  const update=store.db.prepare(`UPDATE candidate_items SET review_status='approved',review_reason='automatic_factual_template',reviewed_at=?,reviewed_by='automatic'
   WHERE id=? AND review_status='pending' AND publication_decision='AUTO_PUBLISHABLE'
   AND EXISTS(SELECT 1 FROM news_controls WHERE id=1 AND publication_enabled=1)
   AND EXISTS(SELECT 1 FROM source_health WHERE source_id=? AND status='healthy' AND last_successful_run_at=?)
   AND NOT EXISTS(SELECT 1 FROM source_state WHERE source_id=? AND (disabled=1 OR takedown=1))
   AND NOT EXISTS(SELECT 1 FROM news_takedowns WHERE item_id=?)
   AND NOT EXISTS(SELECT 1 FROM candidate_items WHERE topic_key=? AND review_status='approved')
   AND NOT EXISTS(SELECT 1 FROM candidate_items WHERE review_status='approved' AND source_url IN (${legacyUrls.length?legacyUrls.map(()=>'?').join(','):'NULL'}))
   AND NOT EXISTS(SELECT 1 FROM candidate_items WHERE review_status='approved' AND (? IS NULL OR json_extract(CASE WHEN json_valid(product_facts) THEN product_facts ELSE '{}' END,'$.brand')=? OR (?='official_manufacturer_model' AND json_extract(CASE WHEN json_valid(product_facts) THEN product_facts ELSE '{}' END,'$.brand') IS NULL AND json_extract(CASE WHEN json_valid(product_facts) THEN product_facts ELSE '{}' END,'$.identifierBasis')='distinctive_software_model')) AND category=? AND json_extract(CASE WHEN json_valid(product_facts) THEN product_facts ELSE '{}' END,'$.product')=? AND COALESCE(json_extract(CASE WHEN json_valid(product_facts) THEN product_facts ELSE '{}' END,'$.version'),'')=? AND (event_type=? OR event_type IN ('other','new_product','release') AND ? IN ('other','new_product','release')))`)
   .bind(new Date(now).toISOString(),row.id,source.id,health.last_successful_run_at,source.id,row.id,row.topic_key,...legacyUrls,facts.brand||null,facts.brand||null,facts.identifierBasis||'',row.category,facts.product||null,facts.version||'',row.event_type,row.event_type);
  const result=await store.db.batch([update,store.db.prepare('UPDATE news_controls SET revision=revision+1 WHERE id=1')]);
  published+=result[0].meta.changes;
 }
 return published;
}
