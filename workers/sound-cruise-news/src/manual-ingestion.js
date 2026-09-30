// CLI only. Structured input is validated before any database write; no external fetch.
import {MANUAL_SOURCES,manualEvidenceGate,manualUrl} from './manual-sources.js';
import {assessSale,saleLabel,saleEndsAt,SALE_EVENTS,SALE_EQUIPMENT,SALE_BRANDS} from './sale.js';
import {validLabel} from './metadata.js';
import {hash,DAY} from './policy.js';
import {ARTICLE_CHECKS,REQUIRED_CHECKS} from './review.js';
const validatedItems=new WeakMap();
export const MANUAL_ORIGIN='operator_manual_add';
export const RELEVANCE_REASONS=['guitarist','acoustic_performance','singer_songwriter','guitar_centric_live','guitar_event'];
const common=['kind','sourceId','officialUrl','publishedAt','checks','articleChecks'];
function exact(obj,allowed){if(!obj||typeof obj!=='object'||Array.isArray(obj)||Object.keys(obj).some(k=>!allowed.includes(k)))throw Error('manual_field_forbidden');}
const text=(v,max=70)=>typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=max&&!/[<>\x00-\x1f]|https?:|審査待ち|要確認|に関する話題|見逃|激安|超特価/.test(v);
function day(v){return typeof v==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(saleEndsAt(v));}
const dateLabel=v=>`${Number(v.slice(5,7))}月${Number(v.slice(8,10))}日`;
export async function manualCandidate(input,now=Date.now()){
 const isSale=input?.kind==='sale',fields=isSale?['seller','saleType','startDate','endDate','endTime','equipment','brands','benefit','scope','percentOff','verificationUrl']:['artist','eventType','eventName','eventDate','endDate','venue','relevanceReason'];
 exact(input,[...common,...fields]);
 const source=MANUAL_SOURCES.find(s=>s.id===input.sourceId);if(manualEvidenceGate(source,now))throw Error('manual_source_evidence_required');
 if(!source.contentTypes.includes(isSale?'sale':'artist')||!['sale','artist_live'].includes(input.kind))throw Error('manual_source_scope');
 const url=manualUrl(input.officialUrl,source);if(!day(input.publishedAt))throw Error('manual_publication_date');const published=Date.parse(input.publishedAt+'T00:00:00+09:00');if(published>now||now-published>=90*DAY)throw Error('manual_publication_date');
 exact(input.checks,[...REQUIRED_CHECKS,'guitarEvidenceChecked']);exact(input.articleChecks,Object.keys(ARTICLE_CHECKS));
 if(REQUIRED_CHECKS.some(k=>input.checks[k]!==true)||Object.entries(ARTICLE_CHECKS).some(([k,values])=>!values.includes(input.articleChecks[k]))||input.articleChecks.primarySource!=='primary')throw Error('manual_verification_required');
 let facts,label,eventType,category,deadline=null;
 if(isSale){
  if(input.seller!==source.name||!SALE_EVENTS.some(([t])=>t===input.saleType)&&!['期間限定セール','期間限定の値下げ'].includes(input.saleType)||!day(input.startDate)||!day(input.endDate)||input.startDate>input.endDate||input.startDate>new Date(now+9*3600000).toISOString().slice(0,10))throw Error('manual_sale_facts');
  if(input.benefit!=='price_reduction'||input.scope!=='broad')throw Error('manual_sale_scope_or_benefit');
  if(!Array.isArray(input.equipment)||input.equipment.length<1||input.equipment.length>3||new Set(input.equipment).size!==input.equipment.length||input.equipment.some(e=>!SALE_EQUIPMENT.some(([n])=>n===e))||!Array.isArray(input.brands)||input.brands.length>10||new Set(input.brands).size!==input.brands.length||input.brands.some(b=>!SALE_BRANDS.includes(b)))throw Error('manual_sale_equipment');
  if(!Number.isInteger(input.percentOff)||input.percentOff<1||input.percentOff>100)throw Error('manual_sale_benefit');
  deadline=saleEndsAt(input.endDate,input.endTime);if(!Number.isFinite(deadline)||deadline<now)throw Error('manual_sale_expired_or_invalid');
  // Compose classifier input solely from fixed vocabulary and validated facts, never publisher text.
  const jd=v=>v.replace('-','年').replace('-','月')+'日';const title=`全ラインナップ ${input.equipment.join('・')} ${input.saleType} ${input.percentOff}%割引 ${jd(input.startDate)}〜${jd(input.endDate)}${input.endTime||''}`;
  const result=assessSale({title,date:new Date(published).toISOString()},source,now,{hasDate:true,known:false});
  if(result.decision!=='AUTO_PUBLISHABLE'||result.facts.scope!=='broad'||result.facts.nature!=='sale')throw Error('manual_sale_classifier_rejected');
  if(input.verificationUrl!==undefined){const u=new URL(input.verificationUrl);if(source.id!=='manual-apu'||u.href!=='https://www.kvraudio.com/forum/viewtopic.php?t=633574')throw Error('manual_verification_url');}
  facts={...result.facts,event:input.saleType,seller:input.seller,startDate:input.startDate,endDate:input.endDate,...(input.endTime?{endTime:input.endTime}:{}),equipment:input.equipment,brands:input.brands,percentOff:input.percentOff,benefit:input.benefit,...(input.verificationUrl?{verificationUrl:input.verificationUrl}:{})};label=saleLabel(facts);category='sale';eventType='sale';
 }else{
  if(!text(input.artist,50)||!text(input.eventName,65)||!text(input.venue,60)||!['concert','recital','exhibition','guitar_festival','interview'].includes(input.eventType)||!day(input.eventDate)||!RELEVANCE_REASONS.includes(input.relevanceReason)||input.checks.guitarEvidenceChecked!==true||input.articleChecks.relevance!=='guitar')throw Error('manual_artist_facts');
  if(input.endDate!==undefined&&(!day(input.endDate)||input.endDate<input.eventDate))throw Error('manual_event_dates');
  const verbs={concert:'ギター公演',recital:'ギターリサイタル',exhibition:'使用ギター・機材展示',guitar_festival:'ギターイベント',interview:'ギター演奏のインタビュー'};
  category=input.eventType==='interview'?'artist_guitar':'live_guitar';eventType='manual_artist_live';
  facts={kind:'artist_live',category,artist:input.artist,eventType:input.eventType,eventName:input.eventName,eventDate:input.eventDate,...(input.endDate?{endDate:input.endDate}:{}),venue:input.venue,relevanceReason:input.relevanceReason};
  label=`${input.artist}、${dateLabel(input.eventDate)}${input.endDate&&input.endDate!==input.eventDate?'〜'+dateLabel(input.endDate):''}に${input.venue}で${verbs[input.eventType]}`;
 }
 if(!validLabel(label)||/に関する話題|審査待ち|要確認/.test(label))throw Error('manual_label_invalid');const id=await hash(url);
 const item={id,sourceId:source.id,sourceName:source.name,sourceUrl:url,publishedAt:new Date(published).toISOString(),category,label,topicKey:isSale?`manual:sale:${id}`:`manual:event:${await hash(input.artist+'|'+input.eventType+'|'+input.eventDate+'|'+input.venue)}`,collectedAt:new Date(now).toISOString(),expiresAt:published+90*DAY,saleEndsAt:deadline,eventType,productFacts:facts,checks:input.checks,articleChecks:input.articleChecks,origin:MANUAL_ORIGIN};validatedItems.set(item,JSON.stringify(item));return item;
}
export async function ingestManual(store,item,now=Date.now()){
 if(validatedItems.get(item)!==JSON.stringify(item))throw Error('manual_item_not_validated');
 const source=MANUAL_SOURCES.find(s=>s.id===item.sourceId);if(manualEvidenceGate(source,now)||item.origin!==MANUAL_ORIGIN||item.expiresAt<=now||item.saleEndsAt!==null&&item.saleEndsAt<now)throw Error('manual_source_gate');
 const stamp=new Date(now).toISOString();
 // Insert once; never overwrite an existing record. Controls/takedowns/duplicate topics checked at write time.
 const result=await store.db.batch([
 store.db.prepare(`INSERT OR IGNORE INTO candidate_items(id,source_id,source_name,source_url,normalized_url,published_at,category,label,topic_key,collected_at,review_status,review_reason,reviewed_at,reviewed_by,expires_at,event_type,product_facts,publication_decision,decision_reason,origin,sale_ends_at,review_checks,article_checks)
 SELECT ?,?,?,?,?,?,?,?,?,?,'approved','manual_facts_verified',?,'operator',?,?,?,'PUBLISH_REVIEW','manual_facts_verified',?,?,?,? WHERE EXISTS(SELECT 1 FROM news_controls WHERE id=1 AND collection_enabled=1 AND publication_enabled=1) AND NOT EXISTS(SELECT 1 FROM source_state WHERE source_id=? AND (disabled=1 OR takedown=1)) AND NOT EXISTS(SELECT 1 FROM news_takedowns WHERE item_id=?) AND NOT EXISTS(SELECT 1 FROM candidate_items WHERE topic_key=? AND review_status='approved')`)
 .bind(item.id,item.sourceId,item.sourceName,item.sourceUrl,item.sourceUrl,item.publishedAt,item.category,item.label,item.topicKey,item.collectedAt,stamp,item.expiresAt,item.eventType,JSON.stringify(item.productFacts),MANUAL_ORIGIN,item.saleEndsAt,JSON.stringify(item.checks),JSON.stringify(item.articleChecks),item.sourceId,item.id,item.topicKey),
 store.db.prepare(`INSERT INTO news_admin_audit SELECT ?, 'manual-add',?,?, 'manual_facts_verified' WHERE EXISTS(SELECT 1 FROM candidate_items WHERE id=? AND origin=? AND reviewed_at=?) AND NOT EXISTS(SELECT 1 FROM news_admin_audit WHERE action='manual-add' AND target=?)`).bind(crypto.randomUUID(),item.id,now,item.id,MANUAL_ORIGIN,stamp,item.id),
 store.db.prepare('UPDATE news_controls SET revision=revision+1 WHERE id=1')]);
 return {id:item.id,inserted:result[0].meta.changes===1,publisherRequests:0};
}
