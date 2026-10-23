// Editorial roles are independent. A source is never a missing product brand.
// Callers supply verified identity/action facts; site names cannot prove actors.
const name=s=>typeof s==='string'&&s===s.trim()&&s.length>0&&s.length<=100&&!/[<>「」\x00-\x1f]/.test(s);
const actions=new Set(['information','new_product_information','product_overview','appearance','announce','release','distribution_start','sales_start']);
export function productAttribution({brand,source=null,manufacturer=null,manufacturerEvidence=null,productType=null,eventType=null,actor=null,action='information',actorEvidence=null}={}){
 if(!name(brand)||!actions.has(action)||source!==null&&!name(source))return null;
 if(manufacturer!==null&&(!name(manufacturer)||manufacturerEvidence?.basis!=='explicit_primary_manufacturer'||manufacturerEvidence.manufacturer!==manufacturer||manufacturerEvidence.brand!==brand))return null;
 if(actor!==null&&(!name(actor)||!actorEvidence||actorEvidence.basis!=='explicit_primary_subject'||actorEvidence.actor!==actor||actorEvidence.brand!==brand||actorEvidence.action!==action))return null;
 return {source,manufacturer,brand,announcementActor:actor,headlineSubject:brand,productType,eventType,action};
}
export function attributedProductHeadline({subject,...input}={}){
 const roles=productAttribution(input);
 if(!roles||typeof subject!=='string'||!subject||subject.length>115||/[<>\x00-\x1f]/.test(subject))return null;
 const prefix=roles.headlineSubject+'、'+subject;
 if(roles.action==='product_overview')return roles.brand+'の'+subject+'を紹介';
 if(roles.action==='appearance')return roles.brand+'の'+subject+'が登場';
 if(roles.action==='information')return prefix+'の製品情報';
 if(roles.action==='new_product_information')return prefix+'の新製品情報';
 // A distributor's action cannot silently become the brand's action.
 if(!roles.announcementActor)return null;
 const verb={announce:'発表',release:'発売',distribution_start:'取扱開始',sales_start:'販売開始'}[roles.action];
 return roles.announcementActor===roles.brand?prefix+'を'+verb:prefix+'（'+roles.announcementActor+'が'+verb+'）';
}
const norm=s=>String(s).normalize('NFKC').replace(/[™®\s]/g,'').toLowerCase();
export function listingProductNotice(title,{brand,product,models},sourceName){
 if(typeof title!=='string'||title.length>512||!name(brand)||!Array.isArray(models)||!models.length||/予定|未定|かもしれ|旧製品|以前|過去|他社|比較|関連|付属|対応|保護|(?:発売|発表|登場|取扱開始|販売開始)(?:しない|せず|ではない)/.test(title))return null;
 const clauses=title.split(/[。!?！？]/).filter(t=>models.every(m=>norm(t).includes(norm(m)))&&norm(t).includes(norm(brand)));
 if(clauses.length!==1)return null;const clause=clauses[0];
 if([/取扱(?:い)?(?:を)?開始/,/販売(?:を)?開始/,/発売/,/発表/,/登場/].filter(re=>re.test(clause)).length!==1)return null;
 const found=[['distribution_start',/取扱(?:い)?(?:を)?開始/],['sales_start',/販売(?:を)?開始/],['release',/発売(?:しました|します|開始|！|!|。|$)/],['announce',/発表(?:しました|します|！|!|。|$)/],['appearance',/登場(?:しました|します|！|!|。|$)/]].filter(([,re])=>re.test(clause));
 if(found.length!==1)return null;const action=found[0][0];
 const actors=[brand,sourceName].filter((a,i,all)=>name(a)&&all.indexOf(a)===i&&clause.includes(a+'が'));
 const actor=action==='appearance'?null:actors.length===1?actors[0]:null;
 if(action!=='appearance'&&!actor)return null;
 return {action,actor,brand,product,basis:'explicit_listing_subject'};
}
export function validListingProductNotice(n,f){
 return !!n&&Object.keys(n).every(k=>['action','actor','brand','product','basis'].includes(k))&&n.basis==='explicit_listing_subject'&&n.brand===f.brand&&n.product===f.product&&['appearance','announce','release','distribution_start','sales_start'].includes(n.action)&&(n.action==='appearance'?n.actor===null:name(n.actor));
}
