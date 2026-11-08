// A configuration-scoped, short-lived authorization, not a new scheduler.
// Consumption is durable in the existing UTC-day manual_started latch.
export const MAX_MANUAL_TTL_MS=15*60*1000;
export function manualPermit(env,now){
 const base={effective:false,flagsEnabled:env.NEWS_WEB_ENABLED==='true'&&env.NEWS_WEB_MANUAL_ENABLED==='true'};
 const deny=(reason,extra={})=>({...base,reason,...extra});
 if(!base.flagsEnabled)return deny('operator_web_flags_off');
 let p;try{if(typeof env.NEWS_WEB_MANUAL_PERMIT!=='string'||env.NEWS_WEB_MANUAL_PERMIT.length>1024)throw Error();p=JSON.parse(env.NEWS_WEB_MANUAL_PERMIT);}catch{return deny('operator_web_permit_required');}
 const keys=['issuedAt','expiresAt','maxSearches','maxAiCalls','model'];
 if(!p||Array.isArray(p)||Object.keys(p).length!==keys.length||keys.some(k=>!Object.hasOwn(p,k)))return deny('operator_web_permit_invalid');
 const issued=Date.parse(p.issuedAt),expires=Date.parse(p.expiresAt);
 if(typeof p.issuedAt!=='string'||typeof p.expiresAt!=='string'||!Number.isSafeInteger(issued)||!Number.isSafeInteger(expires)||new Date(issued).toISOString()!==p.issuedAt||new Date(expires).toISOString()!==p.expiresAt||expires<=issued||expires-issued>MAX_MANUAL_TTL_MS||!Number.isInteger(p.maxSearches)||p.maxSearches<0||p.maxSearches>3||!Number.isInteger(p.maxAiCalls)||p.maxAiCalls<0||p.maxAiCalls>5||p.maxSearches+p.maxAiCalls===0||typeof p.model!=='string'||p.model.length>120||!/^@cf\/[a-z0-9/_.-]+$/.test(p.model))return deny('operator_web_permit_invalid');
 const details={day:new Date(issued).toISOString().slice(0,10),expiresAt:new Date(expires).toISOString(),maxSearches:p.maxSearches,maxAiCalls:p.maxAiCalls};
 if(!Number.isSafeInteger(now)||now<issued)return deny('operator_web_permit_not_started',details);
 if(now>=expires)return deny('operator_web_permit_expired',details);
 if(new Date(now).toISOString().slice(0,10)!==details.day)return deny('operator_web_utc_day_changed',details);
 if(env.NEWS_WEB_MODEL!==p.model)return deny('operator_web_model_changed',details);
 return {...base,...details,effective:true,reason:'available'};
}
export async function manualAvailability(db,env,now){
 const permit=manualPermit(env,now);if(!permit.effective)return permit;
 const row=await db.prepare('SELECT manual_started,searches,ai_calls,lock_until FROM news_web_runs WHERE day=?').bind(permit.day).first();
 if(row&&(row.manual_started||row.searches||row.ai_calls))return {...permit,effective:false,reason:'operator_web_permit_spent'};
 if((await db.prepare('SELECT 1 FROM news_web_runs WHERE lock_until>? LIMIT 1').bind(now).first()))return {...permit,effective:false,reason:'operator_web_busy'};
 return permit;
}
