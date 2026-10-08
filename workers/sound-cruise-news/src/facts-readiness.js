import {productArticleSurface} from './product-article-evidence.js';
import {shimamuraProductSurface} from './shimamura-product-evidence.js';
import {namedWorkshopSurface} from './named-workshop-evidence.js';
import {guitarExhibitionSurface} from './guitar-exhibition-evidence.js';
import {agmRecoverySurface} from './agm-article-evidence.js';
import {shimamuraEventSurface} from './shimamura-event-evidence.js';
import {targetSurface} from './target-evidence.js';
import {ikebeProductSurface} from './ikebe-product-evidence.js';
// Diagnostics project the existing publication policy; they do not grant eligibility.
export function missingFacts(row,facts,validation){
 const missing=[];
 if(facts?.kind==='product_article'){if(!validation.publishableLabel)missing.push('確認済みの記事対象・記事タイプ・用途と関連性');if(!row.published_at)missing.push('確認済みの公開日');return missing;}
 if(facts?.kind==='agm_editorial'){if(!validation.publishableLabel)missing.push('確認済みの記事対象・人物・テーマ');if(!row.published_at)missing.push('確認済みの公開日');return missing;}
 if(!facts)missing.push(row.event_type==='guitar_event'?'人物・イベント種別・開催日・会場・ギターとの関連':'確認済みの製品識別情報（メーカー／製品名・型番）');
 else if(facts.kind==='guitar_event'){
  for(const [key,label]of [['artist','人物'],['eventType','イベント種別'],['eventDate','開催日'],['venue','会場'],['evidence','ギターとの関連']])if(!facts[key]&&!(key==='artist'&&facts.eventName))missing.push(label);
 }else if(!facts.product&&!facts.artist&&!facts.performer&&!facts.seller)missing.push('対象を特定できる識別情報');
 if(facts?.scopeUncertain)missing.push('製品本体／拡張・パック等の対象範囲');
 if(row.event_type==='other')missing.push('確認済みの出来事（発表・発売・更新等）');
 if(!row.published_at)missing.push('確認済みの公開日');
 if(validation.errors.includes('facts_incomplete')&&facts&&!missing.length)missing.push(facts.kind==='guitar_event'?'確認済みの人物・イベントは、現行パイロットの掲載条件を満たしていません':'既存の識別・イベント方針を満たすfacts／label');
 return missing;
}
export function recoverySurface(row,source,{primaryRecovery=false}={}){
 const exhibition=guitarExhibitionSurface(row,source);if(exhibition)return exhibition;
 const agm=agmRecoverySurface(row,source);if(agm)return agm;
 const event=shimamuraEventSurface(row,source);if(event)return event;
 const targeted=targetSurface(row,source);if(targeted)return targeted;
 const shima=shimamuraProductSurface(row,source);if(primaryRecovery&&shima)return shima;
 const workshop=namedWorkshopSurface(row,source);if(primaryRecovery&&workshop)return workshop;
 const article=productArticleSurface(row,source);if(article)return article;
 const product=ikebeProductSurface(row,source);if(product)return product;
 // Fixed listing-only evidence must not become permission to crawl article bodies.
 if(source?.id==='ikebe-event'&&source.discoveryUrl==='https://www.ikebe-gakki.com/blog/category/event/')return {url:row.source_url,method:'explicit_event_fields',parser:'event-article-1'};
 if(['shimamura','ikebe','ik'].includes(source?.id)&&['official_listing','shimamura_listing'].includes(source.discoveryType))return {url:source.discoveryUrl,method:'existing_listing_parser',parser:'news-metadata-2'};
 return null;
}

// A diagnostic projection of authoritative validation and verified recovery results.
// This never supplies facts, changes policy or grants permission to publish.
export function recoveryAssessment(row,validation,surface,last,cached){
 const errors=validation.errors,facts=validation.facts;
 let recoveryClass;
 if(errors.includes('duplicate'))recoveryClass='DUPLICATE_BLOCKED';
 else if(validation.valid)recoveryClass='READY_FOR_HUMAN_DECISION';
 else if(errors.some(e=>['operator_source_gate','source_url_invalid','publication_policy_rejected','candidate_takedown','expired_candidate','event_validation_failed'].includes(e))||facts?.scope==='expansion'||facts?.kind==='guitar_event'&&facts.artist&&facts.eventType&&facts.eventDate&&facts.venue&&!validation.publishableLabel)recoveryClass='POLICY_BLOCKED';
 else if(!surface||['facts_not_on_current_surface','facts_identity_changed','facts_date_changed','facts_event_missing','facts_scope_uncertain'].includes(last?.outcome))recoveryClass='NOT_SAFELY_RECOVERABLE';
 else if(surface.method!=='existing_listing_parser')recoveryClass='RECOVERABLE_FROM_ORIGINAL_SOURCE';
 else {
  let item;try{item=JSON.parse(cached?.items_json||'[]').find(i=>i.id===row.id&&i.sourceUrl===row.source_url);}catch{}
  recoveryClass=item?.productFacts&&!item.productFacts.scopeUncertain?'RECOVERABLE_FROM_ORIGINAL_SOURCE':facts?.scopeUncertain?'NOT_SAFELY_RECOVERABLE':'RECOVERABLE_WITH_SOURCE_SPECIFIC_PARSER';
 }
 const nextAction={READY_FOR_HUMAN_DECISION:'事実・原記事を確認して、掲載するかご判断ください。',DUPLICATE_BLOCKED:'既存掲載との重複を確認してください。事実の補完だけでは掲載できません。',POLICY_BLOCKED:'現在の掲載方針・情報源の条件を確認してください。事実の補完だけでは掲載できません。',NOT_SAFELY_RECOVERABLE:'現在の許可済み情報では安全に確定できません。一次情報の対象・日付・出来事を追加確認してください。',RECOVERABLE_FROM_ORIGINAL_SOURCE:'許可済みの一次情報から事実を再確認できます。確認後も掲載条件を別途検証します。',RECOVERABLE_WITH_SOURCE_SPECIFIC_PARSER:'許可済み一覧で製品名・出来事を再確認してください。不足が残る場合は抽出方法の検証が必要です。'}[recoveryClass];
 return {recoveryClass,nextAction};
}

export function recoveryCacheKey(row,source,surface,{serverRepair=false}={}){
 return ['explicit_product_article_fields','targeted_explicit_primary_fields','explicit_ikebe_product_fields','explicit_agm_article_fields','explicit_shimamura_product_fields','explicit_named_workshop_fields'].includes(surface.method)?source.id+':'+surface.parser+':'+row.id+(serverRepair?':server-repair-1':''):surface.method==='existing_listing_parser'?source.id+':'+surface.parser:source.id;
}

// Preserve supported listing extraction; escalate only after that evidence was insufficient,
// or when a verified, per-candidate primary proof has already been acquired.
export async function resolvedRecoverySurface(store,row,source){
 const primary=recoverySurface(row,source,{primaryRecovery:true}),ordinary=recoverySurface(row,source);
 if(!primary||primary.method===ordinary?.method)return ordinary;
 const key=recoveryCacheKey(row,source,primary);
 if(await store.db.prepare("SELECT 1 FROM news_facts_sources WHERE source_id=?").bind(key).first())return primary;
 const prior=await store.db.prepare('SELECT outcome FROM news_facts_rechecks WHERE candidate_id=? ORDER BY checked_at DESC,rowid DESC LIMIT 1').bind(row.id).first();
 return ['facts_not_on_current_surface','facts_not_recovered','facts_unchanged'].includes(prior?.outcome)?primary:ordinary;
}
