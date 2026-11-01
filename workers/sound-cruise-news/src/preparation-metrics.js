import {recordDiscoveryResult,discoverySummary} from './discovery-work.js';
// Bounded, facts-only observations. Never a publication/feedback write or HTTP call.
import {publicationValidation} from './decision-policy.js';
import {factualLabel,allowedArticlePath} from './metadata.js';
import {sourceUrl} from './policy.js';
const code=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(v)?v:'unknown';
const parse=v=>{try{return JSON.parse(v);}catch{return null;}};
const add=(m,k,n=1)=>{m[k]=(m[k]||0)+n;};
export const preparationDay=at=>new Date(at+9*3600000).toISOString().slice(0,10);
export function observePreparation(report,entry,{item=null,created=false,reason=''}={}){
 report.qualityObservations??=[];
 if(report.qualityObservations.length>=600){report.qualityTruncated=true;return;}
 report.qualityObservations.push({url:entry.url,publishedAt:item?.publishedAt||entry.publishedAt||entry.date||null,generated:!!item||created,created,reason:code(reason||item?.decisionReason||'observed')});
}
export async function recordPreparationMetrics(store,report,now,registry,pepper){
 const source=registry.find(s=>s.id===report.sourceId);if(!source)return;
 report.runId??=crypto.randomUUID();const saved=await store.db.prepare('SELECT metrics_json FROM news_preparation_runs WHERE run_id=?').bind(report.runId).first();if(saved){report.preparation=parse(saved.metrics_json);return;}
 const observations=new Map();
 for(const o of report.qualityObservations||[]){const url=sourceUrl(o.url,source);if(!url||!allowedArticlePath(url,source))continue;const old=observations.get(url);observations.set(url,{...o,url,created:!!o.created||!!old?.created,generated:!!o.generated||!!old?.generated});}
 const rows=(await store.db.prepare('SELECT * FROM candidate_items WHERE source_id=?').bind(source.id).all()).results,byUrl=new Map(rows.map(r=>[r.normalized_url||r.source_url,r]));
 // A required deferred-queue write may already have recorded this run's new URL.
 // Its first observation at `now` must not become a historical known-URL count.
 const seen=(await store.db.prepare('SELECT normalized_url FROM news_discovery_receipts WHERE source_id=? AND first_seen_at<?').bind(source.id,now).all()).results;
 const known=new Set(seen.map(r=>r.normalized_url));
 const m={schemaVersion:1,httpRequests:report.requests||0,requestCounts:report.requestCounts||{},cardsParsed:report.candidates||0,observedUrls:observations.size,newUrls:0,knownUrls:0,candidateGenerated:0,candidateCreated:0,factsComplete:0,validationEvaluated:0,validationPassed:0,validationNotMeasured:0,ready:0,readyNew:0,duplicateExcluded:0,outcomeCounts:{},exclusionReasons:{...report.reasons},validationFailures:{},maintenance:report.maintenanceOutcome||null,truncated:!!report.qualityTruncated};
 const receipts=[];
 for(const o of [...observations.values()].sort((a,b)=>+b.created-+a.created)){
  const row=byUrl.get(o.url),exists=!!row&&!o.created,isKnown=known.has(o.url)||exists;
  m[isKnown?'knownUrls':'newUrls']++;m.candidateGenerated+=+o.generated;m.candidateCreated+=+o.created;
  let validation=null,status=o.created?'candidate_created':exists?'known_candidate':o.reason==='storage_duplicate'?'duplicate_blocked':o.generated?'duplicate_or_storage_guard':'not_candidate';
  if(!row&&o.reason==='storage_duplicate')m.duplicateExcluded++;
  if(row&&['pending','reopened'].includes(row.review_status)&&m.validationEvaluated<100){
   const f=parse(row.product_facts);if(f&&factualLabel(f,row.event_type)&&!f.scopeUncertain)m.factsComplete++;
   const v=await publicationValidation(store,row,now,registry,pepper);validation=v;m.validationEvaluated++;
   if(v.valid){m.validationPassed++;if(v.relevance?.status==='REVIEW')status='human_relevance_review';else{m.ready++;m.readyNew+=+o.created;status='ready_for_human_decision';}}
   else{for(const error of v.errors)add(m.validationFailures,code(error));if(v.errors.includes('duplicate')){m.duplicateExcluded++;status='duplicate_blocked';}else status='needs_evidence_or_policy';}
  }else if(row&&['pending','reopened'].includes(row.review_status)){m.validationNotMeasured++;status='validation_not_measured';}
  await recordDiscoveryResult(store,source,{url:o.url,publishedAt:o.publishedAt},now,{row,reason:o.reason,validation,result:report.initialRecovery?.items?.find(i=>i.id===row?.id)});
  add(m.outcomeCounts,status);
  const stamp=Date.parse(o.publishedAt),published=Number.isFinite(stamp)?new Date(stamp).toISOString():null;
  receipts.push({url:o.url,published,status,reason:o.reason,candidateId:row?.id||null});
 }
 const ratio=(a,b)=>b?a/b:null;
 m.rates={candidateCreation:ratio(m.candidateCreated,m.newUrls),factsCompleteness:ratio(m.factsComplete,m.validationEvaluated),validationSuccess:ratio(m.validationPassed,m.validationEvaluated),readyForNewCandidate:ratio(m.readyNew,m.candidateCreated)};
 if(report.initialRecovery)m.initialRecovery={...report.initialRecovery,detailHttp:report.primaryHttp||{success:0,failure:0}};
 if(report.backfill)m.backfill={...report.backfill};
 m.discovery=await discoverySummary(store,now,source.id);
 const runId=report.runId;
 const statements=[store.db.prepare(`INSERT INTO news_discovery_receipts(source_id,normalized_url,first_seen_at,last_seen_at,published_at,outcome,reason_code,candidate_id)
 SELECT ?,json_extract(j.value,'$.url'),?,?,json_extract(j.value,'$.published'),json_extract(j.value,'$.status'),json_extract(j.value,'$.reason'),json_extract(j.value,'$.candidateId') FROM json_each(?) j WHERE true
 ON CONFLICT(source_id,normalized_url) DO UPDATE SET last_seen_at=MAX(last_seen_at,excluded.last_seen_at),published_at=COALESCE(published_at,excluded.published_at),outcome=excluded.outcome,reason_code=excluded.reason_code,candidate_id=COALESCE(excluded.candidate_id,candidate_id)`)
 .bind(source.id,now,now,JSON.stringify(receipts)),store.db.prepare('INSERT OR IGNORE INTO news_preparation_runs VALUES(?,?,?,?,?,?,?)').bind(runId,source.id,now,preparationDay(now),report.requestMode||'normal',code(report.outcome),JSON.stringify(m))];
 await store.db.batch(statements);report.preparation=m;
 console.info(JSON.stringify({event:'news_preparation',runId,sourceId:source.id,jstDay:preparationDay(now),...m}));
}
