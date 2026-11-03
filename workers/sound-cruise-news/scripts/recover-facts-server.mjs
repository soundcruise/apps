// Authenticated operational CLI, not an HTTP endpoint or a human decision.
// Requires an explicit, reviewed one-use approval file; never generates approvals.
import {readFile} from 'node:fs/promises';
import {checkedConfig,remoteSql} from './remote-db.mjs';
import {remoteFactsDatabase} from './facts-remote-adapter.mjs';
import {NewsStore} from '../src/store.js';
import {runtimeSources} from '../src/runtime.js';
import {candidateSnapshot,reviewDetail} from '../src/operator-review.js';
import {resolvedRecoverySurface} from '../src/facts-readiness.js';
import {PRIMARY_ANNOUNCEMENT_PARSER} from '../src/primary-announcement.js';
import {validateRecoveryApproval} from '../src/recovery-budget.js';
import {recheckFacts} from '../src/facts-recheck.js';
import {validatedFingerprint} from '../src/fingerprint.js';
const [file,mode]=process.argv.slice(2);
if(!file||!['--check','--execute'].includes(mode)||process.argv.length!==4)throw Error('usage: recover-facts-server APPROVAL_FILE --check|--execute');
const approval=JSON.parse(await readFile(file,'utf8')),config=await checkedConfig(),now=Date.now();
const store=new NewsStore(remoteFactsDatabase(remoteSql)),registry=runtimeSources(config.vars,undefined,now),actor={type:'system_repair',id:'news-approved-recovery'};
const row=await store.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(approval.candidateId).first();
if(!row||!['pending','reopened'].includes(row.review_status)||row.expires_at<=now)throw Error('pending_unexpired_candidate_required');
const input={id:approval.candidateId,revision:approval.revision,snapshot:approval.snapshot,requestId:'recovery-'+approval.id};
const receipt=await store.db.prepare('SELECT request_id FROM news_facts_rechecks WHERE request_id=?').bind(input.requestId).first();
const source=registry.find(s=>s.id===row.source_id),surface=await resolvedRecoverySurface(store,row,source);
if(!receipt||mode==='--check')await validateRecoveryApproval(approval,input,row,source,{...surface,pipeline:PRIMARY_ANNOUNCEMENT_PARSER},actor,now,await candidateSnapshot(row));
if(mode==='--check'){
 console.log(JSON.stringify({candidateId:row.id,revision:row.review_revision,sourceUrl:row.source_url,parser:surface.parser,expiresAt:approval.expiresAt,maxArticleRequests:1,executed:false}));
}else{
 const secretsFile=process.env.NEWS_RECOVERY_SECRETS_FILE;if(!secretsFile)throw Error('NEWS_RECOVERY_SECRETS_FILE_required');
 const {NEWS_HEADLINE_PEPPER:pepper}=JSON.parse(await readFile(secretsFile,'utf8'));
 if(!await validatedFingerprint(row.title_fingerprint,pepper))throw Error('production_fingerprint_mismatch');
 const result=await recheckFacts(store,input,now,registry,pepper,actor,{recoveryApproval:approval});
 const detail=await reviewDetail(store,row.id,Date.now(),registry,pepper);
 console.log(JSON.stringify({result,detail}));
}
