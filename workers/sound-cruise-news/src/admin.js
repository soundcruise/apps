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
 }else if(['source-disable','source-delete','source-enable'].includes(action)) {
  const source=registry.find(s=>s.id===target);if(!source)throw new Error('source_missing');
  if(action==='source-enable'&&(reason!=='review_complete'||evidenceGate(source,now)||!source.enabled))throw new Error('policy_review_required');
  if(action==='source-enable')add('INSERT INTO source_state(source_id,disabled,takedown) VALUES(?,0,0) ON CONFLICT(source_id) DO UPDATE SET disabled=0,takedown=0,robots_hash=NULL',target);
  else add('INSERT INTO source_state(source_id,disabled,takedown) VALUES(?,1,1) ON CONFLICT(source_id) DO UPDATE SET disabled=1,takedown=1',target);
  if(action==='source-delete')add('DELETE FROM candidate_items WHERE source_id=?',target);
 }else if(action==='item-delete') {
  if(!/^[a-f0-9]{64}$/.test(target))throw new Error('item_id_invalid');
  add('INSERT INTO news_takedowns(item_id,expires_at) VALUES(?,?) ON CONFLICT(item_id) DO UPDATE SET expires_at=MAX(expires_at,excluded.expires_at)',target,now+90*DAY);
  add('DELETE FROM candidate_items WHERE id=?',target);
 }else throw new Error('action_invalid');
 if(['source-disable','source-delete','global-off','collection-off'].includes(action)){
  const sourceId=target==='global'?'collection':target;
  const status=reason==='policy_change'?'policy_review':'paused';
  const code=reason==='policy_change'?'policy_changed':target==='global'?'global_collection_off':'source_disabled';
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
