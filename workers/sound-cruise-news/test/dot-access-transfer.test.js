import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT} from 'jose';
import {handleOperatorRequest} from '../src/operator-worker.js';
import {createCloudRunReadApi} from '../dot-phase1/phase4a/cloudrun-api.mjs';
import {pepper} from './helpers.js';

const origin='https://operator.fixture.test',issuer='https://fixture-team.cloudflareaccess.com',aud='a'.repeat(64),now=Date.parse('2026-10-30T00:00:00Z'),sec=now/1000;
const {publicKey,privateKey}=await generateKeyPair('RS256'),other=await generateKeyPair('RS256');
const jwks=createLocalJWKSet({keys:[{...await exportJWK(publicKey),kid:'fixture'}]});
const env={NEWS_DB:{},NEWS_HEADLINE_PEPPER:pepper,NEWS_OPERATOR_ORIGIN:origin,NEWS_ACCESS_ISSUER:issuer,NEWS_ACCESS_AUD:aud,NEWS_OPERATOR_EMAILS:'["human@fixture.test"]',NEWS_SOURCE_IDS:'["shimamura"]',NEWS_DOT_REVIEW_ENABLED:'true',NEWS_DOT_REVIEW_ORIGIN:'https://news-dot-review-isolation-607890849010.asia-northeast1.run.app'};
async function token({email='human@fixture.test',audience=aud,issuerValue=issuer,expiry=sec+60,nbf=sec-1,key=privateKey,type='app'}={}) {return new SignJWT({email,type,nbf}).setProtectedHeader({alg:'RS256',kid:'fixture'}).setIssuer(issuerValue).setAudience(audience).setSubject('fixture-human').setIssuedAt(sec).setExpirationTime(expiry).sign(key);}
const request=(jwt,headers={})=>new Request(origin+'/api/dot-candidates?limit=1',{headers:{...(jwt?{'Cf-Access-Jwt-Assertion':jwt}:{}),...headers}});
test('configured Worker forwards only validated app assertion to independently authenticated read API',async()=>{
 let calls=0,readCalls=0,captured;const reader={list:async()=>{readCalls++;return {items:[{id:'fictional-moon-guitar-m1-001',validation:{ready:false,formalFacts:false}}],historyComplete:false}},detail:async()=>null};
 const api=createCloudRunReadApi({reader,issuer,audience:aud,operators:['human@fixture.test'],jwks,now:()=>now});const previous=globalThis.fetch;
 globalThis.fetch=async(url,init)=>{calls++;captured={url,init};return api(new Request(url,init))};
 try{
  const valid=await token(),response=await handleOperatorRequest(request(valid,{Cookie:'private=must-not-forward','Authorization':'Bearer must-not-forward'}),env,now,{jwks});assert.equal(response.status,200);const body=await response.json();assert.equal(body.historyComplete,false);assert.equal(body.items[0].validation.ready,false);assert.equal(readCalls,1);assert.equal(calls,1);
  assert.equal(captured.url,env.NEWS_DOT_REVIEW_ORIGIN+'/v1/dot-candidates?limit=1');assert.deepEqual(Object.keys(captured.init.headers).sort(),['Accept','Cf-Access-Jwt-Assertion']);assert.equal(captured.init.headers['Cf-Access-Jwt-Assertion'],valid);assert.equal(captured.init.redirect,'error');
  const rejected=[null,await token({key:other.privateKey}),await token({audience:'b'.repeat(64)}),await token({issuerValue:'https://evil.cloudflareaccess.com'}),await token({email:'other@fixture.test'}),await token({expiry:sec-1}),await token({nbf:sec+60}),await token({type:'org'})];
  for(const bad of rejected){const r=await handleOperatorRequest(request(bad),env,now,{jwks});assert.ok([401,403].includes(r.status));}assert.equal(calls,1);assert.equal(readCalls,1);
  const cross=await handleOperatorRequest(request(valid,{Origin:'https://evil.test'}),env,now,{jwks});assert.equal(cross.status,403);assert.equal(calls,1);
  const denyApi=createCloudRunReadApi({reader,issuer,audience:aud,operators:['different@fixture.test'],jwks,now:()=>now});globalThis.fetch=async(url,init)=>denyApi(new Request(url,init));const denied=await handleOperatorRequest(request(valid),env,now,{jwks});assert.equal(denied.status,503);assert.doesNotMatch(await denied.text(),/fixture-human|human@fixture|eyJ/);assert.equal(readCalls,1);
 }finally{globalThis.fetch=previous;}
});
