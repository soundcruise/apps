import {humanReadyCases} from './fixtures/human-ready-november.js';
import {SOURCES} from '../src/registry.js';import {hash} from '../src/policy.js';import {fingerprint} from '../src/fingerprint.js';
// Isolated UI acceptance only: binds localhost, in-memory DB, fixture identity.
// Not an Access bypass endpoint, production Worker/config or publisher client.
import {createServer} from 'node:http';import {readFile} from 'node:fs/promises';
import {SignJWT,generateKeyPair,exportJWK,createLocalJWKSet} from 'jose';
import {store,pepper} from './helpers.js';import {handleOperatorRequest} from '../src/operator-worker.js';
const now=Date.parse(process.env.NEWS_ACCEPTANCE_CANDIDATES==='true'?'2026-11-16T10:00:00+09:00':'2026-10-28T19:00:00+09:00'),s=await store(),origin='https://isolated-operator.test',issuer='https://isolated.cloudflareaccess.com',aud='a'.repeat(64);
await s.db.prepare('UPDATE news_controls SET publication_enabled=1').run();await s.db.prepare("INSERT INTO source_state(source_id,disabled) VALUES('yamaha',1)").run();
if(process.env.NEWS_ACCEPTANCE_CANDIDATES==='true')for(const f of humanReadyCases){const id=await hash(f.url);await s.recordHealth({sourceId:f.source,status:'healthy',reasonCode:'ok',checkedAt:now,successfulAt:now});await s.put({id,sourceId:f.source,sourceName:SOURCES.find(x=>x.id===f.source).name,sourceUrl:f.url,normalizedUrl:f.url,publishedAt:f.date,category:'media_other',label:'審査待ち（対象確認が必要）',topicKey:id,collectedAt:new Date(now).toISOString(),titleFingerprint:JSON.stringify(await fingerprint('合成した発見見出し',pepper)),productFacts:null,eventType:'other',publicationDecision:'PUBLISH_REVIEW',decisionReason:'collection_human_review',reviewReason:'structured_review_required'});}
if(process.env.NEWS_ACCEPTANCE_REVIEW_SNAPSHOT){
 const snapshot=JSON.parse(await readFile(process.env.NEWS_ACCEPTANCE_REVIEW_SNAPSHOT,'utf8'));
 // Load historical rows without replaying transitions; restore every trigger before serving.
 const triggers=s.db.raw.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger'").all();
 for(const t of triggers)s.db.raw.exec('DROP TRIGGER "'+t.name.replaceAll('"','""')+'"');
 for(const [table,rows] of [...Object.entries(snapshot.tables),['source_state',snapshot.sources[0].results],['source_health',snapshot.sources[1].results]]){
  s.db.raw.exec('DELETE FROM '+table);
  for(const row of rows){const keys=Object.keys(row);s.db.raw.prepare('INSERT INTO '+table+' ('+keys.join(',')+') VALUES ('+keys.map(()=>'?').join(',')+')').run(...keys.map(k=>row[k]));}
 }
 for(const t of triggers)s.db.raw.exec(t.sql);
}
const {privateKey,publicKey}=await generateKeyPair('RS256'),jwks=createLocalJWKSet({keys:[{...await exportJWK(publicKey),kid:'local-fixture'}]});
const token=await new SignJWT({email:'human@fixture.test',type:'app'}).setProtectedHeader({alg:'RS256',kid:'local-fixture'}).setIssuer(issuer).setAudience(aud).setSubject('local-human-fixture').setIssuedAt(now/1000).setExpirationTime(now/1000+3600).sign(privateKey);
const env={NEWS_SOURCE_IDS:JSON.stringify(process.env.NEWS_ACCEPTANCE_CANDIDATES==='true'?['agm','shimamura']:[]),NEWS_DB:s.db,NEWS_HEADLINE_PEPPER:pepper,NEWS_OPERATOR_EMAILS:'["human@fixture.test"]',NEWS_OPERATOR_ORIGIN:origin,NEWS_ACCESS_ISSUER:issuer,NEWS_ACCESS_AUD:aud,NEWS_WEB_ENABLED:process.env.NEWS_ACCEPTANCE_REVIEW_SNAPSHOT?'true':'false',NEWS_WEB_MANUAL_ENABLED:'false',OPERATOR_ASSETS:{fetch:async r=>{const p=new URL(r.url).pathname,name=p==='/'?'index.html':p.slice(1);return new Response(await readFile(new URL('../operator-ui/'+name,import.meta.url)),{headers:{'Content-Type':name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html'}});}}};
let externalAttempts=0;globalThis.fetch=async()=>{externalAttempts++;throw Error('External HTTP forbidden in isolated acceptance');};
createServer(async(req,res)=>{try{let body='';for await(const c of req){body+=c;if(body.length>10000)throw Error('too_large');}const h=new Headers({'Cf-Access-Jwt-Assertion':token});for(const k of ['content-type','x-news-csrf','sec-fetch-site'])if(req.headers[k])h.set(k,req.headers[k]);if(req.headers.origin)h.set('Origin',origin);const response=await handleOperatorRequest(new Request(origin+req.url,{method:req.method,headers:h,...(body?{body}: {})}),env,now,{jwks});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch{res.writeHead(500);res.end('isolated fixture failed');}}).listen(8799,'127.0.0.1',()=>console.log('Isolated Operator fixture http://127.0.0.1:8799; external HTTP blocked; test DB only'));
process.on('SIGINT',()=>{console.log('External HTTP attempts:',externalAttempts);process.exit();});
