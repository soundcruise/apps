import {DAY,hash} from './policy.js';
import {DECISION_POLICY_VERSION,parseFacts} from './decision-policy.js';
import {validatedProductEvent} from './product-event.js';
import {morrisDiagnosticsHealth} from './morris-diagnostics.js';
import {discoverySummary} from './discovery-work.js';
export const INSIGHTS_VERSION='structured-human-v1';
export const MINIMUM_EVIDENCE=5;
// These verdicts describe a particular evidence/duplicate/policy problem, not
// an editorial preference against other news with the same coarse profile.
export function decisionLearningUse(row){
 if(row.verdict!=='reject')return 'editorial';
 if(['facts_identifier_missing','date_uncertain','category_uncertain'].includes(row.reason))return 'technical_only';
 if(row.reason==='duplicate')return 'duplicate_only';
 if(row.reason==='policy_concern')return 'policy_only';
 if(row.reason==='operator_review'&&parse(row.decision_features_json).insightsProfile?.factsVerified!==true)return 'unconfirmed_only';
 return 'editorial';
}
export const displayCategory=key=>['recording_audio','creator_streaming'].includes(key)?'recording_streaming':key;
const parse=value=>{try{return JSON.parse(value)||{};}catch{return {};}};
const populated=value=>value!==null&&value!==undefined&&value!==''&&(!Array.isArray(value)||value.length>0);
const shapeKeys=['brand','product','version','identifierBasis','kind','artist','performer','event','eventType','eventDate','endDate','venue','action','topic','seller','scope','nature','equipment','percentOff'];
const freshness=(stamp,at)=>!Number.isFinite(stamp)||stamp>at?'unknown':at-stamp<=7*DAY?'within_7_days':at-stamp<=14*DAY?'within_14_days':at-stamp<90*DAY?'within_90_days':'expired';
function surface(url){try{const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password)return 'unknown';const routes=['update','dtm-recording','amp-effector','guitar','new_product','information','news','news_events','products','events','event','dtm-materials'];const parts=u.pathname.split('/').filter(Boolean),prefix=[];for(const part of parts){if(!routes.includes(part))break;prefix.push(part);}return u.hostname+'/'+prefix.join('/');}catch{return 'unknown';}}
export function decisionProfile(row,validation,now){
 const facts=parseFacts(row);
 return {version:INSIGHTS_VERSION,source:row.source_id,surface:surface(row.source_url),category:displayCategory(row.category),type:row.event_type||'other',...(validatedProductEvent(facts?.productEvent)?{productAction:facts.productEvent.action}:{}),articleNature:row.event_type==='firmware'?(row.review_reason==='minor_update'?'routine_minor':'significance_unconfirmed'):'not_firmware',factShape:shapeKeys.filter(k=>populated(facts?.[k])),factsVerified:validation?.valid===true,reviewReasons:[row.decision_reason,row.review_reason,...(validation?.errors||[])].filter(Boolean).filter((x,i,a)=>a.indexOf(x)===i).sort(),freshness:freshness(Date.parse(row.published_at),now)};
}
export async function retainedDecisionProfile(row,validation,now){return {...decisionProfile(row,validation,now),articleIdentity:await hash(row.normalized_url||row.source_url||row.id),topicIdentity:row.topic_key?await hash(row.topic_key):null};}
function teacherProfile(row){
 const features=parse(row.decision_features_json);
 if(features.insightsProfile?.version===INSIGHTS_VERSION)return {...features.insightsProfile,...(row.reason==='minor_update'&&features.policySignal?.articleNature==='routine_minor'?{articleNature:'routine_minor'}:{})};
 // Historical coarse fields are immutable evidence, never reconstructed from mutable candidates.
 return {version:'legacy_coarse',source:row.source_id,surface:'unknown',category:displayCategory(row.category),type:features.eventType||'other',factShape:[],factsVerified:false,reviewReasons:[],freshness:'unknown'};
}
// Publication policy 2 changed health/proof validation and exposed relevance;
// it did not redefine the retained human editorial verdict/reason vocabulary.
// Reuse only the editorial signal, never the old proof as current publication
// authority. An old policy name alone is deliberately insufficient.
export function editorialCompatibility(row){
 if(row?.policy_version===DECISION_POLICY_VERSION)return {status:'SAME',reason:'current_policy'};
 const fail=reason=>({status:'OBSOLETE',reason});
 if(row?.policy_version!=='operator-publication-1')return fail('unmapped_policy');
 if(row.actor_type!=='human_operator'||row.success_state!=='committed'||!['approve','reject'].includes(row.verdict))return fail('not_committed_human');
 if(decisionLearningUse(row)!=='editorial')return fail('non_editorial_verdict');
 const f=parse(row.decision_features_json),p=f.insightsProfile,e=f.shadowEvaluation;
 if(f.operation&&f.operation!=='pending_decision'||e?.trigger!=='pre_decision')return fail('not_pre_decision');
 if(p?.version!==INSIGHTS_VERSION||!e||JSON.stringify(p)!==JSON.stringify(e.profile)||p.source!==row.source_id||e.sourceId!==row.source_id||p.category!==displayCategory(row.category)||p.type!==f.eventType||typeof p.type!=='string'||p.type==='other'||p.surface==='unknown'||typeof p.surface!=='string')return fail('profile_unbound');
 if(e.contractVersion!=='shadow-v1'||e.ruleVersion!=='structured-human-v1'||e.policyVersion!==row.policy_version||e.candidateId!==row.candidate_id||e.candidateRevision!==row.candidate_revision||e.candidateSnapshot!==row.candidate_snapshot||!/^[a-f0-9]{64}$/.test(row.candidate_snapshot||'')||e.operatorFinalVerdict!==row.verdict)return fail('snapshot_unbound');
 if(!Number.isSafeInteger(e.generatedAt)||!Number.isSafeInteger(row.decided_at)||!Number.isSafeInteger(row.created_at)||e.generatedAt>row.decided_at||e.generatedAt<row.decided_at-1800000||row.created_at<e.generatedAt)return fail('invalid_evidence_time');
 if(f.factsPresent!==true||f.hasDate!==true||p.factsVerified!==true||e.publicationValidation?.policyVersion!==row.policy_version||e.publicationValidation.valid!==true||!Array.isArray(e.publicationValidation.errors)||e.publicationValidation.errors.length||!Array.isArray(p.factShape)||!p.factShape.length||!['within_7_days','within_14_days','within_90_days'].includes(p.freshness)||!/^[a-f0-9]{64}$/.test(p.articleIdentity||'')||!/^[a-f0-9]{64}$/.test(p.topicIdentity||''))return fail('formal_evidence_unconfirmed');
 // Old generic editorial/event profiles retain field names, not the article
 // subtype (interview/book/correction, etc.). They cannot establish equal
 // editorial meaning. Start with explicitly typed product/launch decisions.
 if(!['new_product','release'].includes(p.type)||!['brand','product','identifierBasis'].every(k=>p.factShape.includes(k)))return fail('editorial_scope_unretained');
 return {status:'COMPATIBLE',reason:'retained_verified_editorial_verdict'};
}
export function policyCompatibility(version,row){return editorialCompatibility({...row,policy_version:version}).status;}
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function similarity(a,b){
 const signals={source:a.source===b.source&&!!a.source,surface:a.surface===b.surface&&a.surface!=='unknown',type:a.type===b.type&&a.type!=='other',category:a.category===b.category&&!!a.category,factStructure:a.factsVerified&&b.factsVerified&&a.factShape.length>0&&equal(a.factShape,b.factShape),reviewReason:a.reviewReasons.length>0&&equal(a.reviewReasons,b.reviewReasons),freshness:a.freshness!=='unknown'&&a.freshness!=='expired'&&a.freshness===b.freshness};
 const firmwareNature=a.type!=='firmware'||(a.articleNature==='routine_minor'&&b.articleNature==='routine_minor');
 const productActionCompatible=!(a.productAction||b.productAction)||a.productAction===b.productAction;
 const level=signals.source&&signals.surface&&signals.type&&signals.category&&signals.factStructure&&firmwareNature&&productActionCompatible?(signals.reviewReason&&signals.freshness?'EXACT_PATTERN':'STRONG_SIMILAR'):(signals.category&&(signals.source||signals.type)?'WEAK_SIMILAR':'INSUFFICIENT');
 return {level,signals};
}
export function evaluateDecisions(profile,rows,{now=Date.now(),candidateId,validation}={}){
 // Latest successful human decision per independent article. Retries/revisions are not extra teachers.
 const latest=new Map();for(const row of [...rows].sort((a,b)=>b.decided_at-a.decided_at||b.decision_id.localeCompare(a.decision_id))){if(row.actor_type!=='human_operator'||row.success_state!=='committed'||row.decided_at>now||row.created_at>now||row.created_at<=now-365*DAY||row.candidate_id===candidateId||!['approve','reject'].includes(row.verdict))continue;if(!latest.has(row.candidate_id))latest.set(row.candidate_id,row);}
 const seenArticles=new Set(),seenTopics=new Set();
 const independent=[...latest.values()].filter(row=>{const p=teacherProfile(row);if(p.articleIdentity&&seenArticles.has(p.articleIdentity)||p.topicIdentity&&seenTopics.has(p.topicIdentity))return false;if(p.articleIdentity)seenArticles.add(p.articleIdentity);if(p.topicIdentity)seenTopics.add(p.topicIdentity);return !(profile.articleIdentity&&p.articleIdentity===profile.articleIdentity||profile.topicIdentity&&p.topicIdentity===profile.topicIdentity);});
 const matches=independent.map(row=>{const compatibility=editorialCompatibility(row);return {decisionId:row.decision_id,candidateId:row.candidate_id,verdict:row.verdict,reason:row.reason,decidedAt:row.decided_at,source:row.source_id,category:row.category,type:teacherProfile(row).type,policyVersion:row.policy_version,policyCompatibility:compatibility.status,compatibilityReason:compatibility.reason,learningUse:decisionLearningUse(row),...similarity(profile,teacherProfile(row))};}).filter(m=>m.level!=='INSUFFICIENT');
 const editorial=matches.filter(m=>m.learningUse==='editorial');
 // Cross-policy compatibility is established only for the same retained
 // editorial pattern. A weak category/source resemblance cannot import an
 // old verdict in either direction (including as a contradiction).
 const usable=m=>m.policyCompatibility==='SAME'||m.policyCompatibility==='COMPATIBLE'&&['EXACT_PATTERN','STRONG_SIMILAR'].includes(m.level);
 const evidence=editorial.filter(m=>['EXACT_PATTERN','STRONG_SIMILAR'].includes(m.level)&&usable(m));
 const approveCount=matches.filter(m=>m.verdict==='approve').length,rejectCount=matches.filter(m=>m.verdict==='reject').length;
 const approvals=evidence.filter(m=>m.verdict==='approve').length,rejections=evidence.filter(m=>m.verdict==='reject').length;
 // Apply compatible verdicts consistently to evidence AND contradictions.
 // A weak same-policy disagreement keeps the existing conservative behavior.
 const same=editorial.filter(usable),yes=same.filter(m=>m.verdict==='approve').length,no=same.filter(m=>m.verdict==='reject').length,contradictionCount=Math.min(yes,no);
 let recommendation='NO_RECOMMENDATION',reason='insufficient_evidence';
 if(contradictionCount)reason='contradictory_history';
 else if(evidence.length>=MINIMUM_EVIDENCE){if(approvals===evidence.length){if(validation?.valid){recommendation='RECOMMEND_APPROVE';reason='consistent_human_evidence';}else reason='publication_blocked';}else if(rejections===evidence.length){recommendation='RECOMMEND_REJECT';reason='consistent_human_evidence';}}
 const rank=['INSUFFICIENT','WEAK_SIMILAR','STRONG_SIMILAR','EXACT_PATTERN'];
 const level=matches.reduce((best,m)=>rank.indexOf(m.level)>rank.indexOf(best)?m.level:best,'INSUFFICIENT');
 return {version:INSIGHTS_VERSION,generatedAt:now,matchedDecisionCount:matches.length,approveCount,rejectCount,evidenceCount:evidence.length,minimumEvidence:MINIMUM_EVIDENCE,contradictionCount,similarityLevel:level,reasonSummary:reason,policyVersion:DECISION_POLICY_VERSION,policyCounts:Object.fromEntries(['SAME','COMPATIBLE','OBSOLETE'].map(k=>[k,matches.filter(m=>m.policyCompatibility===k).length])),excludedTeacherCounts:Object.fromEntries(['technical_only','duplicate_only','policy_only','unconfirmed_only'].map(k=>[k,matches.filter(m=>m.learningUse===k).length])),recommendation,matches:matches.slice(0,50),truncated:matches.length>50};
}
export async function humanDecisions(store,now){return (await store.db.prepare("SELECT decision_id,candidate_id,verdict,reason,actor_type,decided_at,created_at,candidate_revision,candidate_snapshot,source_id,category,decision_features_json,policy_version,success_state FROM news_decision_ledger WHERE actor_type='human_operator' AND success_state='committed' AND created_at>? AND decided_at<=? ORDER BY decided_at DESC,decision_id DESC").bind(now-365*DAY,now).all()).results;}
export async function similarDecisions(store,row,validation,now){return evaluateDecisions(await retainedDecisionProfile(row,validation,now),await humanDecisions(store,now),{now,candidateId:row.id,validation});}
export async function dashboardSummary(store,now){
 const rows=(await store.db.prepare('SELECT review_status,COUNT(*) AS n FROM candidate_items GROUP BY review_status').all()).results,counts=Object.fromEntries(rows.map(r=>[r.review_status,r.n]));
 const human=await store.db.prepare("SELECT COUNT(*) AS n FROM news_decision_ledger WHERE actor_type='human_operator' AND success_state='committed' AND created_at>? AND decided_at<=?").bind(now-365*DAY,now).first();
 return {published:counts.approved||0,pending:(counts.pending||0)+(counts.reopened||0),rejected:counts.rejected||0,humanDecisions:human.n,generatedAt:now,publishedBasis:'approved_status',humanRetentionDays:365,parserDiagnostics:await morrisDiagnosticsHealth(store,now),discovery:await discoverySummary(store,now)};
}
export async function humanDecisionHistory(store,now,{offset=0}={}){
 const rows=(await store.db.prepare("SELECT decision_id,candidate_id,source_id,category,verdict,reason,decided_at,policy_version FROM news_decision_ledger WHERE actor_type='human_operator' AND success_state='committed' AND created_at>? AND decided_at<=? ORDER BY decided_at DESC,decision_id DESC LIMIT 51 OFFSET ?").bind(now-365*DAY,now,offset).all()).results;
 return {items:rows.slice(0,50),nextOffset:rows.length>50?offset+50:null};
}
