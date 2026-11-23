// Read-only, version-bound observations. They never grant source access, facts,
// candidate registration, a duplicate verdict, or a human decision.
import notes from '../docs/web-source-resolution-20261118/review-notes.json' with {type:'json'};
import {hash} from './policy.js';
import {publicSearchUrl} from './web-discovery-quality.js';
const parse=s=>{try{return JSON.parse(s);}catch{return null;}};
const same=(a,b)=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
export async function webReviewNotes(item,known,states,tombstones,now){
 const titleHash=await hash(item.title||''),entry=notes.find(n=>n.hints.some(h=>h.url===item.url&&h.titleHash===titleHash));
 if(!entry||item.humanEntry||item.reviewBlocked||!publicSearchUrl(entry.reference.url))return null;
 const peers=entry.hints.filter(h=>h.url!==item.url).map(h=>h.url),reference={...entry.reference,observedAt:entry.observedAt,confirmed:false,formalFacts:false};
 const discoveryPublishedAt=entry.hints.find(h=>h.url===item.url)?.publishedAt;
 if(!entry.knownArticles)return {reason:entry.reason,reference,peers,knownArticles:[],...(discoveryPublishedAt?{discoveryPublishedAt}:{})};
 const articles=[];
 for(const expected of entry.knownArticles){
  const row=known.find(r=>r.id===expected.id&&r.source_url===expected.url),f=parse(row?.product_facts),state=states.find(s=>s.source_id===row?.source_id);
  if(!row||row.review_status!=='approved'||row.expires_at<=now||tombstones.has(row.id)||state&&(state.disabled||state.takedown||state.publication_blocked)||f?.brand!==expected.brand||!Array.isArray(f.models)||!same(f.models,expected.models))return null;
  articles.push({id:row.id,url:row.source_url,label:row.label});
 }
 return {reason:entry.reason,reference,peers,knownArticles:articles};
}
