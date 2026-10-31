// Read-only, bounded, authenticated Operator-side snapshots. Each scope is read
// independently; they are not a consistent transactional snapshot, and expired
// history cannot be reconstructed. Never use these rows as formal Dot facts.
const limit=100,maxRows=500;
const fields='c.id AS candidate_id,c.label AS title,c.source_url AS url,c.normalized_url AS normalized_url,c.review_status,c.product_facts,c.event_type';
const queries={
 approved:`SELECT ${fields} FROM candidate_items c WHERE c.review_status='approved'`,
 pending:`SELECT ${fields} FROM candidate_items c WHERE c.review_status IN ('pending','reopened')`,
 rejected:`SELECT ${fields} FROM candidate_items c WHERE c.review_status='rejected'`,
 system_excluded:`SELECT ${fields} FROM candidate_items c WHERE c.review_status='system_excluded' OR (c.publication_decision='REJECT' AND c.reviewed_by IN ('source_policy','system_policy','automatic_policy'))`,
 discovery:`SELECT COALESCE(c.id,w.candidate_id,w.normalized_url) AS candidate_id,COALESCE(c.label,'発見台帳') AS title,COALESCE(c.source_url,w.normalized_url) AS url,COALESCE(c.normalized_url,w.normalized_url) AS normalized_url,COALESCE(c.review_status,w.processing_state) AS review_status,c.product_facts,c.event_type FROM news_discovery_work w LEFT JOIN candidate_items c ON c.id=w.candidate_id`,
 decision_ledger:`SELECT COALESCE(c.id,l.candidate_id) AS candidate_id,COALESCE(c.label,'判断履歴') AS title,c.source_url AS url,c.normalized_url AS normalized_url,('ledger_'||l.verdict) AS review_status,c.product_facts,c.event_type FROM news_decision_ledger l LEFT JOIN candidate_items c ON c.id=l.candidate_id WHERE l.success_state='committed'`,
 takedown:`SELECT COALESCE(c.id,t.item_id) AS candidate_id,COALESCE(c.label,'取り下げ') AS title,c.source_url AS url,c.normalized_url AS normalized_url,'takedown' AS review_status,c.product_facts,c.event_type FROM news_takedowns t LEFT JOIN candidate_items c ON c.id=t.item_id`
};
function project(r){let f={};try{f=JSON.parse(r.product_facts||'{}')||{};}catch{}const models=Array.isArray(f.models)?f.models.filter(x=>typeof x==='string').slice(0,8):typeof f.product==='string'?[f.product]:[];return {candidate_id:String(r.candidate_id||''),title:String(r.title||'不明').slice(0,200),url:typeof r.url==='string'?r.url:null,review_status:String(r.review_status||'unknown'),entity:{brand:typeof f.brand==='string'?f.brand:null,models,version:typeof f.version==='string'?f.version:null},event:{type:typeof r.event_type==='string'?r.event_type:'unknown',qualifiers:[]}};}
function searchTerms(candidate){
 const ids=typeof candidate?.candidate_id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(candidate.candidate_id)?[candidate.candidate_id]:[];
 const allSources=Array.isArray(candidate?.sources)?candidate.sources:[],urls=[];let incomplete=allSources.length>8;
 for(const source of allSources.slice(0,8)){for(const raw of [source?.url,source?.canonical_url]){if(raw==null)continue;try{const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password||u.href.length>2048){incomplete=true;continue;}if(!urls.includes(u.href))urls.push(u.href);}catch{incomplete=true;}}}
 const e=candidate?.entity||{},allModels=Array.isArray(e.models)?e.models:[];if(allModels.length>8||allModels.some(x=>typeof x!=='string'||x.length>100)||(typeof e.product==='string'&&e.product.length>100))incomplete=true;
 const models=[...new Set([...allModels.slice(0,8),e.product].filter(x=>typeof x==='string'&&x.trim().length>=4&&x.length<=100).map(x=>x.trim()))];
 if(urls.length>8||models.length>8)incomplete=true;
 return {ids,urls:urls.slice(0,8),models:models.slice(0,8),incomplete};
}
export async function readDotNewsSnapshot(db,candidate){
 if(!db||typeof db.prepare!=='function')return null;
 const terms=searchTerms(candidate),clauses=[],args=[];
 for(const id of terms.ids){clauses.push('r.candidate_id=?');args.push(id);}
 for(const url of terms.urls){clauses.push('(r.url=? OR r.normalized_url=?)');args.push(url,url);}
 for(const model of terms.models){clauses.push("instr(lower(COALESCE(r.product_facts,'')),lower(?))>0");args.push(model);}
 if(!clauses.length)return null;
 const entries=await Promise.all(Object.entries(queries).map(async([scope,sql])=>{try{const items=[];for(let offset=0;offset<maxRows;offset+=limit){const statement='SELECT * FROM ('+sql+') r WHERE ('+clauses.join(' OR ')+') ORDER BY r.candidate_id,r.url,r.title LIMIT 101 OFFSET ?';const result=await db.prepare(statement).bind(...args,offset).all();if(!Array.isArray(result?.results))throw Error('bad_result');const rows=result.results;items.push(...rows.slice(0,limit).map(project));if(rows.length<=limit)return [scope,{complete:true,items,mode:'targeted'}];}return [scope,{complete:false,items,mode:'targeted'}];}catch{return [scope,{complete:false,items:[]}];}}));
 return Object.fromEntries(entries.map(([scope,part])=>[scope,terms.incomplete?{...part,complete:false,reason:'candidate_terms_truncated'}:part]));
}
