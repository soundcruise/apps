import {validatedProductFacts} from './metadata.js';
const field=(i,a,b)=>i[a]??i[b];
function facts(i){try{return typeof field(i,'productFacts','product_facts')==='string'?JSON.parse(field(i,'productFacts','product_facts')):field(i,'productFacts','product_facts');}catch{return null;}}
export function canonicalIdentity(i){try{const u=new URL(field(i,'sourceUrl','source_url'));u.hash='';for(const k of [...u.searchParams.keys()])if(/^(utm_|fbclid|gclid)/.test(k))u.searchParams.delete(k);u.searchParams.sort();return u.href;}catch{return null;}}
export function factualIdentity(i){
 if(field(i,'sourceId','source_id')!=='ik')return null;
 const f=facts(i),event=field(i,'eventType','event_type'),stamp=Date.parse(field(i,'publishedAt','published_at'));
 if(!validatedProductFacts(f)||f.scopeUncertain||!Number.isFinite(stamp)||!['new_product','release','other','firmware','update','recall','discontinued','price_change'].includes(event))return null;
 // Do not compare an update without a version, or collapse different-date launches/packs.
 if(['update','firmware'].includes(event)&&!f.version)return null;
 const family=['new_product','release','other'].includes(event)?'launch':event;
 const day=new Date(stamp+9*3600000).toISOString().slice(0,10);
 const norm=v=>String(v||'').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g,'');
 return [field(i,'sourceId','source_id'),norm(f.brand),norm(f.product),norm(f.version),f.category,family,day].join('|');
}
export function duplicateOf(a,b){
 if(field(a,'sourceId','source_id')!==field(b,'sourceId','source_id'))return false;
 const ca=canonicalIdentity(a),cb=canonicalIdentity(b);if(ca&&ca===cb)return true;
 const fa=factualIdentity(a);return !!fa&&fa===factualIdentity(b);
}
