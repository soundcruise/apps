import {subjectsSql} from './dot-candidate-fence.js';
import {candidateSnapshot} from './operator-review.js';
import {findDotReceipt} from './dot-receipt.js';
import {hash} from './policy.js';
import {retainedArticleHashes} from './dot-retained-decisions.js';
const text=(v,min,max)=>typeof v==='string'&&v===v.trim()&&v.length>=min&&v.length<=max&&!/[\x00-\x1f<>]/.test(v);
export async function historySubjects(store,id,after=''){
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(id)||!text(after,0,2300))throw Error('operator_query_invalid');
 if(!await findDotReceipt(store,id))throw Error('candidate_not_found');
 const rows=(await store.db.prepare(`SELECT subject_key,CASE WHEN length(CAST(subject_token AS BLOB))<=6000 THEN subject_token ELSE NULL END AS subject_token FROM (${subjectsSql}) WHERE COALESCE(candidate_id,'')<>? AND subject_key>? ORDER BY subject_key LIMIT 51`).bind(id,after).all())?.results;
 if(!Array.isArray(rows)||new TextEncoder().encode(JSON.stringify(rows)).length>65536)throw Error('operator_query_invalid');
 return {items:rows.slice(0,50),next:rows.length>50?rows[49].subject_key:null};
}
// An authenticated archival observation, not an override. The gate independently
// checks live related candidates, exact retained URL hashes and all takedowns.
export async function saveDotHistoryExclusion(store,input,actor,now){
 if(actor?.type!=='human_operator'||!text(actor.id,1,200))throw Error('operator_denied');
 if(!input||Object.keys(input).sort().join(',')!=='archive,id,requestId,revision,snapshot,subjectKey,subjectToken'||!/^[A-Za-z0-9_-]{1,128}$/.test(input.id||'')||!/^[a-f0-9]{64}$/.test(input.snapshot||'')||!Number.isSafeInteger(input.revision)||!/^[-A-Za-z0-9_]{16,100}$/.test(input.requestId||'')||!text(input.subjectKey,1,2300)||typeof input.subjectToken!=='string'||input.subjectToken.length>32768)throw Error('operator_query_invalid');
 const a=input.archive;if(!a||Object.keys(a).sort().join(',')!=='brand,event,evidenceRef,product,url'||!text(a.brand,2,100)||!text(a.product,4,100)||!text(a.event,4,100)||!text(a.evidenceRef,20,1000))throw Error('operator_query_invalid');
 let u;try{u=new URL(a.url);}catch{throw Error('operator_query_invalid');}if(u.protocol!=='https:'||u.username||u.password||u.href.length>2048)throw Error('operator_query_invalid');
 const row=await store.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(input.id).first(),receipt=await findDotReceipt(store,input.id);if(!row||!receipt)throw Error('candidate_not_found');
 if(!['pending','reopened'].includes(row.review_status)||row.review_revision!==input.revision||await candidateSnapshot(row)!==input.snapshot)throw Error('candidate_changed');
 const subject=await store.db.prepare(`SELECT * FROM (${subjectsSql}) WHERE subject_key=? AND subject_token=?`).bind(input.subjectKey,input.subjectToken).first();if(!subject)throw Error('candidate_changed');
 const hashes=await retainedArticleHashes([row.source_url,row.normalized_url]);if(typeof subject.article_hash==='string'&&/^[a-f0-9]{64}$/.test(subject.article_hash)&&!(await retainedArticleHashes([u.href])).includes(subject.article_hash))throw Error('operator_query_invalid');let facts;try{facts=JSON.parse(row.product_facts);}catch{throw Error('operator_query_invalid');}
 if((subject.topic_hash&&subject.topic_hash===await hash(row.topic_key||''))||subject.candidate_id===row.id||hashes.includes(subject.article_hash)||[row.source_url,row.normalized_url].includes(subject.url)||[row.source_url,row.normalized_url].includes(u.href)||typeof facts?.product!=='string'||facts.product.length<4||a.product.toLowerCase().includes(facts.product.toLowerCase())||facts.product.toLowerCase().includes(a.product.toLowerCase()))throw Error('operator_query_invalid');
 const payload=JSON.stringify({input,actor,digest:receipt.candidate_digest,revision:receipt.staging_revision,receipt:receipt.request_id}),digest=await hash(payload);
 const prior=await store.db.prepare('SELECT evidence_hash,checked_at FROM news_dot_history_exclusions WHERE request_id=?').bind(input.requestId).first();if(prior){if(prior.evidence_hash!==digest)throw Error('idempotency_payload_changed');return {saved:true,replayed:true,checkedAt:prior.checked_at};}
 await store.db.prepare(`INSERT OR IGNORE INTO news_dot_history_exclusions SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM candidate_items WHERE id=? AND review_revision=? AND product_facts=? AND review_status IN ('pending','reopened')) AND EXISTS(SELECT 1 FROM (${subjectsSql}) WHERE subject_key=? AND subject_token=?)`).bind(input.requestId,row.id,input.snapshot,receipt.candidate_digest,receipt.staging_revision,receipt.request_id,input.subjectKey,input.subjectToken,actor.id,now,now+86400000,u.href,a.brand,a.product,a.event,a.evidenceRef,digest, row.id,row.review_revision,row.product_facts,input.subjectKey,input.subjectToken).run();
 const saved=await store.db.prepare('SELECT evidence_hash FROM news_dot_history_exclusions WHERE request_id=?').bind(input.requestId).first();if(saved?.evidence_hash!==digest)throw Error('candidate_changed');return {saved:true,checkedAt:now};
}
