import test from 'node:test';import assert from 'node:assert/strict';
import {decideAssisted,FINAL_CONFIRMATION} from '../src/assisted-decision.js';
import {saveAssisted} from '../src/assisted-entry.js';
import {handleNewsRequest} from '../src/worker.js';
import {SOURCES} from '../src/registry.js';import {store,pepper} from './helpers.js';
const now=Date.parse('2026-11-10T12:00:00Z'),actor={type:'human_operator',id:'local-final-confirmation-fixture'};
const entry={sourceId:'yamaha-newsroom',url:'https://www.yamaha.com/ja/news_release/2026/26111001/',brand:'Fixture',product:'AC-200',productType:'guitar_amp',action:'announcement',publishedAt:'2026-11-10',confirmed:true,conditionsConfirmed:true};
const input={entry,action:'approve',reason:'useful_product',requestId:'single-final-confirmation-001',confirmation:FINAL_CONFIRMATION};
const localFetch=globalThis.fetch;globalThis.fetch=async(input,...args)=>{const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);if(['127.0.0.1','localhost','[::1]'].includes(url.hostname))return localFetch(input,...args);throw Error('No external HTTP in local publication acceptance');};
async function setup(){const s=await store();await s.db.prepare('UPDATE news_controls SET publication_enabled=1').run();return s;}
const count=async(s,t)=>(await s.db.prepare('SELECT COUNT(*) n FROM '+t).first()).n;
const items=async s=>(await(await handleNewsRequest(new Request('https://local.test/v1/news'),{NEWS_DB:s.db,NEWS_API_MODE:'production'},now,{registry:SOURCES,cache:null})).json()).items;
test('one explicit final confirmation composes current facts/validation/Ledger and is replay-safe',async()=>{
 const s=await setup();assert.equal(await count(s,'candidate_items'),0);const r=await decideAssisted(s,input,now,SOURCES,pepper,actor);assert(r.completed);assert.equal(r.action,'approve');
 assert.equal(await count(s,'news_assisted_edits'),1);assert.equal(await count(s,'news_decision_ledger'),1);assert.equal((await items(s)).length,1);
 const again=await decideAssisted(s,input,now+1,SOURCES,pepper,actor);assert(again.completed&&again.replayed);assert.equal(again.decisionId,r.decisionId);assert.equal(await count(s,'candidate_items'),1);assert.equal(await count(s,'news_decision_ledger'),1);
 const audit=await s.db.prepare('SELECT * FROM news_decision_ledger').first();assert.equal(audit.actor_type,'human_operator');assert.equal(JSON.parse(audit.checks_json).factsChecked,true);
});
for(const patch of [{confirmation:undefined},{entry:{...entry,confirmed:false}},{entry:{...entry,conditionsConfirmed:false}},{entry:{...entry,publishedAt:''}},{entry:{...entry,productType:''}}])test('no implicit human confirmation: '+JSON.stringify(patch),async()=>{
 const s=await setup();try{const r=await decideAssisted(s,{...input,...patch},now,SOURCES,pepper,actor);assert.equal(r.completed,false);}catch(e){assert.match(e.message,/confirmation|required|invalid/);}assert.equal(await count(s,'candidate_items'),0);assert.equal(await count(s,'news_decision_ledger'),0);
});
test('audited pending candidate survives a failed decision, then resumes without resaving or duplicate publication',async()=>{
 const s=await setup();await s.db.prepare("CREATE TRIGGER decision_fixture_failure BEFORE INSERT ON news_decision_ledger BEGIN SELECT RAISE(ABORT,'fixture DB failure'); END").run();
 await assert.rejects(decideAssisted(s,input,now,SOURCES,pepper,actor),e=>e.message==='decision_transaction_failed'&&/^[a-f0-9]{64}$/.test(e.pendingCandidateId));
 assert.equal(await count(s,'candidate_items'),1);assert.equal((await s.candidates())[0].review_status,'pending');assert.equal(await count(s,'news_assisted_edits'),1);assert.equal(await count(s,'news_decision_ledger'),0);assert.equal((await items(s)).length,0);
 await s.db.prepare('DROP TRIGGER decision_fixture_failure').run();assert((await decideAssisted(s,input,now+1,SOURCES,pepper,actor)).completed);assert.equal(await count(s,'news_assisted_edits'),1);assert.equal(await count(s,'news_decision_ledger'),1);
});
test('an audit failure rolls back facts creation and does not proceed to a decision',async()=>{
 const s=await setup();await s.db.prepare("CREATE TRIGGER save_fixture_failure BEFORE INSERT ON news_assisted_edits BEGIN SELECT RAISE(ABORT,'fixture audit failure'); END").run();await assert.rejects(decideAssisted(s,input,now,SOURCES,pepper,actor));assert.equal(await count(s,'candidate_items'),0);assert.equal(await count(s,'news_decision_ledger'),0);
});
test('another actor/content change after a partial save cannot be published by replaying the old confirmation',async()=>{
 const s=await setup();await s.db.prepare("CREATE TRIGGER decision_fixture_failure BEFORE INSERT ON news_decision_ledger BEGIN SELECT RAISE(ABORT,'fixture DB failure'); END").run();await assert.rejects(decideAssisted(s,input,now,SOURCES,pepper,actor));await s.db.prepare('DROP TRIGGER decision_fixture_failure').run();
 await s.db.prepare("UPDATE candidate_items SET label='変更された別の見出し',review_revision=review_revision+1").run();await assert.rejects(decideAssisted(s,input,now+1,SOURCES,pepper,actor),/assisted_decision_changed/);assert.equal(await count(s,'news_decision_ledger'),0);
});
test('published/rejected existing candidates are never registered or decided again by a fresh draft operation',async()=>{
 for(const action of ['approve','reject']){const s=await setup();await decideAssisted(s,{...input,action,reason:action==='approve'?'useful_product':'not_relevant'},now,SOURCES,pepper,actor);const r=await decideAssisted(s,{...input,requestId:'another-final-confirmation-001'},now+1,SOURCES,pepper,actor);assert.equal(r.completed,false);assert(r.existingId);assert.equal(await count(s,'candidate_items'),1);assert.equal(await count(s,'news_assisted_edits'),1);assert.equal(await count(s,'news_decision_ledger'),1);}
});
test('rejection uses the same Ledger without public API exposure; modified retry payload cannot replace prior facts',async()=>{
 const s=await setup(),x={...input,action:'reject',reason:'not_relevant'};assert((await decideAssisted(s,x,now,SOURCES,pepper,actor)).completed);assert.equal((await items(s)).length,0);assert.equal((await s.candidates())[0].review_status,'rejected');await assert.rejects(decideAssisted(s,{...x,entry:{...entry,product:'DIFFERENT'}},now+1,SOURCES,pepper,actor),/idempotency_payload_changed/);
});
test('source prohibition and takedown remain effective after partial facts save',async()=>{
 for(const mode of ['source','takedown','duplicate']){const s=await setup(),saveId=input.requestId+'-approve-useful_product';const saved=await saveAssisted(s,{...entry,requestId:saveId},now,SOURCES,pepper,actor);
  if(mode==='source')await s.db.prepare("INSERT INTO source_state(source_id,publication_blocked) VALUES('yamaha-newsroom',1)").run();
  if(mode==='takedown')await s.db.prepare('INSERT INTO news_takedowns(item_id,expires_at) VALUES(?,?)').bind(saved.id,now+86400000).run();
  if(mode==='duplicate'){const peer=await saveAssisted(s,{...entry,url:entry.url.replace('26111001','26111002'),requestId:'fixture-other-official-notice'},now,SOURCES,pepper,actor);await s.db.prepare("UPDATE candidate_items SET review_status='approved' WHERE id=?").bind(peer.id).run();}
  await assert.rejects(decideAssisted(s,input,now+1,SOURCES,pepper,actor));assert.equal(await count(s,'news_decision_ledger'),0);
 }
});
test('parallel confirmations still create at most one audited candidate and one Ledger decision',async()=>{
 const s=await setup();await Promise.allSettled([decideAssisted(s,input,now,SOURCES,pepper,actor),decideAssisted(s,input,now,SOURCES,pepper,actor)]);assert((await decideAssisted(s,input,now+1,SOURCES,pepper,actor)).completed);assert.equal(await count(s,'candidate_items'),1);assert.equal(await count(s,'news_assisted_edits'),1);assert.equal(await count(s,'news_decision_ledger'),1);
});
test('a human decision through the existing candidate screen wins over a partial-operation retry',async()=>{
 const {operatorDecision,candidateSnapshot}=await import('../src/operator-review.js'),s=await setup();
 const saved=await saveAssisted(s,{...entry,requestId:input.requestId+'-approve-useful_product'},now,SOURCES,pepper,actor),row=(await s.candidates())[0];
 await operatorDecision(s,{id:row.id,action:'reject',reason:'not_relevant',requestId:'separate-human-reject-after-save',revision:row.review_revision,snapshot:await candidateSnapshot(row)},now,SOURCES,pepper,actor);
 const result=await decideAssisted(s,input,now+1,SOURCES,pepper,actor);assert.equal(result.completed,false);assert.equal(result.existingId,saved.id);assert.equal(result.existingStatus,'rejected');assert.equal(await count(s,'news_decision_ledger'),1);assert.equal((await items(s)).length,0);
});
test('CAS changes immediately before Ledger insertion reject the decision and retain a pending candidate',async()=>{
 const s=await setup(),prepare=s.db.prepare;let changed=false;
 s.db.prepare=sql=>{const statement=prepare(sql);if(!sql.startsWith('INSERT INTO news_decision_ledger'))return statement;const wrap=stmt=>({...stmt,bind:(...args)=>wrap(stmt.bind(...args)),run:async()=>{if(!changed){changed=true;await prepare('UPDATE candidate_items SET review_revision=review_revision+1').run();}return stmt.run();}});return wrap(statement);};
 await assert.rejects(decideAssisted(s,input,now,SOURCES,pepper,actor),/stale_decision|candidate_changed/);assert(changed);assert.equal(await count(s,'news_decision_ledger'),0);assert.equal((await s.candidates())[0].review_status,'pending');
});
test('authenticated/CSRF endpoint and existing-record lookup do not allow an unconfirmed publication',async()=>{
 const {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT}=await import('jose'),{handleOperatorRequest}=await import('../src/operator-worker.js');
 const {privateKey,publicKey}=await generateKeyPair('RS256'),jwks=createLocalJWKSet({keys:[{...await exportJWK(publicKey),kid:'final-route-fixture'}]}),origin='https://one-final.test',issuer='https://one-final.cloudflareaccess.com',aud='a'.repeat(64);
 const token=await new SignJWT({email:'fixture@one-final.test',type:'app'}).setProtectedHeader({alg:'RS256',kid:'final-route-fixture'}).setIssuer(issuer).setAudience(aud).setSubject('one-final-fixture').setIssuedAt(now/1000).setExpirationTime(now/1000+3600).sign(privateKey);
 const s=await setup(),env={NEWS_DB:s.db,NEWS_HEADLINE_PEPPER:pepper,NEWS_OPERATOR_EMAILS:'["fixture@one-final.test"]',NEWS_OPERATOR_ORIGIN:origin,NEWS_ACCESS_ISSUER:issuer,NEWS_ACCESS_AUD:aud};
 const call=(path,body,csrf,authenticated=true)=>handleOperatorRequest(new Request(origin+path,{method:body?'POST':'GET',headers:{...(authenticated?{'Cf-Access-Jwt-Assertion':token}:{}),...(body?{'Origin':origin,'Content-Type':'application/json',...(csrf?{'X-News-CSRF':csrf}:{})}:{})},...(body?{body:JSON.stringify(body)}:{})}),env,now,{jwks});
 assert.equal((await call('/api/assisted-decision',input,null,false)).status,401);assert.equal((await call('/api/assisted-decision',input)).status,403);
 const csrf=(await(await call('/api/session')).json()).csrf;assert.equal((await call('/api/assisted-decision',{...input,confirmation:null},csrf)).status,422);assert.equal(await count(s,'candidate_items'),0);
 assert((await(await call('/api/assisted-decision',input,csrf)).json()).completed);const before=await count(s,'news_decision_ledger'),config=await(await call('/api/assisted?hintUrl='+encodeURIComponent(entry.url))).json();assert.equal(config.existing.status,'approved');assert.equal(config.existing.validation.valid,true);assert.equal(await count(s,'news_decision_ledger'),before);
});
test('real local workerd/D1: facts audit and Ledger compose safely, failed decision resumes once',async()=>{
 const {mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{localDatabase}=await import('../scripts/local-db.mjs');
 const dir=await mkdtemp(join(tmpdir(),'news-single-confirmation-'));let runtime;
 try{runtime=await localDatabase(dir);const s=await store(runtime.db);await s.db.prepare('UPDATE news_controls SET publication_enabled=1').run();await s.db.prepare("CREATE TRIGGER failed_local_decision BEFORE INSERT ON news_decision_ledger BEGIN SELECT RAISE(ABORT,'fixture local failure'); END").run();
  await assert.rejects(decideAssisted(s,input,now,SOURCES,pepper,actor),/decision_transaction_failed/);assert.equal((await s.candidates())[0].review_status,'pending');assert.equal(await count(s,'news_decision_ledger'),0);
  await s.db.prepare('DROP TRIGGER failed_local_decision').run();assert((await decideAssisted(s,input,now+1,SOURCES,pepper,actor)).completed);assert((await decideAssisted(s,input,now+2,SOURCES,pepper,actor)).replayed);assert.equal(await count(s,'news_assisted_edits'),1);assert.equal(await count(s,'news_decision_ledger'),1);
 }finally{await runtime?.mf.dispose();await rm(dir,{recursive:true,force:true});}
});
