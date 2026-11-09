import {legalGate} from './registry.js';
import {requirePepper} from './fingerprint.js';
import {hash} from './policy.js';
import {CHECKS,publicationValidation} from './decision-policy.js';
import {effectiveCategory} from './category-editor.js';
import {candidateSnapshot,canonical,operatorDecision,decisionHistory} from './operator-review.js';
import {prepareShadowEvaluation} from './operator-shadow.js';
import {preferReviewSources,sourcePreferenceIdentity} from './source-preference.js';

const and=parts=>parts.length===1?parts[0]:`(${and(parts.slice(0,Math.ceil(parts.length/2)))} AND ${and(parts.slice(Math.ceil(parts.length/2)))})`;
export const AUTOMATIC_POLICY_VERSION='verified-retail-editorial-1';
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
  const plan=await assessAutomatic(store,row,registry,now,pepper);
  if(!plan.eligible)continue;
  // The same formal validator and transactional Ledger trigger as human review.
  // Re-authorize inside that boundary, then fence its decision-time evidence.
  const result=await operatorDecision(store,{id:row.id,action:'approve',reason:'useful_product',requestId:await hash(canonical([AUTOMATIC_POLICY_VERSION,row.id,await candidateSnapshot(row)])),revision:row.review_revision,snapshot:await candidateSnapshot(row),checks:Object.fromEntries(CHECKS.map(k=>[k,true])),label:plan.validation.publishableLabel,category:await effectiveCategory(store,row),publishedAt:row.published_at},now,registry,pepper,{type:'automatic_policy',id:AUTOMATIC_POLICY_VERSION},{authorizeAutomatic:async(current,validation)=>assessAutomatic(store,current,registry,now,pepper,{validation})});
  if(!result.replayed)published++;
 }
 return published;
}

// A small bounded snapshot fence, using the existing decision transaction rather
// than a new lock. Detects inserted/deleted/changed pending peers and changes to
// health, source stops or category overrides while choosing the representative.
async function snapshotFence(store,table,where,limit=512){
 const rows=(await store.db.prepare(`SELECT * FROM ${table} WHERE ${where} LIMIT ${limit+1}`).all()).results;
 if(rows.length>limit||JSON.stringify(rows).length>1000000)throw Error('automatic_context_limit');
 const columns=Object.keys(rows[0]||{});if(columns.some(k=>!/^[_a-z]+$/.test(k)))throw Error('candidate_schema_invalid');
 const equal=columns.length?and(columns.map(k=>`x."${k}" IS json_extract(s.value,'$.${k}')`)):'0';
 return {rows,sql:`((SELECT COUNT(*) FROM ${table} WHERE ${where})=? AND NOT EXISTS(SELECT 1 FROM json_each(?) s WHERE NOT EXISTS(SELECT 1 FROM ${table} x WHERE ${where} AND ${equal})))`,args:[rows.length,JSON.stringify(rows)]};
}
export async function assessAutomatic(store,row,registry,now,pepper,{validation}={}){
 const stop=reason=>({eligible:false,reasons:[reason]});
 if(row.review_status!=='pending'||row.origin==='legacy_fixture_backfill'||!['ikebe','shimamura'].includes(row.source_id)||!['new_product','release'].includes(row.event_type))return stop('outside_verified_retail_scope');
 const controls=await store.controls();if(!controls.publication_enabled)return stop('publication_off');
 // Capture before validation/learning. Any intervening normal decision or edit
 // changes the existing controls revision; peer insertion is fenced separately.
 const peers=await snapshotFence(store,'candidate_items',"source_id IN ('ikebe','shimamura') AND review_status='pending'"),health=await snapshotFence(store,'source_health','1=1'),states=await snapshotFence(store,'source_state','1=1'),categories=await snapshotFence(store,'news_category_overrides','1=1');
 const source=registry.find(s=>s.id===row.source_id),state=await store.state(row.source_id);
 if(!source||legalGate(source,{...state,nextAt:0,lastPublisherRequestAt:0},now,'production',registry)||health.rows.find(h=>h.source_id===row.source_id)?.status!=='healthy')return stop('source_not_healthy_or_permitted');
 if((await decisionHistory(store,row.id)).length)return stop('existing_decision');
 if(categories.rows.some(r=>r.candidate_id===row.id))return stop('human_category_override');
 validation??=await publicationValidation(store,row,now,registry,pepper);
 if(!validation.valid)return {...stop('formal_validation_failed'),validation};
 const shadow=await prepareShadowEvaluation(store,row,validation,now),context=shadow.evidenceContext;
 if(context.evidenceOrigin!=='publisher_structured'||context.identityScope!=='explicit_models'||!context.publicationDateVerified||context.relevanceStatus!=='PASS'||context.priorHumanDecision)return {...stop('unassisted_explicit_evidence_required'),validation};
 const project=async(r,v)=>({id:r.id,sourceId:r.source_id,status:r.review_status,history:await decisionHistory(store,r.id),eventType:r.event_type,category:await effectiveCategory(store,r),facts:v.facts,publishedAt:r.published_at,validation:v});
 const self=await project(row,validation);
 // Exact dated event identity, preserving model/limited/color/version qualifiers.
 if(!sourcePreferenceIdentity(self))return {...stop('explicit_product_event_required'),validation};
 if(row.source_id==='shimamura'){
  const reviews=[self];
  for(const peer of peers.rows.filter(r=>r.source_id==='ikebe'))reviews.push(await project(peer,await publicationValidation(store,peer,now,registry,pepper)));
  if(preferReviewSources(reviews).find(r=>r.id===row.id)?.sourcePreference?.role==='alternative')return {...stop('preferred_verified_ikebe'),validation};
 }
 if(shadow.recommendation!=='RECOMMEND_APPROVE')return {...stop('editorial_evidence_insufficient_or_conflicting'),validation,shadow};
 return {eligible:true,reasons:[],validation,shadow,audit:{policyVersion:AUTOMATIC_POLICY_VERSION,ruleVersion:shadow.ruleVersion,evaluationId:shadow.evaluationId,historyWatermark:shadow.historyWatermark,recommendation:shadow.recommendation,evidenceCount:shadow.evidenceCount,evidenceContext:context},fenceSql:and(["EXISTS(SELECT 1 FROM news_controls WHERE id=1 AND publication_enabled=1 AND revision=?)","NOT EXISTS(SELECT 1 FROM news_decision_ledger WHERE candidate_id=c.id)",... [peers,health,states,categories].map(f=>f.sql)]),fenceArgs:[controls.revision,...[peers,health,states,categories].flatMap(f=>f.args)]};
}
