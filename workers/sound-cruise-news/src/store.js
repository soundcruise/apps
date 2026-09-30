import {saleEndsAt,isSaleRecord} from './sale.js';
import { DAY } from './policy.js';
import { HEALTH_STATUSES,HEALTH_REASONS } from './source-health.js';
export class NewsStore {
 constructor(db){this.db=db;}
 async controls(){return await this.db.prepare('SELECT * FROM news_controls WHERE id=1').first()||{collection_enabled:0,api_enabled:0,revision:0};}
 async state(id){const s=await this.db.prepare('SELECT * FROM source_state WHERE source_id=?').bind(id).first();return s?{disabled:!!s.disabled||!!s.takedown,nextAt:s.next_at,failures:s.failures,robotsHash:s.robots_hash,etag:s.etag,lastModified:s.last_modified,lastDiscoveryAt:s.last_discovery_at||0,lastPublisherRequestAt:s.last_publisher_request_at||0,backoffUntil:s.backoff_until||0,scheduledJstDay:s.scheduled_jst_day||''}:{};}
 async lease(id,now,minIntervalMs=86400000,{requestMode='normal',jstDay=''}={}){
  await this.db.prepare('INSERT OR IGNORE INTO source_state(source_id) VALUES(?)').bind(id).run();
  if(!['normal','scheduled','operator_validation'].includes(requestMode))throw Error('request_mode_invalid');
  if(requestMode!=='normal'){
   if(requestMode==='scheduled'&&!/^20\d{2}-\d{2}-\d{2}$/.test(jstDay))throw Error('scheduled_day_invalid');
   const result=await this.db.prepare(`UPDATE source_state SET lease_until=?${requestMode==='scheduled'?',scheduled_jst_day=?':''} WHERE source_id=? AND disabled=0 AND takedown=0 AND lease_until<=? AND backoff_until<=? AND (failures=0 OR next_at<=?) ${requestMode==='scheduled'?'AND scheduled_jst_day<?':''}`).bind(now+3600000,...(requestMode==='scheduled'?[jstDay]:[]),id,now,now,now,...(requestMode==='scheduled'?[jstDay]:[])).run();
   return result.meta.changes===1;
  }
  const r=await this.db.prepare('UPDATE source_state SET lease_until=? WHERE source_id=? AND disabled=0 AND lease_until<=? AND next_at<=? AND (last_publisher_request_at=0 OR last_publisher_request_at<=?)').bind(now+3600000,id,now,now,now-minIntervalMs).run();
  return r.meta.changes===1;
 }
 async publisherAttempt(id,at,minIntervalMs){
  if(!Number.isSafeInteger(at)||!Number.isSafeInteger(minIntervalMs)||minIntervalMs<=0)throw Error('publisher_attempt_invalid');
  const result=await this.db.prepare('UPDATE source_state SET last_publisher_request_at=MAX(last_publisher_request_at,?),next_at=MAX(next_at,?) WHERE source_id=? AND disabled=0 AND takedown=0').bind(at,at+minIntervalMs,id).run();
  if(result.meta.changes!==1)throw Error('access_stopped');
 }
 async saveState(id,s){
  const statements=[this.db.prepare('UPDATE source_state SET disabled=MAX(disabled,?), next_at=MAX(next_at,?), failures=?, backoff_until=?, robots_hash=?, etag=?, last_modified=?, last_discovery_at=?, lease_until=0 WHERE source_id=?').bind(s.disabled?1:0,s.nextAt||0,s.failures||0,s.backoffUntil||0,s.robotsHash||null,s.etag||null,s.lastModified||null,s.lastDiscoveryAt||0,id)];
  if(s.disabled)statements.push(this.db.prepare('UPDATE news_controls SET revision=revision+1 WHERE id=1'));
  await this.db.batch(statements);
 }
 async put(i){
  const deadline=isSaleRecord(i,i.productFacts)?saleEndsAt(i.productFacts?.endDate,i.productFacts?.endTime):null;
  const expiry=Math.min(Date.parse(i.collectedAt)+90*DAY,i.publishedAt?Date.parse(i.publishedAt)+90*DAY:Infinity);
  const r=await this.db.prepare(`INSERT OR IGNORE INTO candidate_items(id,source_id,source_name,source_url,normalized_url,published_at,category,label,topic_key,collected_at,review_status,review_reason,expires_at,title_fingerprint,event_type,product_facts,feed_published_at,publication_decision,decision_reason,sale_ends_at)
   SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM news_controls WHERE id=1 AND collection_enabled=1) AND NOT EXISTS(SELECT 1 FROM news_takedowns WHERE item_id=?) AND NOT EXISTS(SELECT 1 FROM source_state WHERE source_id=? AND (disabled=1 OR takedown=1))`)
   .bind(i.id,i.sourceId,i.sourceName,i.sourceUrl,i.normalizedUrl,i.publishedAt,i.category,i.label,i.topicKey,i.collectedAt,'pending',i.reviewReason,expiry,i.titleFingerprint||null,i.eventType||'other',i.productFacts?JSON.stringify(i.productFacts):null,i.feedPublishedAt||null,i.publicationDecision||'PUBLISH_REVIEW',i.decisionReason||'legacy_review_required',Number.isFinite(deadline)?deadline:null,i.id,i.sourceId).run();
  if(r.meta.changes===1)return true;
  if(i.productFacts){await this.db.prepare(`UPDATE candidate_items SET product_facts=?,label=?,category=?,event_type=?,title_fingerprint=?,publication_decision=?,decision_reason=?,review_reason=?
   WHERE id=? AND review_status='pending' AND source_url=? AND EXISTS(SELECT 1 FROM news_controls WHERE id=1 AND collection_enabled=1)
   AND NOT EXISTS(SELECT 1 FROM source_state WHERE source_id=? AND (disabled=1 OR takedown=1))
   AND NOT EXISTS(SELECT 1 FROM news_takedowns WHERE item_id=?)`)
   .bind(JSON.stringify(i.productFacts),i.label,i.category,i.eventType,i.titleFingerprint,i.publicationDecision,i.decisionReason,i.reviewReason,i.id,i.sourceUrl,i.sourceId,i.id).run();}
  return false;
 }
 async log(r){await this.db.prepare('INSERT INTO collection_runs(id,source_id,collected_at,requests,candidates,pending,rejected,duplicates,outcome,duration_ms,request_mode) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),r.sourceId,r.startedAt,r.requests,r.candidates,r.pending,r.rejected,r.duplicates,r.outcome,r.durationMs,r.requestMode||'normal').run();}
 async recordHealth({sourceId,status,reasonCode,checkedAt,nextEligibleAt=0,failureCount=0,successfulAt=null}){
  if(!/^[a-z0-9_-]{1,64}$/.test(sourceId)||!HEALTH_STATUSES.includes(status)||!HEALTH_REASONS.includes(reasonCode)||
   !Number.isSafeInteger(checkedAt)||!Number.isSafeInteger(nextEligibleAt)||!Number.isSafeInteger(failureCount)||failureCount<0)throw Error('invalid_health_state');
  const alert=this.db.prepare(`INSERT INTO source_health_alerts(id,source_id,status,reason_code,occurred_at)
   SELECT ?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM source_health WHERE source_id=? AND status=? AND reason_code=?)
   AND (?<>'healthy' OR EXISTS(SELECT 1 FROM source_health WHERE source_id=?))`)
   .bind(crypto.randomUUID(),sourceId,status,reasonCode,checkedAt,sourceId,status,reasonCode,status,sourceId);
  const update=this.db.prepare(`INSERT INTO source_health(source_id,status,reason_code,last_successful_run_at,last_checked_at,next_eligible_run_at,failure_count)
   VALUES(?,?,?,?,?,?,?) ON CONFLICT(source_id) DO UPDATE SET status=excluded.status,reason_code=excluded.reason_code,
   last_successful_run_at=COALESCE(excluded.last_successful_run_at,source_health.last_successful_run_at),
   last_checked_at=excluded.last_checked_at,next_eligible_run_at=excluded.next_eligible_run_at,failure_count=excluded.failure_count`)
   .bind(sourceId,status,reasonCode,successfulAt,checkedAt,nextEligibleAt,failureCount);
  await this.db.batch([alert,update]);
 }
 async sourceHealth(){return (await this.db.prepare('SELECT * FROM source_health ORDER BY source_id').all()).results;}
 async sourceAlerts(limit=100){return (await this.db.prepare('SELECT * FROM source_health_alerts ORDER BY occurred_at DESC,id DESC LIMIT ?').bind(Math.min(Math.max(Number(limit)||100,1),100)).all()).results;}
 async alertSourceDisabled(sourceId,checkedAt){
  if(!/^[a-z0-9_-]{1,64}$/.test(sourceId)||!Number.isSafeInteger(checkedAt))throw Error('invalid_health_alert');
  await this.db.prepare('INSERT INTO source_health_alerts VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),sourceId,'paused','source_auto_disabled',checkedAt).run();
 }
 async purge(now,{leadMs=0}={}){
  const result=await this.db.batch([
   this.db.prepare('DELETE FROM candidate_items WHERE expires_at <= ?').bind(now+leadMs),
   this.db.prepare('DELETE FROM collection_runs WHERE collected_at <= ?').bind(now-90*DAY),
   this.db.prepare('DELETE FROM news_admin_audit WHERE occurred_at <= ?').bind(now-365*DAY),
   this.db.prepare('DELETE FROM news_takedowns WHERE expires_at <= ?').bind(now),
   this.db.prepare('DELETE FROM source_health_alerts WHERE occurred_at <= ?').bind(now-365*DAY),
   this.db.prepare('DELETE FROM news_operator_feedback WHERE occurred_at <= ?').bind(now-365*DAY),
   this.db.prepare('DELETE FROM legacy_news_grants WHERE NOT EXISTS(SELECT 1 FROM candidate_items c WHERE c.id=legacy_news_grants.item_id)'),
   this.db.prepare('UPDATE news_controls SET revision=revision+1 WHERE id=1')
  ]);
  return {news:result[0].meta.changes,runs:result[1].meta.changes,audit:result[2].meta.changes,takedowns:result[3].meta.changes,alerts:result[4].meta.changes};
 }
 async candidates(){return (await this.db.prepare('SELECT * FROM candidate_items ORDER BY published_at DESC,id').all()).results;}

}
