// Local fixture API only. An explicit local JWKS and synthetic origins are mandatory.
import {createHash} from 'node:crypto';
import {authenticateOperator,verifyCsrf} from '../../src/operator-auth.js';
import {validateInput} from '../engine.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
export const deliveryDigest=input=>sha(JSON.stringify(stable(input)));
const cleanString=(v,n)=>typeof v==='string'&&v.length>0&&v.length<=n&&!/[\x00-\x1f]/.test(v);
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export function createFixtureConfirmationApi({h,env,jwks,now,stage}){
 if(!h?.raw||!jwks||env?.NEWS_ACCESS_ISSUER!=='https://fixture.cloudflareaccess.com'||env?.NEWS_OPERATOR_ORIGIN!=='https://operator.fixture.test'||typeof stage?.get!=='function')throw Error('fixture_only');
 return async request=>{try{
  const identity=await authenticateOperator(request,env,now,{jwks});const url=new URL(request.url);if(url.origin!==identity.config.origin)throw Error('origin_denied');
  if(request.method!=='POST'||!['/fixture/confirm','/fixture/register'].includes(url.pathname)||url.search)return json({error:'not_found'},404);
  await verifyCsrf(request,identity,env,now);if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers.get('Content-Type')||''))return json({error:'invalid'},400);
  if(Number(request.headers.get('Content-Length'))>16384)return json({error:'invalid'},413);const reader=request.body?.getReader();if(!reader)return json({error:'invalid'},400);let bytes=0,text='';const decoder=new TextDecoder();try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>16384){await reader.cancel();return json({error:'invalid'},413)}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}let b;try{b=JSON.parse(text)}catch{return json({error:'invalid'},400)}
  if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!['candidateId','expectedDigest','expectedVersion','requestId','human','observations','policy','outcome'].includes(k))||!/^[A-Za-z0-9_-]{1,128}$/.test(b.candidateId||'')||!/^[a-f0-9]{64}$/.test(b.expectedDigest||'')||!cleanString(b.expectedVersion,128)||!/^[A-Za-z0-9_-]{16,100}$/.test(b.requestId||''))return json({error:'invalid'},400);
  const record=await stage.get(b.candidateId);const checked=validateInput(record?.input);if(!checked.valid||checked.data.candidate.candidate_id!==b.candidateId)return json({error:'stage_unavailable'},503);const digest=deliveryDigest(checked.data);if(digest!==b.expectedDigest||record.version!==b.expectedVersion)return json({error:'candidate_changed'},409);
  if(url.pathname==='/fixture/confirm'){
   if(!b.human||typeof b.human!=='object'||Array.isArray(b.human)||!Array.isArray(b.observations)||!b.observations.length||b.observations.length>32||b.observations.some(o=>!o||Object.keys(o).some(k=>!['field','sourceId','locator'].includes(k))||!cleanString(o.field,80)||!cleanString(o.sourceId,128)||!cleanString(o.locator,300))||!b.policy||typeof b.policy!=='object'||Array.isArray(b.policy)||Object.keys(b.policy).sort().join(',')!=='acquisition,images,quotation,reproduction'||Object.values(b.policy).some(v=>!['unknown','not_permitted','human_checked'].includes(v))||!['confirmed','needs_confirmation'].includes(b.outcome)||b.observations.some(o=>!checked.data.candidate.sources.some(source=>source.source_id===o.sourceId))||(b.outcome==='confirmed'&&['source','identity','product_type','event','published_at','usage'].some(field=>!b.observations.some(o=>o.field===field))))return json({error:'invalid'},400);
   const recordData={candidateId:b.candidateId,deliveryDigest:digest,deliveryVersion:record.version,actor:identity.actor.id,human:b.human,observations:b.observations,policy:b.policy,outcome:b.outcome};const ph=sha(JSON.stringify(stable(recordData)));
   h.raw.prepare('INSERT OR IGNORE INTO dot_fixture_confirmations VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(b.requestId,ph,b.candidateId,digest,record.version,identity.actor.id,now,JSON.stringify(b.human),JSON.stringify(b.observations),JSON.stringify(b.policy),b.outcome);
   const existing=h.raw.prepare('SELECT * FROM dot_fixture_confirmations WHERE request_id=?').get(b.requestId);if(existing.payload_hash!==ph)return json({error:'conflict'},409);return json({status:'recorded',requestId:b.requestId});
  }
  const evidence=h.raw.prepare('SELECT * FROM dot_fixture_confirmations WHERE request_id=?').get(b.requestId);if(!evidence||evidence.actor_id!==identity.actor.id||evidence.delivery_digest!==digest||evidence.delivery_version!==record.version||evidence.outcome!=='confirmed')return json({error:'confirmation_required'},409);
  const policy=JSON.parse(evidence.policy_json);if(policy.acquisition!=='human_checked'||Object.values(policy).some(x=>x==='unknown'))return json({status:'needs_confirmation',reasons:['source_policy_unconfirmed']});
  // Fixture-only: the saved human observation feeds the existing Yamaha path.
  // Policy self-report is not treated as a new NEWS source permission.
  return json(await h.ingest(record,JSON.parse(evidence.human_json)));
 }catch(e){return json({error:['authentication_required','authentication_invalid','operator_denied','origin_denied','csrf_invalid'].includes(e.message)?e.message:'fixture_unavailable'},['authentication_required','authentication_invalid'].includes(e.message)?401:['operator_denied','origin_denied','csrf_invalid'].includes(e.message)?403:503);}};
}
