import { NEWS_BETA_ITEMS } from './data/news-beta.js?v=1.3.0';
import { NEWS_CATEGORIES } from './news-data.js?v=1.3.0';
export class NewsDisabledError extends Error { constructor(){super('news_disabled');this.name='NewsDisabledError';} }
const safeText=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max&&!/[<>\u0000-\u001f]/.test(value);
function validItem(item) {
    if(!item||item.publishable!==true||!safeText(item.id,128)||!safeText(item.label,140)||!safeText(item.sourceName,100)||!Object.hasOwn(NEWS_CATEGORIES,item.category)||!Number.isFinite(Date.parse(item.publishedAt)))return false;
    try {const u=new URL(item.sourceUrl);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!['localhost','127.0.0.1','[::1]'].includes(u.hostname)&&/[a-z]/i.test(u.hostname)&&!u.hostname.endsWith('.local');}catch{return false;}
}
// Fixture remains default. Only trusted application code can supply an API transport.
export async function loadNews({ provider = 'fixture', transport } = {}) {
    if (provider === 'fixture') return NEWS_BETA_ITEMS;
    if (provider !== 'api' || typeof transport !== 'function') throw new TypeError('News provider unavailable');
    const payload = await transport();
    if(payload?.disabled===true)throw new NewsDisabledError();
    if (!payload || payload.contractVersion!==1 || !Array.isArray(payload.items)||payload.items.length>50||!payload.items.every(validItem)) throw new TypeError('Invalid news response');
    return payload.items.map(item => ({
        id: item.id, label: item.label, sourceName: item.sourceName, sourceUrl: item.sourceUrl,
        publishedAt: item.publishedAt, category: item.category,
        topicKey: item.id, createdAt: item.publishedAt, updatedAt: item.publishedAt,
        sourceSafety: 'safe', sourceKind: 'media', manualReviewStatus: 'approved',
        ...(['artist_guitar', 'live_guitar'].includes(item.category) ? { guitarEvidence: 'manual_guitar_review' } : {})
    }));
}
