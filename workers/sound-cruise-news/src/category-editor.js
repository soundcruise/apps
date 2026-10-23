import {CATEGORIES} from './metadata.js';
import {hash} from './policy.js';
const labels={acoustic_guitar:'アコギ',electric_guitar_bass:'ギター・ベース',amps_effects:'アンプ・エフェクター',recording_audio:'録音・オーディオ',dtm_software:'DTMソフト',creator_streaming:'配信機材',artist_guitar:'アーティスト',live_guitar:'イベント',media_other:'その他',sale:'セール'};
export const categoryOptions=CATEGORIES.map(id=>({id,label:labels[id]}));
const snapshot=row=>hash(JSON.stringify(Object.fromEntries(Object.keys(row).sort().map(k=>[k,row[k]]))));
export async function effectiveCategory(store,row){return (await store.db.prepare('SELECT category FROM news_category_overrides WHERE candidate_id=?').bind(row.id).first())?.category||row.category;}
export async function categoryDetail(store,id,now){
 const row=await store.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(id).first();if(!row)throw Error('candidate_not_found');
 const manual=await store.db.prepare('SELECT * FROM news_category_overrides WHERE candidate_id=?').bind(id).first();
 const blocked=await store.db.prepare('SELECT 1 blocked FROM news_takedowns WHERE item_id=? UNION ALL SELECT 1 FROM source_state WHERE source_id=? AND (takedown=1 OR publication_blocked=1) LIMIT 1').bind(id,row.source_id).first();
 const history=(await store.db.prepare('SELECT old_category,new_category,created_at,actor_type,actor_id,operation_type FROM news_category_edits WHERE candidate_id=? ORDER BY created_at DESC,rowid DESC LIMIT 20').bind(id).all()).results;
 return {id,category:manual?.category||row.category,originalCategory:row.category,manual:!!manual,editable:['pending','reopened','approved'].includes(row.review_status)&&row.expires_at>now&&!blocked,revision:row.review_revision,snapshot:await snapshot(row),options:categoryOptions,history};
}
export async function saveCategory(store,input,now,actor){
 if(actor?.type!=='human_operator'||typeof actor.id!=='string'||!/^[a-zA-Z0-9:_@.\-]{1,200}$/.test(actor.id))throw Error('operator_denied');
 if(!input||Object.keys(input).some(k=>!['id','category','revision','snapshot','requestId'].includes(k))||typeof input.id!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(input.id)||!CATEGORIES.includes(input.category)||!Number.isSafeInteger(input.revision)||input.revision<0||!/^[a-f0-9]{64}$/.test(input.snapshot||'')||!/^[-a-zA-Z0-9_]{16,100}$/.test(input.requestId||''))throw Error('category_invalid');
 const payloadHash=await hash(JSON.stringify({id:input.id,category:input.category,revision:input.revision,snapshot:input.snapshot,requestId:input.requestId,actor}));
 const replay=async()=>{const r=await store.db.prepare('SELECT payload_hash,new_category FROM news_category_edits WHERE request_id=?').bind(input.requestId).first();if(!r)return null;if(r.payload_hash!==payloadHash)throw Error('idempotency_payload_changed');return {saved:true,replayed:true,category:r.new_category};};
 const prior=await replay();if(prior)return prior;
 const row=await store.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(input.id).first();if(!row)throw Error('candidate_not_found');
 const detail=await categoryDetail(store,input.id,now);if(!detail.editable)throw Error('category_not_editable');
 if(detail.revision!==input.revision||detail.snapshot!==input.snapshot)throw Error('category_changed');
 if(detail.category===input.category)return {saved:true,changed:false,category:detail.category};
 const keys=Object.keys(row).sort();if(keys.some(k=>!/^[_a-z]+$/.test(k)))throw Error('candidate_schema_invalid');
 const statement=store.db.prepare(`INSERT INTO news_category_edits(request_id,payload_hash,candidate_id,old_category,new_category,created_at,actor_type,actor_id,operation_type,expected_revision)
 SELECT ?,?,c.id,?,?,?,?,?,'manual_category_edit',? FROM candidate_items c WHERE ${keys.map(k=>`c."${k}" IS ?`).join(' AND ')}`)
 .bind(input.requestId,payloadHash,detail.category,input.category,now,actor.type,actor.id,input.revision,...keys.map(k=>row[k]));
 try{const r=await statement.run();if(r.meta.changes!==1)throw Error('category_changed');}
 catch(error){const committed=await replay();if(committed)return committed;if(error.message==='category_changed'||/category_changed/.test(error.message))throw Error('category_changed');throw Error('category_transaction_failed',{cause:error});}
 return {saved:true,changed:true,category:input.category};
}
