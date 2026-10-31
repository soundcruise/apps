import {hash} from './policy.js';
import {retainedArticleHashes} from './dot-retained-decisions.js';

export const SCOPE_RULE='dot-candidate-scope-2';
const json=c=>`CASE WHEN json_valid(${c}) THEN ${c} ELSE '{}' END`;
const facts=json('c.product_facts');
const feature=json('l.decision_features_json');
// Every unversioned retained decision needs archival evidence: current candidate
// facts alone cannot attest to the identity of a past decision.
export const subjectsSql=`SELECT 'ledger:'||l.decision_id AS subject_key,
 json_array(l.candidate_id,l.verdict,l.reason,l.actor_type,l.actor_id,l.decided_at,l.candidate_revision,l.candidate_snapshot,l.success_state,l.policy_version,l.source_id,l.category,json_extract(${feature},'$.insightsProfile.articleIdentity'),json_extract(${feature},'$.insightsProfile.topicIdentity'),l.created_at,json_extract(${feature},'$.eventType'),json_extract(${feature},'$.operation')) AS subject_token,
 l.candidate_id AS candidate_id, json_extract(${feature},'$.insightsProfile.articleIdentity') AS article_hash,json_extract(${feature},'$.insightsProfile.topicIdentity') AS topic_hash,NULL AS url,l.verdict AS verdict
 FROM news_decision_ledger l WHERE l.success_state='committed'
 UNION ALL SELECT 'discovery:'||w.source_id||':'||w.normalized_url,json_array(w.source_id,w.normalized_url,w.candidate_id,w.processing_state,w.updated_at,w.reason_code,w.evidence_ref,w.parser_version,w.evidence_json,w.history_json),w.candidate_id,NULL,NULL,w.normalized_url,'unknown'
 FROM news_discovery_work w
 UNION ALL SELECT 'takedown:'||t.item_id,json_array(t.item_id,t.expires_at),t.item_id,NULL,NULL,NULL,'takedown'
 FROM news_takedowns t
 UNION ALL SELECT 'identity:'||c.id,json_array(c.id,c.review_revision,c.review_status,c.source_url,c.normalized_url,c.product_facts,c.event_type),c.id,NULL,NULL,c.source_url,c.review_status
 FROM candidate_items c WHERE c.review_status IN ('approved','pending','reopened','rejected','system_excluded') AND
 (NOT json_valid(COALESCE(c.product_facts,'')) OR (length(trim(COALESCE(json_extract(${facts},'$.product'),''))) BETWEEN 1 AND 3) OR EXISTS(SELECT 1 FROM json_each(CASE WHEN json_type(${facts},'$.models')='array' THEN json_extract(${facts},'$.models') ELSE '[]' END) WHERE type<>'text' OR length(trim(value))<4) OR (COALESCE(json_extract(${facts},'$.product'),'')='' AND COALESCE(json_array_length(CASE WHEN json_type(${facts},'$.models')='array' THEN json_extract(${facts},'$.models') ELSE '[]' END),0)=0))`;

