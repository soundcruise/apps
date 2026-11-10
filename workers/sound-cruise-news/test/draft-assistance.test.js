import test from 'node:test';import assert from 'node:assert/strict';
import {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT} from 'jose';
import {draftDate,assistedDraftWithInformation} from '../src/draft-assistance.js';
import {webArticleDraft,saveHint,savedWebDraft} from '../src/web-discovery.js';
import {prepareAssisted,saveAssisted} from '../src/assisted-entry.js';
import {handleOperatorRequest} from '../src/operator-worker.js';
import {operatorDecision,candidateSnapshot} from '../src/operator-review.js';
import {handleNewsRequest} from '../src/worker.js';
import {assessAutomatic} from '../src/automatic.js';
import {SOURCES} from '../src/registry.js';import {store,pepper} from './helpers.js';
// Captured estimate shape + conversation-provided facts, not a new production proof.
const now=Date.parse('2026-11-10T08:00:00Z'),url='https://www.yamaha.com/ja/news_release/2026/26110601/';
const estimate={category:'amp',brand:'ヤマハ',product:'Acompass 60',event:'新製品発売',value:'high',priority:'medium',relevance:'high',duplicate:'unknown',reason:'公開日要確認'};
const hint={url,title:'Acompass 60 ニュース',estimate_json:JSON.stringify(estimate)};
const information={version:1,url,source:{label:'運営者提供の確認用情報（未確認）',url},fields:{brand:'ヤマハ',product:'Acompass 60',productType:'guitar_amp',action:'announcement',publishedAt:'2026-11-06'},notes:[{label:'発売予定',value:'2026年12月上旬'},{label:'定格出力',value:'60W'}]};
const actor={type:'human_operator',id:'isolated-fixture-confirmation'};
let externalCalls=0;globalThis.fetch=async()=>{externalCalls++;throw Error('no external HTTP in draft acceptance');};
async function setup(){const s=await store();await s.db.prepare('UPDATE news_controls SET publication_enabled=1').run();await saveHint(s.db,{url,title:hint.title,provider:'exa',searchedAt:now},now);await s.db.prepare('UPDATE news_web_hints SET estimate_json=? WHERE url=?').bind(hint.estimate_json,url).run();return s;}
test('all supplied Acompass fields are draft inputs; saved AI estimate remains release, new headline is announcement',()=>{
 const saved=webArticleDraft(hint),before=JSON.stringify(saved),draft=assistedDraftWithInformation(saved,information);
 assert.equal(JSON.stringify(saved),before);assert.equal(saved.fields.action,'release');assert.equal(saved.fields.publishedAt,'');
 assert.equal(draft.fields.label,'ヤマハ、ギターアンプ「Acompass 60」を発表');assert.equal(draft.fields.publishedAt,'2026-11-06');assert.equal(draft.fields.action,'announcement');assert.equal(draft.missing.length,0);
 assert.equal(draft.fieldSources.publishedAt.kind,'provided_information');assert.equal(draft.fieldSources.publishedAt.confirmed,false);assert.equal(draft.humanConfirmed,false);assert.equal(draft.formalFacts,false);assert.deepEqual(draft.notes,information.notes);
});
test('publication hints can prefill but modification timestamps and URL dates never become publication dates',()=>{
 for(const v of ['2026-02-30','2026-11-06junk','not a date',null])assert.equal(draftDate(v),'');
 assert.equal(draftDate('2026-11-06T09:00:00+09:00'),'2026-11-06');
 const date=webArticleDraft({...hint,search_meta_json:JSON.stringify({publishedAtHint:'2026-11-06',lastModifiedHint:'2026-11-09'})});assert.equal(date.fields.publishedAt,'2026-11-06');assert.equal(date.fieldSources.publishedAt.confirmed,false);
 for(const meta of [{lastModifiedHint:'2026-11-09'},{lastModifiedDate:'2026-11-09'},{publishedAtHint:'2026-02-30'}])assert.equal(webArticleDraft({...hint,search_meta_json:JSON.stringify(meta)}).fields.publishedAt,'');
});
test('unambiguous saved AI type aliases prefill drafts while broad categories remain unknown',()=>{
 for(const category of ['acoustic_guitar','Acoustic Guitar']){const d=webArticleDraft({...hint,estimate_json:JSON.stringify({...estimate,category})});assert.equal(d.fields.productType,'acoustic_guitar');assert.equal(d.fieldSources.productType.confirmed,false);}
 for(const category of ['amp','Guitar','music_instrument','news_hint'])assert.equal(webArticleDraft({...hint,estimate_json:JSON.stringify({...estimate,category})}).fields.productType,'');
});
test('generic input assistance preserves unknowns, event distinctions, URL scope and source labels',()=>{
 const otherUrl='https://jp.yamaha.com/musical-instruments/guitars-basses-amps/explore/topics/2026/another-fixture.html';
 const saved=webArticleDraft({...hint,url:otherUrl,estimate_json:JSON.stringify({...estimate,product:'OTHER-200',category:'ギターアンプ',event:'限定新色を発表'})});
 const d=assistedDraftWithInformation(saved,{version:1,url:otherUrl,source:{label:'別記事の確認情報',url:otherUrl},fields:{brand:'Yamaha'}});
 assert.equal(d.fields.product,'OTHER-200');assert.equal(d.fields.publishedAt,'');assert.equal(d.fields.action,'');assert(d.missing.includes('action'));assert.equal(d.fields.label,undefined);
 assert.throws(()=>assistedDraftWithInformation(saved,information),/assisted_draft_invalid/);
 assert.throws(()=>assistedDraftWithInformation(webArticleDraft({...hint,url:'https://unreviewed.example/news/1'}),{...information,url:'https://unreviewed.example/news/1'}),/assisted_draft_unavailable/);
});
test('untrusted assistance cannot set confirmation, origin, provenance or arbitrary source controls',()=>{
 const saved=webArticleDraft(hint);
 for(const patch of [{confirmed:true},{formalFacts:true},{facts_provenance:'fake'},{sourceId:'yamaha'}])assert.throws(()=>assistedDraftWithInformation(saved,{...information,fields:{...information.fields,...patch}}),/assisted_draft_invalid/);
 for(const patch of [{publishedAt:'2026-02-30'},{label:'<script>not trusted</script>'},{productType:'unknown'}])assert.throws(()=>assistedDraftWithInformation(saved,{...information,fields:{...information.fields,...patch}}),/assisted_draft_invalid/);
 assert.throws(()=>assistedDraftWithInformation(saved,{...information,source:{label:'reference',url:'javascript:alert(1)'}}),/assisted_draft_invalid/);
 assert.throws(()=>assistedDraftWithInformation(saved,{...information,notes:[{label:'x',value:'<img>'}]}),/assisted_draft_invalid/);
});
test('local E2E: draft -> explicit fixture human confirmation -> current save/CAS/Ledger/public API; automatic unchanged',async()=>{
 const s=await setup(),original=await s.db.prepare('SELECT * FROM news_web_hints').first();
 const draft=assistedDraftWithInformation(await savedWebDraft(s.db,url,now),information);
 assert.equal((await prepareAssisted(s,{...draft.fields,confirmed:false,conditionsConfirmed:false},now,SOURCES,pepper)).valid,false);
 assert.equal((await s.candidates()).length,0);
 const input={...draft.fields,confirmed:true,conditionsConfirmed:true,requestId:'draft-assistance-local-save-001'};
 const saved=await saveAssisted(s,input,now,SOURCES,pepper,actor);assert(saved.validation.valid);assert((await saveAssisted(s,input,now,SOURCES,pepper,actor)).replayed);
 let row=(await s.candidates())[0];assert.equal(row.review_status,'pending');assert.equal(JSON.parse(row.product_facts).action,'announcement');assert.equal(JSON.parse(row.facts_provenance).method,'human_public_facts_confirmation');
 assert.equal((await assessAutomatic(s,row,SOURCES,now,pepper)).eligible,false);
 const api=()=>handleNewsRequest(new Request('https://local.test/v1/news'),{NEWS_DB:s.db,NEWS_API_MODE:'production'},now,{registry:SOURCES,cache:null});
 assert.equal((await(await api()).json()).items.length,0);assert.equal((await s.db.prepare('SELECT COUNT(*) n FROM news_decision_ledger').first()).n,0);
 const repeated=await saveAssisted(s,{...input,requestId:'draft-assistance-duplicate-001'},now,SOURCES,pepper,actor);assert.equal(repeated.valid,false);assert.equal((await s.candidates()).length,1);
 const decision={id:row.id,action:'approve',reason:'useful_product',requestId:'draft-assistance-decision-001',revision:row.review_revision,snapshot:await candidateSnapshot(row),label:saved.validation.publishableLabel,category:row.category,publishedAt:row.published_at,checks:{factsChecked:true,relevanceChecked:true,duplicateChecked:true,independentLabelChecked:true}};
 await operatorDecision(s,decision,now,SOURCES,pepper,actor);assert.equal((await(await api()).json()).items.length,1);assert.equal((await s.db.prepare('SELECT COUNT(*) n FROM news_decision_ledger').first()).n,1);
 assert.deepEqual(await s.db.prepare('SELECT * FROM news_web_hints').first(),original);
 assert.equal(externalCalls,0);
});

