import {legalGate} from './registry.js';
import {requirePepper} from './fingerprint.js';
import {hash,DAY} from './policy.js';
import {humanDecisions} from './operator-insights.js';
import {CHECKS,publicationValidation} from './decision-policy.js';
import {effectiveCategory} from './category-editor.js';
import {candidateSnapshot,canonical,operatorDecision,decisionHistory} from './operator-review.js';
import {prepareShadowEvaluation,SHADOW_RULE_VERSION} from './operator-shadow.js';
import {preferReviewSources,sourcePreferenceIdentity} from './source-preference.js';

const and=parts=>parts.length===1?parts[0]:`(${and(parts.slice(0,Math.ceil(parts.length/2)))} AND ${and(parts.slice(Math.ceil(parts.length/2)))})`;
export const AUTOMATIC_POLICY_VERSION='verified-retail-editorial-2';
// Expected per-candidate races/validation outcomes abstain, not retry. Unknown
// exceptions, SQL failures and resource limits must still stop the invocation.
const candidateErrors=new Set(['candidate_not_found','candidate_changed','already_decided','stale_decision','duplicate','automatic_not_eligible','candidate_takedown','operator_source_gate','expired_candidate','source_url_invalid','facts_incomplete','facts_provenance_invalid','label_provenance_invalid','publication_policy_rejected','sale_validation_failed','event_validation_failed','event_date_missing','verified_factual_label_required']);
// No Worker/cron caller is installed. Explicit invocation is also OFF by default.
// This path never fetches a publisher or calls a model.
export async function publishAutomatic(store,source,registry,now,pepper,{enabled=false}={}){
 if(enabled!==true)return 0;
 requirePepper(pepper);
 source=registry.find(s=>s.id===source?.id);
 if(!source||!['ikebe','shimamura'].includes(source.id))return 0;
 const rows=(await store.db.prepare("SELECT * FROM candidate_items WHERE source_id=? AND review_status='pending' ORDER BY published_at DESC,id LIMIT 100").bind(source.id).all()).results;
 let published=0;
 for(const row of rows){
  try{
  const plan=await assessAutomatic(store,row,registry,now,pepper);
  if(!plan.eligible)continue;
  // The same formal validator and transactional Ledger trigger as human review.
  // Re-authorize inside that boundary, then fence its decision-time evidence.
  const result=await operatorDecision(store,{id:row.id,action:'approve',reason:'useful_product',requestId:await hash(canonical([AUTOMATIC_POLICY_VERSION,row.id,await candidateSnapshot(row)])),revision:row.review_revision,snapshot:await candidateSnapshot(row),checks:Object.fromEntries(CHECKS.map(k=>[k,true])),label:plan.validation.publishableLabel,category:await effectiveCategory(store,row),publishedAt:row.published_at},now,registry,pepper,{type:'automatic_policy',id:AUTOMATIC_POLICY_VERSION},{authorizeAutomatic:async(current,validation)=>assessAutomatic(store,current,registry,now,pepper,{validation})});
  if(!result.replayed)published++;
  }catch(error){if(!candidateErrors.has(error?.message))throw error;console.log(JSON.stringify({event:'news_automatic_abstained',candidateId:row.id,reason:error.message}));}
 }
 return published;
}

// Only live, same-category Ikebe competitors can affect Shimamura preference.
// Virtual fields bind the competitor's publication health/stop/category, not
// unrelated sources, request leases, heartbeat timestamps or retention counters.
const peerCategory="COALESCE((SELECT category FROM news_category_overrides WHERE candidate_id=x.id),x.category)";
const peerContext={preference_category:peerCategory,
 preference_health:"(SELECT json_array(status,reason_code,last_successful_run_at) FROM source_health WHERE source_id=x.source_id)",
 preference_source:"(SELECT json_array(disabled,takedown,publication_blocked,robots_hash) FROM source_state WHERE source_id=x.source_id)"};
