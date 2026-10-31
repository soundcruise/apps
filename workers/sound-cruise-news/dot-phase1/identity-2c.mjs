// Isolated comparison prototype. Supplied evidence is test data, not authority to publish.
const text=x=>typeof x==='string'?x.normalize('NFKC').trim().toLowerCase():'';
const set=x=>[...new Set((x||[]).map(text).filter(Boolean))].sort();
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const reference=r=>typeof r==='string'&&r.length>=8&&r.length<=512;
function normalized(value,kind,brand,aliases){
 const input=text(value);if(!input)return {value:null,rule:'missing',evidence:[]};
 const matches=(aliases||[]).filter(a=>a.kind===kind&&a.reviewed===true&&reference(a.evidence)&&typeof a.version==='string'&&text(a.from)===input&&(kind!=='model'||text(a.brand)===text(brand)));
 if(matches.length!==1)return {value:input,rule:matches.length?'conflicting_aliases':'literal_nfkc',evidence:[]};
 return {value:text(matches[0].to),rule:'verified_alias',version:matches[0].version,evidence:[matches[0].evidence]};
}
export function normalizeIdentity(candidate,aliases=[]){
 const raw=candidate.entity||{};const brand=normalized(raw.brand,'brand',null,aliases);
 const models=(raw.models||[]).map(v=>normalized(v,'model',brand.value,aliases));
 return {brand,models,version:text(raw.version)||null,ruleVersion:'dot-identity-2c-1'};
}
// Evidence is passed separately by an authorized verifier, never extracted from dot JSON.
// Fixture attestations are explicitly hypothetical until independently verified.
export function compareIdentity(a,b,{aliases=[],attestation=null}={}){
 const left=normalizeIdentity(a,aliases),right=normalizeIdentity(b,aliases);
 const audit={ruleVersion:'dot-identity-2c-1',left,right,attestationRefs:[]};
 const result=(comparison,reason)=>({comparison,reason,audit});
 if(left.brand.rule==='conflicting_aliases'||right.brand.rule==='conflicting_aliases'||left.models.some(x=>x.rule==='conflicting_aliases')||right.models.some(x=>x.rule==='conflicting_aliases'))return result('UNCERTAIN','ambiguous_alias');
 if(!left.brand.value||!right.brand.value||left.brand.value!==right.brand.value)return result('UNCERTAIN','brand_unverified_or_different');
 const am=set(left.models.map(x=>x.value)),bm=set(right.models.map(x=>x.value));if(!am.length||!bm.length||!same(am,bm))return result('UNCERTAIN','model_identity_not_proven');
 const ea=a.event||{},eb=b.event||{};if(!ea.type||!eb.type||ea.type==='unknown'||eb.type==='unknown')return result('UNCERTAIN','event_unknown');
 if(!attestation||attestation.independent!==true||!reference(attestation.leftEvidence)||!reference(attestation.rightEvidence)||!reference(attestation.ruleVersion)||!same(set(attestation.candidateIds),set([a.candidate_id,b.candidate_id])))return result('UNCERTAIN','independent_evidence_required');
 audit.attestationRefs=[attestation.leftEvidence,attestation.rightEvidence];audit.attestationVersion=attestation.ruleVersion;
 if(ea.type!==eb.type){const kinds=new Set(['announcement','release','domestic_release','limited_edition','new_color','revival','event_announcement','event_report','interview','update','beta']);if(kinds.has(ea.type)&&kinds.has(eb.type)&&attestation.differentEvents===true)return result('DISTINCT','independently_confirmed_distinct_events');return result('UNCERTAIN','event_relation_unproven');}
 if(left.version!==right.version||text(ea.market)!==text(eb.market)||!same(set(ea.qualifiers),set(eb.qualifiers)))return result('UNCERTAIN','variant_market_version_mismatch');
 if(attestation.sameEvent!==true||!reference(attestation.eventIdentity))return result('UNCERTAIN','same_event_not_proven');
 return result('SAME','independently_confirmed_event');
}
export function reviewDisposition(comparison,existing,{historyComplete=false,scope='unknown'}={}){
 const result={comparison,scope,historyComplete,ready:false,published:false,automaticReopen:false};
 if(comparison==='SAME'&&existing?.review_status==='rejected')result.hold=existing.actor_type==='human_operator'?'human_rejection_preserved':['system_policy','source_policy'].includes(existing.actor_type)?'system_decision_review':'decision_actor_unknown';
 else if(scope!=='allowed')result.hold='scope_not_allowed';
 else if(!historyComplete)result.hold='history_incomplete';
 else result.hold='evidence_and_validation_required';
 return result;
}
