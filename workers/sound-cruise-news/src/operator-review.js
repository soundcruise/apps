import {agmBookAnchor,AGM_BOOK_CHECKS} from './agm-human-evidence.js';
import {safeFactDiagnostics} from './facts-failure.js';
import {canonicalReview} from './canonical-confirmation.js';
import {canonicalReceiptFence} from './canonical-evidence.js';
import {publicationHealthSQL} from './source-health.js';
import {preferReviewSources} from './source-preference.js';
import {preparationState} from './preparation-state.js';
import {ASSISTED_ORIGIN,assistedPredicate} from './assisted-facts.js';
import {effectiveCategory} from './category-editor.js';
import {MORRIS_EDITORIAL_POLICY,MORRIS_REVIEW_TYPES,MORRIS_PRODUCT_TYPES} from './morris-editorial-policy.js';
import {morrisRecoveryView,morrisReviewEvidence} from './morris-collector.js';
import {reviewReference} from './review-reference.js';
import {lifecycleView} from './pending-lifecycle.js';
import {retainedDecisionProfile} from './operator-insights.js';
import {prepareShadowEvaluation} from './operator-shadow.js';
import {missingFacts,recoverySurface,resolvedRecoverySurface,recoveryAssessment,recoveryCacheKey} from './facts-readiness.js';
import {hash,DAY} from './policy.js';
import {CHECKS,REASONS,DECISION_POLICY_VERSION,parseFacts,resolvedDuplicatePredicate,publicationValidation} from './decision-policy.js';
export const FEEDBACK_REASONS=Object.freeze([...new Set(Object.values(REASONS).flat())]);
export const canonical=value=>JSON.stringify(sort(value));
function sort(value){if(Array.isArray(value))return value.map(sort);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,sort(value[k])]));return value;}
export const candidateSnapshot=row=>hash(canonical(row));
export async function decisionHistory(store,id){return (await store.db.prepare('SELECT verdict,reason,actor_type,actor_id,decided_at,source_id,category,policy_version,decision_id FROM news_decision_ledger WHERE candidate_id=? ORDER BY decided_at DESC,decision_id DESC LIMIT 100').bind(id).all()).results;}
const safeProof=value=>{try{return JSON.parse(value||'[]');}catch{return [];}};
const visibleFacts=facts=>facts?Object.fromEntries(Object.entries(facts).filter(([k])=>['bookTitle','publisher','bookEvidence','coDevelopment','variants','announcement','keyboardKeys','signatureModel','editionMarket','limitedReissue','stringsCount','author','focus','serviceAction','publicationAction','subject','actor','deadline','releaseDate','officialIdentity','productType','releaseEvent','models','components','theme','relevance','articleEvidence','section','articleType','person','brand','product','version','category','identifierBasis','manufacturerSource','listingSource','scopeUncertain','productEvent','kind','artist','performer','event','evidence','eventType','eventDate','endDate','endTime','startDate','venue','action','topic','seller','sellerKind','scope','nature','equipment','percentOff','brands'].includes(k))):null;
export async function reviewDetail(store,id,now,registry,pepper){
 const row=await store.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(id).first();if(!row)throw Error('candidate_not_found');
 const validation=await publicationValidation(store,row,now,registry,pepper);
 const source=registry.find(s=>s.id===row.source_id),surface=await resolvedRecoverySurface(store,row,source);
 const last=await store.db.prepare('SELECT checked_at,outcome,provenance_json FROM news_facts_rechecks WHERE candidate_id=? ORDER BY checked_at DESC LIMIT 1').bind(id).first();
 const cached=await store.db.prepare('SELECT checked_at,outcome,items_json FROM news_facts_sources WHERE source_id=?').bind(surface?recoveryCacheKey(row,source,surface):row.source_id).first();
 const factsReview={...recoveryAssessment(row,validation,surface,last,cached),missing:missingFacts(row,validation.facts,validation),available:!!surface&&!validation.errors.includes('operator_source_gate')&&!validation.errors.includes('source_url_invalid')&&['pending','reopened'].includes(row.review_status),surfaceUrl:surface?.url||null,method:surface?.method||null,lastVerifiedAt:last?.checked_at||cached?.checked_at||null,outcome:last?.outcome||cached?.outcome||null,provenance:last?.provenance_json&&last.provenance_json!=='[]'?safeProof(last.provenance_json):safeProof(row.facts_provenance),reviewability:validation.errors.includes('duplicate')?'DUPLICATE_BLOCKED':validation.valid?'READY_FOR_HUMAN_DECISION':validation.errors.includes('operator_source_gate')?'POLICY_BLOCKED':surface?'FACTS_RECOVERY_UNCERTAIN':'POLICY_BLOCKED'};
 const morrisReview=row.source_id==='morris'?{policy:MORRIS_EDITORIAL_POLICY,state:validation.valid?'READY':validation.errors.some(e=>['duplicate','expired_candidate','event_validation_failed','candidate_takedown','publication_policy_rejected'].includes(e))?'EXCLUDED':'NEEDS_CONFIRMATION',historical:row.review_reason==='morris_historical_confirmation_required',types:MORRIS_REVIEW_TYPES,productTypes:Object.keys(MORRIS_PRODUCT_TYPES),confirmationAvailable:['pending','reopened'].includes(row.review_status)&&!validation.valid&&!validation.errors.some(e=>!['facts_incomplete','facts_provenance_invalid'].includes(e))}:null;
 if(morrisReview){morrisReview.automation=await morrisRecoveryView(store,row,now);if(morrisReview.state==='NEEDS_CONFIRMATION'){
  factsReview.nextAction=morrisReview.automation.recoveryStatus==='PERMISSION_BLOCKED_HISTORICAL'?'システム側の証拠待ちです。保存済み一次証拠が不足し、許諾範囲では過去詳細を再取得できません。自動の詳細再取得は行いません。原記事を人間が確認した事実は、保存済み一覧証拠と結び付けて正式に入力できます。掲載可と非掲載は別に判断します。':'新着は許可済みの1回取得で自動解析します。不足が残る間は掲載判断を求めません。';
  if(morrisReview.automation.recoveryStatus==='PERMISSION_BLOCKED_HISTORICAL'){factsReview.available=false;factsReview.reviewability='EVIDENCE_WAIT';morrisReview.confirmationAvailable=morrisReview.confirmationAvailable&&!!await morrisReviewEvidence(store,row,now);}
 }}
 const work=await store.db.prepare('SELECT diagnostics_json FROM news_discovery_work WHERE source_id=? AND normalized_url=?').bind(row.source_id,row.source_url).first();
 try{if(work?.diagnostics_json)factsReview.diagnostics=safeFactDiagnostics(JSON.parse(work.diagnostics_json));}catch{}
 const lifecycle=await lifecycleView(store,row,now);
 const agmBookReview=row.source_id==='agm'&&(!row.product_facts||row.product_facts==='null')?{confirmationAvailable:['pending','reopened'].includes(row.review_status)&&!validation.errors.some(e=>!['facts_incomplete','facts_provenance_invalid'].includes(e))&&!!await agmBookAnchor(store,row,now,pepper),checks:AGM_BOOK_CHECKS}:null;
 return {agmBookReview,canonicalReview:await canonicalReview(store,row,validation,source,now),preparationState:preparationState(row,validation,lifecycle),assistedEditable:row.origin===ASSISTED_ORIGIN,systemDisposition:row.review_status==='rejected'&&['system_policy','source_policy'].includes(row.reviewed_by)?{actor:row.reviewed_by,reason:row.review_reason}:null,reviewReference:await reviewReference(store,row),morrisReview,lifecycle,factsReview,id:row.id,label:row.label,source:row.source_name,sourceId:row.source_id,category:await effectiveCategory(store,row),publishedAt:row.published_at,eventType:row.event_type,reason:row.decision_reason,reviewReason:row.review_reason,sourceUrl:row.source_url,decision:row.publication_decision,status:row.review_status,facts:visibleFacts(validation.facts),expiresAt:row.expires_at,saleEndsAt:row.sale_ends_at,eventEndsAt:row.event_ends_at,snapshot:await candidateSnapshot(row),revision:row.review_revision,validation:{...validation,facts:undefined,healthSuccessfulAt:undefined},history:await decisionHistory(store,id)};
}
export async function reviewQueue(store,{now=Date.now(),registry=[],pepper}={}){
 const rows=(await store.candidates()).filter(i=>i.origin!=='legacy_fixture_backfill'&&['pending','reopened'].includes(i.review_status));
 if(registry.length)return preferReviewSources(await Promise.all(rows.map(row=>reviewDetail(store,row.id,now,registry,pepper))));
 return Promise.all(rows.map(async row=>({id:row.id,label:row.label,source:row.source_name,category:await effectiveCategory(store,row),publishedAt:row.published_at,facts:visibleFacts(parseFacts(row)),reason:row.decision_reason,sourceUrl:row.source_url,decision:row.publication_decision,snapshot:await candidateSnapshot(row),revision:row.review_revision})));
}
// Keep the existing full-row CAS within D1's expression-depth limit.
const andSql=parts=>parts.length===1?parts[0]:`(${andSql(parts.slice(0,Math.ceil(parts.length/2)))} AND ${andSql(parts.slice(Math.ceil(parts.length/2)))})`;
const savedResult=row=>({id:row.candidate_id,action:row.verdict,reason:row.reason,at:row.decided_at,decisionId:row.decision_id,publisherRequests:0});
async function replay(store,requestId,payloadHash){const existing=await store.db.prepare('SELECT * FROM news_decision_ledger WHERE request_id=?').bind(requestId).first();if(!existing)return null;if(existing.request_payload_hash!==payloadHash)throw Error('idempotency_payload_changed');return savedResult(existing);}
export async function operatorDecision(store,input,now,registry,pepper,actor,{authorizeAutomatic}={}){
 const automatic=actor?.type==='automatic_policy';
 // Internal server capability only; the HTTP operator always supplies its Access actor.
 if(automatic&&(typeof authorizeAutomatic!=='function'||input?.action!=='approve'||input?.reason!=='useful_product'))throw Error('automatic_authorization_required');
 if(!actor||!['human_operator','fixture','system_repair','automatic_policy'].includes(actor.type)||typeof actor.id!=='string'||!/^[a-zA-Z0-9:_@.\-]{1,200}$/.test(actor.id))throw Error('operator_identity_required');
 if(!input||Object.keys(input).some(k=>!['id','action','reason','requestId','snapshot','revision','checks','label','category','publishedAt','takedown'].includes(k))||!['approve','reject'].includes(input.action)||!REASONS[input.action].includes(input.reason)||typeof input.id!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(input.id)||!/^[-a-zA-Z0-9_]{16,100}$/.test(input.requestId||'')||!/^[a-f0-9]{64}$/.test(input.snapshot||'')||!Number.isSafeInteger(input.revision)||input.revision<0)throw Error('operator_decision_invalid');
 if(input.takedown!==undefined&&(input.takedown!==true||input.action!=='reject'||actor.type!=='human_operator'))throw Error('operator_decision_invalid');
 const payloadHash=await hash(canonical({input,actor})),previous=await replay(store,input.requestId,payloadHash);if(previous)return automatic?{...previous,replayed:true}:previous;
 const row=await store.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(input.id).first();
 if(!row)throw Error('candidate_not_found');
 const takedown=input.takedown===true;
 if(takedown?row.review_status!=='approved':row.origin==='legacy_fixture_backfill'||!['pending','reopened'].includes(row.review_status))throw Error('already_decided');
 if(input.reason==='minor_update'&&row.event_type!=='firmware')throw Error('operator_decision_invalid');
 if(row.review_revision!==input.revision||await candidateSnapshot(row)!==input.snapshot)throw Error('candidate_changed');
 const approve=input.action==='approve';let validation=null;
 if(approve){
  validation=await publicationValidation(store,row,now,registry,pepper);
  if(!validation.valid)throw Error(validation.errors[0]);
  if(input.label!==validation.publishableLabel||input.category!==await effectiveCategory(store,row)||input.publishedAt!==row.published_at)throw Error('verified_factual_label_required');
  if(!input.checks||Object.keys(input.checks).some(k=>!CHECKS.includes(k))||CHECKS.some(k=>input.checks[k]!==true))throw Error('operator_checks_required');
 }else if(input.checks&&Object.keys(input.checks).length)throw Error('operator_decision_invalid');
 const authorization=automatic?await authorizeAutomatic(row,validation):null;
 if(automatic&&authorization?.eligible!==true)throw Error('automatic_not_eligible');
 const predicate=await resolvedDuplicatePredicate(store,row,parseFacts(row),now),decisionId=crypto.randomUUID();
 // A full row CAS also catches collector/recovery edits without altering their UPDATE
 // change counts. Only this decision service increments review_revision.
 const snapshotColumns=Object.keys(row).sort();if(snapshotColumns.some(k=>!/^[_a-z]+$/.test(k)))throw Error('candidate_schema_invalid');
 // One bound frame preserves every CAS value/time while keeping multi-model
 // decisions below D1's parameter limit, for human and automatic actors alike.
 const stampSql="json_extract(cas.frame,'$.now')";
 const snapshotWhere=andSql(snapshotColumns.map(k=>`c."${k}" IS json_extract(cas.frame,'$.row.${k}')`));
 // No body, headline, raw HTML, product/artist names or tokens in retained features.
 const insightsValidation=actor.type==='human_operator'?(validation||await publicationValidation(store,row,now,registry,pepper)):null;
 // A takedown must not invent a retrospective Shadow evaluation.
 const observed=takedown?await store.db.prepare('SELECT evaluation_json FROM news_shadow_evaluations WHERE candidate_id=? AND candidate_revision=? AND candidate_snapshot=? AND policy_version=? AND evaluated_at BETWEEN ? AND ? ORDER BY evaluated_at DESC LIMIT 1').bind(row.id,row.review_revision,input.snapshot,DECISION_POLICY_VERSION,now-1800000,now).first():null;
 const evaluation=takedown?(observed?JSON.parse(observed.evaluation_json):null):actor.type==='human_operator'?await prepareShadowEvaluation(store,row,insightsValidation,now,{trigger:'pre_decision',decisionId}):null;
 const profile=actor.type==='human_operator'?await retainedDecisionProfile(row,insightsValidation,now):null;
 const features=canonical({...(input.reason==='minor_update'?{policySignal:{eventType:'firmware',articleNature:'routine_minor',newsValue:'low',basis:'human_operator',reason:'minor_update'}}:{}),operation:automatic?'automatic_publication':takedown?'human_takedown':'pending_decision',...(automatic?{automaticEvaluation:authorization.audit}:{}),...(profile?{insightsProfile:profile}:{}),...(evaluation?{shadowEvaluation:{...evaluation,operatorFinalVerdict:input.action}}:{}),factsPresent:!!parseFacts(row),eventType:row.event_type,publicationDecision:row.publication_decision,hasDate:Number.isFinite(Date.parse(row.published_at)),sale:row.category==='sale',labelQuality:validation?.quality.labelInformationScore??null});
 const statement=store.db.prepare(`INSERT INTO news_decision_ledger(decision_id,candidate_id,verdict,reason,actor_type,actor_id,decided_at,source_id,category,decision_features_json,policy_version,request_id,request_payload_hash,candidate_revision,candidate_snapshot,success_state,created_at,persisted_label,checks_json)
 SELECT ?,c.id,?,?,?,?,${stampSql},c.source_id,c.category,?,?,?,?,c.review_revision,?,'committed',${stampSql},?,?
 FROM candidate_items c,(SELECT ? AS frame) cas WHERE c.id=? AND c.review_revision=? AND c.review_status=? ${takedown?'':"AND c.origin<>'legacy_fixture_backfill'"} AND ${snapshotWhere}
 ${approve?`AND c.expires_at>${stampSql} AND (c.sale_ends_at IS NULL OR c.sale_ends_at>=${stampSql}) AND (c.event_ends_at IS NULL OR c.event_ends_at>=${stampSql})
 AND EXISTS(SELECT 1 FROM news_controls WHERE id=1 AND publication_enabled=1)
 ${row.origin===ASSISTED_ORIGIN?'AND '+assistedPredicate():"AND EXISTS(SELECT 1 FROM source_health WHERE source_id=c.source_id AND "+publicationHealthSQL+" AND last_successful_run_at=?)"}
 AND NOT EXISTS(SELECT 1 FROM source_state WHERE source_id=c.source_id AND (${row.origin===ASSISTED_ORIGIN?'':'disabled=1 OR '}takedown=1 OR publication_blocked=1))
 AND NOT EXISTS(SELECT 1 FROM news_takedowns WHERE item_id=c.id)
 AND NOT EXISTS(SELECT 1 FROM candidate_items d WHERE ${predicate.sql}) AND ${predicate.fenceSql} ${parseFacts(row)?.kind==='human_product_notice'?'AND '+canonicalReceiptFence():''}`:''}
 ${automatic?'AND '+authorization.fenceSql:''}`)
 .bind(decisionId,input.action,input.reason,actor.type,actor.id,features,DECISION_POLICY_VERSION,input.requestId,payloadHash,input.snapshot,approve?validation.publishableLabel:null,canonical(approve?{basis:automatic?'automatic_formal_and_editorial':'validated_official_surface',...input.checks}:{}),canonical({row,now}),row.id,row.review_revision,row.review_status,...(approve?[...(row.origin===ASSISTED_ORIGIN?[]:[validation.healthSuccessfulAt]),...predicate.args,...predicate.fenceArgs]:[]),...(automatic?authorization.fenceArgs:[]));
 try{await statement.run();}catch(error){const committed=await replay(store,input.requestId,payloadHash);if(committed)return automatic?{...committed,replayed:committed.decisionId!==decisionId}:committed;throw Error('decision_transaction_failed',{cause:error});}
 const committed=await replay(store,input.requestId,payloadHash);if(committed)return automatic?{...committed,replayed:committed.decisionId!==decisionId}:committed;
 const current=await store.db.prepare('SELECT review_status,review_revision FROM candidate_items WHERE id=?').bind(row.id).first();
 if(current?.review_revision!==row.review_revision||current?.review_status!==row.review_status)throw Error('stale_decision');
 if(approve){const after=await publicationValidation(store,row,now,registry,pepper);if(!after.valid)throw Error(after.errors[0]);}
 throw Error('stale_decision');
}
export async function purgeDecisionLedger(store,now){
 // Facts and labels expire at 90 days; coarse decision evidence and idempotency last 365 days.
 await store.db.batch([store.db.prepare('UPDATE news_decision_ledger SET persisted_label=NULL WHERE created_at<=? AND persisted_label IS NOT NULL').bind(now-90*DAY),store.db.prepare('DELETE FROM news_decision_ledger WHERE created_at<=?').bind(now-365*DAY)]);
}
