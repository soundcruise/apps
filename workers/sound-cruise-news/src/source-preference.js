import {productBrandVariants} from './product-brand-identity.js';
import {validHeadlineEvidence} from './headline-evidence.js';
import {validatedProductEvent} from './product-event.js';

const norm=s=>typeof s==='string'?s.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase():'';
const day=s=>typeof s==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s?s:null;
// This selects a default review representative; it is never a duplicate verdict
// or publication authority. Unknown launch dates deliberately do not match.
export function sourcePreferenceIdentity(row){
 // The caller supplies the server's formally validated review projection.
 const f=row.facts;
 if(!['ikebe','shimamura'].includes(row.sourceId)||row.status!=='pending'||row.history?.length||!Array.isArray(row.history)||row.validation?.valid!==true||row.validation.relevance?.status!=='PASS'||!['new_product','release'].includes(row.eventType)||!f?.brand||!f.productType||!Array.isArray(f.models)||!f.models.length||f.models.length>4||!f.models.every(m=>typeof m==='string'&&m.trim().length>=2))return null;
 let event;
 if(f.kind==='primary_product_notice'&&f.identifierBasis==='verified_primary_announcement'&&f.listingSource===row.sourceId)event=f.announcement;
 else if(['explicit_article_product_fields','explicit_shimamura_product_fields','explicit_listing_facts'].includes(f.identifierBasis)&&validHeadlineEvidence(f))event=f.releaseEvent;
 if(!event||!day(event.date)||!['scheduled_release','release','reservation_start'].includes(event.action))return null;
 if(f.productEvent&&!validatedProductEvent(f.productEvent))return null;
 const models=f.models.map(norm).sort();if(new Set(models).size!==models.length)return null;
 // Preserve every model token and qualifier; a family overlap or broad topic is
 // insufficient. No inferred brand aliases, dates, editions or color stripping.
 return JSON.stringify([productBrandVariants(f.brand).map(norm).sort()[0],models,f.productType,row.category,f.version??null,event.action,event.date,
  f.productEvent?[f.productEvent.action,f.productEvent.signal]:null,f.signatureModel??null,f.editionMarket??null,f.limitedReissue??null,f.stringsCount??null,f.keyboardKeys??null]);
}

export function preferReviewSources(rows){
 const groups=new Map();
 for(const row of rows){const key=sourcePreferenceIdentity(row);if(!key)continue;const group=groups.get(key)||[];group.push(row);groups.set(key,group);}
 const recommendations=new Map(),rank=new Map(rows.map((r,i)=>[r.id,i]));
 for(const group of groups.values()){
  const ikebe=group.find(r=>r.sourceId==='ikebe'),others=group.filter(r=>r.sourceId==='shimamura');if(!ikebe||!others.length)continue;
  recommendations.set(ikebe.id,{role:'preferred',reason:'same_verified_product_and_dated_event',alternatives:others.map(r=>r.id)});
  const first=Math.min(...group.map(r=>rank.get(r.id)));rank.set(ikebe.id,first-0.5);
  for(const row of others)recommendations.set(row.id,{role:'alternative',reason:'same_verified_product_and_dated_event',preferredId:ikebe.id,preferredSource:'池部楽器'});
 }
 // Fresh validation on each queue read: no stored rejection, waiting period,
 // candidate mutation, publisher request, or change to human decision history.
 return rows.map(row=>({...row,sourcePreference:recommendations.get(row.id)||null})).sort((a,b)=>rank.get(a.id)-rank.get(b.id));
}
