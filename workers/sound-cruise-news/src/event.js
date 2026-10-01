import {saleEndsAt} from './sale.js';
// Interviews have publication retention, not a scheduled event expiry.
export function eventEndsAt(facts){
 if(!facts||!['artist_live','guitar_event'].includes(facts.kind)||facts.eventType==='interview')return null;
 if(!facts.endDate&&!facts.eventDate)return null;
 const at=saleEndsAt(facts.endDate||facts.eventDate);return Number.isFinite(at)?at:NaN;
}
