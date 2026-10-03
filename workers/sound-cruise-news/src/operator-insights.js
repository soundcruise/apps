import {DAY,hash} from './policy.js';
import {DECISION_POLICY_VERSION,parseFacts} from './decision-policy.js';
export const INSIGHTS_VERSION='structured-human-v1';
export const MINIMUM_EVIDENCE=5;
// No older policy is declared compatible without an explicit, reviewed mapping.
const COMPATIBLE_POLICIES=Object.freeze([]);
export const displayCategory=key=>['recording_audio','creator_streaming'].includes(key)?'recording_streaming':key;
const parse=value=>{try{return JSON.parse(value)||{};}catch{return {};}};
const populated=value=>value!==null&&value!==undefined&&value!==''&&(!Array.isArray(value)||value.length>0);
const shapeKeys=['brand','product','version','identifierBasis','kind','artist','performer','event','eventType','eventDate','endDate','venue','action','topic','seller','scope','nature','equipment','percentOff'];
const freshness=(stamp,at)=>!Number.isFinite(stamp)||stamp>at?'unknown':at-stamp<=7*DAY?'within_7_days':at-stamp<=14*DAY?'within_14_days':at-stamp<90*DAY?'within_90_days':'expired';
function surface(url){try{const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password)return 'unknown';const routes=['update','dtm-recording','amp-effector','guitar','new_product','information','news','news_events','products','events','event','dtm-materials'];const parts=u.pathname.split('/').filter(Boolean),prefix=[];for(const part of parts){if(!routes.includes(part))break;prefix.push(part);}return u.hostname+'/'+prefix.join('/');}catch{return 'unknown';}}
export function decisionProfile(row,validation,now){
 const facts=parseFacts(row);
 return {version:INSIGHTS_VERSION,source:row.source_id,surface:surface(row.source_url),category:displayCategory(row.category),type:row.event_type||'other',articleNature:row.event_type==='firmware'?(row.review_reason==='minor_update'?'routine_minor':'significance_unconfirmed'):'not_firmware',factShape:shapeKeys.filter(k=>populated(facts?.[k])),factsVerified:validation?.valid===true,reviewReasons:[row.decision_reason,row.review_reason,...(validation?.errors||[])].filter(Boolean).filter((x,i,a)=>a.indexOf(x)===i).sort(),freshness:freshness(Date.parse(row.published_at),now)};
}
export async function retainedDecisionProfile(row,validation,now){return {...decisionProfile(row,validation,now),articleIdentity:await hash(row.normalized_url||row.source_url||row.id),topicIdentity:row.topic_key?await hash(row.topic_key):null};}
function teacherProfile(row){
 const features=parse(row.decision_features_json);
 if(features.insightsProfile?.version===INSIGHTS_VERSION)return {...features.insightsProfile,...(row.reason==='minor_update'&&features.policySignal?.articleNature==='routine_minor'?{articleNature:'routine_minor'}:{})};
 // Historical coarse fields are immutable evidence, never reconstructed from mutable candidates.
 return {version:'legacy_coarse',source:row.source_id,surface:'unknown',category:displayCategory(row.category),type:features.eventType||'other',factShape:[],factsVerified:false,reviewReasons:[],freshness:'unknown'};
}
export function policyCompatibility(version){return version===DECISION_POLICY_VERSION?'SAME':COMPATIBLE_POLICIES.includes(version)?'COMPATIBLE':'OBSOLETE';}
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function similarity(a,b){
 const signals={source:a.source===b.source&&!!a.source,surface:a.surface===b.surface&&a.surface!=='unknown',type:a.type===b.type&&a.type!=='other',category:a.category===b.category&&!!a.category,factStructure:a.factsVerified&&b.factsVerified&&a.factShape.length>0&&equal(a.factShape,b.factShape),reviewReason:a.reviewReasons.length>0&&equal(a.reviewReasons,b.reviewReasons),freshness:a.freshness!=='unknown'&&a.freshness!=='expired'&&a.freshness===b.freshness};
 const firmwareNature=a.type!=='firmware'||(a.articleNature==='routine_minor'&&b.articleNature==='routine_minor');
 const level=signals.source&&signals.surface&&signals.type&&signals.category&&signals.factStructure&&firmwareNature?(signals.reviewReason&&signals.freshness?'EXACT_PATTERN':'STRONG_SIMILAR'):(signals.category&&(signals.source||signals.type)?'WEAK_SIMILAR':'INSUFFICIENT');
 return {level,signals};
}
export function evaluateDecisions(profile,rows,{now=Date.now(),candidateId,validation}={}){
 // Latest successful human decision per independent article. Retries/revisions are not extra teachers.
 const latest=new Map();for(const row of [...rows].sort((a,b)=>b.decided_at-a.decided_at||b.decision_id.localeCompare(a.decision_id))){if(row.actor_type!=='human_operator'||row.success_state!=='committed'||row.decided_at>now||row.created_at<=now-365*DAY||row.candidate_id===candidateId||!['approve','reject'].includes(row.verdict))continue;if(!latest.has(row.candidate_id))latest.set(row.candidate_id,row);}
 const seenArticles=new Set(),seenTopics=new Set();
 const independent=[...latest.values()].filter(row=>{const p=teacherProfile(row);if(p.articleIdentity&&seenArticles.has(p.articleIdentity)||p.topicIdentity&&seenTopics.has(p.topicIdentity))return false;if(p.articleIdentity)seenArticles.add(p.articleIdentity);if(p.topicIdentity)seenTopics.add(p.topicIdentity);return !(profile.articleIdentity&&p.articleIdentity===profile.articleIdentity||profile.topicIdentity&&p.topicIdentity===profile.topicIdentity);});
 const matches=independent.map(row=>({decisionId:row.decision_id,candidateId:row.candidate_id,verdict:row.verdict,reason:row.reason,decidedAt:row.decided_at,source:row.source_id,category:row.category,type:teacherProfile(row).type,policyVersion:row.policy_version,policyCompatibility:policyCompatibility(row.policy_version),...similarity(profile,teacherProfile(row))})).filter(m=>m.level!=='INSUFFICIENT');
 const evidence=matches.filter(m=>['EXACT_PATTERN','STRONG_SIMILAR'].includes(m.level)&&m.policyCompatibility==='SAME');
 const approveCount=matches.filter(m=>m.verdict==='approve').length,rejectCount=matches.filter(m=>m.verdict==='reject').length;
 const approvals=evidence.filter(m=>m.verdict==='approve').length,rejections=evidence.filter(m=>m.verdict==='reject').length;
 // Even a weak contradictory match under the same policy suppresses a recommendation.
 const same=matches.filter(m=>m.policyCompatibility==='SAME'),yes=same.filter(m=>m.verdict==='approve').length,no=same.filter(m=>m.verdict==='reject').length,contradictionCount=Math.min(yes,no);
 let recommendation='NO_RECOMMENDATION',reason='insufficient_evidence';
 if(contradictionCount)reason='contradictory_history';
 else if(evidence.length>=MINIMUM_EVIDENCE){if(approvals===evidence.length){if(validation?.valid){recommendation='RECOMMEND_APPROVE';reason='consistent_human_evidence';}else reason='publication_blocked';}else if(rejections===evidence.length){recommendation='RECOMMEND_REJECT';reason='consistent_human_evidence';}}
 const rank=['INSUFFICIENT','WEAK_SIMILAR','STRONG_SIMILAR','EXACT_PATTERN'];
 const level=matches.reduce((best,m)=>rank.indexOf(m.level)>rank.indexOf(best)?m.level:best,'INSUFFICIENT');
 return {version:INSIGHTS_VERSION,generatedAt:now,matchedDecisionCount:matches.length,approveCount,rejectCount,evidenceCount:evidence.length,minimumEvidence:MINIMUM_EVIDENCE,contradictionCount,similarityLevel:level,reasonSummary:reason,policyVersion:DECISION_POLICY_VERSION,policyCounts:Object.fromEntries(['SAME','COMPATIBLE','OBSOLETE'].map(k=>[k,matches.filter(m=>m.policyCompatibility===k).length])),recommendation,matches:matches.slice(0,50),truncated:matches.length>50};
}
export async function humanDecisions(store,now){return (await store.db.prepare("SELECT decision_id,candidate_id,verdict,reason,actor_type,decided_at,created_at,candidate_revision,candidate_snapshot,source_id,category,decision_features_json,policy_version,success_state FROM news_decision_ledger WHERE actor_type='human_operator' AND success_state='committed' AND created_at>? AND decided_at<=? ORDER BY decided_at DESC,decision_id DESC").bind(now-365*DAY,now).all()).results;}
export async function similarDecisions(store,row,validation,now){return evaluateDecisions(await retainedDecisionProfile(row,validation,now),await humanDecisions(store,now),{now,candidateId:row.id,validation});}
export async function dashboardSummary(store,now){
 const rows=(await store.db.prepare('SELECT review_status,COUNT(*) AS n FROM candidate_items GROUP BY review_status').all()).results,counts=Object.fromEntries(rows.map(r=>[r.review_status,r.n]));
 const human=await store.db.prepare("SELECT COUNT(*) AS n FROM news_decision_ledger WHERE actor_type='human_operator' AND success_state='committed' AND created_at>? AND decided_at<=?").bind(now-365*DAY,now).first();
 return {published:counts.approved||0,pending:(counts.pending||0)+(counts.reopened||0),rejected:counts.rejected||0,humanDecisions:human.n,generatedAt:now,publishedBasis:'approved_status',humanRetentionDays:365};
}
export async function humanDecisionHistory(store,now,{offset=0}={}){
 const rows=(await store.db.prepare("SELECT decision_id,candidate_id,source_id,category,verdict,reason,decided_at,policy_version FROM news_decision_ledger WHERE actor_type='human_operator' AND success_state='committed' AND created_at>? AND decided_at<=? ORDER BY decided_at DESC,decision_id DESC LIMIT 51 OFFSET ?").bind(now-365*DAY,now,offset).all()).results;
 return {items:rows.slice(0,50),nextOffset:rows.length>50?offset+50:null};
}
