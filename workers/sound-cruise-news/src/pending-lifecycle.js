import {DAY} from './policy.js';
import {DECISION_POLICY_VERSION,publicationValidation} from './decision-policy.js';
import {recheckFacts} from './facts-recheck.js';
import {recoverySurface,recoveryCacheKey,missingFacts,resolvedRecoverySurface} from './facts-readiness.js';
import {candidateSnapshot} from './operator-review.js';
import {saveShadowEvaluation} from './operator-shadow.js';
export const RECHECK_POLICY='pending-recheck-1';
const pending=r=>r&&r.origin!=='legacy_fixture_backfill'&&['pending','reopened'].includes(r.review_status);
const history=(s,event)=>JSON.stringify([...JSON.parse(s.history_json),event].slice(-20));
export const deadline=row=>Math.min(row.expires_at,...[row.sale_ends_at,row.event_ends_at].filter(Number.isSafeInteger));
export function objectiveBlock(row,validation,now){
 if(validation.errors.includes('candidate_takedown'))return 'TAKEDOWN_CONFIRMED';
 if(row.expires_at<=now||[row.sale_ends_at,row.event_ends_at].some(d=>Number.isSafeInteger(d)&&d<now))return 'EXPIRED_CONFIRMED';
 if(validation.errors.includes('duplicate'))return 'DUPLICATE_CONFIRMED';
 if(validation.errors.includes('publication_policy_rejected'))return 'POLICY_BLOCK_CONFIRMED';
 return null;
}
export function nextRecheck(row,attempt,now){
 const interval=[6*3600000,DAY,3*DAY,7*DAY][Math.min(Math.max(attempt-1,0),3)],lastChance=deadline(row)-2*3600000;
 return Math.min(now+interval,lastChance>now?lastChance:now+3600000);
}
export async function initializePending(store,now){
 await store.db.prepare(`INSERT OR IGNORE INTO news_pending_lifecycle(candidate_id,next_recheck_at,recheck_policy_version)
 SELECT id,?,? FROM candidate_items WHERE review_status IN ('pending','reopened') AND origin<>'legacy_fixture_backfill' AND NOT EXISTS(SELECT 1 FROM source_state s WHERE s.source_id=candidate_items.source_id AND s.disabled=1)`).bind(now,RECHECK_POLICY).run();
 await store.db.prepare(`UPDATE news_pending_lifecycle SET next_recheck_at=? WHERE recheck_status<>'SOURCE_EXCLUDED' AND lease_until<=? AND assessed_revision>=0 AND assessed_revision<>(SELECT review_revision FROM candidate_items WHERE id=candidate_id)`).bind(now,now).run();
}
export async function lifecycleView(store,row,now){
 const state=await store.db.prepare('SELECT * FROM news_pending_lifecycle WHERE candidate_id=?').bind(row.id).first();
 return {...state,history:state?JSON.parse(state.history_json):[],history_json:undefined,lease_token:undefined,lease_until:undefined,longPending:now-Date.parse(row.collected_at)>=14*DAY};
}
export async function setPublishInterest(store,input,now,registry,pepper,actor){
 if(actor?.type!=='human_operator'||!input||Object.keys(input).some(k=>!['id','revision','snapshot','interest'].includes(k))||typeof input.interest!=='boolean'||!/^[-a-zA-Z0-9_]{1,128}$/.test(input.id||'')||!Number.isSafeInteger(input.revision)||!/^[a-f0-9]{64}$/.test(input.snapshot||''))throw Error('operator_interest_invalid');
 const row=await store.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(input.id).first();
 if(!pending(row))throw Error('already_decided');
 if(row.review_revision!==input.revision||await candidateSnapshot(row)!==input.snapshot)throw Error('candidate_changed');
 const validation=await publicationValidation(store,row,now,registry,pepper);
 if(input.interest&&((await store.state(row.source_id)).disabled||validation.valid||objectiveBlock(row,validation,now)))throw Error('operator_interest_not_applicable');
 await initializePending(store,now);
 const state=await store.db.prepare('SELECT * FROM news_pending_lifecycle WHERE candidate_id=?').bind(row.id).first();
 if(!state)return lifecycleView(store,row,now);
 if(!!state.user_publish_interest===input.interest)return lifecycleView(store,row,now);
 const columns=Object.keys(row),result=await store.db.prepare(`UPDATE news_pending_lifecycle SET user_publish_interest=?,user_publish_interest_at=?,next_recheck_at=CASE WHEN ?=1 THEN MIN(COALESCE(next_recheck_at,?),?) ELSE next_recheck_at END,history_json=?
 WHERE candidate_id=? AND history_json=? AND EXISTS(SELECT 1 FROM candidate_items WHERE ${columns.map(k=>k+' IS ?').join(' AND ')})`)
 .bind(+input.interest,now,+input.interest,now,now,history(state,{at:now,actor:'human_operator',actorId:actor.id,action:input.interest?'publish_interest':'cancel_publish_interest'}),row.id,state.history_json,...columns.map(k=>row[k])).run();
 if(result.meta.changes!==1)throw Error('candidate_changed');
 return lifecycleView(store,row,now);
}
export function recheckOutcome(result,validation){
 if(validation.valid)return 'RECOVERED_READY';
 if(result?.recovered)return 'RECOVERED_STILL_BLOCKED';
 if(['facts_http_404','facts_http_410'].includes(result?.outcome))return 'PERMANENT_INVALID';
 if(/http_|timeout|busy|unavailable|parser_failure|transaction_failed|candidate_changed/.test(result?.outcome||''))return 'TEMPORARY_FETCH_FAILURE';
 return 'NO_NEW_EVIDENCE';
}
export async function runPendingRechecks(store,now,registry,pepper,{limit=4,recover=recheckFacts,shadow=saveShadowEvaluation,...options}={}){
 if(!Number.isSafeInteger(limit)||limit<1||limit>20)throw Error('operator_recheck_limit_invalid');
 const started=Date.now(),report={due:0,attempted:0,recovered:0,newlyReady:0,autoBlocked:0,noEvidence:0,failure:0,items:[]};
 if(!(await store.controls()).collection_enabled)return {...report,stopped:true,durationMs:0};
 await initializePending(store,now);
 const rows=(await store.db.prepare(`SELECT c.*,l.next_recheck_at,l.user_publish_interest,l.recheck_attempt_count FROM candidate_items c JOIN news_pending_lifecycle l ON c.id=l.candidate_id WHERE c.review_status IN ('pending','reopened') AND c.origin<>'legacy_fixture_backfill' AND l.next_recheck_at<=? AND l.lease_until<=? AND NOT EXISTS(SELECT 1 FROM source_state s WHERE s.source_id=c.source_id AND s.disabled=1)`).bind(now,now).all()).results;
 const prepared=[];for(const joined of rows){const row=await store.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(joined.id).first();if(!pending(row))continue;const validation=await publicationValidation(store,row,now,registry,pepper);prepared.push({row,validation,joined});}
 prepared.sort((a,b)=>b.joined.user_publish_interest-a.joined.user_publish_interest||deadline(a.row)-deadline(b.row)||missingFacts(a.row,a.validation.facts,a.validation).length-missingFacts(b.row,b.validation.facts,b.validation).length||a.joined.next_recheck_at-b.joined.next_recheck_at);
 report.due=prepared.length;
 for(const {row,validation:before} of prepared.slice(0,limit)){
  const token=crypto.randomUUID(),claim=await store.db.prepare('UPDATE news_pending_lifecycle SET lease_token=?,lease_until=? WHERE candidate_id=? AND next_recheck_at<=? AND lease_until<=? AND NOT EXISTS(SELECT 1 FROM candidate_items c JOIN source_state s ON s.source_id=c.source_id WHERE c.id=candidate_id AND s.disabled=1)').bind(token,now+5*60000,row.id,now,now).run();if(claim.meta.changes!==1)continue;
  let result=null,validation=before,status=objectiveBlock(row,before,now),current=row;
  try{
   if(!status&&!before.valid){
    const source=registry.find(s=>s.id===row.source_id),surface=await resolvedRecoverySurface(store,row,source);
    const cached=surface&&await store.db.prepare('SELECT * FROM news_facts_sources WHERE source_id=?').bind(recoveryCacheKey(row,source,surface)).first();
    const dailyRecovery=source&&await store.db.prepare('SELECT COUNT(*) AS n FROM news_facts_sources WHERE (source_id=? OR instr(source_id,?)=1) AND checked_at>?').bind(source.id,source.id+':',now-DAY).first();
    if(surface&&!before.errors.some(e=>['operator_source_gate','source_url_invalid'].includes(e))&&(cached?.checked_at>now-DAY||dailyRecovery.n===0)){
     report.attempted++;result=await recover(store,{id:row.id,revision:row.review_revision,snapshot:await candidateSnapshot(row),requestId:'autonomous-'+token},now,registry,pepper,{type:'system_recheck',id:'pending-recheck'},options);
    }else result={outcome:!surface?'facts_no_supported_surface':before.errors.some(e=>['operator_source_gate','source_url_invalid'].includes(e))?'facts_source_gate':'facts_daily_budget_deferred'};
   }
   current=await store.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(row.id).first();
   if(!pending(current))throw Error('candidate_changed');
   if((await store.state(current.source_id)).disabled){await store.db.prepare('UPDATE news_pending_lifecycle SET lease_until=0 WHERE candidate_id=? AND lease_token=?').bind(row.id,token).run();continue;}
   validation=await publicationValidation(store,current,now,registry,pepper);status=objectiveBlock(current,validation,now)||recheckOutcome(result,validation);
   // A failed recovery cannot silently use a pre-update Shadow. Save only the current snapshot.
   await shadow(store,{id:current.id,revision:current.review_revision,snapshot:await candidateSnapshot(current)},now,registry,pepper);
  }catch(error){status='TEMPORARY_FETCH_FAILURE';result={outcome:/^[a-z_0-9]+$/.test(error.message)?error.message:'facts_unavailable'};}
  if(!pending(current)){await store.db.prepare('UPDATE news_pending_lifecycle SET lease_until=0 WHERE candidate_id=? AND lease_token=?').bind(row.id,token).run();report.failure++;continue;}
  const blocked=['DUPLICATE_CONFIRMED','EXPIRED_CONFIRMED','POLICY_BLOCK_CONFIRMED','TAKEDOWN_CONFIRMED'].includes(status),ready=status==='RECOVERED_READY';
  // PERMANENT_INVALID is diagnostic only: a single 404 does not prove permanent removal.
  const state=await store.db.prepare('SELECT * FROM news_pending_lifecycle WHERE candidate_id=?').bind(row.id).first();
  const next=status==='EXPIRED_CONFIRMED'||status==='TAKEDOWN_CONFIRMED'?null:blocked||ready?now+DAY:nextRecheck(current,state.recheck_attempt_count+1,now);
  const columns=Object.keys(current),saved=await store.db.prepare(`UPDATE news_pending_lifecycle SET last_rechecked_at=?,next_recheck_at=?,assessed_revision=?,recheck_attempt_count=recheck_attempt_count+1,recheck_status=?,unresolved_reason=?,last_recheck_result=?,recheck_policy_version=?,history_json=?,lease_until=0
 WHERE candidate_id=? AND lease_token=? AND history_json=? AND EXISTS(SELECT 1 FROM candidate_items WHERE ${columns.map(k=>k+' IS ?').join(' AND ')})`)
 .bind(now,next,current.review_revision,status,validation.errors.join(','),result?.outcome||status,RECHECK_POLICY,history(state,{at:now,actor:'system_recheck',result:status,outcome:result?.outcome||status,revision:current.review_revision,publicationPolicy:DECISION_POLICY_VERSION}),row.id,token,state.history_json,...columns.map(k=>current[k])).run();
  if(saved.meta.changes!==1){await store.db.prepare('UPDATE news_pending_lifecycle SET lease_until=0 WHERE candidate_id=? AND lease_token=?').bind(row.id,token).run();report.failure++;continue;}
  report.recovered+=result?.recovered?1:0;report.newlyReady+=ready&&!before.valid?1:0;report.autoBlocked+=blocked?1:0;report.noEvidence+=status==='NO_NEW_EVIDENCE'?1:0;report.failure+=status==='TEMPORARY_FETCH_FAILURE'?1:0;
  report.items.push({id:row.id,result:status,nextRecheckAt:next});
 }
 report.durationMs=Date.now()-started;console.info(JSON.stringify({event:'news_pending_recheck',...report}));return report;
}
