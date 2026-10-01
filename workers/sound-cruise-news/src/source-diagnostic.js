// One-use operator diagnostics. Fixed Sleepfreaks robots only, no collection restart.
import {boundedFetch,hash,robotsPolicy,BOT} from './policy.js';
export const DIAGNOSTIC_HEADERS=Object.freeze(['server','cf-mitigated','retry-after','content-type','x-robots-tag','cf-ray','x-sucuri-id','x-sucuri-block','x-firewall-rule']);
export async function robotsDiagnostic(source,{fetcher=fetch,now=Date.now()}={}){
 if(source.id!=='sleepfreaks'||source.robotsUrl!=='https://sleepfreaks-dtm.com/robots.txt'||source.discoveryUrl!=='https://sleepfreaks-dtm.com/feed/')throw Error('diagnostic_surface_invalid');
 const output={at:new Date(now).toISOString(),sourceId:source.id,status:null,headers:{},hash:null,robotsAllowed:false,robotsMatchesReviewed:false,challenge:false,reason:'network_error'};
 try{
  const reply=await boundedFetch(source.robotsUrl,{fetcher,maxBytes:512000});output.status=reply.status;
  output.headers=Object.fromEntries(DIAGNOSTIC_HEADERS.filter(k=>reply.headers.has(k)).map(k=>[k,reply.headers.get(k).slice(0,160)]));
  output.challenge=!!reply.headers.get('cf-mitigated');
  if(reply.status!==200){output.reason=reply.status===403?'http_403':reply.status===429?'rate_limited':reply.status===451?'http_451':'http_unavailable';return output;}
  output.hash=await hash(reply.text);output.robotsMatchesReviewed=output.hash===source.robotsHash;
  const policy=robotsPolicy(reply.text,source);reply.text='';output.robotsAllowed=policy.isAllowed(source.discoveryUrl,BOT)===true;
  output.reason=output.challenge?'unexpected_challenge':!output.robotsAllowed?'robots_disallow':!output.robotsMatchesReviewed?'robots_changed':'robots_clear';return output;
 }catch(error){output.reason=['redirect_blocked','response_too_large','robots_unparseable','robots_unavailable'].includes(error.message)?error.message:'network_error';return output;}
}
export function compareRobotsDiagnostics(worker,terminal){
 const clear=r=>r?.status===200&&r.reason==='robots_clear'&&r.robotsAllowed===true&&r.robotsMatchesReviewed===true&&!r.challenge;
 if(worker?.status===403&&clear(terminal))return {classification:'worker_network_block_likely',collectionStopped:true,feedValidationAllowed:false};
 if(worker?.status===403&&terminal?.status===403)return {classification:'publisher_access_change_possible',collectionStopped:true,feedValidationAllowed:false};
 if(clear(worker)&&clear(terminal)&&worker.hash===terminal.hash)return {classification:'temporary_failure_possible',collectionStopped:true,feedValidationAllowed:true};
 return {classification:'unresolved_access_or_policy',collectionStopped:true,feedValidationAllowed:false};
}
