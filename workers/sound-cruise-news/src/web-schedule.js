// Finite dates on the existing Workers Cron, not a second scheduler or DB.
export const WEB_DISCOVERY_CRON='30 23 * * *'; // 08:30 JST; separate from 06:00 collection.
export const SCHEDULED_WEB_MODEL='@cf/google/gemma-4-26b-a4b-it';
export const WEB_RUN_WINDOW=15*60*1000;
export function scheduledWebPermit(env,scheduledAt,now){
 const deny=reason=>({effective:false,reason});
 if(env.NEWS_WEB_ENABLED!=='true')return deny('web_schedule_off');
 let p;try{if(typeof env.NEWS_WEB_SCHEDULE!=='string'||env.NEWS_WEB_SCHEDULE.length>512)throw Error();p=JSON.parse(env.NEWS_WEB_SCHEDULE);}catch{return deny('web_schedule_required');}
 if(!p||Array.isArray(p)||Object.keys(p).length!==1||!Array.isArray(p.starts)||!p.starts.length||p.starts.length>3)return deny('web_schedule_invalid');
 const starts=p.starts.map(x=>typeof x==='string'?Date.parse(x):NaN);
 if(starts.some((x,i)=>!Number.isSafeInteger(x)||new Date(x).toISOString()!==p.starts[i]||new Date(x).toISOString().slice(11)!=='23:30:00.000Z'||i&&x<=starts[i-1])||new Set(starts.map(x=>new Date(x).toISOString().slice(0,10))).size!==starts.length||starts.at(-1)-starts[0]>=7*86400000)return deny('web_schedule_invalid');
 if(env.NEWS_WEB_MODEL!==SCHEDULED_WEB_MODEL)return deny('web_schedule_model_mismatch');
 // Production ScheduledController includes seconds/milliseconds (observed +41.397s).
 // Match only the configured Cron minute; keep the deadline anchored to the plan,
 // never to delivery time, so this cannot catch up an old slot or extend its TTL.
 if(!Number.isSafeInteger(scheduledAt)||!Number.isSafeInteger(now))return deny('web_schedule_not_planned');
 const plannedAt=Math.floor(scheduledAt/60000)*60000;
 if(!starts.includes(plannedAt))return deny('web_schedule_not_planned');
 if(now<scheduledAt||now>=plannedAt+WEB_RUN_WINDOW)return deny('web_schedule_window_closed');
 return {effective:true,reason:'available',expiresAt:plannedAt+WEB_RUN_WINDOW,days:starts.map(x=>new Date(x).toISOString().slice(0,10)),maxSearches:3,maxAiCalls:5};
}
