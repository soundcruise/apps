import test from 'node:test';import assert from 'node:assert/strict';
import {candidatePresentation as candidateView,draftRequirements as requirements,webPresentation as webView} from '../src/review-presentation.js';
const now=Date.parse('2026-11-16T01:00:00Z'),candidatePresentation=(...a)=>candidateView(...a,now),draftRequirements=d=>requirements(d,now),webPresentation=i=>webView(i,now);
const url='https://www.yamaha.com/ja/news_release/2026/26111601/',row={source_url:url,review_status:'pending'},human={available:true};
const draft={registrationAllowed:true,fields:{url,brand:'Example',product:'AC-300',productType:'guitar_amp',action:'announcement',publishedAt:'2026-11-16'}};
test('generic future articles are classified by completeness, never URL exceptions or confirmation flags',()=>{
 const v={valid:false,errors:['facts_incomplete']};assert.equal(candidatePresentation(row,v,human,draft).readiness,'human_confirmation');
 for(const field of ['brand','product','productType','action','publishedAt']){const d=structuredClone(draft);delete d.fields[field];const p=candidatePresentation(row,v,human,d);assert.equal(p.group,'human_facts');assert(p.missing.includes(field));}
 assert.equal(candidatePresentation({...row,review_status:'approved'},v,human,draft),null);
 for(const error of ['candidate_takedown','unknown_failure'])assert.equal(candidatePresentation(row,{valid:false,errors:[error]},human,draft).group,'technical');
 for(const error of ['operator_source_gate','source_url_invalid'])assert.equal(candidatePresentation(row,{valid:false,errors:[error]},{available:false},draft).group,'technical');
 for(const error of ['duplicate','expired_candidate','publication_policy_rejected'])assert.equal(candidatePresentation(row,{valid:false,errors:[error]},human,draft).group,'editorial');
 assert.equal(candidatePresentation(row,{valid:true,errors:[]},human,draft).readiness,'formal');assert.equal(candidatePresentation(row,{valid:true,errors:[],relevance:{status:'REVIEW'}},human,draft).group,'editorial');assert.equal(candidatePresentation(row,v,{available:false,alternativeAvailable:true},null).group,'human_facts');assert.equal(candidatePresentation(row,v,{available:false,reason:'未対応'},null).group,'technical');
});
test('variants, events, invalid dates and incompatible kinds cannot be marked ready for human publication',()=>{
 let d=structuredClone(draft);d.fields.action='variant_introduction';assert(draftRequirements(d).missing.includes('qualifier'));d.fields.qualifier='限定カラー';assert.equal(draftRequirements(d).missing.length,0);
 d.fields.publishedAt='2026-11-17';assert(draftRequirements(d).missing.includes('publishedAt'));d.fields.publishedAt='2026-02-30';assert(draftRequirements(d).missing.includes('publishedAt'));
 d=structuredClone(draft);d.fields.productType='event';d.fields.action='event_announcement';assert(draftRequirements(d).missing.includes('eventDate'));assert(draftRequirements(d).missing.includes('venue'));
 d=structuredClone(draft);d.fields.productType='interview';assert(draftRequirements(d).missing.includes('productType_or_action'));
});
test('unsupported Web sources are technical, editorial advice is not a Ledger verdict, existing/deferred hints stay out',()=>{
 const item={url,webReview:{queue:'judgment'},articleDraft:draft};assert.equal(webPresentation(item).group,'technical');item.humanEntry={url};assert.equal(webPresentation(item).readiness,'human_confirmation');
 const old={...item,url:'https://gibson.jp/news-events/27491'};assert.equal(webPresentation(old).group,'editorial');assert.equal(old.webReview.queue,'judgment');assert.equal(old.review_status,undefined);
 for(const queue of ['low','existing'])assert.equal(webPresentation({...item,webReview:{queue}}),null);
});
