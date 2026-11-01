import {eventEndsAt} from './event.js';
import {saleEndsAt} from './sale.js';
import {sourcePolicyReason} from './source-policy-evidence.js';
// Explicit maintenance only. No automatic approval and no human feedback/Ledger writes.
import {publicationValidation} from './decision-policy.js';
import {intentionalSourceStop} from './source-health.js';
import {candidateSnapshot} from './operator-review.js';
import {hash} from './policy.js';
export async function preparePendingResolution(store,input,now,registry,pepper){
 if(!input||Object.keys(input).some(k=>!['id','snapshot','requestId'].includes(k))||!/^[a-f0-9]{64}$/.test(input.id||'')||!/^[a-f0-9]{64}$/.test(input.snapshot||'')||!/^[a-zA-Z0-9_-]{16,100}$/.test(input.requestId||'')||!Number.isSafeInteger(now))throw Error('resolution_request_invalid');
 const row=await store.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(input.id).first();
 if(!row||!['pending','reopened'].includes(row.review_status)||row.origin==='legacy_fixture_backfill')throw Error('resolution_not_pending');
 if(await candidateSnapshot(row)!==input.snapshot)throw Error('candidate_changed');
 if(await store.db.prepare("SELECT 1 FROM news_decision_ledger WHERE candidate_id=? AND actor_type='human_operator'").bind(row.id).first())throw Error('human_decision_protected');
 const v=await publicationValidation(store,row,now,registry,pepper),state=await store.state(row.source_id),source=registry.find(s=>s.id===row.source_id);
 const excluded=!!state.disabled&&!!source&&await intentionalSourceStop(store,row.source_id);
 const eventEnded=v.errors.includes('event_validation_failed')&&Number.isSafeInteger(row.event_ends_at)&&row.event_ends_at<now&&eventEndsAt(v.facts)===row.event_ends_at;
 const saleEnded=v.errors.includes('sale_validation_failed')&&Number.isSafeInteger(row.sale_ends_at)&&row.sale_ends_at<now&&saleEndsAt(v.facts?.endDate,v.facts?.endTime)===row.sale_ends_at;
 const reason=excluded?'source_disabled':v.errors.includes('duplicate')?'duplicate':v.errors.includes('expired_candidate')&&Number.isSafeInteger(row.expires_at)&&row.expires_at<=now?'expired_candidate':eventEnded?'event_ended':saleEnded?'sale_ended':sourcePolicyReason(row,now);
 if(!reason)throw Error('resolution_requires_objective_evidence');
 const lifecycle=await store.db.prepare('SELECT * FROM news_pending_lifecycle WHERE candidate_id=?').bind(row.id).first();
 const actor=excluded?'source_policy':'system_policy',status=excluded?'SOURCE_EXCLUDED':reason==='duplicate'?'DUPLICATE_CONFIRMED':['expired_candidate','event_ended','sale_ended'].includes(reason)?'EXPIRED_CONFIRMED':'POLICY_BLOCK_CONFIRMED';
 const columns=Object.keys(row),guard=`EXISTS(SELECT 1 FROM candidate_items WHERE ${columns.map(k=>k+' IS ?').join(' AND ')}) AND NOT EXISTS(SELECT 1 FROM news_decision_ledger WHERE candidate_id=? AND actor_type='human_operator')`,args=[...columns.map(k=>row[k]),row.id];
 const statements=[];
 const add=(sql,args=[])=>statements.push({sql,args});
 // Deliberate NOT NULL failure rolls back a real D1 batch on stale plans.
 add(`INSERT INTO news_admin_audit(id,action,target,occurred_at,reason_code) VALUES(?,'pending-system-resolution',?,?,CASE WHEN ${guard} THEN ? ELSE NULL END)`,[input.requestId,row.id,now,...args,reason]);
 if(excluded){const stop=await store.db.prepare("SELECT * FROM news_admin_audit WHERE target=? AND action IN ('source-collection-stop','source-disable','source-delete','source-enable') ORDER BY occurred_at DESC,rowid DESC LIMIT 1").bind(row.source_id).first();if(!stop)throw Error('source_stop_evidence_missing');
  add("INSERT INTO news_admin_audit(id,action,target,occurred_at,reason_code) SELECT ?,'pending-resolution-guard',?,?,CASE WHEN EXISTS(SELECT 1 FROM source_state WHERE source_id=? AND disabled=1) AND (SELECT id FROM news_admin_audit WHERE target=? AND action IN ('source-collection-stop','source-disable','source-delete','source-enable') ORDER BY occurred_at DESC,rowid DESC LIMIT 1)=? THEN ? ELSE NULL END",[input.requestId+'-guard',row.id,now,row.source_id,row.source_id,stop.id,reason]);
 }else if(reason==='duplicate'){
  for(const d of v.duplicates){const original=await store.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(d.id).first(),keys=Object.keys(original);add(`INSERT INTO news_admin_audit(id,action,target,occurred_at,reason_code) SELECT ?,'pending-resolution-guard',?,?,CASE WHEN EXISTS(SELECT 1 FROM candidate_items WHERE ${keys.map(k=>k+' IS ?').join(' AND ')}) THEN ? ELSE NULL END`,[input.requestId+'-'+d.id.slice(0,8),row.id,now,...keys.map(k=>original[k]),reason]);}
 }
 add("UPDATE candidate_items SET review_status='rejected',review_reason=?,reviewed_at=?,reviewed_by=?,review_revision=review_revision+1,publication_decision='REJECT',decision_reason=? WHERE id=?",[reason,now,actor,reason,row.id]);
 const history=JSON.stringify([...(lifecycle?JSON.parse(lifecycle.history_json):[]),{at:now,actor,action:'system_resolution',reason,revision:row.review_revision+1}].slice(-20));
 if(lifecycle){const keys=Object.keys(lifecycle);add(`INSERT INTO news_admin_audit(id,action,target,occurred_at,reason_code) SELECT ?,'pending-resolution-guard',?,?,CASE WHEN EXISTS(SELECT 1 FROM news_pending_lifecycle WHERE ${keys.map(k=>k+' IS ?').join(' AND ')}) THEN ? ELSE NULL END`,[input.requestId+'-lifecycle',row.id,now,...keys.map(k=>lifecycle[k]),reason]);}
 else add("INSERT INTO news_pending_lifecycle(candidate_id,recheck_policy_version) VALUES(?,'pending-recheck-1')",[row.id]);
 add('UPDATE news_pending_lifecycle SET next_recheck_at=NULL,last_rechecked_at=?,assessed_revision=?,recheck_status=?,unresolved_reason=?,last_recheck_result=?,lease_until=0,lease_token=NULL,history_json=? WHERE candidate_id=?',[now,row.review_revision+1,status,reason,reason,history,row.id]);
 add('UPDATE news_controls SET revision=revision+1 WHERE id=1');
 return {id:row.id,requestId:input.requestId,reason,actor,statements};
}
export async function applyPendingResolution(store,plan){
 const prior=await store.db.prepare("SELECT * FROM news_admin_audit WHERE id=? AND action='pending-system-resolution'").bind(plan.requestId).first();if(prior){if(prior.target!==plan.id||prior.reason_code!==plan.reason)throw Error('resolution_replay_changed');return {id:plan.id,reason:plan.reason,replayed:true};}
 await store.db.batch(plan.statements.map(s=>store.db.prepare(s.sql).bind(...s.args)));
 return {id:plan.id,reason:plan.reason,replayed:false};
}

