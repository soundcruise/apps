// Read-only comparison identities. Never parse a display headline into facts.
import {validPublishedHeadline,publishedHeadline} from './published-headline.js';
import {assistedLabel} from './assisted-facts.js';
import {productBrandVariants} from './product-brand-identity.js';
const canonical=v=>JSON.stringify(sort(v));
function sort(v){return Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;}
const normalize=s=>typeof s==='string'?s.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase():'';
const type=t=>({electric_acoustic_guitar:'electro_acoustic'})[t]||t;
// Only an explicit list of complete model codes. No prefix completion, aliases,
// family expansion, prose splitting, or ambiguous single model such as LL16D/ARE.
export function explicitComparisonModels(product){
 if(typeof product!=='string')return [];
 const pieces=product.split(/\s+\/\s+|／/).map(s=>s.normalize('NFKC'));
 return pieces.length>=2&&pieces.length<=4&&pieces.every(p=>/^[A-Za-z0-9][A-Za-z0-9._-]{1,59}$/.test(p.trim())&&/[A-Za-z]/.test(p)&&/\d/.test(p))?pieces.map(normalize):[normalize(product)];
}
export function legacyProductIdentity(row,now){
 let f,p;try{f=typeof row.product_facts==='string'?JSON.parse(row.product_facts):row.product_facts;p=JSON.parse(row.facts_provenance||'null');}catch{return null;}
 // Existing structured model identities keep their current duplicate semantics.
 // This adapter is a fallback for old presentation-only/coarse product facts.
 if(typeof f?.brand==='string'&&typeof f?.product==='string'&&Array.isArray(f?.models)&&f.models.length>0&&(f.kind||f.identifierBasis))return null;
 const h=f?.headlineQuality,stamp=Date.parse(row.published_at);
 if(!Number.isFinite(stamp)||stamp>now||now-stamp>=90*86400000)return null;
 if(!validPublishedHeadline(h,row)||h.kind!=='product'||publishedHeadline(h,row)!==row.label)return null;
 const receipt=Array.isArray(p)?p.filter(e=>e?.factField==='headlineQuality').at(-1):null;
 if(!receipt||receipt.sourceId!==row.source_id||receipt.sourceUrl!==row.source_url||!['published-headline-1','published-headline-2','published-headline-3'].includes(receipt.parserVersion)||!['authorized_published_primary_review','authorized_owner_type_and_primary_review'].includes(receipt.extractionMethod)||!Number.isSafeInteger(receipt.verifiedAt)||receipt.verifiedAt>now||canonical(receipt.evidence)!==canonical(h.evidence)||h.evidence.some(e=>!Number.isSafeInteger(e.verifiedAt)||e.verifiedAt>receipt.verifiedAt))return null;
 return {brand:h.brand,product:normalize(h.product),models:explicitComparisonModels(h.product),productType:type(h.productType),action:h.action,event:['announce','release','scheduled_release'].includes(h.action)?'launch':h.action,version:h.version||'',qualifier:h.qualifier||'',feature:h.feature||'',date:h.date||'',publication:{id:row.id,url:row.source_url,publishedAt:row.published_at}};
}
export function assistedProductIdentity(f){
 if(!assistedLabel(f)||['event','interview'].includes(f.productType))return null;
 return {brand:f.brand,product:normalize(f.product),models:explicitComparisonModels(f.product),productType:type(f.productType),action:f.action,event:['announcement','release'].includes(f.action)?'launch':f.action,version:f.version||'',qualifier:f.qualifier||'',feature:'',date:f.releaseDate||''};
}
export function sameProductLaunch(a,b){
 if(!a||!b||a.event!=='launch'||b.event!=='launch'||a.productType!==b.productType||a.version!==b.version||a.qualifier!==b.qualifier||a.feature!==b.feature)return false;
 if(!productBrandVariants(a.brand).map(normalize).some(x=>productBrandVariants(b.brand).map(normalize).includes(x)))return false;
 if(a.date&&b.date&&!(a.date.startsWith(b.date)||b.date.startsWith(a.date)))return false;
 return a.product===b.product||a.models.some(m=>b.models.includes(m));
}
