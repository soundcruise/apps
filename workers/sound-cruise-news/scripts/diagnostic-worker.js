// Temporary deployment in the production NEWS account. No Cron, candidate writes,
// source enable or public admin on the NEWS Worker. Delete this deployment after use.
import {getSource,evidenceGate} from '../src/registry.js';
import {robotsDiagnostic} from '../src/source-diagnostic.js';
import {hash} from '../src/policy.js';
export async function diagnosticRequest(request,env,now=Date.now(),fetcher=fetch){
 const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 if(request.method!=='POST'||new URL(request.url).pathname!=='/robots-check')return reply({error:'not_found'},404);
 const token=request.headers.get('Authorization')?.replace(/^Bearer /,'');
 if(!env.DIAGNOSTIC_TOKEN||!token)return reply({error:'unauthorized'},401);
 const a=await hash(token),b=await hash(env.DIAGNOSTIC_TOKEN);let different=0;for(let i=0;i<a.length;i++)different|=a.charCodeAt(i)^b.charCodeAt(i);if(different)return reply({error:'unauthorized'},401);
 if(!/^existing-source-robots-[a-f0-9-]{36}$/.test(env.DIAGNOSTIC_RUN_ID||'')||!Number.isFinite(Number(env.DIAGNOSTIC_EXPIRES_AT))||now>=Number(env.DIAGNOSTIC_EXPIRES_AT))return reply({error:'diagnostic_expired'},410);
 const source=getSource('sleepfreaks');if(evidenceGate(source,now))return reply({error:'policy_gate'},409);
 const state=await env.NEWS_DB.prepare("SELECT disabled,publication_blocked,takedown FROM source_state WHERE source_id='sleepfreaks'").first();
 if(!state||state.disabled!==1||state.publication_blocked!==0||state.takedown!==0)return reply({error:'diagnostic_state_changed'},409);
 // Consume permission BEFORE network. A failed/ambiguous response never permits retry.
 const consumed=await env.NEWS_DB.prepare('INSERT OR IGNORE INTO news_admin_audit VALUES(?,?,?,?,?)').bind(env.DIAGNOSTIC_RUN_ID,'source-robots-diagnostic-attempt','sleepfreaks',now,'quality_review').run();
 if(Number(consumed.meta.changes)!==1)return reply({error:'diagnostic_already_used'},409);
 const result=await robotsDiagnostic(source,{fetcher,now});
 await env.NEWS_DB.prepare('INSERT INTO news_admin_audit VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),'source-robots-diagnostic-result','sleepfreaks',Date.now(),result.reason).run();return reply(result);
}
export default {fetch:(request,env)=>diagnosticRequest(request,env)};