export async function candidateScopeKeys(row,receipt,candidate,now){
 const rawSources=Array.isArray(candidate?.sources)?candidate.sources:[],entity=candidate?.entity||{};
 const rawModels=[...(Array.isArray(entity.models)?entity.models:[]),entity.product].filter(x=>x!=null);
 if(rawSources.length>8||rawModels.length>9||rawModels.some(x=>typeof x!=='string'||x.trim().length<4||x.length>100))throw Error('identity_search_incomplete');
 const urls=[row.source_url,row.normalized_url];
 for(const source of rawSources)for(const value of [source?.url,source?.canonical_url])if(value!=null){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.href.length>2048)throw Error('history_read_incomplete');urls.push(u.href);}
 const models=[...new Set(rawModels.map(x=>x.trim().toLowerCase()))];
 if(!models.length||new Set(urls).size>18)throw Error('history_read_incomplete');
 return {snapshot:await hash(JSON.stringify(Object.fromEntries(Object.keys(row).sort().map(k=>[k,row[k]])))),id:row.id,topicKey:row.topic_key,topicHash:row.topic_key?await hash(row.topic_key):null,dotId:receipt.dot_candidate_id,digest:receipt.candidate_digest,revision:receipt.staging_revision,receipt:receipt.request_id,now,urls:[...new Set(urls)],hashes:await retainedArticleHashes(urls),models,rule:SCOPE_RULE};
}
const exact=(a,url)=>`${a} IN (SELECT value FROM json_each(json_extract(k.v,'$.${url}')))`;
const related=`(c.id=json_extract(k.v,'$.dotId') OR c.topic_key=json_extract(k.v,'$.topicKey') OR ${exact('c.source_url','urls')} OR ${exact('c.normalized_url','urls')} OR EXISTS(SELECT 1 FROM json_each(json_extract(k.v,'$.models')) m WHERE instr(lower(COALESCE(c.product_facts,'')),m.value)>0))`;
// Bounded result, not a snapshot of history payloads. Re-evaluated by the final
// conditional decision INSERT, so a newly related row is not missed.
export const scopeSql=`WITH k(v) AS (SELECT ?), subjects AS MATERIALIZED (${subjectsSql}),
 related AS (SELECT c.id,c.review_status,c.source_url,c.normalized_url FROM candidate_items c,k WHERE c.id<>json_extract(k.v,'$.id') AND ${related}),
 evidence AS MATERIALIZED (SELECT e.request_id,e.subject_key,e.subject_token,e.expires_at FROM k CROSS JOIN subjects s CROSS JOIN news_dot_history_exclusions e INDEXED BY news_dot_history_exclusion_lookup
 WHERE e.subject_key=s.subject_key AND e.subject_token=s.subject_token AND e.candidate_id=json_extract(k.v,'$.id') AND e.candidate_snapshot=json_extract(k.v,'$.snapshot') AND e.candidate_digest=json_extract(k.v,'$.digest') AND e.staging_revision=json_extract(k.v,'$.revision') AND e.receipt_id=json_extract(k.v,'$.receipt') AND e.checked_at<=json_extract(k.v,'$.now') AND e.expires_at>json_extract(k.v,'$.now')
 AND e.archive_url NOT IN (SELECT value FROM json_each(json_extract(k.v,'$.urls')))
 AND NOT EXISTS(SELECT 1 FROM json_each(json_extract(k.v,'$.models')) m WHERE instr(lower(e.archive_product),m.value)>0 OR instr(m.value,lower(e.archive_product))>0)),
 unresolved AS (SELECT s.subject_key FROM subjects s CROSS JOIN k LEFT JOIN evidence e ON e.subject_key=s.subject_key AND e.subject_token=s.subject_token WHERE COALESCE(s.candidate_id,'')<>json_extract(k.v,'$.id') AND e.request_id IS NULL)
 SELECT json_object('unresolved',(SELECT COUNT(*) FROM unresolved),
 'related',(SELECT COUNT(*) FROM related),
 'blocked',(SELECT COUNT(*) FROM related,k WHERE review_status IN ('rejected','system_excluded') AND (${exact('source_url','urls')} OR ${exact('normalized_url','urls')}))+
 (SELECT COUNT(*) FROM subjects s,k WHERE s.verdict IN ('reject','takedown','rejected','system_excluded') AND (s.candidate_id=json_extract(k.v,'$.id') OR (s.topic_hash IS NOT NULL AND s.topic_hash=json_extract(k.v,'$.topicHash')) OR ${exact('s.article_hash','hashes')} OR ${exact('s.url','urls')}))+
 (SELECT COUNT(*) FROM news_takedowns t,k WHERE t.item_id=json_extract(k.v,'$.id') OR EXISTS(SELECT 1 FROM candidate_items c WHERE c.id=t.item_id AND (${exact('c.source_url','urls')} OR ${exact('c.normalized_url','urls')}))),
 'evidence',json((SELECT json_group_array(request_id) FROM (SELECT request_id FROM evidence ORDER BY request_id))), 'evidenceCount',(SELECT COUNT(*) FROM evidence), 'evidenceVersion',(SELECT COALESCE(MAX(seq),0) FROM news_dot_evidence_events,k WHERE candidate_id=json_extract(k.v,'$.id')), 'evidenceExpiresAt',(SELECT MIN(expires_at) FROM evidence), 'scope', '${SCOPE_RULE}')`;

