import {createRemoteJWKSet, jwtVerify} from 'jose';

// The Cloud Run service independently verifies the human Access assertion.
export function createCloudRunReadApi({reader, issuer, audience, operators, jwks, now=()=>Date.now()}) {
 if(!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer||'') || !/^[a-f0-9]{64}$/.test(audience||'') || !Array.isArray(operators) || !operators.length || operators.some(x=>typeof x!=='string'||!/^[-\w.+]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(x)) || !reader?.list || !reader?.detail) throw Error('invalid_config');
 const permitted=new Set(operators.map(x=>x.toLowerCase()));
 const keySet=jwks||createRemoteJWKSet(new URL(issuer+'/cdn-cgi/access/certs'));
 const json=(body,status)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 return async function(request){
  if(request.method!=='GET')return json({error:'method_not_allowed'},405);
  const token=request.headers.get('Cf-Access-Jwt-Assertion');
  if(!token||token.length>16000)return json({error:'unauthorized'},401);
  let payload;try{({payload}=await jwtVerify(token,keySet,{issuer,audience,algorithms:['RS256'],requiredClaims:['exp','iat','sub','email','type'],maxTokenAge:'168h',currentDate:new Date(now())}));}catch{return json({error:'unauthorized'},401);}
  if(payload.type!=='app'||typeof payload.sub!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(payload.sub)||typeof payload.email!=='string'||!permitted.has(payload.email.toLowerCase()))return json({error:'forbidden'},403);
  const url=new URL(request.url),keys=[...url.searchParams.keys()];let result;
  try{
   if(url.pathname==='/v1/dot-candidates'){
    if(keys.some(k=>!['limit','cursor'].includes(k))||new Set(keys).size!==keys.length) return json({error:'invalid_query'},400);
    const limit=url.searchParams.get('limit')||'10',cursor=url.searchParams.get('cursor');
    if(!/^(?:[1-9]|1[0-9]|20)$/.test(limit)||(cursor!==null&&!/^[a-f0-9]{64}$/.test(cursor)))return json({error:'invalid_query'},400);
    result=await reader.list({limit:Number(limit),cursor});
    if(!Array.isArray(result?.items)||result.items.length>Number(limit)||result.items.some(x=>x.validation?.ready!==false||x.validation?.formalFacts!==false))throw Error();
   }else if(/^\/v1\/dot-candidates\/[A-Za-z0-9_-]{1,128}$/.test(url.pathname)&&!url.search){
    result=await reader.detail(url.pathname.split('/').at(-1));if(!result)return json({error:'not_found'},404);
    if(result.validation?.ready!==false||result.validation?.formalFacts!==false)throw Error();
   }else return json({error:'not_found'},404);
   if(new TextEncoder().encode(JSON.stringify(result)).length>65536)throw Error();
   return json(result,200);
  }catch{return json({error:'reader_unavailable'},503);}
 };
}