async function preferenceFence(store,row,now){
 const where=`x.source_id='ikebe' AND x.review_status='pending' AND x.expires_at>${now} AND ${peerCategory}=?`;
 const rows=(await store.db.prepare(`SELECT x.*,${Object.entries(peerContext).map(([k,v])=>`${v} AS ${k}`).join(',')} FROM candidate_items x WHERE ${where} LIMIT 513`).bind(row.category).all()).results;
 const data=JSON.stringify(rows);
 if(rows.length>512||new TextEncoder().encode(data).length>1000000)throw Error('automatic_context_limit');
 const columns=Object.keys(rows[0]||{});if(columns.some(k=>!/^[_a-z]+$/.test(k)))throw Error('candidate_schema_invalid');
 const equal=columns.length?and(columns.map(k=>`${peerContext[k]||`x."${k}"`} IS json_extract(s.value,'$.${k}')`)):'0';
 return {rows,sql:`((SELECT COUNT(*) FROM candidate_items x WHERE ${where})=? AND NOT EXISTS(SELECT 1 FROM json_each(?) s WHERE NOT EXISTS(SELECT 1 FROM candidate_items x WHERE ${where} AND ${equal})))`,args:[row.category,rows.length,data,row.category]};
}
export async function assessAutomatic(store,row,registry,now,pepper,{validation}={}){
 if(!Number.isSafeInteger(now))throw Error('automatic_time_invalid');
 validation??=await publicationValidation(store,row,now,registry,pepper);
 const stop=reason=>({eligible:false,reasons:[reason],validation,ruleVersion:SHADOW_RULE_VERSION,policyVersion:AUTOMATIC_POLICY_VERSION,evaluatedAt:now});
 if(row.review_status!=='pending'||row.origin==='legacy_fixture_backfill'||!['ikebe','shimamura'].includes(row.source_id)||!['new_product','release'].includes(row.event_type))return stop('outside_verified_retail_scope');
 const controls=await store.controls();if(!controls.publication_enabled)return stop('publication_off');
 const source=registry.find(s=>s.id===row.source_id),state=await store.state(row.source_id),health=await store.db.prepare('SELECT status,reason_code FROM source_health WHERE source_id=?').bind(row.source_id).first();
 if(!source||legalGate(source,{...state,nextAt:0,lastPublisherRequestAt:0},now,'production',registry)||health?.status!=='healthy')return stop('source_not_healthy_or_permitted');
 if((await decisionHistory(store,row.id)).length)return stop('existing_decision');
 if(await store.db.prepare('SELECT candidate_id FROM news_category_overrides WHERE candidate_id=?').bind(row.id).first())return stop('human_category_override');
 if(!validation.valid)return {...stop('formal_validation_failed'),validation};
 const teachers=await humanDecisions(store,now,{includeFuture:true}),shadow=await prepareShadowEvaluation(store,row,validation,now,{teachers}),context=shadow.evidenceContext;
 if(context.evidenceOrigin!=='publisher_structured'||context.identityScope!=='explicit_models'||!context.publicationDateVerified||context.relevanceStatus!=='PASS'||context.priorHumanDecision)return {...stop('unassisted_explicit_evidence_required'),validation};
 const project=async(r,v)=>({id:r.id,sourceId:r.source_id,status:r.review_status,history:await decisionHistory(store,r.id),eventType:r.event_type,category:await effectiveCategory(store,r),facts:v.facts,publishedAt:r.published_at,validation:v});
 const self=await project(row,validation);
 // Exact dated event identity, preserving model/limited/color/version qualifiers.
 if(!sourcePreferenceIdentity(self))return {...stop('explicit_product_event_required'),validation};
 let peers=null;
 if(row.source_id==='shimamura'){
  peers=await preferenceFence(store,row,now);
  const reviews=[self];
  for(const saved of peers.rows){const peer=Object.fromEntries(Object.entries(saved).filter(([k])=>!Object.hasOwn(peerContext,k)));reviews.push(await project(peer,await publicationValidation(store,peer,now,registry,pepper)));}
  if(preferReviewSources(reviews).find(r=>r.id===row.id)?.sourcePreference?.role==='alternative')return {...stop('preferred_verified_ikebe'),validation};
 }
 if(shadow.recommendation!=='RECOMMEND_APPROVE')return {...stop('editorial_evidence_insufficient_or_conflicting'),validation,shadow};
 const teacherIds=JSON.stringify(teachers.map(t=>t.decision_id).sort());
 if(new TextEncoder().encode(teacherIds).length>1000000)throw Error('automatic_context_limit');
 // Existing INSERT already checks full candidate CAS, publication ON, health
 // success timestamp, source stops, duplicate/takedown and the Ledger trigger.
 // Add only strict automatic health/backoff, target category, immutable human
 // teacher IDs, and (for Shimamura) the relevant preference set.
 const conditions=["NOT EXISTS(SELECT 1 FROM news_decision_ledger WHERE candidate_id=c.id)",
  "EXISTS(SELECT 1 FROM source_health WHERE source_id=c.source_id AND status='healthy' AND reason_code IS ?)",
  "(SELECT robots_hash FROM source_state WHERE source_id=c.source_id) IS ?",
  "NOT EXISTS(SELECT 1 FROM source_state WHERE source_id=c.source_id AND backoff_until>?)",
  "NOT EXISTS(SELECT 1 FROM news_category_overrides WHERE candidate_id=c.id)",
  "(SELECT json_group_array(decision_id) FROM (SELECT decision_id FROM news_decision_ledger WHERE actor_type='human_operator' AND success_state='committed' AND created_at>? ORDER BY decision_id))=?",
  ...(peers?[peers.sql]:[])];
 return {eligible:true,reasons:[],validation,shadow,ruleVersion:SHADOW_RULE_VERSION,policyVersion:AUTOMATIC_POLICY_VERSION,evaluatedAt:now,
  audit:{policyVersion:AUTOMATIC_POLICY_VERSION,ruleVersion:shadow.ruleVersion,evaluationId:shadow.evaluationId,historyWatermark:shadow.historyWatermark,recommendation:shadow.recommendation,evidenceCount:shadow.evidenceCount,evidenceContext:context},
  fenceSql:and(conditions),fenceArgs:[health.reason_code,state.robotsHash??null,now,now-365*DAY,teacherIds,...(peers?peers.args:[])]};
}

