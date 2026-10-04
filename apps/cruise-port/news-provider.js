import { CRUISE_APPS_NEWS_ITEM } from './news-articles.js?v=1.16.1';
import { NEWS_BETA_ITEMS } from './data/news-beta.js?v=1.3.0';
import { NEWS_CATEGORIES, validSaleDeadline } from './news-data.js?v=1.16.1';
import { NEWS_PROVIDER, NEWS_API_BASE } from './news-config.js?v=1.11.1';
export class NewsDisabledError extends Error { constructor(){super('news_disabled');this.name='NewsDisabledError';} }
const safeText=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max&&!/[<>\u0000-\u001f]/.test(value);
function validItem(item) {
    if(!item||item.publishable!==true||!safeText(item.id,128)||!safeText(item.label,140)||!safeText(item.sourceName,100)||!Object.hasOwn(NEWS_CATEGORIES,item.category)||!Number.isFinite(Date.parse(item.publishedAt)))return false;
    if(item.eventEndsAt!=null&&(!Number.isSafeInteger(item.eventEndsAt)||item.eventEndsAt<0))return false;
    if(item.category==='sale'&&!validSaleDeadline(item.saleEndsAt))return false;
    try {const u=new URL(item.sourceUrl);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!['localhost','127.0.0.1','[::1]'].includes(u.hostname)&&/[a-z]/i.test(u.hostname)&&!u.hostname.endsWith('.local');}catch{return false;}
}
// Low-level fixture loading is explicit in dev/tests; configured production loading uses the API.
export async function loadNews({ provider = 'fixture', transport } = {}) {
    if (provider === 'fixture') return NEWS_BETA_ITEMS;
    if (provider !== 'api' || typeof transport !== 'function') throw new TypeError('News provider unavailable');
    const payload = await transport();
    if(payload?.disabled===true)throw new NewsDisabledError();
    if (!payload || payload.contractVersion!==1 || !Array.isArray(payload.items)||payload.items.length>50||!payload.items.every(validItem)) throw new TypeError('Invalid news response');
    return payload.items.map(item => ({
        id: item.id, label: item.label, sourceName: item.sourceName, sourceUrl: item.sourceUrl,
        publishedAt: item.publishedAt, category: item.category,
        ...(item.category === 'sale' ? { saleEndsAt: item.saleEndsAt ?? null } : {}),
        ...(item.eventEndsAt!=null?{eventEndsAt:item.eventEndsAt}:{}),
        topicKey: item.id, createdAt: item.publishedAt, updatedAt: item.publishedAt,
        sourceSafety: 'safe', sourceKind: 'media', manualReviewStatus: 'approved',
        ...(['artist_guitar', 'live_guitar'].includes(item.category) ? { guitarEvidence: 'manual_guitar_review' } : {})
    }));
}

export async function loadConfiguredNews({provider=NEWS_PROVIDER,baseUrl=NEWS_API_BASE,fetcher=globalThis.fetch}={}){
 if(provider==='fixture')return {items:[CRUISE_APPS_NEWS_ITEM,...await loadNews()],mode:'beta'};
 if(provider!=='api'||baseUrl!==NEWS_API_BASE)throw new TypeError('News provider unavailable');
 const items=[],seen=new Set(),cursors=new Set();let offset=0,cursor=null;
 // No persistent client cache: an API kill or takedown must not resurrect old news.
 for(let page=0;page<200;page++){
  let payload;
  const records=await loadNews({provider:'api',transport:async()=>{
   const query=new URLSearchParams({limit:'50',...(cursor?{cursor}:{offset:String(offset)})});
   const response=await fetcher(`${baseUrl}/v1/news?${query}`,{method:'GET',credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000)});
   if(!response.ok){try{payload=await response.json();}catch{}if(payload?.disabled)throw new NewsDisabledError();throw new Error('News API unavailable');}
   payload=await response.json();return payload;
  }});
  for(const item of records)if(!seen.has(item.id)){seen.add(item.id);items.push(item);}
  if(Object.hasOwn(payload,'nextCursor')){
   if(payload.nextCursor===null)return {items:[CRUISE_APPS_NEWS_ITEM,...items],mode:'on'};
   if(typeof payload.nextCursor!=='string'||payload.nextCursor.length>400||!payload.nextCursor.length||cursors.has(payload.nextCursor))throw new TypeError('Invalid news pagination');
   cursors.add(payload.nextCursor);cursor=payload.nextCursor;continue;
  }
  if(payload.nextOffset===null)return {items:[CRUISE_APPS_NEWS_ITEM,...items],mode:'on'};
  if(!Number.isInteger(payload.nextOffset)||payload.nextOffset!==offset+50)throw new TypeError('Invalid news pagination');
  offset=payload.nextOffset;
 }
 throw new Error('News pagination limit exceeded');
}
