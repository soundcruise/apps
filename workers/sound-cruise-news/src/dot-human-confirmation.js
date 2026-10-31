import {hash} from './policy.js';

// These are human observations, not an assertion that a source policy is approved.
const fields=['source','identity','event','date','claims','policy','history'];
const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
const bounded=(v,n)=>typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=n&&!/[\x00-\x1f<>]/.test(v);
export async function dotSnapshot(detail,id){
 if(!detail||detail.validation?.formalFacts!==false||detail.validation?.ready!==false||detail.candidate?.candidate_id!==id||!/^\d{1,15}:\d{1,9}$/.test(detail.stagingRevision||''))throw Error('operator_unavailable');
 return {digest:await hash(JSON.stringify(stable(detail.candidate))),revision:detail.stagingRevision};
}
export async function saveDotConfirmation(db,reader,input,actor,now){
 if(actor?.type!=='human_operator')throw Error('operator_denied');
 if(!input||Object.keys(input).sort().join(',')!=='candidateId,digest,observations,outcome,requestId,revision'||!/^[A-Za-z0-9_-]{1,128}$/.test(input.candidateId||'')||!/^[a-f0-9]{64}$/.test(input.digest||'')||!/^\d{1,15}:\d{1,9}$/.test(input.revision||'')||!/^[A-Za-z0-9_-]{16,100}$/.test(input.requestId||'')||!['confirmed','needs_confirmation'].includes(input.outcome)||!input.observations||typeof input.observations!=='object'||Array.isArray(input.observations)||Object.keys(input.observations).sort().join(',')!==fields.slice().sort().join(',')||fields.some(f=>!bounded(input.observations[f],600)))throw Error('operator_query_invalid');
 const detail=await reader.detail(input.candidateId),snapshot=await dotSnapshot(detail,input.candidateId);
 if(snapshot.digest!==input.digest||snapshot.revision!==input.revision)throw Error('candidate_changed');
 const evidence=JSON.stringify(stable({observations:input.observations,outcome:input.outcome}));
 const payload=await hash(JSON.stringify({candidateId:input.candidateId,digest:input.digest,revision:input.revision,actor:actor.id,evidence}));
 await db.prepare('INSERT OR IGNORE INTO news_dot_confirmations(request_id,candidate_id,candidate_digest,staging_revision,actor_id,confirmed_at,evidence_json,evidence_hash,outcome) VALUES(?,?,?,?,?,?,?,?,?)').bind(input.requestId,input.candidateId,input.digest,input.revision,actor.id,now,evidence,payload,input.outcome).run();
 const stored=await db.prepare('SELECT evidence_hash,confirmed_at FROM news_dot_confirmations WHERE request_id=?').bind(input.requestId).first();
 if(!stored||stored.evidence_hash!==payload)throw Error('idempotency_payload_changed');
 return {saved:true,confirmedAt:stored.confirmed_at,outcome:input.outcome,formalFacts:false,ready:false,registration:'NOT_AVAILABLE'};
}
