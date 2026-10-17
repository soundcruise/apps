import {saleEndsAt} from './sale.js';
// Interviews have publication retention, not a scheduled event expiry.
export function eventEndsAt(facts){
 if(facts?.kind==='morris_notice'){const date=facts.deadline||(['event_announcement','exhibition'].includes(facts.articleType)?facts.endDate||facts.eventDate:null);return date?saleEndsAt(date):null;}
 if(!facts||!(['artist_live','guitar_event'].includes(facts.kind)||facts.kind==='agm_editorial'&&facts.articleType==='performance_event')||facts.eventType==='interview')return null;
 if(!facts.endDate&&!facts.eventDate)return null;
 const at=saleEndsAt(facts.endDate||facts.eventDate);return Number.isFinite(at)?at:NaN;
}
