// Editorial roles are independent. A source is never a missing product brand.
// Callers supply verified identity/action facts; site names cannot prove actors.
const name=s=>typeof s==='string'&&s===s.trim()&&s.length>0&&s.length<=100&&!/[<>「」\x00-\x1f]/.test(s);
const actions=new Set(['information','new_product_information','announce','release','distribution_start','sales_start']);
export function productAttribution({brand,source=null,actor=null,action='information',actorEvidence=null}={}){
 if(!name(brand)||!actions.has(action)||source!==null&&!name(source))return null;
 if(actor!==null&&(!name(actor)||!actorEvidence||actorEvidence.basis!=='explicit_primary_subject'||actorEvidence.actor!==actor||actorEvidence.brand!==brand||actorEvidence.action!==action))return null;
 return {source,brand,announcementActor:actor,headlineSubject:brand,action};
}
export function attributedProductHeadline({subject,...input}={}){
 const roles=productAttribution(input);
 if(!roles||typeof subject!=='string'||!subject||subject.length>115||/[<>\x00-\x1f]/.test(subject))return null;
 const prefix=roles.headlineSubject+'、'+subject;
 if(roles.action==='information')return prefix+'の製品情報';
 if(roles.action==='new_product_information')return prefix+'の新製品情報';
 // A distributor's action cannot silently become the brand's action.
 if(!roles.announcementActor)return null;
 const verb={announce:'発表',release:'発売',distribution_start:'取扱開始',sales_start:'販売開始'}[roles.action];
 return roles.announcementActor===roles.brand?prefix+'を'+verb:prefix+'（'+roles.announcementActor+'が'+verb+'）';
}
