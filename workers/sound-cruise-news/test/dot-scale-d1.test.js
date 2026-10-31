import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {localDatabase} from '../scripts/local-db.mjs';
import {fictionalInput} from '../dot-phase1/phase4a/preview.mjs';
import {SOURCES} from '../src/registry.js';
import {pepper} from './helpers.js';
import {dotSnapshot,saveDotConfirmation} from '../src/dot-human-confirmation.js';
import {saveAssisted} from '../src/assisted-entry.js';
import {admitDotCandidate} from '../src/dot-admission.js';
import {saveDotSourceRecheck} from '../src/dot-source-recheck.js';
import {saveDotHistoryCheck} from '../src/dot-history-check.js';
import {historySubjects,saveDotHistoryExclusion} from '../src/dot-history-exclusion.js';
import {candidateSnapshot,operatorDecision} from '../src/operator-review.js';
import {dotPublicationGate} from '../src/dot-publication-gate.js';
import {publicationValidation} from '../src/decision-policy.js';
import {effectiveCategory} from '../src/category-editor.js';
import {retainedArticleHashes} from '../src/dot-retained-decisions.js';
import {migrationStatements} from '../scripts/migration-statements.mjs';
const actor={type:'human_operator',id:'access:fixture-human'};
const compatibilityDate=process.env.NEWS_DOT_TEST_COMPATIBILITY_DATE||'2026-09-18';
if(!['2026-09-18','2026-09-28'].includes(compatibilityDate))throw Error('unsupported_test_compatibility_date');

