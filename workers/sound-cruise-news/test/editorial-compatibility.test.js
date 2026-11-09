import test from 'node:test';
import assert from 'node:assert/strict';
import {editorialCompatibility,policyCompatibility,evaluateDecisions,INSIGHTS_VERSION} from '../src/operator-insights.js';
import {DECISION_POLICY_VERSION} from '../src/decision-policy.js';
import {SHADOW_RULE_VERSION} from '../src/operator-shadow.js';

const now=Date.parse('2026-11-08T01:00:00Z'),stamp=now-60000,hex=n=>n.toString(16).padStart(64,'0');
const profile={version:INSIGHTS_VERSION,source:'ikebe',surface:'www.ikebe-gakki-pb.com/new_product',category:'amps_effects',type:'new_product',articleNature:'not_firmware',factShape:['brand','product','identifierBasis'],factsVerified:true,reviewReasons:['structured_review_required'],freshness:'within_7_days',articleIdentity:hex(1000),topicIdentity:hex(2000)};
function legacy(n,{verdict='approve',reason=verdict==='approve'?'useful_product':'not_relevant',patch={}}={}){
 // Synthetic retained contracts, not reconstructed publisher proof or production READY.
 const p={...profile,articleIdentity:hex(n),topicIdentity:hex(n+100),...patch};
 const d={decision_id:'d'+n,candidate_id:'c'+n,verdict,reason,actor_type:'human_operator',success_state:'committed',source_id:p.source,category:p.category,policy_version:'operator-publication-1',candidate_revision:0,candidate_snapshot:hex(3000+n),created_at:stamp,decided_at:stamp};
 const e={contractVersion:'shadow-v1',ruleVersion:'structured-human-v1',policyVersion:d.policy_version,sourceId:d.source_id,candidateId:d.candidate_id,candidateRevision:d.candidate_revision,candidateSnapshot:d.candidate_snapshot,operatorFinalVerdict:verdict,trigger:'pre_decision',generatedAt:stamp,profile:p,publicationValidation:{valid:true,errors:[],policyVersion:d.policy_version}};
 d.decision_features_json=JSON.stringify({operation:'pending_decision',factsPresent:true,hasDate:true,eventType:p.type,insightsProfile:p,shadowEvaluation:e});return d;
}
function change(d,fn){const f=JSON.parse(d.decision_features_json);fn(f);return {...d,decision_features_json:JSON.stringify(f)};}
const evaluate=(rows,p=profile,validation={valid:true,errors:[]})=>evaluateDecisions(p,rows,{now,candidateId:'target',validation});

test('compatibility is per retained decision; an old version name alone grants no evidence',()=>{
 assert.equal(SHADOW_RULE_VERSION,'structured-human-v3');assert.equal(policyCompatibility('operator-publication-1'),'OBSOLETE');
 const d=legacy(1);assert.equal(editorialCompatibility(d).status,'COMPATIBLE');assert.equal(policyCompatibility(d.policy_version,d),'COMPATIBLE');
 assert.equal(editorialCompatibility({...d,policy_version:'unknown'}).status,'OBSOLETE');
 for(const mutate of [f=>{delete f.insightsProfile;},f=>{delete f.shadowEvaluation;},f=>{f.operation='human_takedown';},f=>{f.shadowEvaluation.candidateRevision++;},f=>{f.shadowEvaluation.candidateSnapshot=hex(1);},f=>{f.shadowEvaluation.generatedAt=stamp+1;},f=>{f.shadowEvaluation.generatedAt=stamp-1800001;},f=>{f.shadowEvaluation.publicationValidation.valid=false;},f=>{f.shadowEvaluation.publicationValidation.errors=['facts_provenance_invalid'];},f=>{f.insightsProfile.source='other';},f=>{f.hasDate=false;},f=>{f.shadowEvaluation.profile={...f.insightsProfile,productAction:'new_color'};}])assert.equal(editorialCompatibility(change(d,mutate)).status,'OBSOLETE');
});

test('generic AGM/event and unidentified product profiles do not import editorial meaning',()=>{
 for(const patch of [{source:'agm',surface:'acousticguitarmagazine.jp/',type:'agm_editorial',factShape:['kind','topic']},{source:'morris',type:'morris_notice',factShape:['kind','action']},{factShape:['brand','product']}]){
  const d=legacy(1,{patch});assert.equal(editorialCompatibility(d).reason,'editorial_scope_unretained');
 }
 // Typed AGM product news can be editorially compatible; this is no source permission grant.
 assert.equal(editorialCompatibility(legacy(1,{patch:{source:'agm',surface:'acousticguitarmagazine.jp/'}})).status,'COMPATIBLE');
});