// Bounded prospective read-only projection. No new record store, cron or HTTP
// endpoint; callers can compare this snapshot with the existing human Ledger.
export async function assessAutomaticCandidates(store,registry,now,pepper,{limit=3}={}){
 if(!Number.isSafeInteger(limit)||limit<1||limit>10)throw Error('automatic_assessment_limit');
 const rows=(await store.db.prepare("SELECT * FROM candidate_items WHERE review_status='pending' ORDER BY published_at DESC,id LIMIT ?").bind(limit).all()).results;
 const results=[];
 for(const row of rows){
  const p=await assessAutomatic(store,row,registry,now,pepper),snapshot=await candidateSnapshot(row);
  const latest=await store.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(row.id).first();
  const changed=!latest||await candidateSnapshot(latest)!==snapshot;
  const reasons=changed?['candidate_changed']:p.reasons,eligible=!changed&&p.eligible;
  const editorial=p.validation.valid&&!eligible&&['outside_verified_retail_scope','unassisted_explicit_evidence_required','explicit_product_event_required','editorial_evidence_insufficient_or_conflicting','human_category_override'].includes(reasons[0]);
  results.push({id:row.id,revision:row.review_revision,snapshot,evaluatedAt:now,policyVersion:p.policyVersion,ruleVersion:p.ruleVersion,eligible,reasons,validation:{valid:p.validation.valid,errors:p.validation.errors},
   editorial:{recommendation:p.shadow?.recommendation??null,evidenceCount:p.shadow?.evidenceCount??null,reason:p.shadow?.reasonSummary??null},humanReviewRequired:editorial,humanReviewReason:editorial?reasons[0]:null,
   nextAction:changed?'reassess_changed_candidate':eligible?'await_explicit_automatic_enablement':reasons[0]==='existing_decision'?'preserve_existing_decision':editorial?'human_editorial_decision':'formal_evidence_or_source_recovery'});
 }
 return results;
}
