import {recordDiscoveryResult} from './discovery-work.js';
import {hash} from './policy.js';
import {PRIMARY_ANNOUNCEMENT_PARSER} from './primary-announcement.js';
import {publicationValidation} from './decision-policy.js';
import {recheckFacts} from './facts-recheck.js';
import {candidateSnapshot} from './operator-review.js';
import {initialPrimarySource} from './recovery-budget.js';
// Same recovery/validation/CAS service as hourly and Operator. No publication API.
export async function prepareInitialFacts(store,report,now,registry,pepper,options){
 const source=registry.find(s=>s.id===report.sourceId);
 if(!initialPrimarySource(source)||report.requestMode!=='scheduled'||!['collected','not_modified'].includes(report.outcome))return;
 const urls=new Set((report.qualityObservations||[]).filter(o=>o.created).map(o=>o.url));
 const rows=(await store.db.prepare("SELECT c.* FROM candidate_items c LEFT JOIN news_discovery_work w ON w.source_id=c.source_id AND w.normalized_url=c.source_url WHERE c.source_id=? AND c.review_status IN ('pending','reopened') AND (w.next_at IS NULL OR w.next_at<=?) ORDER BY CASE WHEN w.processing_state='parser_failed' AND w.parser_version=? THEN 1 WHEN w.processing_state IN ('validated_ready','duplicate','outside_date_window','out_of_scope') THEN 2 ELSE 0 END,COALESCE(w.first_seen_at,0),c.collected_at,c.id LIMIT 100").bind(source.id,now,PRIMARY_ANNOUNCEMENT_PARSER).all()).results;
 // Oldest durable work first; a continuous stream of new URLs cannot starve backlog.
 const m=report.initialRecovery={evaluated:0,attempted:0,recovered:0,ready:0,deferred:0,failed:0,unchangedEvidence:0,cacheHits:0,detailSuccess:0,detailFailure:0,outcomes:{},missingFields:{},items:[]};
 for(const row of rows){
  // Include previously budget-deferred pending work, never a published/human verdict.
  const work=await store.db.prepare('SELECT * FROM news_discovery_work WHERE source_id=? AND normalized_url=?').bind(source.id,row.source_url).first();
  if(work?.processing_state==='parser_failed'&&work.parser_version===PRIMARY_ANNOUNCEMENT_PARSER){let p;try{p=JSON.parse(work.evidence_json)?.proof;}catch{}if(p?.failureReason&&p.pipelineVersion===PRIMARY_ANNOUNCEMENT_PARSER&&p.evidenceKey===await hash(row.title_fingerprint||'')){m.unchangedEvidence++;continue;}}
  const before=await publicationValidation(store,row,now,registry,pepper);
  if(before.valid||before.errors.some(e=>!['facts_incomplete','facts_provenance_invalid'].includes(e))){await recordDiscoveryResult(store,source,{url:row.source_url},now,{row,validation:before});continue;}
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
  await recordDiscoveryResult(store,source,{url:row.source_url},now,{row:await store.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(row.id).first(),validation:result.validation||before,result});
  m.items.push({id:row.id,outcome:result.outcome,ready:valid,newCandidate:urls.has(row.source_url),errors:result.validation?.errors||before.errors,...(result.diagnostics?{diagnostics:result.diagnostics}:{})});
  if((await store.state(source.id)).disabled||(await store.state(source.id)).backoffUntil>now)break;
 }
}
