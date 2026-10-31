import {legacyProductIdentity,assistedProductIdentity,sameProductLaunch} from './legacy-product-identity.js';
import {assistedProof} from './assisted-facts.js';
const columns=['id','source_id','source_url','published_at','label','product_facts','facts_provenance','review_revision','review_status'];
const legacyFilter=a=>`${a}.review_status='approved' AND json_type(CASE WHEN json_valid(${a}.product_facts) THEN ${a}.product_facts ELSE '{}' END,'$.headlineQuality')='object'`;
const assistedFilter=a=>`${a}.review_status='approved' AND ${a}.origin='operator_assisted'`;
export async function withLegacyDuplicates(store,row,facts,now,base,registry){
 const assisted=facts?.kind==='assisted_notice',identity=assisted?assistedProductIdentity(facts):legacyProductIdentity(row,now);
 if(!identity)return {...base,fenceSql:'1',fenceArgs:[]};
 const filter=assisted?legacyFilter:assistedFilter;
 const peers=(await store.db.prepare(`SELECT ${columns.map(c=>'x.'+c).join(',')}${assisted?'':',x.origin'} FROM candidate_items x WHERE ${filter('x')} ORDER BY x.id LIMIT 513`).all()).results;
 const snapshot=JSON.stringify(peers.map(r=>Object.fromEntries(columns.map(c=>[c,r[c]??null]))));
 if(peers.length>512||new TextEncoder().encode(snapshot).length>1048576)return {...base,fenceSql:'0',fenceArgs:[],compatibilityError:'duplicate_check_unavailable'};
 const ids=[],trustedIds=[];for(const peer of peers){
  if(peer.id===row.id)continue;
  let other;if(assisted)other=legacyProductIdentity(peer,now);else if(await assistedProof(store,peer,now,registry)){try{other=assistedProductIdentity(JSON.parse(peer.product_facts));}catch{}}
  if(other)trustedIds.push(peer.id);
  if(sameProductLaunch(identity,other))ids.push(peer.id);
 }
 // A single bound JSON snapshot keeps D1 parameter counts bounded. All approved
 // legacy peers, including nonmatches, are fenced against insertion/deletion/edit.
 // The human decision INSERT evaluates this fence atomically; no cache or DB repair.
 const equal=columns.map(c=>`x.${c} IS json_extract(s.value,'$.${c}')`).join(' AND ');
 const fenceSql=`((SELECT COUNT(*) FROM candidate_items x WHERE ${filter('x')})=? AND NOT EXISTS(SELECT 1 FROM json_each(?) s LEFT JOIN candidate_items x ON x.id=json_extract(s.value,'$.id') WHERE x.id IS NULL OR NOT (${filter('x')}) OR NOT (${equal})))`;
 return {sql:`(((${base.sql}) AND (d.id NOT IN(SELECT value FROM json_each(?)) OR d.topic_key=? OR d.normalized_url=? OR d.source_url=?)) OR (d.review_status='approved' AND d.id<>? AND d.id IN(SELECT value FROM json_each(?))))`,args:[...base.args,JSON.stringify(trustedIds),row.topic_key,row.normalized_url,row.source_url,row.id,JSON.stringify(ids)],fenceSql,fenceArgs:[peers.length,snapshot]};
}
export async function duplicateFenceValid(store,predicate){return !!(await store.db.prepare('SELECT 1 ok WHERE '+predicate.fenceSql).bind(...predicate.fenceArgs).first());}
