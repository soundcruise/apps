// Cloudflare scheduledTime is UTC; all daily discovery/recovery uses 06:00 JST.
export const COLLECTION_CRON='0 21 * * *';
export const jstCollectionDay=at=>new Date(at+9*3600000).toISOString().slice(0,10);
export function nextDailyCollectionAt(now){const day=86400000,at=Math.floor(now/day)*day+21*3600000;return at>now?at:at+day;}
export function dailyCollectionAtOrAfter(at){return nextDailyCollectionAt(at-1);}
const targets={shimamura:'https://www.shimamura.co.jp/maintenance.html',agm:'https://acousticguitarmagazine.jp/'};
export const reviewedMaintenanceRedirect=(source,e)=>!!e&&e.status===302&&e.sourceUrl===source.robotsUrl&&e.location===targets[source.id]&&!!targets[source.id];
// The legacy collector imposed a rolling day after each publisher attempt. Only
// that identified internal delay may be shortened; unexplained longer holds stay.
export function maintenanceRecoveryAt(state,e){
 const stoppedAt=Date.parse(e.timestamp);
 if(!Number.isFinite(stoppedAt))return Infinity;
 const legacyInternalUntil=Math.max(stoppedAt,state.lastPublisherRequestAt||0)+86400000;
 const hold=Math.max(state.nextAt||0,state.backoffUntil||0);
 return dailyCollectionAtOrAfter(Math.max(nextDailyCollectionAt(stoppedAt),e.retryAfterAt||0,hold>legacyInternalUntil?hold:0));
}