const origin='https://operator.prefill.test',issuer='https://prefill.cloudflareaccess.com',aud='a'.repeat(64);
const {privateKey,publicKey}=await generateKeyPair('RS256'),jwks=createLocalJWKSet({keys:[{...await exportJWK(publicKey),kid:'prefill-fixture'}]});
const token=await new SignJWT({email:'fixture@prefill.test',type:'app'}).setProtectedHeader({alg:'RS256',kid:'prefill-fixture'}).setIssuer(issuer).setAudience(aud).setSubject('prefill-human').setIssuedAt(now/1000).setExpirationTime(now/1000+3600).sign(privateKey);
test('input assistance API uses existing Access/CSRF, is bounded and read-only, never saves checks',async()=>{
 const s=await setup(),env={NEWS_DB:s.db,NEWS_HEADLINE_PEPPER:pepper,NEWS_OPERATOR_EMAILS:'["fixture@prefill.test"]',NEWS_OPERATOR_ORIGIN:origin,NEWS_ACCESS_ISSUER:issuer,NEWS_ACCESS_AUD:aud};
 const call=(path,body,csrf,auth=true)=>handleOperatorRequest(new Request(origin+path,{method:body?'POST':'GET',headers:{...(auth?{'Cf-Access-Jwt-Assertion':token}:{}),...(body?{'Origin':origin,'Content-Type':'application/json',...(csrf?{'X-News-CSRF':csrf}:{})}:{})},...(body?{body:JSON.stringify(body)}:{})}),env,now,{jwks});
 const csrf=(await(await call('/api/session')).json()).csrf,body={url,information};
 const protectedTables=['candidate_items','news_web_hints','news_decision_ledger','news_shadow_evaluations','news_assisted_edits'];
 const snapshot=()=>Promise.all(protectedTables.map(async t=>(await s.db.prepare('SELECT * FROM '+t+' ORDER BY rowid').all()).results));const before=await snapshot();
 assert.equal((await call('/api/assisted-draft',body,null,false)).status,401);assert.equal((await call('/api/assisted-draft',body)).status,403);
 const response=await call('/api/assisted-draft',body,csrf),result=await response.json();assert.equal(response.status,200);assert(result.readOnly);assert.equal(result.draft.fields.action,'announcement');
 assert.equal((await call('/api/assisted-draft',{...body,confirmed:true},csrf)).status,422);
 assert.equal((await call('/api/assisted-draft',{url:url.replace('26110601','26110602'),information},csrf)).status,422);
 assert.deepEqual(await snapshot(),before);
});
