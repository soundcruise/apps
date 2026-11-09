import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {automaticCase,at} from './automatic-case.js';import {pepper} from './helpers.js';
import {assessAutomaticCandidates,AUTOMATIC_POLICY_VERSION} from '../src/automatic.js';
import {SHADOW_RULE_VERSION} from '../src/operator-shadow.js';
import {evaluateDecisions} from '../src/operator-insights.js';

test('prospective assessment returns validation, snapshot, rule and next action with SELECT only',async()=>{
 const x=await automaticCase(),before=x.s.db.raw.prepare("SELECT * FROM news_decision_ledger").all(),shadows=x.s.db.raw.prepare('SELECT * FROM news_shadow_evaluations').all();
 const prepare=x.s.db.prepare.bind(x.s.db);x.s.db.prepare=sql=>{assert.match(sql,/^SELECT\b/);return prepare(sql);};x.s.db.batch=()=>{throw Error('read-only assessment attempted batch');};
 const results=await assessAutomaticCandidates(x.s,x.registry,at,pepper);
 assert.equal(results.length,1);const r=results[0];assert.equal(r.eligible,true);assert.equal(r.validation.valid,true);assert.deepEqual(r.reasons,[]);assert.equal(r.ruleVersion,SHADOW_RULE_VERSION);assert.equal(r.policyVersion,AUTOMATIC_POLICY_VERSION);assert.match(r.snapshot,/^[a-f0-9]{64}$/);assert.equal(r.revision,x.row.review_revision);assert.equal(r.nextAction,'await_explicit_automatic_enablement');assert.equal(r.humanReviewRequired,false);
 assert(!JSON.stringify(results).includes('fenceSql'));assert(!JSON.stringify(results).includes('source_url'));assert.deepEqual(x.s.db.raw.prepare('SELECT * FROM news_decision_ledger').all(),before);assert.deepEqual(x.s.db.raw.prepare('SELECT * FROM news_shadow_evaluations').all(),shadows);assert.equal((await x.s.db.prepare("SELECT review_status FROM candidate_items WHERE id='target'").first()).review_status,'pending');
});
test('formal READY needing editorial evidence is distinguished from a technical evidence failure',async()=>{
 const x=await automaticCase({teachers:4});let [r]=await assessAutomaticCandidates(x.s,x.registry,at,pepper);assert.equal(r.eligible,false);assert.equal(r.validation.valid,true);assert.equal(r.humanReviewRequired,true);assert.equal(r.editorial.reason,'insufficient_evidence');
 await x.s.db.prepare("UPDATE candidate_items SET facts_provenance='[]' WHERE id='target'").run();[r]=await assessAutomaticCandidates(x.s,x.registry,at,pepper);assert.equal(r.validation.valid,false);assert.equal(r.humanReviewRequired,false);assert.equal(r.nextAction,'formal_evidence_or_source_recovery');
 await assert.rejects(assessAutomaticCandidates(x.s,x.registry,at,pepper,{limit:11}),/assessment_limit/);
});
test('historical shape generalization counterexample stays an abstention under the adopted strict rule',()=>{
 const f=JSON.parse(readFileSync(new URL('./fixtures/editorial-shape-counterexample.json',import.meta.url))),t=f.target;
 assert.equal(t.verdict,'reject');assert.equal(f.teachers.length,7);assert(f.teachers.every(r=>r.decided_at<t.at&&r.created_at<=t.at));
 const opts={now:t.at,candidateId:t.candidateId,validation:t.validation};
 assert.equal(evaluateDecisions(t.profile,f.teachers,opts).recommendation,'NO_RECOMMENDATION');
 // B/C are rejected experiments, not selectable production rules. Normalize
 // copies of both bound profiles to reproduce what the experiment would merge.
 for(const mode of ['B','C']){
  const normalize=p=>({...p,factShape:mode==='B'?['brand','product','identifierBasis']:p.factShape.filter(k=>!['kind','version'].includes(k))});
  const rows=f.teachers.map(d=>{const features=JSON.parse(d.decision_features_json);features.insightsProfile=normalize(features.insightsProfile);features.shadowEvaluation.profile=normalize(features.shadowEvaluation.profile);return {...d,decision_features_json:JSON.stringify(features)};});
  const result=evaluateDecisions(normalize(t.profile),rows,opts);assert.equal(result.evidenceCount,7);assert.equal(result.recommendation,'RECOMMEND_APPROVE','must remain a rejected false-publish-direction counterexample: '+mode);
 }
});
