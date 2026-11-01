import {validPrimaryAnnouncement} from './primary-announcement.js';
import {validatedShimamuraProductFacts} from './shimamura-product-evidence.js';
import {hash} from './policy.js';
export const PRIMARY_PROOF_CONTRACT='primary-fields-1';
const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
export const primaryFactsDigest=(row,facts,event)=>hash(canonical({candidate:row.id,url:row.source_url,publishedAt:row.published_at,evidenceKey:row.title_fingerprint,facts,event}));
export async function sealPrimaryProof(proof,item,row){
 if(!['explicit_primary_announcement_fields','explicit_shimamura_product_fields'].includes(proof.extractionMethod))return proof;
 return {...proof,contract:PRIMARY_PROOF_CONTRACT,candidateId:row.id,factsDigest:await primaryFactsDigest(row,item.productFacts,item.eventType)};
}
// Stable field contract for newly fetched evidence; legacy receipts keep their
// narrower existing feature/version checks. A version string alone grants nothing.
export async function primaryContractValid(row,facts,proof,now){
 if(!['ikebe','shimamura'].includes(row.source_id)||!Array.isArray(proof)||!proof.length||proof.length>64||proof.length!==Object.keys(facts||{}).length+1||new Set(proof.map(p=>p?.factField)).size!==proof.length)return false;
 const digest=await primaryFactsDigest(row,facts,row.event_type),key=await hash(row.title_fingerprint||'');
 const first=proof[0];
 if(facts?.listingSource!==row.source_id||facts.articleUrl!==row.source_url||!(first?.extractionMethod==='explicit_primary_announcement_fields'?validPrimaryAnnouncement(facts):first?.extractionMethod==='explicit_shimamura_product_fields'&&validatedShimamuraProductFacts(facts)))return false;
 const family=first?.extractionMethod==='explicit_primary_announcement_fields'?/^primary-announcement-([1-9]\d*)$/:first?.extractionMethod==='explicit_shimamura_product_fields'&&row.source_id==='shimamura'?/^shimamura-product-fields-([1-9]\d*)$/:null;
 const version=family?.exec(first?.parserVersion||'');
 if(!version||Number(version[1])<(first.extractionMethod==='explicit_primary_announcement_fields'?5:12))return false;
 return [...Object.keys(facts),'event_type'].every(field=>proof.some(p=>p.factField===field&&p.contract===PRIMARY_PROOF_CONTRACT&&p.candidateId===row.id&&p.sourceId===row.source_id&&p.sourceUrl===row.source_url&&p.publishedAt===row.published_at&&p.evidenceKey===key&&p.factsDigest===digest&&p.parserVersion===first.parserVersion&&p.extractionMethod===first.extractionMethod&&p.responseHash===first.responseHash&&/^[a-f0-9]{64}$/.test(p.responseHash||'')&&Number.isSafeInteger(p.verifiedAt)&&p.verifiedAt>0&&p.verifiedAt<=now&&p.verifiedAt===first.verifiedAt));
}