export async function restoreSystemResolution(store,input,now,registry,pepper,actor){
 if(actor?.type!=='human_operator'||!/^[-a-zA-Z0-9:_@.]{1,200}$/.test(actor.id||'')||!Number.isSafeInteger(now)||!input||Object.keys(input).some(k=>!['id','snapshot','requestId'].includes(k))||!/^[a-f0-9]{64}$/.test(input.id||'')||!/^[a-f0-9]{64}$/.test(input.snapshot||'')||!/^[-a-zA-Z0-9_]{16,100}$/.test(input.requestId||''))throw Error('operator_resolution_invalid');
 const payloadHash=await hash(JSON.stringify({id:input.id,snapshot:input.snapshot,actor:actor.id}));
 const prior=await store.db.prepare("SELECT * FROM news_admin_audit WHERE id=? AND action='pending-system-restore'").bind(input.requestId).first();
 if(prior){if(prior.target!==input.id||prior.reason_code!==payloadHash)throw Error('idempotency_payload_changed');return {id:input.id,replayed:true};}
 const row=await store.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(input.id).first();
 if(!row||row.review_status!=='rejected'||!['system_policy','source_policy'].includes(row.reviewed_by))throw Error('operator_resolution_not_system');
 if(await candidateSnapshot(row)!==input.snapshot)throw Error('candidate_changed');
 if(await store.db.prepare('SELECT 1 FROM news_decision_ledger WHERE candidate_id=?').bind(row.id).first()||await store.db.prepare('SELECT 1 FROM news_takedowns WHERE item_id=?').bind(row.id).first())throw Error('operator_resolution_protected');
 const v=await publicationValidation(store,{...row,publication_decision:'PUBLISH_REVIEW'},now,registry,pepper);
 if(v.errors.some(e=>['duplicate','candidate_takedown','expired_candidate','operator_source_gate','source_url_invalid','event_validation_failed','sale_validation_failed'].includes(e))||sourcePolicyReason(row,now))throw Error('operator_resolution_still_blocked');
 const columns=Object.keys(row),lifecycle=await store.db.prepare('SELECT * FROM news_pending_lifecycle WHERE candidate_id=?').bind(row.id).first();
 if(!lifecycle)throw Error('operator_resolution_lifecycle_missing');
 const history=JSON.stringify([...JSON.parse(lifecycle.history_json),{at:now,actor:'human_operator',actorId:actor.id,action:'restore_system_resolution',reason:row.review_reason,revision:row.review_revision+1}].slice(-20));
 await store.db.batch([
 store.db.prepare(`INSERT INTO news_admin_audit SELECT ?,'pending-system-restore',?,?,CASE WHEN EXISTS(SELECT 1 FROM candidate_items WHERE ${columns.map(k=>k+' IS ?').join(' AND ')}) AND NOT EXISTS(SELECT 1 FROM news_decision_ledger WHERE candidate_id=?) AND NOT EXISTS(SELECT 1 FROM news_takedowns WHERE item_id=?) AND EXISTS(SELECT 1 FROM news_pending_lifecycle WHERE candidate_id=? AND history_json=?) THEN ? ELSE NULL END`).bind(input.requestId,row.id,now,...columns.map(k=>row[k]),row.id,row.id,row.id,lifecycle.history_json,payloadHash),
 store.db.prepare("UPDATE candidate_items SET review_status='reopened',publication_decision='PUBLISH_REVIEW',review_reason='system_resolution_restored',decision_reason='system_resolution_restored',reviewed_by=NULL,reviewed_at=NULL,review_revision=review_revision+1 WHERE id=?").bind(row.id),
 store.db.prepare("UPDATE news_pending_lifecycle SET next_recheck_at=?,recheck_status='WAITING',lease_until=0,lease_token=NULL,history_json=? WHERE candidate_id=?").bind(now,history,row.id)]);
 return {id:row.id,replayed:false};
}
