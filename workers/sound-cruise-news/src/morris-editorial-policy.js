import {morrisArticleUrl} from './morris-policy.js';
// Editorial relevance is source-specific. Completeness and publication approval
// remain independent gates; an official listing entry is never itself READY.
export const MORRIS_EDITORIAL_POLICY='morris-official-information-1';
export const MORRIS_REVIEW_TYPES=Object.freeze({
 new_product:{label:'新製品発表',category:'acoustic_guitar',suffix:'を発表',product:true},
 product_release:{label:'新製品発売',category:'acoustic_guitar',suffix:'を発売',product:true,release:true},
 signature_model:{label:'シグネチャーモデル',category:'acoustic_guitar',suffix:'のシグネチャーモデルを発表',product:true},
 limited_model:{label:'限定モデル',category:'acoustic_guitar',suffix:'の限定モデルを発表',product:true},
 recruitment:{label:'参加者募集・応募',category:'live_guitar',suffix:'の参加者募集を案内'},
 competition:{label:'コンテスト情報',category:'live_guitar',suffix:'のコンテスト情報を案内'},
 event_announcement:{label:'イベント開催案内',category:'live_guitar',suffix:'の開催を案内',event:true},
 exhibition:{label:'イベント出展',category:'live_guitar',suffix:'への出展を案内',event:true},
 artist:{label:'アーティスト情報',category:'artist_guitar',suffix:'の活動情報を紹介'},
 interview:{label:'インタビュー',category:'artist_guitar',suffix:'のインタビューを紹介'},
 craftsmanship:{label:'ギター製作',category:'media_other',suffix:'のギター製作情報を紹介'},
 maintenance:{label:'修理・メンテナンス',category:'media_other',suffix:'の修理・メンテナンス情報を案内'},
 service:{label:'サービス案内',category:'media_other',suffix:'に関するサービス案内を公開'},
 report:{label:'活動・イベントレポート',category:'media_other',suffix:'のレポートを公開'},
 catalog:{label:'カタログ・資料',category:'media_other',suffix:'の資料を公開'},
 official_notice:{label:'その他アコギ関連の公式お知らせ',category:'media_other',suffix:'に関する公式のお知らせを公開'}
});
export const MORRIS_PRODUCT_TYPES=Object.freeze({'アコースティックギター':'acoustic_guitar','エレアコ':'acoustic_guitar','アコギ用アクセサリー':'media_other'});
export const MORRIS_FACT_CHECKS=Object.freeze(['primaryArticleChecked','subjectActionBound','acousticRelevanceChecked','noOriginalTextCopied']);
const name=v=>typeof v==='string'&&v.trim()===v&&v.length>=2&&v.length<=60&&!/[<>\x00-\x1f]/.test(v);
const day=v=>typeof v==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00+09:00'))&&new Date(Date.parse(v+'T00:00:00+09:00')+9*3600000).toISOString().slice(0,10)===v;
export function morrisNoticeFacts(input,url,{automatic=false}={}){
 const t=MORRIS_REVIEW_TYPES[input?.articleType];
 if(!Object.hasOwn(MORRIS_REVIEW_TYPES,input?.articleType||'')||!t||!morrisArticleUrl(url)||Object.keys(input).some(k=>!['articleType','subject','productType','eventDate','endDate','venue','releaseDate','deadline',...(automatic?['serviceAction','publicationAction']:[])].includes(k))||!name(input.subject))return null;
 if(t.product?!Object.hasOwn(MORRIS_PRODUCT_TYPES,input.productType):input.productType!==undefined)return null;
 const optionalExhibition=automatic&&input.articleType==='exhibition';
 if(optionalExhibition?(input.eventDate!==undefined&&!day(input.eventDate)||input.venue!==undefined&&!name(input.venue)||input.endDate!==undefined&&(!day(input.endDate)||!input.eventDate||input.endDate<input.eventDate)):t.event?(!day(input.eventDate)||!name(input.venue)||input.endDate!==undefined&&(!day(input.endDate)||input.endDate<input.eventDate)):(input.eventDate!==undefined||input.endDate!==undefined||input.venue!==undefined))return null;
 if(t.release?!day(input.releaseDate):input.releaseDate!==undefined)return null;
 if(input.deadline!==undefined&&(!['recruitment','competition'].includes(input.articleType)||!day(input.deadline)))return null;
 if(input.serviceAction!==undefined&&(!['service','maintenance'].includes(input.articleType)||!['intake_stopped','intake_resumed','service_started','conditions_changed'].includes(input.serviceAction)))return null;
 if(input.publicationAction!==undefined&&(!['catalog','report','interview','craftsmanship','artist','official_notice'].includes(input.articleType)||!['published','updated'].includes(input.publicationAction)))return null;
 return {kind:'morris_notice',evidence:automatic?'morris_explicit_notice_v1':'morris_human_primary_v1',listingSource:'morris',articleUrl:url,actor:'Morris Guitars',action:input.articleType,relevance:'acoustic_guitar',category:t.product?MORRIS_PRODUCT_TYPES[input.productType]:t.category,...input};
}
export const morrisConfirmedFacts=(input,url)=>morrisNoticeFacts(input,url);
export function morrisNoticeLabel(f,eventType){
 if(eventType!=='morris_notice'||f?.kind!=='morris_notice'||!['morris_human_primary_v1','morris_explicit_notice_v1'].includes(f.evidence)||f.actor!=='Morris Guitars'||f.listingSource!=='morris'||f.relevance!=='acoustic_guitar'||f.action!==f.articleType)return null;
 const {articleType,subject,productType,eventDate,endDate,venue,releaseDate,deadline,serviceAction,publicationAction}=f;
 const input={articleType,subject,...Object.fromEntries(Object.entries({productType,eventDate,endDate,venue,releaseDate,deadline,serviceAction,publicationAction}).filter(([,v])=>v!==undefined))};
 const verified=morrisNoticeFacts(input,f.articleUrl,{automatic:f.evidence==='morris_explicit_notice_v1'});if(!verified||JSON.stringify(verified)!==JSON.stringify(f))return null;
 const t=MORRIS_REVIEW_TYPES[articleType];
 const serviceSuffix={intake_stopped:'の受付停止を案内',intake_resumed:'の受付再開を案内',service_started:'のサービス開始を案内',conditions_changed:'のサービス条件変更を案内'}[serviceAction];
 if(serviceSuffix)return `Morris Guitars、「${subject}」${serviceSuffix}`;
 if(articleType==='catalog'&&publicationAction==='updated')return `Morris Guitars、「${subject}」の資料を更新`;
 return `Morris Guitars、${t.product?productType+'「'+subject+'」':'「'+subject+'」'}${t.suffix}`;
}
