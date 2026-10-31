// Read-only, bounded, authenticated Operator-side snapshots. Each scope is read
// independently; they are not a consistent transactional snapshot, and expired
// history cannot be reconstructed. Never use these rows as formal Dot facts.
const limit=100,maxRows=500;
const fields='c.id AS candidate_id,c.label AS title,c.source_url AS url,c.review_status,c.product_facts,c.event_type';
const queries={
 approved:`SELECT ${fields} FROM candidate_items c WHERE c.review_status='approved' ORDER BY c.id LIMIT 101`,
 pending:`SELECT ${fields} FROM candidate_items c WHERE c.review_status IN ('pending','reopened') ORDER BY c.id LIMIT 101`,
 rejected:`SELECT ${fields} FROM candidate_items c WHERE c.review_status='rejected' ORDER BY c.id LIMIT 101`,
 system_excluded:`SELECT ${fields} FROM candidate_items c WHERE c.review_status='system_excluded' OR (c.publication_decision='REJECT' AND c.reviewed_by IN ('source_policy','system_policy','automatic_policy')) ORDER BY c.id LIMIT 101`,
 discovery:`SELECT COALESCE(c.id,w.candidate_id,w.normalized_url) AS candidate_id,COALESCE(c.label,'発見台帳') AS title,COALESCE(c.source_url,w.normalized_url) AS url,COALESCE(c.review_status,w.processing_state) AS review_status,c.product_facts,c.event_type FROM news_discovery_work w LEFT JOIN candidate_items c ON c.id=w.candidate_id ORDER BY w.source_id,w.normalized_url LIMIT 101`,
 decision_ledger:`SELECT COALESCE(c.id,l.candidate_id) AS candidate_id,COALESCE(c.label,'判断履歴') AS title,c.source_url AS url,('ledger_'||l.verdict) AS review_status,c.product_facts,c.event_type FROM news_decision_ledger l LEFT JOIN candidate_items c ON c.id=l.candidate_id WHERE l.success_state='committed' ORDER BY l.decided_at DESC,l.decision_id LIMIT 101`,
 takedown:`SELECT COALESCE(c.id,t.item_id) AS candidate_id,COALESCE(c.label,'取り下げ') AS title,c.source_url AS url,'takedown' AS review_status,c.product_facts,c.event_type FROM news_takedowns t LEFT JOIN candidate_items c ON c.id=t.item_id ORDER BY t.item_id LIMIT 101`
};
function project(r){let f={};try{f=JSON.parse(r.product_facts||'{}')||{};}catch{}const models=Array.isArray(f.models)?f.models.filter(x=>typeof x==='string').slice(0,8):typeof f.product==='string'?[f.product]:[];return {candidate_id:String(r.candidate_id||''),title:String(r.title||'不明').slice(0,200),url:typeof r.url==='string'?r.url:null,review_status:String(r.review_status||'unknown'),entity:{brand:typeof f.brand==='string'?f.brand:null,models,version:typeof f.version==='string'?f.version:null},event:{type:typeof r.event_type==='string'?r.event_type:'unknown',qualifiers:[]}};}
export async function readDotNewsSnapshot(db){
 if(!db||typeof db.prepare!=='function')return null;
 const entries=await Promise.all(Object.entries(queries).map(async([scope,sql])=>{try{const items=[];for(let offset=0;offset<maxRows;offset+=limit){const result=await db.prepare(sql+' OFFSET ?').bind(offset).all();if(!Array.isArray(result?.results))throw Error('bad_result');const rows=result.results;items.push(...rows.slice(0,limit).map(project));if(rows.length<=limit)return [scope,{complete:true,items}];}return [scope,{complete:false,items}];}catch{return [scope,{complete:false,items:[]}];}}));
 return Object.fromEntries(entries);
}