test('current and compatible strong evidence share the unchanged five-teacher threshold and validation gate',()=>{
 const old=Array.from({length:5},(_,n)=>legacy(n+1));
 assert.equal(evaluate(old.slice(0,4)).recommendation,'NO_RECOMMENDATION');
 let r=evaluate(old);assert.equal(r.recommendation,'RECOMMEND_APPROVE');assert.equal(r.policyCounts.COMPATIBLE,5);assert.equal(r.evidenceCount,5);
 const current=old.slice(3).map(d=>({...d,policy_version:DECISION_POLICY_VERSION}));r=evaluate([...old.slice(0,3),...current]);
 assert.equal(r.recommendation,'RECOMMEND_APPROVE');assert.equal(r.policyCounts.SAME,2);assert.equal(r.policyCounts.COMPATIBLE,3);
 assert.equal(evaluate(old,profile,{valid:false,errors:['facts_provenance_invalid']}).recommendation,'NO_RECOMMENDATION');
 assert.equal(evaluate(old,profile,{valid:false,errors:['duplicate','candidate_takedown']}).reasonSummary,'publication_blocked');
});

test('compatible editorial disagreements block in both directions; excluded technical/duplicate/policy cases never teach low value',()=>{
 const yes=Array.from({length:5},(_,n)=>legacy(n+1)),no=Array.from({length:5},(_,n)=>legacy(n+10,{verdict:'reject'}));
 assert.equal(evaluate(no).recommendation,'RECOMMEND_REJECT');
 assert.equal(evaluate([...yes,no[0]]).recommendation,'NO_RECOMMENDATION');assert.equal(evaluate([...no,yes[0]]).recommendation,'NO_RECOMMENDATION');
 for(const reason of ['facts_identifier_missing','date_uncertain','category_uncertain','duplicate','policy_concern']){
  const bad=Array.from({length:5},(_,n)=>legacy(n+10,{verdict:'reject',reason}));
  assert(bad.every(d=>editorialCompatibility(d).reason==='non_editorial_verdict'));
  assert.equal(evaluate(bad).recommendation,'NO_RECOMMENDATION');assert.equal(evaluate([...yes,...bad]).recommendation,'RECOMMEND_APPROVE');
 }
});

test('weak cross-policy resemblance is not imported as evidence or contradiction; explicit edition actions stay separate',()=>{
 const yes=Array.from({length:5},(_,n)=>legacy(n+1)),weak=legacy(10,{verdict:'reject',patch:{type:'release'}});
 assert.equal(evaluate([...yes,weak]).recommendation,'RECOMMEND_APPROVE');assert.equal(evaluate([weak]).evidenceCount,0);
 for(const action of ['new_color','limited_edition','reissue']){
  const variants=Array.from({length:5},(_,n)=>legacy(n+1,{patch:{productAction:action}}));
  assert.equal(evaluate(variants).evidenceCount,0);assert.equal(evaluate(yes,{...profile,productAction:action}).evidenceCount,0);
  assert.equal(evaluate(variants,{...profile,productAction:action}).recommendation,'RECOMMEND_APPROVE');
 }
 // Current-policy weak disagreement retains the existing conservative behavior.
 assert.equal(evaluate([...yes,{...weak,policy_version:DECISION_POLICY_VERSION}]).recommendation,'NO_RECOMMENDATION');
});

test('future/created-late/self verdicts, repeated articles/topics and superseded approvals cannot inflate evidence',()=>{
 const past=Array.from({length:4},(_,n)=>legacy(n+1)),fifth=legacy(5),base=evaluate(past);
 for(const d of [{...fifth,decided_at:now+1},{...fifth,created_at:now+1},{...fifth,candidate_id:'target'}])assert.equal(evaluate([...past,d]).recommendation,base.recommendation);
 for(const key of ['articleIdentity','topicIdentity'])assert.equal(evaluate(Array.from({length:5},(_,n)=>legacy(n+1,{patch:{[key]:hex(1)}}))).evidenceCount,1);
 const latest={...legacy(5,{verdict:'reject',reason:'facts_identifier_missing'}),decision_id:'newer',decided_at:stamp+1};
 assert.equal(evaluate([...past,fifth,latest]).evidenceCount,4);
 const data=JSON.stringify([...past,fifth]);evaluate([...past,fifth]);assert.equal(JSON.stringify([...past,fifth]),data);
});
