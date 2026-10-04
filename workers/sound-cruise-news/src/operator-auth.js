import {createRemoteJWKSet,jwtVerify} from 'jose';
import {hash} from './policy.js';
export function operatorConfig(env){
 let operators;try{operators=JSON.parse(env.NEWS_OPERATOR_EMAILS||'[]');}catch{}
 if(!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.NEWS_ACCESS_ISSUER||'')||!/^[a-f0-9]{64}$/.test(env.NEWS_ACCESS_AUD||'')||!Array.isArray(operators)||!operators.length||operators.some(x=>typeof x!=='string'||!/^[-\w.+]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(x))||typeof env.NEWS_HEADLINE_PEPPER!=='string'||env.NEWS_HEADLINE_PEPPER.length<32)throw Error('operator_not_configured');
 let origin;try{origin=new URL(env.NEWS_OPERATOR_ORIGIN);if(origin.protocol!=='https:'||origin.origin!==env.NEWS_OPERATOR_ORIGIN)throw Error();}catch{throw Error('operator_not_configured');}
 return {issuer:env.NEWS_ACCESS_ISSUER,audience:env.NEWS_ACCESS_AUD,operators:operators.map(x=>x.toLowerCase()),origin:origin.origin};
}
export async function authenticateOperator(request,env,now=Date.now(),{jwks}={}){
 const config=operatorConfig(env),token=request.headers.get('Cf-Access-Jwt-Assertion');
 if(!token||token.length>16000)throw Error('authentication_required');
 let claims;try{const {payload}=await jwtVerify(token,jwks||createRemoteJWKSet(new URL(config.issuer+'/cdn-cgi/access/certs')),{issuer:config.issuer,audience:config.audience,algorithms:['RS256'],requiredClaims:['exp','iat','sub','email','type'],currentDate:new Date(now),maxTokenAge:'168h'});claims=payload;}catch{throw Error('authentication_invalid');}
 if(claims.type!=='app'||typeof claims.email!=='string'||typeof claims.sub!=='string'||claims.sub.length>128||!/^[a-zA-Z0-9_-]+$/.test(claims.sub)||!config.operators.includes(claims.email.toLowerCase()))throw Error('operator_denied');
 // Only a verified human Access identity is attributed as human; CLI cannot name its own actor.
 return {config,actor:{type:'human_operator',id:'access:'+claims.sub},email:claims.email,session:await hash(token)};
}
const encoder=new TextEncoder();
async function csrfKey(secret){return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
const toHex=bytes=>[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
const csrfMessage=(session,expiry)=>encoder.encode('news-operator-csrf-v1:'+session+':'+expiry);
export async function csrfToken(identity,env,now){const expiry=now+30*60000;return expiry+'.'+toHex(await crypto.subtle.sign('HMAC',await csrfKey(env.NEWS_HEADLINE_PEPPER),csrfMessage(identity.session,expiry)));}
export async function verifyCsrf(request,identity,env,now){
 if(request.headers.get('Origin')!==identity.config.origin||request.headers.get('Sec-Fetch-Site')&&request.headers.get('Sec-Fetch-Site')!=='same-origin')throw Error('origin_denied');
 const token=request.headers.get('X-News-CSRF')||'',match=/^(\d{13})\.([a-f0-9]{64})$/.exec(token),expiry=match?Number(match[1]):0;
 if(!match||expiry<=now||expiry>now+30*60000||!await crypto.subtle.verify('HMAC',await csrfKey(env.NEWS_HEADLINE_PEPPER),Uint8Array.from(match[2].match(/../g),x=>parseInt(x,16)),csrfMessage(identity.session,expiry)))throw Error('csrf_invalid');
}
