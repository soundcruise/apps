import {handleNewsRequest} from './worker.js';
import {hash} from './policy.js';
import {canonical} from './operator-review.js';
const dayOf=value=>new Date(Date.parse(value)+9*3600000).toISOString().slice(0,10);
const dayOK=d=>typeof d==='string'&&/^20\d\d-\d\d-\d\d$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
const idOK=s=>typeof s==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(s);
// Public pagination stays chronological. The complete Port list applies day-local order.
export async function publishedPresentation(store,env,now,registry){
 const all=[];let cursor=null;
 do{const u=new URL('https://news.internal/v1/news');u.searchParams.set('limit','50');if(cursor)u.searchParams.set('cursor',cursor);
 const r=await handleNewsRequest(new Request(u),{...env,NEWS_API_MODE:'production'},now,{registry,cache:null});if(!r.ok)throw Error('presentation_unavailable');const p=await r.json();all.push(...p.items);cursor=p.nextCursor;if(all.length>10000)throw Error('presentation_unavailable');}while(cursor);
 const days=new Map();for(const item of all){const day=dayOf(item.publishedAt);if(!days.has(day))days.set(day,[]);days.get(day).push(item);}
 const preferences=(await store.db.prepare('SELECT * FROM news_presentation_days').all()).results;
 const rows=await store.candidates(),controls=await store.controls();
 const result=[];for(const [day,items]of days){const p=preferences.find(p=>p.day===day),revision=p?.revision||0;
 for(const item of items)item.assistedEditable=rows.some(r=>r.id===item.id&&r.origin==='operator_assisted');
 items.sort((a,b)=>(a.displayOrder??100000)-(b.displayOrder??100000)||b.publishedAt.localeCompare(a.publishedAt)||a.id.localeCompare(b.id));
 const guard=dayGuard(rows,day),snapshot=await hash(canonical({day,revision,guard,controls:controls.revision,items}));
 result.push({day,revision,snapshot,items});}return {days:result};
}
function dayGuard(rows,day){return rows.filter(r=>dayOf(r.published_at||r.collected_at)===day).map(r=>({id:r.id,revision:r.review_revision,status:r.review_status,label:r.label,published:r.published_at,expires:r.expires_at,sale:r.sale_ends_at,event:r.event_ends_at})).sort((a,b)=>a.id.localeCompare(b.id));}
export async function savePresentation(store,input,env,now,registry,actor){
 if(!input||Object.keys(input).some(k=>!['day','revision','snapshot','items','requestId'].includes(k))||!dayOK(input.day)||!Number.isSafeInteger(input.revision)||input.revision<0||!/^[a-f0-9]{64}$/.test(input.snapshot||'')||!idOK(input.requestId)||!Array.isArray(input.items)||input.items.length<1||input.items.length>100||input.items.some(i=>!i||Object.keys(i).length!==2||!idOK(i.id)||typeof i.hot!=='boolean')||new Set(input.items.map(i=>i.id)).size!==input.items.length)throw Error('presentation_invalid');
 if(!actor?.id||!['human_operator','system_repair','fixture'].includes(actor.type))throw Error('operator_denied');
 const payloadHash=await hash(canonical({input,actor})),prior=await store.db.prepare('SELECT * FROM news_presentation_requests WHERE request_id=?').bind(input.requestId).first();
 if(prior){if(prior.payload_hash!==payloadHash)throw Error('idempotency_payload_changed');return {saved:true,replayed:true,day:input.day,revision:prior.expected_revision+1};}
 const rows=await store.candidates(),controls=await store.controls();
 const current=(await publishedPresentation(store,env,now,registry)).days.find(d=>d.day===input.day);
 if(!current||current.snapshot!==input.snapshot||current.revision!==input.revision||input.items.length!==current.items.length||input.items.some(i=>!current.items.some(c=>c.id===i.id)))throw Error('presentation_changed');
 const guard=dayGuard(rows,input.day),fields={revision:'review_revision',status:'review_status',label:'label',published:'published_at',expires:'expires_at',sale:'sale_ends_at',event:'event_ends_at'};
 const equal=Object.entries(fields).map(([key,col])=>`c.${col} IS json_extract(j.value,'$.${key}')`).join(' AND ');
 // One guarded INSERT and trigger commit the preference, replay receipt and cache revision.
 // A competing publish/takedown/edit/retention change fails closed, without partial layout writes.
 const sql=`INSERT INTO news_presentation_requests(request_id,payload_hash,actor_type,actor_id,day,expected_revision,items_json,created_at)
 SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM news_controls WHERE id=1 AND api_enabled=1 AND revision=?)
 AND (SELECT COUNT(*) FROM candidate_items WHERE strftime('%Y-%m-%d',COALESCE(published_at,collected_at),'+9 hours')=?)=?
 AND NOT EXISTS(SELECT 1 FROM json_each(?) j WHERE NOT EXISTS(SELECT 1 FROM candidate_items c WHERE c.id=json_extract(j.value,'$.id') AND ${equal}))`;
 try{const r=await store.db.prepare(sql).bind(input.requestId,payloadHash,actor.type,actor.id,input.day,input.revision,JSON.stringify(input.items),now,controls.revision,input.day,guard.length,JSON.stringify(guard)).run();if(r.meta.changes!==1)throw Error('presentation_changed');}
 catch(e){const saved=await store.db.prepare('SELECT payload_hash FROM news_presentation_requests WHERE request_id=?').bind(input.requestId).first();if(saved?.payload_hash===payloadHash)return {saved:true,replayed:true,day:input.day,revision:input.revision+1};if(/presentation_changed/.test(e.message))throw Error('presentation_changed');throw Error('presentation_transaction_failed');}
 return {saved:true,day:input.day,revision:input.revision+1};
}