test('persistent workerd D1 retains >526 rows and >256 KiB while a scoped human approval succeeds',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'dot-scale-scope-'));let rt;
 const archive=new Map();
 const now=Date.now(),url='https://jp.yamaha.com/musical-instruments/guitars-basses-amps/explore/topics/2026/scale_fixture.html';
 try{
 rt=await localDatabase(join(dir,'v3'),{compatibilityDate});let db=rt.db,s=rt.store;
 await db.prepare('UPDATE news_controls SET publication_enabled=1').run();
 await db.prepare("INSERT INTO source_state(source_id,disabled) VALUES('yamaha',1)").run();
 const c=fictionalInput().candidate;c.candidate_id='scale-yamaha';c.entity={manufacturer:'Yamaha',brand:'Yamaha',product:'FG700',models:['FG700'],version:null,product_type:null};c.sources=[{url,canonical_url:url}];c.event.type='announcement';c.dates.article_published={value:'2026-10-30',precision:'day'};
 const detail={candidate:c,stagingRevision:'123:4',deliveryKeyHash:'b'.repeat(64),validation:{formalFacts:false,ready:false}},reader={detail:async()=>detail},snap=await dotSnapshot(detail,c.candidate_id);
 const human={url,brand:'Yamaha',product:'FG700',productType:'acoustic_guitar',action:'announcement',publishedAt:'2026-10-30'};
 await saveDotConfirmation(db,reader,{candidateId:c.candidate_id,digest:snap.digest,revision:snap.revision,observations:{source:url+' | official page',identity:'Yamaha / FG700 | heading',event:'announcement | event',date:'2026-10-30 | visible date',claims:'acoustic_guitar | product',policy:'yamaha-human-facts-20261028 | permission',history:'確認済み（期限切れ履歴は不明）'},outcome:'confirmed',requestId:'scale-confirmation-000001'},actor,now);
 // Seed retained data before admission. Their actual original identity is recorded
 // in the synthetic archive, including records whose live candidate was purged.
 const template=await saveAssisted(s,{...human,product:'SEED-TEMPLATE',url:url.replace('scale_fixture','template_fixture'),sourceId:'yamaha',confirmed:true,requestId:'scale-seed-template-000001'},now,SOURCES,pepper,actor);
 assert.equal(template.saved,true);
 let row=await db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(template.id).first();
 const cols=(await db.prepare('PRAGMA table_info(candidate_items)').all()).results.map(x=>x.name);
 const replaced={id:'?',source_url:'?',normalized_url:'?',topic_key:'?',product_facts:'?',label:"'Unrelated synthetic product'",review_status:"'pending'",review_revision:'0'};
 const clone='INSERT INTO candidate_items('+cols.map(x=>'"'+x+'"').join(',')+') SELECT '+cols.map(x=>replaced[x]||'"'+x+'"').join(',')+' FROM candidate_items WHERE id=?';
 for(let offset=0;offset<305;offset+=50){const batch=[];for(let i=offset;i<Math.min(305,offset+50);i++){
 const facts=i===300?{}:i===301?{brand:'OtherFixture',product:'S1',models:['S1'],aliases:['OTHER-S1']}:{brand:'OtherFixture',product:'OTHER-'+i,models:['OTHER-'+i]};
 if(i===300||i===301)archive.set('identity:other-'+i,{url:'https://fixture.invalid/archive/'+i,brand:'OtherFixture',product:i===301?'OTHER-S1':'OTHER-IDENTITY-'+i,event:'independent_announcement',evidenceRef:'synthetic independent archive manifest for candidate other-'+i+'; original identity and aliases inspected'});
 batch.push(db.prepare(clone).bind('other-'+i,'https://fixture.invalid/archive/'+i,'https://fixture.invalid/archive/'+i,'other-event-'+i,JSON.stringify(facts),row.id));}await db.batch(batch);}
 const ledgerSql="INSERT INTO news_decision_ledger(decision_id,candidate_id,verdict,reason,actor_type,actor_id,decided_at,source_id,category,decision_features_json,policy_version,request_id,request_payload_hash,candidate_revision,candidate_snapshot,success_state,created_at,checks_json) VALUES(?,?,'reject','operator_review','fixture','synthetic',?,'yamaha',?,?,'fixture',?,'hash',0,'synthetic-snapshot','committed',?,'{}')";
 for(let offset=0;offset<156;offset+=40){const batch=[];for(let i=offset;i<Math.min(156,offset+40);i++){const originalUrl='https://fixture.invalid/archive/'+i;archive.set('ledger:scale-ledger-'+i,{url:originalUrl,brand:'OtherFixture',product:'OTHER-'+i,event:'independent_announcement',evidenceRef:'synthetic independent archive manifest for original decision scale-ledger-'+i+'; original article URL hash and product inspected'});batch.push(db.prepare(ledgerSql).bind('scale-ledger-'+i,'other-'+i,now,row.category,JSON.stringify({padding:'x'.repeat(7000),eventType:'new_product',insightsProfile:{articleIdentity:(await retainedArticleHashes([originalUrl]))[0]}}),'scale-ledger-request-'+i,now));}await db.batch(batch);}
 // A simulated retention purge creates five genuine orphan decisions. They stay
 // in the ledger for every subsequent assertion and are never removed to pass.
 await db.prepare("UPDATE candidate_items SET review_revision=review_revision+1 WHERE id='other-0'").run();
 for(let i=151;i<156;i++)await db.prepare('DELETE FROM candidate_items WHERE id=?').bind('other-'+i).run();
 for(let offset=0;offset<101;offset+=40){const batch=[];for(let i=offset;i<Math.min(101,offset+40);i++){archive.set('discovery:fixture:https://fixture.invalid/discovery/'+i,{url:'https://fixture.invalid/discovery/'+i,brand:'OtherFixture',product:'OTHER-DISCOVERY-'+i,event:'independent_announcement',evidenceRef:'synthetic independent archive manifest for discovery '+i+'; original product inspected'});batch.push(db.prepare("INSERT INTO news_discovery_work(source_id,normalized_url,first_seen_at,updated_at,processing_state,reason_code,next_action) VALUES('fixture',?,?,?,'discovered','unknown','none')").bind('https://fixture.invalid/discovery/'+i,now,now));}await db.batch(batch);}
 for(let i=0;i<3;i++){archive.set('takedown:orphan-takedown-'+i,{url:'https://fixture.invalid/withdrawn/'+i,brand:'OtherFixture',product:'OTHER-WITHDRAWN-'+i,event:'independent_announcement',evidenceRef:'synthetic independent archive manifest for withdrawn item orphan-takedown-'+i+'; original product inspected'});await db.prepare('INSERT INTO news_takedowns(item_id,expires_at) VALUES(?,?)').bind('orphan-takedown-'+i,i===2?now-1000:now+100000).run();}
 const scale=await db.prepare('SELECT (SELECT COUNT(*) FROM candidate_items)+(SELECT COUNT(*) FROM news_decision_ledger)+(SELECT COUNT(*) FROM news_discovery_work)+(SELECT COUNT(*) FROM news_takedowns) AS rows,(SELECT SUM(length(CAST(decision_features_json AS BLOB))) FROM news_decision_ledger) AS bytes').first();assert.ok(scale.rows>=526);assert.ok(scale.bytes>262144);
 const registered=await admitDotCandidate(s,reader,{candidateId:c.candidate_id,confirmationId:'scale-confirmation-000001',requestId:'scale-registration-000001',human},actor,now,SOURCES,pepper);assert.equal(registered.status,'registered',JSON.stringify(registered));row=await db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(registered.id).first();const snapshot=await candidateSnapshot(row);
 // Main/old Worker approval metadata cannot bypass the new Dot protocol after
 // schema migration; its normal non-Dot writes retain the original contract.
 const oldApprove=ledgerSql.replace("'reject'","'approve'").replace("'fixture','synthetic'","'human_operator','access:fixture-human'");
 await assert.rejects(()=>db.prepare(oldApprove).bind('old-dot-approval',row.id,now,row.category,'{}','old-dot-request-000001',now).run(),/dot_scope_protocol_required/);
 assert.equal((await db.prepare('SELECT review_status FROM candidate_items WHERE id=?').bind(row.id).first()).review_status,'pending');
 await assert.rejects(()=>db.prepare("UPDATE candidate_items SET review_status='approved' WHERE id=?").bind(row.id).run(),/dot_scope_protocol_required/);
 const directInsert='INSERT OR REPLACE INTO candidate_items('+cols.map(x=>'"'+x+'"').join(',')+') SELECT '+cols.map(x=>x==='review_status'?"'approved'":'"'+x+'"').join(',')+' FROM candidate_items WHERE id=?';
 await assert.rejects(()=>db.prepare(directInsert).bind(row.id).run(),/dot_scope_protocol_required/);
 await saveDotSourceRecheck(s,reader,{id:row.id,snapshot,revision:row.review_revision,requestId:'scale-source-check-000001',observation:'Synthetic source currently confirms FG700 and date',checks:{facts:true,original:true,rights:true}},actor,now+1);
 await saveDotHistoryCheck(s,{id:row.id,snapshot,revision:row.review_revision,requestId:'scale-history-check-000001',basis:'Synthetic archive establishes unrelated original subjects; expired unobserved history is unknown',evidenceRef:'fixture-archive:complete-scoped-evidence',checks:{archives:true,identity:true,scope:true}},actor,now+2);
 assert.equal((await dotPublicationGate(s,reader,row.id,now+3,SOURCES,pepper)).status,'HOLD');
 let cursor='',n=0;do{const page=await historySubjects(s,row.id,cursor);for(const subject of page.items){await saveDotHistoryExclusion(s,{id:row.id,snapshot,revision:row.review_revision,requestId:'scale-exclusion-'+String(n++).padStart(8,'0'),subjectKey:subject.subject_key,subjectToken:subject.subject_token,archive:archive.get(subject.subject_key)},actor,now+2);}cursor=page.next||'';}while(cursor);
 assert.ok(n>=260);const before=await dotPublicationGate(s,reader,row.id,now+3,SOURCES,pepper);assert.equal(before.status,'PASS',JSON.stringify(before.blockers));
 // Revocation, new orphan state, and direct same-URL rejection cannot reuse PASS.
 await db.prepare('DELETE FROM news_dot_history_exclusions WHERE request_id=?').bind('scale-exclusion-00000000').run();assert.equal((await dotPublicationGate(s,reader,row.id,now+3,SOURCES,pepper)).status,'HOLD');
 // Restore that observation by re-inspecting the same archived original subject.
 const first=(await historySubjects(s,row.id)).items[0];await saveDotHistoryExclusion(s,{id:row.id,snapshot,revision:row.review_revision,requestId:'scale-rechecked-exclusion-01',subjectKey:first.subject_key,subjectToken:first.subject_token,archive:archive.get(first.subject_key)},actor,now+2);
 await rt.mf.dispose();rt=await localDatabase(join(dir,'v3'),{compatibilityDate});db=rt.db;s=rt.store;
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM news_decision_ledger').first()).n,156);
 const nativePrepare=db.prepare.bind(db),metrics={queries:0,returnedRows:0,returnedBytes:0,rowsRead:0,sqlMilliseconds:0};
 const tracked=(sql,args=[])=>({bind:(...a)=>tracked(sql,a),all:async()=>{const r=await nativePrepare(sql).bind(...args).all();metrics.queries++;metrics.returnedRows+=r.results.length;metrics.returnedBytes+=new TextEncoder().encode(JSON.stringify(r.results)).length;metrics.rowsRead+=r.meta?.rows_read||0;metrics.sqlMilliseconds+=r.meta?.duration||0;return r;},first:async()=>((await tracked(sql,args).all()).results[0]||null)});s.db={prepare:tracked};
 const started=performance.now(),gate=await dotPublicationGate(s,reader,row.id,now+3,SOURCES,pepper);assert.equal(gate.status,'PASS',JSON.stringify(gate.blockers));s.db=db;
 assert.ok(new TextEncoder().encode(JSON.stringify(gate.fence)).length<65536);
 console.log(JSON.stringify({test:'synthetic_workerd_scope',compatibilityDate,retainedRows:scale.rows,ledgerBytes:scale.bytes,archivalObservations:n,gateMilliseconds:Math.round(performance.now()-started),fenceBytes:new TextEncoder().encode(JSON.stringify(gate.fence)).length,...metrics}));
 const v=await publicationValidation(s,row,now+3,SOURCES,pepper),input={id:row.id,revision:row.review_revision,snapshot,action:'approve',reason:'operator_review',requestId:'scale-approve-000000001',label:v.publishableLabel,category:await effectiveCategory(s,row),publishedAt:row.published_at,checks:{factsChecked:true,relevanceChecked:true,duplicateChecked:true,independentLabelChecked:true}};
 const decision=await operatorDecision(s,input,now+3,SOURCES,pepper,actor,{enabled:true,reader});assert.equal(decision.action,'approve');
 // Lost ACK / process restart: same authenticated request returns the one result.
 await rt.mf.dispose();
 const config=join(dir,'wrangler-scope.json');await writeFile(config,JSON.stringify({name:'news-scope-test',compatibility_date:compatibilityDate,d1_databases:[{binding:'NEWS_DB',database_name:'sound-cruise-news-local',database_id:'00000000-0000-0000-0000-000000000001',remote:false}]}));
 const cli=await promisify(execFile)(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','NEWS_DB','--local','--persist-to',dir,'--config',config,'--command','SELECT COUNT(*) AS n FROM candidate_items','--json'],{timeout:60000,maxBuffer:1048576});assert.ok(JSON.parse(cli.stdout)[0].results[0].n>=300);
 rt=await localDatabase(join(dir,'v3'),{compatibilityDate});db=rt.db;s=rt.store;
 assert.deepEqual(await operatorDecision(s,input,now+3,SOURCES,pepper,actor,{enabled:true,reader,clock:()=>now+3}),decision);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM news_decision_ledger WHERE candidate_id=?').bind(row.id).first()).n,1);
 assert.equal((await db.prepare('SELECT review_status FROM candidate_items WHERE id=?').bind(row.id).first()).review_status,'approved');
 await assert.rejects(()=>db.prepare("UPDATE candidate_items SET source_id='fixture' WHERE id=?").bind(row.id).run(),/dot_scope_protocol_required/);
 const audit=await db.prepare('SELECT checks_json FROM news_decision_ledger WHERE request_id=?').bind(input.requestId).first();assert.match(JSON.parse(audit.checks_json).dotPublication.scopeDigest,/^[a-f0-9]{64}$/);
 // Idempotent additive migration; preexisting write contracts gain no triggers.
 const sql=await readFile(new URL('../migrations/0029_dot_history_scope.sql',import.meta.url),'utf8');await db.batch(migrationStatements(sql).map(q=>db.prepare(q)));
 const legacy=await db.prepare("UPDATE candidate_items SET review_reason='old_worker_fixture' WHERE id='other-250'").run();assert.equal(legacy.meta.changes,1);
 // D1 evaluates the saved candidate condition again after an old-style writer
 // introduces a new unknown history record; no application generation is needed.
 const part=gate.fence.snapshotParts[0];assert.equal((await db.prepare(`SELECT (${part.sql}) AS value`).bind(...part.args).first()).value,part.value);
 await db.prepare('INSERT INTO news_takedowns(item_id,expires_at) VALUES(?,?)').bind('late-unidentified-takedown',now+600000).run();
 assert.notEqual((await db.prepare(`SELECT (${part.sql}) AS value`).bind(...part.args).first()).value,part.value);
 const approved=await db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(row.id).first();
 await operatorDecision(s,{id:row.id,action:'reject',reason:'not_relevant',takedown:true,requestId:'scale-human-takedown-000001',revision:approved.review_revision,snapshot:await candidateSnapshot(approved)},now+4,SOURCES,pepper,actor);
 await operatorDecision(s,input,now+3,SOURCES,pepper,actor,{enabled:true,reader,clock:()=>now+3});
 assert.equal((await db.prepare('SELECT review_status FROM candidate_items WHERE id=?').bind(row.id).first()).review_status,'rejected');
 assert.equal((await dotPublicationGate(s,reader,row.id,now+4,SOURCES,pepper)).status,'BLOCK');

 }finally{await rt?.mf.dispose();await rm(dir,{recursive:true,force:true});}
});
