// Read-only routing for the operator. These groups grant no facts or authority.
import previousInformation from '../docs/human-ready-20261116/review-information.json' with {type:'json'};
import currentInformation from '../docs/readiness-20261117/review-information.json' with {type:'json'};
const information=[...currentInformation,...previousInformation];
import guidance from '../docs/operator-review-groups-20261116/editorial-guidance.json' with {type:'json'};
import {assistedLabel,assistedTypes} from './assisted-facts.js';
import {labelMatchesType} from './assisted-product-type.js';
import {draftDate} from './draft-assistance.js';
export const reviewInformation=url=>information.find(r=>r.information.url===url)?.information;
export const primaryReviewInformation=url=>information.find(r=>r.discoveryUrls?.includes(url))?.information;
const editorial=url=>guidance.find(r=>r.url===url);
const result=(group,reason,extra={})=>({group,reason,formalReady:false,...extra});
export function draftRequirements(draft,now=Date.now()){
 const f=draft?.fields||{},missing=['brand','product','productType','action','publishedAt',...(f.action==='variant_introduction'?['qualifier']:[]),...(f.productType==='event'?['eventDate','venue']:[])].filter(k=>!f[k]);
 if(f.publishedAt&&(!draftDate(f.publishedAt)||Date.parse(f.publishedAt+'T00:00:00+09:00')>now||now-Date.parse(f.publishedAt+'T00:00:00+09:00')>=90*86400000))missing.push('publishedAt');
 const label=assistedLabel({kind:'assisted_notice',...f,category:assistedTypes[f.productType]?.[1]},{draft:true});
 if(!missing.length&&!label)missing.push('productType_or_action');
 const headline=f.label||label||(f.product?f.product+'（確認用下書き）':draft?.headline);
 if(label&&(!headline||headline.length<8||headline.length>160||/[<>\x00-\x1f]/.test(headline)||!headline.includes(f.brand)||!headline.includes(f.product)||!labelMatchesType(headline,f.productType)))missing.push('label');
 if(f.eventDate&&(!draftDate(f.eventDate)||Date.parse(f.eventDate+'T23:59:59+09:00')<now))missing.push('eventDate');
 return {missing:[...new Set(missing)],headline};
}
function humanPresentation(url,draft,now){
 const {missing,headline}=draftRequirements(draft,now),confirmationUrl='/?assistedUrl='+encodeURIComponent(url);
 return missing.length?result('human_facts','不足する事実を原記事で確認し、確認フォームで補完してください。',{missing,headline,confirmationUrl}):result('approvable','入力済み案と原記事・紹介条件を本人が確認すれば、既存の掲載操作へ進めます。',{readiness:'human_confirmation',missing,headline,confirmationUrl});
}
export function candidatePresentation(row,validation,humanReview,draft,now){
 if(!['pending','reopened'].includes(row.review_status))return null;
 const errors=validation.errors||[];
 if(errors.includes('candidate_takedown')||!humanReview.available&&errors.some(e=>['operator_source_gate','source_url_invalid'].includes(e)))return result('technical','出典停止・掲載条件・URLをシステム側で確認する必要があります。');
 if(errors.some(e=>['duplicate','expired_candidate','publication_policy_rejected'].includes(e)))return result('editorial','重複・期限・既存方針を確認して判断してください。');
 if(validation.valid&&row.origin!=='operator_assisted'&&validation.relevance?.status==='REVIEW')return result('editorial','事実の検証は完了しています。掲載価値・関連性を判断してください。');
 if(validation.valid)return result('approvable','正式検証済みです。掲載するか判断してください。',{formalReady:true,readiness:'formal'});
 if(humanReview.possibleKnownEvent)return result('editorial','入力済み案が掲載済みの同一出来事と一致する可能性があります。重複を確認してください。',{possibleKnownEvent:humanReview.possibleKnownEvent});
 const note=editorial(row.source_url);if(note)return result('editorial',note.reason,{reference:note.reference,headline:draft?.fields?.label||draft?.fields?.product||null});
 if(humanReview.available&&draft?.registrationAllowed){
  // An approved human URL scope may replace Bot-only validation gates.
  // candidateHumanReview separately checks controls, source stop and permissions.
  // Unrelated validation failures remain technical blockers.
  if(errors.some(e=>!['facts_incomplete','facts_provenance_invalid','label_provenance_invalid','relevance_uncertain','operator_source_gate','source_url_invalid'].includes(e)))return result('technical','正式検証の停止理由を解消する必要があります。');
  return humanPresentation(row.source_url,draft,now);
 }
 if(humanReview.alternativeAvailable)return result('human_facts','既存の確認フォームで不足する事実を確認・補完してください。');
 return result('technical',humanReview.reason||'既存の確認経路・出典証拠の対応が必要です。');
}
export function webPresentation(item,now){
 if(item.webReview?.queue!=='judgment')return null;
 if(item.reviewBlocked)return result('technical','出典停止・利用条件を確認する必要があります。');
 const note=editorial(item.url);if(note)return result('editorial',note.reason,{reference:note.reference});
 if(!item.humanEntry||!(item.primaryReview?.draft||item.articleDraft)?.registrationAllowed)return result('technical',item.articleDraft?.sourceReview?.reason||'この出典・URLは人間確認による正式保存が未対応です。出典条件と対応経路の確認が必要です。');
 return humanPresentation(item.humanEntry.url,item.primaryReview?.draft||item.articleDraft,now);
}
