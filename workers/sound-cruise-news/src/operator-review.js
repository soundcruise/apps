import {ASSISTED_ORIGIN,assistedPredicate} from './assisted-facts.js';
import {effectiveCategory} from './category-editor.js';
import {MORRIS_EDITORIAL_POLICY,MORRIS_REVIEW_TYPES,MORRIS_PRODUCT_TYPES} from './morris-editorial-policy.js';
import {morrisRecoveryView} from './morris-collector.js';
import {reviewReference} from './review-reference.js';
import {lifecycleView} from './pending-lifecycle.js';
import {retainedDecisionProfile} from './operator-insights.js';
import {prepareShadowEvaluation} from './operator-shadow.js';
import {missingFacts,recoverySurface,resolvedRecoverySurface,recoveryAssessment,recoveryCacheKey} from './facts-readiness.js';
import {hash,DAY} from './policy.js';
import {findDotReceipt} from './dot-receipt.js';
import {CHECKS,REASONS,DECISION_POLICY_VERSION,parseFacts,resolvedDuplicatePredicate,publicationValidation} from './decision-policy.js';
export const FEEDBACK_REASONS=Object.freeze([...new Set(Object.values(REASONS).flat())]);
export const canonical=value=>JSON.stringify(sort(value));
function sort(value){if(Array.isArray(value))return value.map(sort);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,sort(value[k])]));return value;}
export const candidateSnapshot=row=>hash(canonical(row));
// Preserve parameter order while avoiding D1's expression-depth limit for a full
// row CAS composed with nested publication predicates.
function andSql(terms){if(terms.length<2)return terms[0]||'1';const mid=Math.floor(terms.length/2);return '('+andSql(terms.slice(0,mid))+' AND '+andSql(terms.slice(mid))+')';}
export async function decisionHistory(store,id){return (await store.db.prepare('SELECT verdict,reason,actor_type,actor_id,decided_at,source_id,category,policy_version,decision_id FROM news_decision_ledger WHERE candidate_id=? ORDER BY decided_at DESC,decision_id DESC LIMIT 100').bind(id).all()).results;}
const visibleFacts=facts=>facts?Object.fromEntries(Object.entries(facts).filter(([k])=>['author','focus','serviceAction','publicationAction','subject','actor','deadline','releaseDate','officialIdentity','productType','releaseEvent','models','components','theme','relevance','articleEvidence','section','articleType','person','brand','product','version','category','identifierBasis','manufacturerSource','listingSource','scopeUncertain','productEvent','kind','artist','performer','event','evidence','eventType','eventDate','endDate','endTime','startDate','venue','action','topic','seller','sellerKind','scope','nature','equipment','percentOff','brands'].includes(k))):null;
export async function reviewDetail(store,id,now,registry,pepper){
 const row=await store.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(id).first();if(!row)throw Error('candidate_not_found');
 const receipt=row.origin===ASSISTED_ORIGIN?await findDotReceipt(store,row.id):null;
 const validation=await publicationValidation(store,row,now,registry,pepper);
 // Generic Dot admission is review-only until the independent publication and
 // Firestore freshness gates are implemented. Never display it as approvable.
 if(receipt||row.origin===ASSISTED_ORIGIN&&row.source_id!=='yamaha'){validation.valid=false;validation.errors.push('dot_publication_gate_pending');}
 const source=registry.find(s=>s.id===row.source_id),surface=await resolvedRecoverySurface(store,row,source);
 const last=await store.db.prepare('SELECT checked_at,outcome,provenance_json FROM news_facts_rechecks WHERE candidate_id=? ORDER BY checked_at DESC LIMIT 1').bind(id).first();
 const cached=await store.db.prepare('SELECT checked_at,outcome,items_json FROM news_facts_sources WHERE source_id=?').bind(surface?recoveryCacheKey(row,source,surface):row.source_id).first();
 const factsReview={...recoveryAssessment(row,validation,surface,last,cached),missing:missingFacts(row,validation.facts,validation),available:!!surface&&!validation.errors.includes('operator_source_gate')&&!validation.errors.includes('source_url_invalid')&&['pending','reopened'].includes(row.review_status),surfaceUrl:surface?.url||null,method:surface?.method||null,lastVerifiedAt:last?.checked_at||cached?.checked_at||null,outcome:last?.outcome||cached?.outcome||null,provenance:last?.provenance_json&&last.provenance_json!=='[]'?JSON.parse(last.provenance_json):row.facts_provenance?JSON.parse(row.facts_provenance):[],reviewability:validation.errors.includes('duplicate')?'DUPLICATE_BLOCKED':validation.valid?'READY_FOR_HUMAN_DECISION':validation.errors.includes('operator_source_gate')?'POLICY_BLOCKED':surface?'FACTS_RECOVERY_UNCERTAIN':'POLICY_BLOCKED'};
 if(receipt){factsReview.available=false;factsReview.nextAction='Dot候補の現在版と原出典を再確認するまで掲載できません。自動再取得は行いません。';}
 const morrisReview=row.source_id==='morris'?{policy:MORRIS_EDITORIAL_POLICY,state:validation.valid?'READY':validation.errors.some(e=>['duplicate','expired_candidate','event_validation_failed','candidate_takedown','publication_policy_rejected'].includes(e))?'EXCLUDED':'NEEDS_CONFIRMATION',historical:row.review_reason==='morris_historical_confirmation_required',types:MORRIS_REVIEW_TYPES,productTypes:Object.keys(MORRIS_PRODUCT_TYPES),confirmationAvailable:['pending','reopened'].includes(row.review_status)&&!validation.valid&&!validation.errors.some(e=>!['facts_incomplete','facts_provenance_invalid'].includes(e))}:null;
 if(morrisReview){morrisReview.automation=await morrisRecoveryView(store,row,now);if(morrisReview.state==='NEEDS_CONFIRMATION'){
  factsReview.nextAction=morrisReview.automation.recoveryStatus==='PERMISSION_BLOCKED_HISTORICAL'?'システム側の証拠待ちです。保存済み一次証拠が不足し、許諾範囲では過去詳細を再取得できません。新しい許可済み一覧に正式なfactsが得られた場合だけ再評価します。事実入力・掲載判断はまだ不要です。':'新着は許可済みの1回取得で自動解析します。不足が残る間は掲載判断を求めません。';
  if(morrisReview.automation.recoveryStatus==='PERMISSION_BLOCKED_HISTORICAL'){factsReview.available=false;factsReview.reviewability='EVIDENCE_WAIT';morrisReview.confirmationAvailable=false;}
 }}
 return {dotAdmission:!!receipt,assistedEditable:row.origin===ASSISTED_ORIGIN&&row.source_id==='yamaha'&&!receipt,systemDisposition:row.review_status==='rejected'&&['system_policy','source_policy'].includes(row.reviewed_by)?{actor:row.reviewed_by,reason:row.review_reason}:null,reviewReference:await reviewReference(store,row),morrisReview,lifecycle:await lifecycleView(store,row,now),factsReview,id:row.id,label:row.label,source:row.source_name,sourceId:row.source_id,category:await effectiveCategory(store,row),publishedAt:row.published_at,eventType:row.event_type,reason:row.decision_reason,reviewReason:row.review_reason,sourceUrl:row.source_url,decision:row.publication_decision,status:row.review_status,facts:visibleFacts(validation.facts),expiresAt:row.expires_at,saleEndsAt:row.sale_ends_at,eventEndsAt:row.event_ends_at,snapshot:await candidateSnapshot(row),revision:row.review_revision,validation:{...validation,facts:undefined,healthSuccessfulAt:undefined},history:await decisionHistory(store,id)};
}
export async function reviewQueue(store,{now=Date.now(),registry=[],pepper}={}){
 const rows=(await store.candidates()).filter(i=>i.origin!=='legacy_fixture_backfill'&&['pending','reopened'].includes(i.review_status));
 if(registry.length)return Promise.all(rows.map(row=>reviewDetail(store,row.id,now,registry,pepper)));
 return Promise.all(rows.map(async row=>({id:row.id,label:row.label,source:row.source_name,category:await effectiveCategory(store,row),publishedAt:row.published_at,facts:visibleFacts(parseFacts(row)),reason:row.decision_reason,sourceUrl:row.source_url,decision:row.publication_decision,snapshot:await candidateSnapshot(row),revision:row.review_revision})));
}
const savedResult=row=>({id:row.candidate_id,action:row.verdict,reason:row.reason,at:row.decided_at,decisionId:row.decision_id,publisherRequests:0});
async function replay(store,requestId,payloadHash){const existing=await store.db.prepare('SELECT * FROM news_decision_ledger WHERE request_id=?').bind(requestId).first();if(!existing)return null;if(existing.request_payload_hash!==payloadHash)throw Error('idempotency_payload_changed');return savedResult(existing);}
export async function operatorDecision(store,input,now,registry,pepper,actor,dotContext=null){
 if(!actor||!['human_operator','fixture','system_repair'].includes(actor.type)||typeof actor.id!=='string'||!/^[a-zA-Z0-9:_@.\-]{1,200}$/.test(actor.id))throw Error('operator_identity_required');
 if(!input||Object.keys(input).some(k=>!['id','action','reason','requestId','snapshot','revision','checks','label','category','publishedAt','takedown'].includes(k))||!['approve','reject'].includes(input.action)||!REASONS[input.action].includes(input.reason)||typeof input.id!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(input.id)||!/^[-a-zA-Z0-9_]{16,100}$/.test(input.requestId||'')||!/^[a-f0-9]{64}$/.test(input.snapshot||'')||!Number.isSafeInteger(input.revision)||input.revision<0)throw Error('operator_decision_invalid');
 if(input.takedown!==undefined&&(input.takedown!==true||input.action!=='reject'||actor.type!=='human_operator'))throw Error('operator_decision_invalid');
 const payloadHash=await hash(canonical({input,actor})),previous=await replay(store,input.requestId,payloadHash);if(previous)return previous;
 const row=await store.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(input.id).first();
 if(!row)throw Error('candidate_not_found');
 const takedown=input.takedown===true;
 if(takedown?row.review_status!=='approved':row.origin==='legacy_fixture_backfill'||!['pending','reopened'].includes(row.review_status))throw Error('already_decided');
 if(input.reason==='minor_update'&&row.event_type!=='firmware')throw Error('operator_decision_invalid');
 if(row.review_revision!==input.revision||await candidateSnapshot(row)!==input.snapshot)throw Error('candidate_changed');
 const approve=input.action==='approve';let validation=null,dotFence=null,dotReader=null;
 if(approve){
  const dotReceipt=row.origin===ASSISTED_ORIGIN?await findDotReceipt(store,row.id):null;
  if(dotReceipt){if(actor.type!=='human_operator'||!dotContext?.enabled)throw Error('dot_publication_gate_pending');dotReader=dotContext.reader||(dotContext.readerFactory?dotContext.readerFactory():null);if(!dotReader)throw Error('dot_publication_gate_pending');const {dotPublicationGate}=await import('./dot-publication-gate.js');const gate=await dotPublicationGate(store,dotReader,row.id,now,registry,pepper);if(gate.status!=='PASS'||!gate.fence)throw Error('dot_publication_gate_pending');dotFence=gate.fence;}
  else if(row.origin===ASSISTED_ORIGIN&&row.source_id!=='yamaha')throw Error('dot_publication_gate_pending');
  validation=await publicationValidation(store,row,now,registry,pepper);
  if(!validation.valid)throw Error(validation.errors[0]);
  if(input.label!==validation.publishableLabel||input.category!==await effectiveCategory(store,row)||input.publishedAt!==row.published_at)throw Error('verified_factual_label_required');
  if(!input.checks||Object.keys(input.checks).some(k=>!CHECKS.includes(k))||CHECKS.some(k=>input.checks[k]!==true))throw Error('operator_checks_required');
 }else if(input.checks&&Object.keys(input.checks).length)throw Error('operator_decision_invalid');
 const predicate=await resolvedDuplicatePredicate(store,row,parseFacts(row),now,registry),decisionId=crypto.randomUUID();
 // A full row CAS also catches collector/recovery edits without altering their UPDATE
 // change counts. Only this decision service increments review_revision.
 const snapshotColumns=Object.keys(row).sort();if(snapshotColumns.some(k=>!/^[_a-z]+$/.test(k)))throw Error('candidate_schema_invalid');
 const snapshotWhere=andSql(snapshotColumns.map(k=>`c."${k}" IS ?`));
 // No body, headline, raw HTML, product/artist names or tokens in retained features.
 const insightsValidation=actor.type==='human_operator'?(validation||await publicationValidation(store,row,now,registry,pepper)):null;
 // A takedown must not invent a retrospective Shadow evaluation.
 const observed=takedown?await store.db.prepare('SELECT evaluation_json FROM news_shadow_evaluations WHERE candidate_id=? AND candidate_revision=? AND candidate_snapshot=? AND policy_version=? AND evaluated_at BETWEEN ? AND ? ORDER BY evaluated_at DESC LIMIT 1').bind(row.id,row.review_revision,input.snapshot,DECISION_POLICY_VERSION,now-1800000,now).first():null;
 const evaluation=takedown?(observed?JSON.parse(observed.evaluation_json):null):actor.type==='human_operator'?await prepareShadowEvaluation(store,row,insightsValidation,now,{trigger:'pre_decision',decisionId}):null;
 const profile=actor.type==='human_operator'?await retainedDecisionProfile(row,insightsValidation,now):null;
 const features=canonical({...(input.reason==='minor_update'?{policySignal:{eventType:'firmware',articleNature:'routine_minor',newsValue:'low',basis:'human_operator',reason:'minor_update'}}:{}),operation:takedown?'human_takedown':'pending_decision',...(profile?{insightsProfile:profile}:{}),...(evaluation?{shadowEvaluation:{...evaluation,operatorFinalVerdict:input.action}}:{}),factsPresent:!!parseFacts(row),eventType:row.event_type,publicationDecision:row.publication_decision,hasDate:Number.isFinite(Date.parse(row.published_at)),sale:row.category==='sale',labelQuality:validation?.quality.labelInformationScore??null});
 // Re-read external staging after all other preparation; it is not locked by D1.
 let decisionNow=now;if(dotFence){decisionNow=dotContext?.clock?dotContext.clock():Date.now();const {dotPublicationGate}=await import('./dot-publication-gate.js');const latest=await dotPublicationGate(store,dotReader,row.id,decisionNow,registry,pepper);if(latest.status!=='PASS'||!latest.fence||latest.fence.expiresAt<=decisionNow)throw Error('dot_publication_gate_pending');dotFence=latest.fence;}
 const statement=store.db.prepare(`INSERT INTO news_decision_ledger(decision_id,candidate_id,verdict,reason,actor_type,actor_id,decided_at,source_id,category,decision_features_json,policy_version,request_id,request_payload_hash,candidate_revision,candidate_snapshot,success_state,created_at,persisted_label,checks_json)
 SELECT ?,c.id,?,?,?,?,?,c.source_id,c.category,?,?,?,?,c.review_revision,?,'committed',?,?,?
 FROM candidate_items c WHERE c.id=? AND c.review_revision=? AND c.review_status=? ${takedown?'':"AND c.origin<>'legacy_fixture_backfill'"} AND ${snapshotWhere}
 ${approve?`AND c.expires_at>? AND (c.sale_ends_at IS NULL OR c.sale_ends_at>=?) AND (c.event_ends_at IS NULL OR c.event_ends_at>=?)
 AND EXISTS(SELECT 1 FROM news_controls WHERE id=1 AND publication_enabled=1)
 ${row.origin===ASSISTED_ORIGIN?(row.source_id==='yamaha'?'AND '+assistedPredicate():"AND EXISTS(SELECT 1 FROM news_assisted_edits a WHERE a.candidate_id=c.id AND a.source_url=c.source_url AND a.published_at=c.published_at AND a.facts_json=c.product_facts AND a.label=c.label)"):"AND EXISTS(SELECT 1 FROM source_health WHERE source_id=c.source_id AND status='healthy' AND last_successful_run_at=?)"}
 AND NOT EXISTS(SELECT 1 FROM source_state WHERE source_id=c.source_id AND (${row.origin===ASSISTED_ORIGIN?'':'disabled=1 OR '}takedown=1 OR publication_blocked=1))
 AND NOT EXISTS(SELECT 1 FROM news_takedowns WHERE item_id=c.id)
 AND NOT EXISTS(SELECT 1 FROM candidate_items d WHERE ${predicate.sql}) AND ${predicate.fenceSql} ${dotFence?'AND '+dotFence.snapshotParts.map(p=>'('+p.sql+') IS ?').join(' AND ')+' AND ? > '+(dotContext?.clock?'?':"(CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER))")+' AND EXISTS(SELECT 1 FROM news_dot_publication_checks WHERE request_id=? AND candidate_id=c.id AND checked_at<=? AND checked_at>?) AND EXISTS(SELECT 1 FROM news_dot_history_checks WHERE request_id=? AND candidate_id=c.id AND checked_at<=? AND checked_at>?) AND EXISTS(SELECT 1 FROM news_dot_admission_receipts WHERE request_id=? AND candidate_id=c.id)':''}`:''}`)
 .bind(decisionId,input.action,input.reason,actor.type,actor.id,now,features,DECISION_POLICY_VERSION,input.requestId,payloadHash,input.snapshot,now,approve?validation.publishableLabel:null,canonical(approve?{basis:'validated_official_surface',...input.checks,...(dotFence?{dotPublication:{ruleVersion:dotFence.ruleVersion,scopeDigest:dotFence.scopeDigest,scopeWitnessId:dotFence.scopeWitnessId,scopeEvidenceCount:dotFence.scopeEvidenceCount,scopeEvidenceVersion:dotFence.scopeEvidenceVersion,sourceCheckId:dotFence.sourceCheckId,historyCheckId:dotFence.historyCheckId,receiptId:dotFence.receiptId,candidateDigest:dotFence.candidateDigest,stagingRevision:dotFence.stagingRevision,expiresAt:dotFence.expiresAt}}:{})}:{}),row.id,row.review_revision,row.review_status,...snapshotColumns.map(k=>row[k]),...(approve?[now,now,now,...(row.origin===ASSISTED_ORIGIN?[]:[validation.healthSuccessfulAt]),...predicate.args,...predicate.fenceArgs,...(dotFence?[...dotFence.snapshotParts.flatMap(p=>[...(p.args||[]),p.value]),dotFence.expiresAt,...(dotContext?.clock?[decisionNow]:[]),dotFence.sourceCheckId,decisionNow,decisionNow-300000,dotFence.historyCheckId,decisionNow,decisionNow-300000,dotFence.receiptId]:[])]:[]));
 try{await statement.run();}catch(error){const committed=await replay(store,input.requestId,payloadHash);if(committed)return committed;throw Error('decision_transaction_failed',{cause:error});}
 const committed=await replay(store,input.requestId,payloadHash);if(committed)return committed;
 const current=await store.db.prepare('SELECT review_status,review_revision FROM candidate_items WHERE id=?').bind(row.id).first();
 if(current?.review_revision!==row.review_revision||current?.review_status!==row.review_status)throw Error('stale_decision');
 if(approve){const after=await publicationValidation(store,row,now,registry,pepper);if(!after.valid)throw Error(after.errors[0]);}
 throw Error('stale_decision');
}
export async function purgeDecisionLedger(store,now){
 // Facts and labels expire at 90 days; coarse decision evidence and idempotency last 365 days.
 await store.db.batch([store.db.prepare('UPDATE news_decision_ledger SET persisted_label=NULL WHERE created_at<=? AND persisted_label IS NOT NULL').bind(now-90*DAY),store.db.prepare('DELETE FROM news_decision_ledger WHERE created_at<=?').bind(now-365*DAY)]);
}
