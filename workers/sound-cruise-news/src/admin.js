import { SOURCES, evidenceGate } from './registry.js';
import { DAY } from './policy.js';
export const REASONS=['owner_request','policy_change','security_incident','quality_review','review_complete','operator_stop'];
export function adminStatements({action,target='global',reason},now=Date.now(),registry=SOURCES) {
 if(!REASONS.includes(reason))throw new Error('reason_code_required');
 const statements=[];
 const add=(sql,...args)=>statements.push({sql,args});
 if(['collection-off','api-off','global-off','collection-on','api-on','publish-off','publish-on'].includes(action)) {
  if(target!=='global')throw new Error('target_invalid');
  if(action.endsWith('-on')&&reason!=='review_complete')throw new Error('review_required');
  if(action==='global-off')add('UPDATE news_controls SET collection_enabled=0,publication_enabled=0,api_enabled=0 WHERE id=1');
  else add(`UPDATE news_controls SET ${action.startsWith('api')?'api_enabled':action.startsWith('publish')?'publication_enabled':'collection_enabled'}=? WHERE id=1`,action.endsWith('-on')?1:0);
 }else if(['source-collection-stop','source-publication-block','source-publication-unblock'].includes(action)){
  if(!registry.some(s=>s.id===target))throw Error('source_missing');
  if(action==='source-publication-unblock'&&reason!=='review_complete')throw Error('review_required');
  if(action==='source-collection-stop'){
   add('INSERT INTO source_state(source_id,disabled) VALUES(?,1) ON CONFLICT(source_id) DO UPDATE SET disabled=1',target);
   // Acquisition policy closes operational work only; candidates and teacher decisions stay intact.
   add(`INSERT INTO news_pending_lifecycle(candidate_id,assessed_revision,next_recheck_at,recheck_status,unresolved_reason,last_recheck_result,recheck_policy_version,history_json)
    SELECT id,review_revision,NULL,'SOURCE_EXCLUDED','source_disabled','source_policy','pending-recheck-1',?
    FROM candidate_items WHERE source_id=? AND review_status IN ('pending','reopened') AND origin<>'legacy_fixture_backfill'
    ON CONFLICT(candidate_id) DO UPDATE SET assessed_revision=excluded.assessed_revision,next_recheck_at=NULL,recheck_status='SOURCE_EXCLUDED',unresolved_reason='source_disabled',last_recheck_result='source_policy',lease_token=NULL,lease_until=0,
     history_json=json_insert(news_pending_lifecycle.history_json,'$[#]',json(?)) WHERE news_pending_lifecycle.recheck_status<>'SOURCE_EXCLUDED'`,
    JSON.stringify([{at:now,actor:'source_policy',result:'SOURCE_EXCLUDED',reason:'source_disabled'}]),target,
    JSON.stringify({at:now,actor:'source_policy',result:'SOURCE_EXCLUDED',reason:'source_disabled'}));
  }
  else add('INSERT INTO source_state(source_id,publication_blocked) VALUES(?,?) ON CONFLICT(source_id) DO UPDATE SET publication_blocked=excluded.publication_blocked',target,action==='source-publication-block'?1:0);
 }else if(['source-disable','source-delete','source-enable'].includes(action)) {
  const source=registry.find(s=>s.id===target);if(!source)throw new Error('source_missing');
  if(action==='source-enable'&&(reason!=='review_complete'||evidenceGate(source,now)||!source.enabled))throw new Error('policy_review_required');
  if(action==='source-enable')add('INSERT INTO source_state(source_id,disabled,takedown,publication_blocked) VALUES(?,0,0,0) ON CONFLICT(source_id) DO UPDATE SET disabled=0,takedown=0,publication_blocked=0,robots_hash=NULL',target);
  else add('INSERT INTO source_state(source_id,disabled,takedown,publication_blocked) VALUES(?,1,1,1) ON CONFLICT(source_id) DO UPDATE SET disabled=1,takedown=1,publication_blocked=1',target);
  if(action==='source-delete')add('DELETE FROM candidate_items WHERE source_id=?',target);
 }else if(action==='item-delete') {
  if(!/^[a-f0-9]{64}$/.test(target))throw new Error('item_id_invalid');
  add('INSERT INTO news_takedowns(item_id,expires_at) VALUES(?,?) ON CONFLICT(item_id) DO UPDATE SET expires_at=MAX(expires_at,excluded.expires_at)',target,now+90*DAY);
  add('DELETE FROM candidate_items WHERE id=?',target);
 }else throw new Error('action_invalid');
 if(['source-collection-stop','source-disable','source-delete','global-off','collection-off'].includes(action)){
  const sourceId=target==='global'?'collection':target;
  const status=action==='source-collection-stop'?'paused':reason==='policy_change'?'policy_review':'paused';
  const code=action==='source-collection-stop'?'source_disabled':reason==='policy_change'?'policy_changed':target==='global'?'global_collection_off':'source_disabled';
  add('INSERT INTO source_health_alerts SELECT ?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM source_health WHERE source_id=? AND status=? AND reason_code=?)',crypto.randomUUID(),sourceId,status,code,now,sourceId,status,code);
  add('INSERT INTO source_health(source_id,status,reason_code,last_checked_at,failure_count) VALUES(?,?,?,?,0) ON CONFLICT(source_id) DO UPDATE SET status=excluded.status,reason_code=excluded.reason_code,last_checked_at=excluded.last_checked_at',sourceId,status,code,now);
 }
 add('UPDATE news_controls SET revision=revision+1 WHERE id=1');
 add('INSERT INTO news_admin_audit VALUES(?,?,?,?,?)',crypto.randomUUID(),action,target,now,reason);
 return statements;
}
export async function administer(store,input,now=Date.now(),registry=SOURCES) {
 const statements=adminStatements(input,now,registry);
 await store.db.batch(statements.map(({sql,args})=>store.db.prepare(sql).bind(...args)));
}

// Authenticated CLI plan: acquisition-only stops must not turn off the public API.
export function operatorPlan(input,now=Date.now(),registry=SOURCES){
 const statements=adminStatements(input,now,registry);
 return input.action==='source-collection-stop'?statements:[{sql:'UPDATE news_controls SET api_enabled=0,revision=revision+1 WHERE id=1',args:[]},...statements];
}
