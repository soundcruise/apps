// Synthetic native fixture ONLY. Never used by either deployable entrypoint/config.
import {createCompatibleWorkerCandidate,createIsolatedCompatibleCapability} from '../src/maintenance-compatible-worker.js';
import {createIsolatedHandoverEvidenceProvider} from '../src/maintenance-handover-evidence.js';
const limiter={async limit(){return{success:true};}};
const rates=['START_RATE_LIMITER','SYNC_RATE_LIMITER','PAIRING_ISSUE_RATE_LIMITER','PAIR_RATE_LIMITER','RECOVERY_RATE_LIMITER','ACCOUNT_QA_ENROLL_RATE_LIMITER','ACCOUNT_START_RATE_LIMITER','ACCOUNT_HANDOFF_ISSUE_RATE_LIMITER','ACCOUNT_HANDOFF_CONSUME_RATE_LIMITER','ACCOUNT_APP_JOIN_ISSUE_RATE_LIMITER','ACCOUNT_APP_JOIN_CONSUME_RATE_LIMITER','ACCOUNT_RECOVERY_RATE_LIMITER','ACCOUNT_BRIDGE_RATE_LIMITER','PRO_VERIFY_RATE_LIMITER'];
async function control(env,path,body){const r=await env.CONTROL.fetch('https://fixture.control'+path,{method:'POST',body:JSON.stringify(body||{})});if(!r.ok)throw Error('fixture_control_hold');return r.json();}
function pauseDB(db,env,pause,ack){if(!pause&&!ack)return db;const specs=new WeakMap();let lost=false;function prepare(sql,values=[]){const native=db.prepare(sql).bind(...values),s={bind(...v){return prepare(sql,v);},run:()=>native.run(),all:()=>native.all(),first:c=>native.first(c)};specs.set(s,{native,sql});return s;}return{prepare,withSession(bookmark){return pauseDB(db.withSession?db.withSession(bookmark):db,env,pause,ack);},getBookmark(){return db.getBookmark?.();},async batch(items){const xs=items.map(x=>specs.get(x));if(xs.some(x=>!x))throw Error('fixture new SQL wrapper');if(pause&&(pause.startsWith('business-')?xs.some(x=>/INSERT.*sync_records/s.test(x.sql)):pause.startsWith('claim-')?xs.some(x=>/INSERT INTO sync_authority_cleanup_claims/s.test(x.sql)):true))await control(env,'/new-pause',{id:pause});const out=await db.batch(xs.map(x=>x.native));const recovery=xs.some(x=>x.sql.includes("SET phase='resolved'")),business=xs.some(x=>/INSERT.*sync_records/s.test(x.sql));if(!lost&&((['recovery','recovery-both'].includes(ack)&&recovery)||(ack==='business'&&business))){lost=true;await control(env,'/fixture-event',{type:'d1-commit-ack-loss',kind:recovery?'recovery':'business'});throw Error('fixture D1 commit ACK loss');}return out;}};}

export default {async fetch(request,env,ctx){
 const binding=pauseDB(env.SYNC_DB,env,request.headers.get('X-Fixture-Pause'),request.headers.get('X-Fixture-Ack-Loss'));
 const isolated={...env,SYNC_DB:binding,...Object.fromEntries(rates.map(n=>[n,limiter]))};
 const worker=createCompatibleWorkerCandidate({db:binding,env:isolated});
 if(new URL(request.url).pathname!=='/__invoke'||request.headers.get('X-Fixture-Only')!=='synthetic')return worker.fetch(request,ctx);
 const body=await request.json(),headers=new Headers(request.headers);headers.delete('Content-Length');headers.delete('X-Fixture-Pause');headers.delete('X-Fixture-Only');if(body.originOverride)headers.set('Origin',body.originOverride);
 const native=new Request('https://localhost'+(body.path||'/__private'),{method:body.method||'POST',headers,...(body.method==='GET'?{}:{body:JSON.stringify(body.body??body.job??{})})});
 const verifyEvidence=createIsolatedHandoverEvidenceProvider({readWindow:()=>control(env,'/window'),verifyReceipt:(kind,digest,binding)=>control(env,'/receipt',{kind,digest,binding}),verifyRestore:(backup,manifest)=>control(env,'/restore',{backup,manifest})});
 const cap=createIsolatedCompatibleCapability({fixtureOnly:true,db:binding,env:isolated,writerScope:'account-pro-writer',securityScope:'account-pro-security',scopeForAccount:(id,lane)=>lane+'-'+id,verifyEvidence,verifyService:input=>control(env,'/service',input),enableAssetJobs:body.enableAssetJobs===true,dependencies:{async verifyTurnstileToken(){return{ok:true};},async verifyProTurnstile(){return{ok:true};}}});
 try{
  const used=body.forgedCapability?{}:cap;
  if(body.kind==='http')return worker.ownerHttp(body.action||'fetch',native,used,body.options||{});
  if(body.kind==='schema')return Response.json(await worker.inspectSchema());if(body.kind==='rollback')return Response.json(await worker.assessLegacyRollback());
  if(body.kind==='scheduled')return Response.json(await worker.scheduled());
  let result;if(body.kind==='handover')result=await worker.handover(body.action,native,body.job,body.evidence,used,body.lane||'writer');
  else if(body.kind==='chord')result=await worker.chord(body.action,native,body.job,used,body.options||{});
  else if(body.kind==='retention')result=await worker.retention(body.action,native,body.job,used,body.options||{});
  else if(body.kind==='asset-cleanup')result=await worker.assetCleanup(body.action,native,body.job,used,body.options||{});
  else return new Response('fixture unknown',{status:404});if(body.kind==='asset-cleanup'&&body.action==='reconcile'&&request.headers.get('X-Fixture-Ack-Loss')==='recovery-both'){await control(env,'/fixture-event',{type:'response-ack-loss',verifiedBeforeDrop:result.status});return Response.json({code:'fixture_response_ack_lost_readback_required'},{status:503});}return Response.json(result);
 }catch(e){return Response.json({code:'fixture_action_hold',reason:String(e.message).slice(0,200)},{status:409});}
}};
