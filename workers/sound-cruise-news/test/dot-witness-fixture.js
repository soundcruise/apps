import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {localDatabase} from '../scripts/local-db.mjs';
import {migrationStatements} from '../scripts/migration-statements.mjs';
import {pepper} from './helpers.js';
import {SOURCES} from '../src/registry.js';
import {fictionalInput} from '../dot-phase1/phase4a/preview.mjs';
import {dotSnapshot,saveDotConfirmation} from '../src/dot-human-confirmation.js';
import {admitDotCandidate} from '../src/dot-admission.js';
import {saveDotSourceRecheck} from '../src/dot-source-recheck.js';
import {saveDotHistoryCheck} from '../src/dot-history-check.js';
import {dotPublicationGate} from '../src/dot-publication-gate.js';
import {candidateSnapshot,operatorDecision} from '../src/operator-review.js';
import {effectiveCategory} from '../src/category-editor.js';
import {publicationValidation} from '../src/decision-policy.js';
import {administer} from '../src/admin.js';

const options={compatibilityDate:process.env.NEWS_DOT_TEST_COMPATIBILITY_DATE||'2026-09-18'};
export async function isolated(fn){
 const dir=await mkdtemp(join(tmpdir(),'dot-delete-d1-'));
 let rt=await localDatabase(dir,options);
 const restart=async()=>{await rt.mf.dispose();rt=await localDatabase(dir,options);return rt;};
 try{await fn(rt,restart);}finally{await rt.mf.dispose();await rm(dir,{recursive:true,force:true});}
}
export async function fixture(rt){
 const {store:s,db}=rt,now=Date.now(),actor={type:'human_operator',id:'access:fixture-human'};
 const url='https://jp.yamaha.com/musical-instruments/guitars-basses-amps/explore/topics/2026/fixture_atomic.html';
 await db.prepare('UPDATE news_controls SET publication_enabled=1').run();
 await db.prepare("INSERT INTO source_state(source_id,disabled) VALUES('yamaha',1)").run();
 const c=fictionalInput().candidate;
 c.candidate_id='fixture-atomic-d1';
 c.entity={manufacturer:'Yamaha',brand:'Yamaha',product:'FG700',models:['FG700'],version:null,product_type:null};
 c.sources=[{url,canonical_url:url}];c.event.type='announcement';c.dates.article_published={value:'2026-10-30',precision:'day'};
 const detail={candidate:c,stagingRevision:'123:4',deliveryKeyHash:'b'.repeat(64),validation:{formalFacts:false,ready:false}};
 const reader={detail:async()=>detail},snap=await dotSnapshot(detail,c.candidate_id);
 const human={url,brand:'Yamaha',product:'FG700',productType:'acoustic_guitar',action:'announcement',publishedAt:'2026-10-30'};
 const observations={source:url+' | official page',identity:'Yamaha / FG700 | heading',event:'announcement | event',date:'2026-10-30 | date',claims:'acoustic_guitar | type',policy:'yamaha-human-facts-20261028 | permission',history:'確認済み（期限切れ履歴は不明）'};
 const confirmation={candidateId:c.candidate_id,digest:snap.digest,revision:snap.revision,observations,outcome:'confirmed',requestId:'d1-confirmation-atomic-0001'};
 await saveDotConfirmation(db,reader,confirmation,actor,now);
 const input={candidateId:c.candidate_id,confirmationId:confirmation.requestId,requestId:'d1-registration-atomic-0001',human};
 const saved=await admitDotCandidate(s,reader,input,actor,now,SOURCES,pepper);
 assert.equal(saved.status,'registered');
 const row=await db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(saved.id).first(),snapshot=await candidateSnapshot(row);
 await saveDotSourceRecheck(s,reader,{id:row.id,snapshot,revision:row.review_revision,requestId:'d1-source-check-atomic-0001',observation:'Synthetic source and date confirmed',checks:{facts:true,original:true,rights:true}},actor,now+1);
 await saveDotHistoryCheck(s,{id:row.id,snapshot,revision:row.review_revision,requestId:'d1-history-check-atomic-0001',basis:'New isolated fixture history reviewed',evidenceRef:'isolated-history-only',checks:{archives:true,identity:true,scope:true}},actor,now+2);
 return {now,actor,reader,input,confirmation,row,snapshot,saved};
}
