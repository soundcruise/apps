import {hash,DAY} from './policy.js';
import {DECISION_POLICY_VERSION,publicationValidation} from './decision-policy.js';
import {INSIGHTS_VERSION,humanDecisions,retainedDecisionProfile,evaluateDecisions} from './operator-insights.js';
export const SHADOW_RULE_VERSION=INSIGHTS_VERSION;
export const SHADOW_CONTRACT_VERSION='shadow-v1';
const canonical=value=>JSON.stringify(sort(value));
function sort(value){return Array.isArray(value)?value.map(sort):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,sort(value[k])])):value;}
export const shadowSnapshot=row=>hash(canonical(row));
export const comparison=(recommendation,verdict)=>({RECOMMEND_APPROVE:{approve:'AGREE_APPROVE',reject:'FALSE_PUBLISH_DIRECTION'},RECOMMEND_REJECT:{approve:'MISSED_PUBLISH_DIRECTION',reject:'AGREE_REJECT'},NO_RECOMMENDATION:{approve:'NO_RECOMMENDATION_APPROVE',reject:'NO_RECOMMENDATION_REJECT'}}[recommendation]?.[verdict]||null);
export async function prepareShadowEvaluation(store,row,validation,now,{trigger='review',decisionId=null}={}){
 const profile=await retainedDecisionProfile(row,validation,now),teachers=await humanDecisions(store,now),result=evaluateDecisions(profile,teachers,{now,candidateId:row.id,validation});
 const candidateSnapshot=await shadowSnapshot(row),historyWatermark=await hash(canonical(teachers.map(d=>[d.decision_id,d.policy_version,d.candidate_revision]).sort()));
 const reviewability=validation.errors.includes('duplicate')?'DUPLICATE_BLOCKED':validation.valid?'READY_FOR_HUMAN_DECISION':validation.errors.includes('operator_source_gate')?'POLICY_BLOCKED':'FACTS_OR_VALIDATION_BLOCKED';
 const state={candidateId:row.id,candidateRevision:row.review_revision,candidateSnapshot,policyVersion:DECISION_POLICY_VERSION,ruleVersion:SHADOW_RULE_VERSION,profile,historyWatermark,reviewability,validationErrors:validation.errors,trigger,decisionId};
 return {...result,evaluationId:await hash(canonical(state)),contractVersion:SHADOW_CONTRACT_VERSION,ruleVersion:SHADOW_RULE_VERSION,candidateId:row.id,candidateRevision:row.review_revision,candidateSnapshot,sourceId:row.source_id,category:row.category,articleType:row.event_type,profile,historyWatermark,trigger,reviewability,publicationValidation:{valid:validation.valid,errors:validation.errors,policyVersion:validation.policyVersion}};
}
export async function saveShadowEvaluation(store,input,now,registry,pepper){
 if(!input||Object.keys(input).some(k=>!['id','revision','snapshot'].includes(k))||!/^[-a-zA-Z0-9_]{1,128}$/.test(input.id||'')||!Number.isSafeInteger(input.revision)||input.revision<0||!/^[a-f0-9]{64}$/.test(input.snapshot||''))throw Error('operator_shadow_input_invalid');
 const row=await store.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(input.id).first();if(!row)throw Error('candidate_not_found');
 if(row.origin==='legacy_fixture_backfill'||!['pending','reopened'].includes(row.review_status))throw Error('already_decided');
 if(row.review_revision!==input.revision||await shadowSnapshot(row)!==input.snapshot)throw Error('candidate_changed');
 const validation=await publicationValidation(store,row,now,registry,pepper),evaluation=await prepareShadowEvaluation(store,row,validation,now);
 const columns=Object.keys(row).sort();if(columns.some(k=>!/^[_a-z]+$/.test(k)))throw Error('candidate_schema_invalid');
 await store.db.prepare(`INSERT OR IGNORE INTO news_shadow_evaluations SELECT ?,?,?,?,?,?,?,?,?,? FROM candidate_items c WHERE c.id=? AND ${columns.map(k=>`c."${k}" IS ?`).join(' AND ')}`)
 .bind(evaluation.evaluationId,row.id,row.review_revision,evaluation.candidateSnapshot,now,evaluation.policyVersion,evaluation.ruleVersion,evaluation.recommendation,canonical(evaluation.profile),canonical(evaluation),row.id,...columns.map(k=>row[k])).run();
 const current=await store.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(row.id).first();if(!current||await shadowSnapshot(current)!==input.snapshot)throw Error('candidate_changed');
 const saved=await store.db.prepare('SELECT evaluation_json FROM news_shadow_evaluations WHERE evaluation_id=?').bind(evaluation.evaluationId).first();if(!saved)throw Error('candidate_changed');
 // Repeating identical state/history returns the first observation; no unbounded time-based inserts.
 return JSON.parse(saved.evaluation_json);
}
export async function evaluatePending(store,now,registry,pepper){
 const pending=(await store.candidates()).filter(r=>r.origin!=='legacy_fixture_backfill'&&['pending','reopened'].includes(r.review_status));
 // Bound each request; subsequent pages target IDs, never repeatedly re-evaluate the same first page.
 if(pending.length>100)throw Error('operator_shadow_batch_too_large');
 const outcomes=[];for(const row of pending){try{const result=await saveShadowEvaluation(store,{id:row.id,revision:row.review_revision,snapshot:await shadowSnapshot(row)},now,registry,pepper);outcomes.push({id:row.id,evaluationId:result.evaluationId,recommendation:result.recommendation});}catch(e){if(['candidate_changed','already_decided','candidate_not_found'].includes(e.message))outcomes.push({id:row.id,error:e.message});else throw e;}}
 return {evaluated:outcomes.filter(r=>r.evaluationId).length,items:outcomes};
}
const parse=value=>{try{return JSON.parse(value);}catch{return null;}};
const empty=()=>({evaluatedHumanDecisions:0,recommendApprove:0,recommendReject:0,noRecommendation:0,agreement:0,falsePublishDirection:0,missedPublishDirection:0,contradictions:0});
function add(metrics,result,outcome){metrics.evaluatedHumanDecisions++;metrics[result.recommendation==='RECOMMEND_APPROVE'?'recommendApprove':result.recommendation==='RECOMMEND_REJECT'?'recommendReject':'noRecommendation']++;if(outcome.startsWith('AGREE_'))metrics.agreement++;if(outcome==='FALSE_PUBLISH_DIRECTION')metrics.falsePublishDirection++;if(outcome==='MISSED_PUBLISH_DIRECTION')metrics.missedPublishDirection++;if(result.contradictionCount>0)metrics.contradictions++;}
function rates(m){const n=m.evaluatedHumanDecisions,recommended=m.recommendApprove+m.recommendReject;return {...m,recommendationCoverage:n?recommended/n:null,agreementRate:recommended?m.agreement/recommended:null,contradictionRate:n?m.contradictions/n:null,lowSample:n<10};}
export function aggregateShadowMetrics(ledger,evaluations,now,{policy=DECISION_POLICY_VERSION,rule=SHADOW_RULE_VERSION}={}){
 const validHumans=ledger.filter(d=>d.actor_type==='human_operator'&&d.success_state==='committed'&&d.policy_version===policy&&d.created_at>now-365*DAY&&d.decided_at<=now);
 const current=evaluations.filter(e=>e.policy_version===policy&&e.rule_version===rule&&e.evaluated_at>now-365*DAY&&e.evaluated_at<=now),byId=new Map(current.map(e=>[e.evaluation_id,e]));
 const latestByCandidate=new Map();for(const d of [...validHumans].sort((a,b)=>b.decided_at-a.decided_at||b.decision_id.localeCompare(a.decision_id)))if(!latestByCandidate.has(d.candidate_id))latestByCandidate.set(d.candidate_id,d);
 const matched=[];for(const d of latestByCandidate.values()){const f=parse(d.decision_features_json),id=f?.shadowEvaluation?.evaluationId,row=byId.get(id),result=row&&parse(row.evaluation_json),profile=row&&parse(row.profile_json);
  if(!result||!profile||row.candidate_id!==d.candidate_id||row.candidate_revision!==d.candidate_revision||row.candidate_snapshot!==d.candidate_snapshot||row.evaluated_at>d.decided_at||row.evaluated_at<d.decided_at-1800000||result.ruleVersion!==rule||result.policyVersion!==policy||!comparison(result.recommendation,d.verdict))continue;
  matched.push({d,result,profile});
 }
 // Latest matched verdict per candidate/article/topic, not source sightings or retry count.
 const seen=new Set(),seenArticles=new Set(),seenTopics=new Set(),independent=matched.sort((a,b)=>b.d.decided_at-a.d.decided_at||b.d.decision_id.localeCompare(a.d.decision_id)).filter(({d,profile:p})=>{if(seen.has(d.candidate_id)||p.articleIdentity&&seenArticles.has(p.articleIdentity)||p.topicIdentity&&seenTopics.has(p.topicIdentity))return false;seen.add(d.candidate_id);if(p.articleIdentity)seenArticles.add(p.articleIdentity);if(p.topicIdentity)seenTopics.add(p.topicIdentity);return true;});
 const total=empty(),patterns=new Map();for(const {d,result,profile:p}of independent){const outcome=comparison(result.recommendation,d.verdict);add(total,result,outcome);const descriptor={source:p.source,surface:p.surface,category:p.category,articleType:p.type,factShape:p.factShape,ruleVersion:rule,policyVersion:policy},key=canonical(descriptor);if(!patterns.has(key))patterns.set(key,{...descriptor,...empty()});add(patterns.get(key),result,outcome);}
 return {policyVersion:policy,ruleVersion:rule,totalHumanDecisions:validHumans.length,evaluationsRecorded:current.length,observations:{recommendApprove:current.filter(r=>r.recommendation==='RECOMMEND_APPROVE').length,recommendReject:current.filter(r=>r.recommendation==='RECOMMEND_REJECT').length,noRecommendation:current.filter(r=>r.recommendation==='NO_RECOMMENDATION').length},matchedHumanDecisions:matched.length,independentHumanDecisions:independent.length,unmatchedHumanDecisions:validHumans.length-matched.length,...rates(total),humanEvidenceSpanDays:independent.length?(Math.max(...independent.map(m=>m.d.decided_at))-Math.min(...independent.map(m=>m.d.decided_at)))/DAY:0,patterns:[...patterns.values()].map(rates),automationEnabled:false,readiness:{autoPublish:independent.length<10?'INSUFFICIENT_EVIDENCE':total.falsePublishDirection||total.contradictions?'REQUIRES_RISK_REVIEW':'REQUIRES_SUSTAINED_PATTERN_EVIDENCE',autoReject:independent.length<10?'INSUFFICIENT_EVIDENCE':total.missedPublishDirection||total.contradictions?'REQUIRES_RISK_REVIEW':'REQUIRES_SUSTAINED_PATTERN_EVIDENCE',reason:'requires_independent_sustained_evidence_and_explicit_operator_approval'}};
}
export async function shadowMetrics(store,now){
 const ledger=await humanDecisions(store,now),evaluations=(await store.db.prepare('SELECT * FROM news_shadow_evaluations WHERE evaluated_at>? AND evaluated_at<=? ORDER BY evaluated_at DESC,evaluation_id').bind(now-365*DAY,now).all()).results;
 return aggregateShadowMetrics(ledger,evaluations,now);
}
