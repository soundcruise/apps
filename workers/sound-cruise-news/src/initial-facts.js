import {publicationValidation} from './decision-policy.js';
import {recheckFacts} from './facts-recheck.js';
import {candidateSnapshot} from './operator-review.js';
import {initialPrimarySource} from './recovery-budget.js';
// Same recovery/validation/CAS service as hourly and Operator. No publication API.
export async function prepareInitialFacts(store,report,now,registry,pepper,options){
 const source=registry.find(s=>s.id===report.sourceId);
 if(!initialPrimarySource(source)||report.requestMode!=='scheduled'||report.outcome!=='collected')return;
 const urls=new Set((report.qualityObservations||[]).filter(o=>o.created).map(o=>o.url));
 const rows=(await store.db.prepare("SELECT * FROM candidate_items WHERE source_id=? AND review_status IN ('pending','reopened') ORDER BY collected_at DESC,id LIMIT 30").bind(source.id).all()).results;
 rows.sort((a,b)=>+urls.has(b.source_url)-+urls.has(a.source_url)||a.collected_at.localeCompare(b.collected_at));
 const m=report.initialRecovery={evaluated:0,attempted:0,recovered:0,ready:0,deferred:0,failed:0,cacheHits:0,detailSuccess:0,detailFailure:0,outcomes:{},missingFields:{},items:[]};
 for(const row of rows){
  // Include previously budget-deferred pending work, never a published/human verdict.
  if(!urls.has(row.normalized_url||row.source_url)&&row.product_facts)continue;
  const before=await publicationValidation(store,row,now,registry,pepper);
  if(before.valid||before.errors.some(e=>!['facts_incomplete','facts_provenance_invalid'].includes(e)))continue;
  m.evaluated++;const started=report.requestCounts.article||0;
  let result;
  try{result=await recheckFacts(store,{id:row.id,revision:row.review_revision,snapshot:await candidateSnapshot(row),requestId:'initial-'+crypto.randomUUID()},now,registry,pepper,{type:'system_recheck',id:'initial-facts'},options);}
  catch(error){result={outcome:/^[a-z_0-9]+$/.test(error.message)?error.message:'initial_facts_failed'};}
  const fetched=(report.requestCounts.article||0)>started,deferred=result.outcome==='facts_daily_budget_deferred',valid=!!result.validation?.valid;
  m.attempted+=+!deferred;m.recovered+=+!!result.recovered;m.ready+=+valid;m.deferred+=+deferred;m.failed+=+(!valid&&!deferred);m.cacheHits+=+(!fetched&&!deferred);
  m.detailSuccess+=+(fetched&&!!result.recovered);m.detailFailure+=+(fetched&&!result.recovered);
  m.outcomes[result.outcome]=(m.outcomes[result.outcome]||0)+1;
  for(const e of result.validation?.errors||before.errors){if(['facts_incomplete','facts_provenance_invalid','label_provenance_invalid'].includes(e))m.missingFields[e]=(m.missingFields[e]||0)+1;}
  for(const field of result.diagnostics?.missingFields||[])m.missingFields[field]=(m.missingFields[field]||0)+1;
  m.items.push({id:row.id,outcome:result.outcome,ready:valid,newCandidate:urls.has(row.source_url),errors:result.validation?.errors||before.errors,...(result.diagnostics?{diagnostics:result.diagnostics}:{})});
  if((await store.state(source.id)).disabled||(await store.state(source.id)).backoffUntil>now)break;
 }
}
