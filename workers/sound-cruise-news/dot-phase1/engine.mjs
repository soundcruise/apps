// Offline prototype only: no database, network, production import or publication authority.
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const schema=JSON.parse(readFileSync(new URL('./candidate.schema.json',import.meta.url),'utf8'));
const ajv=new Ajv2020({allErrors:true,strict:true});addFormats(ajv);
const validate=ajv.compile(schema), MAX_BYTES=65536;
const digest=x=>createHash('sha256').update(x).digest('hex');
const norm=x=>String(x||'').normalize('NFKC').trim().toLowerCase();
const dayValid=x=>/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
function validDate(d){if(d.precision==='unknown')return d.value===null&&d.timezone===null&&d.evidence_ids.length===0;if(!d.value||!d.evidence_ids.length)return false;if(d.precision==='day')return dayValid(d.value);if(d.precision==='month')return /^\d{4}-(0[1-9]|1[0-2])$/.test(d.value);return /^\d{4}-\d{2}-\d{2}T\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(d.value)&&dayValid(d.value.slice(0,10))&&Number.isFinite(Date.parse(d.value));}
export function validateInput(input){
 let data;try{let raw=typeof input==='string'?input:JSON.stringify(input);if(Buffer.byteLength(raw)>MAX_BYTES)return {valid:false,errors:['size_exceeded']};data=JSON.parse(raw);}catch{return {valid:false,errors:['invalid_json']};}
 if(!validate(data))return {valid:false,errors:validate.errors.map(e=>`${e.instancePath} ${e.message}`)};
 const c=data.candidate, errors=[], ids=new Set();
 if(Date.parse(data.run.window.start)>=Date.parse(data.run.window.end_exclusive))errors.push('invalid_window');
 for(const s of c.sources){if(ids.has(s.source_id))errors.push('duplicate_source_id');ids.add(s.source_id);try{for(const raw of [s.url,s.canonical_url]){const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password||u.hash||u.href!==raw)throw Error();}if(new URL(s.url).origin!==new URL(s.canonical_url).origin)throw Error();}catch{errors.push('invalid_source_url');}if(s.body_verified&&s.acquisition_method!=='permitted_article_body')errors.push('index_cannot_be_body');}
 for(const [key,d] of Object.entries(c.dates)){if(!validDate(d))errors.push(`invalid_date:${key}`);if(d.evidence_ids.some(x=>!ids.has(x)))errors.push(`unknown_date_evidence:${key}`);}
 const claimIds=new Set();for(const claim of c.claims){if(claimIds.has(claim.claim_id))errors.push('duplicate_claim_id');claimIds.add(claim.claim_id);if([...claim.evidence_ids,...claim.conflicting_evidence_ids].some(x=>!ids.has(x)))errors.push('unknown_claim_evidence');if(claim.verification==='supported'&&!claim.evidence_ids.length)errors.push('unsupported_claim');if(claim.verification==='contradicted'&&!claim.conflicting_evidence_ids.length)errors.push('missing_contradiction');}
 return {valid:!errors.length,errors,data};
}
// The caller supplies a separately governed, trusted policy snapshot, never one from Dot's JSON.
export function policyGate(source,policies,now,operation='facts_use'){
 if(!Number.isFinite(Date.parse(now)))return {allowed:false,reason:'invalid_clock'};
 let u;try{u=new URL(source.url);}catch{return {allowed:false,reason:'invalid_url'};}
 const p=policies.find(p=>p.id===source.policy_id&&p.revision===source.policy_revision);
 if(!p)return {allowed:false,reason:'policy_unknown'};
 if(p.revoked!==false||p.stopped!==false||p.access_denied!==false)return {allowed:false,reason:'policy_stopped_or_unconfirmed'};
 if(source.acquisition_method==='unknown')return {allowed:false,reason:'method_unconfirmed'};
 if(!p.evidence_ref||!p.expires_at||!Number.isFinite(Date.parse(p.expires_at))||Date.parse(now)>=Date.parse(p.expires_at)||!p.reviewed_at||Date.parse(p.reviewed_at)>Date.parse(now)||!Number.isFinite(Date.parse(p.reviewed_at)))return {allowed:false,reason:'policy_expired_or_unverified'};
 if(u.port||/%(?:2f|5c|2e)/i.test(u.pathname)||u.hostname!==p.host||!p.paths?.some(path=>u.pathname===path||u.pathname.startsWith(path.endsWith('/')?path:path+'/')))return {allowed:false,reason:'scope_mismatch'};
 if(!p.purposes?.includes(operation)||!p.storage?.includes('minimal_facts'))return {allowed:false,reason:'purpose_or_storage_unconfirmed'};
 const state=p.methods?.[source.acquisition_method];return state==='allowed'?{allowed:true,reason:'allowed'}:{allowed:false,reason:state==='prohibited'?'method_prohibited':'method_unconfirmed'};
}
// Explicit claims are useful for discovery; even allowed observations do not become formal evidence here.
export function assessEvidence(candidate,policies,now){const sourceStates=candidate.sources.map(s=>({id:s.source_id,...policyGate(s,policies,now)}));const blockers=[];if(!sourceStates.length)blockers.push('no_source');if(sourceStates.some(s=>!s.allowed))blockers.push('policy_blocked');if(candidate.sources.some(s=>s.acquisition_method!=='permitted_article_body'||!s.body_verified))blockers.push('body_not_verified');if(candidate.claims.some(c=>c.verification!=='supported'||!c.evidence_ids.length))blockers.push('claim_unverified_or_conflicted');if(candidate.dates.article_published.precision==='unknown')blockers.push('publication_date_unknown');return {sourceStates,blockers:[...new Set(blockers)],formalFacts:false,ready:false,reason:'independent_evidence_verification_not_implemented'};}
const normModels=c=>new Set((c.entity.models||[]).map(norm).filter(Boolean));
export function compareEvents(a,b,{verifiedIdentity=false}={}){
 const au=a.sources?.map(s=>s.canonical_url)||[],bu=b.sources?.map(s=>s.canonical_url)||[];if(au.some(u=>bu.includes(u))){const sameType=a.event?.type===b.event?.type&&a.event?.type!=='unknown';const sameVersion=a.entity?.version===b.entity?.version;const sameMarket=a.event?.market===b.event?.market;const sameVariants=JSON.stringify((a.event?.qualifiers||[]).map(norm).sort())===JSON.stringify((b.event?.qualifiers||[]).map(norm).sort());return sameType&&sameVersion&&sameMarket&&sameVariants?'SAME':'UNCERTAIN';}
 const brandA=norm(a.entity.brand),brandB=norm(b.entity.brand);if(!brandA||!brandB)return 'UNCERTAIN';if(brandA!==brandB)return 'UNCERTAIN';
 const ma=normModels(a),mb=normModels(b);if(!ma.size||!mb.size)return 'UNCERTAIN';if(![...ma].some(x=>mb.has(x)))return 'UNCERTAIN';
 const ea=a.event,eb=b.event;if(!ea?.type||!eb?.type||ea.type==='unknown'||eb.type==='unknown')return 'UNCERTAIN';
 if(ea.type!==eb.type){const activity=new Set(['event_announcement','event_report','interview']);return activity.has(ea.type)!==activity.has(eb.type)?'DISTINCT':'UNCERTAIN';}
 const qa=(ea.qualifiers||[]).map(norm).sort(),qb=(eb.qualifiers||[]).map(norm).sort();
 if(JSON.stringify(qa)!==JSON.stringify(qb))return 'UNCERTAIN';
 if(a.entity.version!==b.entity.version||ea.market!==eb.market)return 'UNCERTAIN';
 // Source-independent SAME requires an explicit event identity or trusted event date; model alone is not sufficient.
 const da=a.dates?.first_announcement,db=b.dates?.first_announcement;
 if(verifiedIdentity&&da?.value&&db?.value&&da.precision===db.precision&&da.value===db.value&&qa.length===qb.length)return 'SAME';
 return 'UNCERTAIN';
}
export function classifyFreshness(c,window){
 const date=c.dates?.article_published,start=Date.parse(window.start),end=Date.parse(window.end_exclusive);
 if(!date?.value||date.precision==='unknown'||!Number.isFinite(start)||!Number.isFinite(end))return 'UNCERTAIN';
 // A day of unknown time/zone is an interval, not a made-up midnight timestamp.
 function bounds(d){if(d.precision==='timestamp'){const at=Date.parse(d.value);return [at,at];}if(d.precision==='day'){const at=Date.parse(d.value+'T00:00:00Z');return [at-14*3600000,at+38*3600000];}return [NaN,NaN];}
 const [earliest,latest]=bounds(date);if(!Number.isFinite(earliest))return 'UNCERTAIN';
 if(latest<start||earliest>=end)return 'OUTSIDE';
 const first=c.dates?.first_announcement,firstBounds=first?.value?bounds(first):[NaN,NaN];
 if(c.event.type==='announcement'&&Number.isFinite(firstBounds[1])&&firstBounds[1]<start&&!c.event.qualifiers.length)return 'OLD_REINTRODUCTION';
 return earliest>=start&&latest<end?'IN_WINDOW':'UNCERTAIN';
}
export class DryRun {
 constructor(policies,existing=[],verifyIdentity=()=>false){this.policies=policies;this.rows=[...existing];this.receipts=new Map();this.verifyIdentity=verifyIdentity;}
 submit(input,now){const checked=validateInput(input);if(!checked.valid)return {status:'invalid',errors:checked.errors};const data=checked.data,c=data.candidate;const payload=digest(JSON.stringify(data));const prior=this.receipts.get(c.idempotency_key);if(prior)return prior.hash===payload?{...prior.result,replayed:true}:{status:'idempotency_conflict'};
 if(this.rows.some(row=>row.candidate_id===c.candidate_id))return {status:'candidate_id_conflict'};
 const evidence=assessEvidence(c,this.policies,now),matches=this.rows.map(r=>({id:r.candidate_id,review_status:r.review_status,comparison:compareEvents(c,r,{verifiedIdentity:this.verifyIdentity(c,r)===true})})).filter(r=>r.comparison!=='DISTINCT');
 const same=matches.find(m=>m.comparison==='SAME');const freshness=classifyFreshness(c,data.run.window);const result={status:same?'same':matches.length?'uncertain':'staged',candidate_id:c.candidate_id,evidence,matches,freshness,ready:false,published:false};
 this.receipts.set(c.idempotency_key,{hash:payload,result});if(!same)this.rows.push({...c,review_status:'staged'});return result;}
}
