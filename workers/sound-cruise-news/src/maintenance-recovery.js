// Only reviewed temporary robots redirects may be probed. Never follow them.
import {boundedFetch,robotsPolicy,robotsEvidence,BOT,DAY} from './policy.js';
import {evidenceGate} from './registry.js';
import {intentionalSourceStop,healthForOutcome} from './source-health.js';
const targets={shimamura:'https://www.shimamura.co.jp/maintenance.html',agm:'https://acousticguitarmagazine.jp/'};
export async function maintenanceRecoveryEligible(store,source,now){
 if(!source?.productionEnabled||!source.enabled||evidenceGate(source,now)||!targets[source.id]||!(await store.controls()).collection_enabled)return false;
 const s=await store.state(source.id);
 if(!s.disabled||s.publicationBlocked||s.backoffUntil>now||s.nextAt>now||await intentionalSourceStop(store,source.id))return false;
 const stop=await store.db.prepare("SELECT * FROM news_admin_audit WHERE target=? AND action IN ('redirect-blocked','maintenance-recovery-denied') ORDER BY occurred_at DESC,rowid DESC LIMIT 1").bind(source.id).first();
 if(stop?.action!=='redirect-blocked'||stop.occurred_at>now)return false;
 const last=await store.db.prepare("SELECT outcome FROM collection_runs WHERE source_id=? AND outcome<>'maintenance_robots_restored' ORDER BY collected_at DESC,rowid DESC LIMIT 1").bind(source.id).first();
 if(last?.outcome!=='redirect_blocked')return false;
 let e;try{e=JSON.parse(stop.reason_code);}catch{return false;}
 return e.status===302&&e.sourceUrl===source.robotsUrl&&e.location===targets[source.id];
}
export async function resumeMaintenanceFromRobots(store,source,{text,checkedAt},now){
 if(!await maintenanceRecoveryEligible(store,source,now)||!Number.isSafeInteger(checkedAt)||checkedAt>now||now-checkedAt>3600000)throw Error('maintenance_resume_not_eligible');
 const robot=robotsPolicy(text,source,200),e=await robotsEvidence(text),old=await store.state(source.id);
 if(!e.matches(source.robotsHash)||!e.matches(old.robotsHash)||robot.isAllowed(source.discoveryUrl,BOT)!==true)throw Error('maintenance_robots_review_required');
 const r=await store.db.prepare(`UPDATE source_state SET disabled=0,failures=0,backoff_until=0,robots_hash=? WHERE source_id=? AND disabled=1 AND takedown=0 AND publication_blocked=0 AND lease_until<=? AND backoff_until<=? AND next_at<=?
 AND EXISTS(SELECT 1 FROM news_controls WHERE id=1 AND collection_enabled=1)
 AND NOT EXISTS(SELECT 1 FROM news_admin_audit WHERE target=? AND action IN ('source-collection-stop','source-disable','source-delete','maintenance-recovery-denied') AND occurred_at>=?)`).bind(e.digest,source.id,now,now,now,source.id,checkedAt).run();
 if(r.meta.changes!==1)throw Error('maintenance_resume_changed');
 await store.db.prepare('INSERT INTO news_admin_audit VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),'source-resume',source.id,now,JSON.stringify({actor:'system_source_review',reason:'maintenance_robots_restored',checkedAt,robotsHash:e.digest})).run();
 return {id:source.id,text,checkedAt};
}
export async function probeMaintenanceRecovery(store,source,now,{fetcher=fetch}={}){
 if(!await maintenanceRecoveryEligible(store,source,now))return null;
 const day=new Date(now+9*3600000).toISOString().slice(0,10),key=source.id+':maintenance-probe:'+day,token=crypto.randomUUID();
 const claim=await store.db.prepare("INSERT OR IGNORE INTO news_facts_sources(source_id,lease_token,lease_until,checked_at,outcome) VALUES(?,?,?,?,'in_progress')").bind(key,token,now+60000,now).run();
 if(claim.meta.changes!==1)return null;
 let requests=0,outcome='maintenance_probe_failed',proof={sourceId:source.id,url:source.robotsUrl,checkedAt:now},cached=null;
 try{
  if(!await maintenanceRecoveryEligible(store,source,now))throw Error('maintenance_resume_changed');
  // A stopped source cannot use publisherAttempt. Reserve this single fixed probe
  // without clearing its stop, and share its acquisition clock with the collector.
  const reserved=await store.db.prepare('UPDATE source_state SET last_publisher_request_at=MAX(last_publisher_request_at,?) WHERE source_id=? AND disabled=1 AND takedown=0 AND publication_blocked=0 AND lease_until<=? AND backoff_until<=? AND next_at<=?').bind(now,source.id,now,now,now).run();
  if(reserved.meta.changes!==1)throw Error('maintenance_resume_changed');
  requests++;const r=await boundedFetch(source.robotsUrl,{fetcher,maxBytes:512000,headers:{Accept:'text/plain'}});proof.status=r.status;
  if(r.status!==200)throw Error('http_'+r.status);
  cached=await resumeMaintenanceFromRobots(store,source,{text:r.text,checkedAt:now},now);outcome='maintenance_robots_restored';
 }catch(error){
  outcome=error.message;
  if(error.redirectEvidence){proof={...proof,...error.redirectEvidence};await store.recordRedirect(source.id,error.redirectEvidence);}
  else await store.db.prepare('INSERT INTO news_admin_audit VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),'maintenance-recovery-denied',source.id,now,/^[a-z_0-9]+$/.test(outcome)?outcome:'probe_failed').run();
  await store.db.prepare('UPDATE source_state SET next_at=MAX(next_at,?),backoff_until=MAX(backoff_until,?) WHERE source_id=?').bind(now+DAY,now+DAY,source.id).run();
  await store.recordHealth({sourceId:source.id,...healthForOutcome(outcome==='redirect_blocked'?'maintenance_redirect':outcome),checkedAt:now,nextEligibleAt:now+DAY});
 }finally{
  await store.db.prepare('UPDATE news_facts_sources SET lease_until=0,outcome=?,proof_json=? WHERE source_id=? AND lease_token=?').bind(/^[a-z_0-9]+$/.test(outcome)?outcome:'probe_failed',JSON.stringify(proof),key,token).run();
  await store.log({sourceId:source.id,startedAt:now,requests,candidates:0,pending:0,rejected:0,duplicates:0,outcome:cached?'maintenance_robots_restored':outcome,durationMs:0,requestMode:'scheduled'});
 }
 return {cachedRobots:cached,outcome,requests};
}
