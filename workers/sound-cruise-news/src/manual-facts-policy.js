import {sourceUrl,DAY} from './policy.js';

// This is a policy record from the immutable NEWS registry, never from Dot or
// an Operator request. Publication still passes the existing NEWS source gate.
export function manualFactsPolicy(source,url,now){
 const p=source?.manualFactsPolicy;
 if(!p||!Array.isArray(p.manufacturers)||!p.manufacturers.length||p.manufacturers.length>32||p.manufacturers.some(x=>typeof x!=='string'||x.length<2||x.length>100)||!/^[a-z0-9_-]{1,64}$/.test(source.id||'')||source.sourceKind!=='official'||p.sourceKind!=='official'||source.legalStatus!=='SAFE'||source.policyDecision!=='approved'||p.reviewedBy!=='operator'||p.usage!=='independent_facts_only'||p.acquisition!=='human_only'||p.quotation!=='forbidden'||p.reproduction!=='forbidden'||p.images!=='forbidden'||typeof p.permissionRef!=='string'||!/^[a-z0-9_-]{8,100}$/.test(p.permissionRef)||source.permissionRef!==p.permissionRef||!/^https:\/\//.test(p.evidenceUrl||'')||!Number.isFinite(Date.parse(p.reviewedAt||''))||Date.parse(p.reviewedAt)>now||now-Date.parse(p.reviewedAt)>90*DAY)return null;
 try{const evidence=new URL(p.evidenceUrl);if(evidence.protocol!=='https:'||evidence.username||evidence.password||evidence.port||evidence.hostname==='localhost'||/\.(?:local|internal|localhost)$/i.test(evidence.hostname))return null;}catch{return null;}
 if(sourceUrl(url,source)!==url)return null;
 let path;try{path=decodeURIComponent(new URL(url).pathname)}catch{return null}
 if(!Array.isArray(p.allowedPaths)||!p.allowedPaths.length||p.allowedPaths.some(x=>typeof x!=='string'||!x.startsWith('/'))||!p.allowedPaths.some(x=>path.startsWith(x))||(Array.isArray(source.allowedPaths)&&source.allowedPaths.length&&!source.allowedPaths.some(x=>path.startsWith(x)))||(source.deniedPaths||[]).some(x=>path.startsWith(x))||(source.deniedPathSegments||[]).some(x=>path.split('/').includes(x)))return null;
 if(source.articlePathPattern){try{if(!new RegExp(source.articlePathPattern).test(path))return null}catch{return null}}
 return p;
}
export function observationsMatchHuman(o,h,permissionRef){
 const located=(text,value)=>{if(typeof text!=='string')return false;const parts=text.split(' | ');return parts.length===2&&parts[0]===value&&parts[1].trim().length>=3;};
 return !!o&&located(o.source,h.url)&&located(o.identity,`${h.brand} / ${h.product}`)&&located(o.event,h.action)&&located(o.date,h.publishedAt)&&located(o.claims,h.productType)&&located(o.policy,permissionRef)&&o.history==='確認済み（期限切れ履歴は不明）';
}