// The target and its evidence are small and CAS-protected in the decision SQL.
// Ordinary unrelated history never leaves D1. Additional evidence is not an
// override for a known same-URL rejection or a related live candidate.
const selectors={candidate_items:'id',news_assisted_edits:'candidate_id',news_dot_admission_receipts:'candidate_id',news_dot_publication_checks:'candidate_id',news_dot_history_checks:'candidate_id',news_category_overrides:'candidate_id'};
export async function candidateFence(db,keys){
 const args=[JSON.stringify(keys)];
 // Exact membership stays inside D1. Reuse an immutable witness for identical
 // input and state; a changed set receives a different nonce, even at equal size.
 await db.prepare('DELETE FROM news_dot_scope_witnesses WHERE nonce IN (SELECT nonce FROM news_dot_scope_witnesses WHERE decision_id IS NULL AND expires_at<=? LIMIT 100)').bind(keys.now).all();
 const key=args[0],keyHash=await hash(key),nonce=crypto.randomUUID();
 const result=(await db.prepare(`WITH current(v) AS MATERIALIZED (${scopeSql})
 INSERT INTO news_dot_scope_witnesses(nonce,candidate_id,keys_hash,keys_json,state,expires_at)
 SELECT COALESCE((SELECT nonce FROM news_dot_scope_witnesses w WHERE w.candidate_id=? AND w.keys_hash=? AND w.state=current.v AND w.expires_at>? LIMIT 1),?),?,?,?,current.v,? FROM current WHERE 1
 ON CONFLICT(nonce) DO UPDATE SET nonce=excluded.nonce
 RETURNING nonce,json_remove(state,'$.evidence') AS summary`).bind(key,keys.id,keyHash,keys.now,nonce,keys.id,keyHash,key,keys.now+300000).all()).results?.[0];
 if(typeof result?.nonce!=='string'||typeof result.summary!=='string'||new TextEncoder().encode(result.summary).length>32768)throw Error('history_read_incomplete');
 const summary=JSON.parse(result.summary);if(!Number.isSafeInteger(summary.evidenceCount)||!Number.isSafeInteger(summary.evidenceVersion)||summary.evidenceCount<0||summary.evidenceVersion<0)throw Error('history_read_incomplete');if(!Number.isSafeInteger(summary.unresolved)||!Number.isSafeInteger(summary.related)||!Number.isSafeInteger(summary.blocked))throw Error('history_read_incomplete');
 const membershipSql=`SELECT w.nonce FROM news_dot_scope_witnesses w WHERE w.nonce=? AND w.keys_json=? AND w.state=(${scopeSql})`;
 const names=Object.keys(selectors).concat(['news_dot_confirmations','source_state','source_health','news_controls']);
 const metadata=(await db.prepare(`SELECT m.name AS tbl,p.name AS col,p.cid AS cid FROM sqlite_master m JOIN pragma_table_info(m.name) p WHERE m.type='table' AND m.name IN (${names.map(()=>'?').join(',')}) ORDER BY m.name,p.cid`).bind(...names).all())?.results;
 const queries=[];
 for(const table of names){const cols=metadata?.filter(x=>x.tbl===table).map(x=>x.col);if(!cols?.length||cols.some(x=>!/^[_a-z]+$/.test(x)))throw Error('history_read_incomplete');
 const filter=selectors[table]?`${selectors[table]}=json_extract(k.v,'$.id')`:table==='news_dot_confirmations'?`request_id=(SELECT confirmation_id FROM news_dot_admission_receipts WHERE request_id=json_extract(k.v,'$.receipt'))`:table==='news_controls'?'id=1':`source_id=(SELECT source_id FROM candidate_items WHERE id=json_extract(k.v,'$.id'))`;
 queries.push(`'${table}',json((SELECT json_group_array(json(v)) FROM (SELECT json_array(${cols.map(c=>'"'+c+'"').join(',')}) v FROM ${table},k WHERE ${filter} ORDER BY v LIMIT 65)))`);
 }
 const sql=`WITH k(v) AS (SELECT ?) SELECT json_object(${queries.join(',')})`;
 const value=(await db.prepare(`SELECT (${sql}) AS value`).bind(...args).first())?.value;
 if(typeof value!=='string'||new TextEncoder().encode(value).length>65536||Object.values(JSON.parse(value)).some(x=>!Array.isArray(x)||x.length>64))throw Error('history_read_incomplete');
 return {summary,witnessId:result.nonce,parts:[{sql:membershipSql,args:[result.nonce,key,key],value:result.nonce},{sql,args,value}],digest:await hash(JSON.stringify({keys,summary,witness:result.nonce,target:value}))};
}
