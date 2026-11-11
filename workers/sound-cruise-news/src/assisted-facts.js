import {AGM_PERMISSION_REF} from './agm-sections.js';
import {productTypes,validTypeEvidence,labelMatchesType} from './assisted-product-type.js';
// Human observation permission is independent of Bot acquisition permission.
export const ASSISTED_ORIGIN='operator_assisted';
export const ASSISTED_PERMISSION='yamaha-human-facts-20261028';
// These are human observation scopes, not Bot/republishing grants. No wildcard sources.
export const assistedSources=[
 {id:'yamaha',name:'ヤマハ / ヤマハミュージックジャパン',automatic:'not_allowed',manual:'permitted_topics_only',basis:'publisher_permission',permissionRef:ASSISTED_PERMISSION,origin:'https://jp.yamaha.com',articlePattern:'^/musical-instruments/guitars-basses-amps/explore/topics/20[0-9]{2}/[a-zA-Z0-9_-]+\\.html$'},
 {id:'yamaha-newsroom',name:'ヤマハ / ヤマハミュージックジャパン',automatic:'not_allowed',manual:'conditions_review_required',basis:'public_facts_conditions_review',permissionRef:'human-facts-conditions-v1:yamaha-newsroom',origin:'https://www.yamaha.com',articlePattern:'^/ja/news_release/20[0-9]{2}/[0-9]{8}/$'},
 {id:'agm',name:'ACOUSTIC GUITAR MAGAZINE WEB',automatic:'unchanged',manual:'publisher_conditions_required',basis:'publisher_permission',permissionRef:AGM_PERMISSION_REF,origin:'https://acousticguitarmagazine.jp',articlePattern:'^/(?:(?:gears|interview|column|beginners|lesson)/(?!feed/|page/|tag/|author/)[a-zA-Z0-9_-]+|20[0-9]{2}[-_][a-zA-Z0-9_-]+)/$'},
 {id:'shimamura',name:'島村楽器',automatic:'unchanged',manual:'conditions_review_required',basis:'public_facts_conditions_review',permissionRef:'human-facts-conditions-v1:shimamura-shops',origin:'https://www.shimamura.co.jp',articlePattern:'^/update/shops/[a-z0-9-]+/(?:guitar-bass|acoustic-guitar|dtm-recording|amp-effector)/[0-9]+/$'},
 {id:'deviser',name:'Deviser',automatic:'unchanged',manual:'conditions_review_required',basis:'public_facts_conditions_review',permissionRef:'human-facts-conditions-v1:deviser',origin:'https://www.deviser.co.jp',articlePattern:'^/information/[0-9]+/?$'}
];
export function assistedSource(raw){try{const u=new URL(raw);if(u.href!==raw||u.search||u.hash||u.username||u.password||u.port)return null;return assistedSources.find(s=>u.origin===s.origin&&new RegExp(s.articlePattern).test(u.pathname))||null;}catch{return null;}}
// Reviewed human-introduction limits only. These records never grant Bot access
// or add an unreviewed source to the collector registry.
const pendingHumanSources={
 'gibson.jp':{reason:'利用規約はリンク先をトップページ等に限定しています。個別記事への直接リンクを伴う紹介条件の確認が必要です。',termsUrl:'https://gibson.jp/support/terms'},
 'www.mikigakki.com':{reason:'通販規約のコンテンツ利用条件と、客観的事実の独自紹介・記事への直接リンクへの適用範囲が未確認です。',termsUrl:'https://www.mikigakki.com/shop/pages/terms.aspx'},
 'shop.jeugia.co.jp':{reason:'商品ページの利用・リンク条件が未確認です。記事公開日と新しい出来事も原記事で確認してください。'},
 'www.chunichi.co.jp':{reason:'非営利目的等のリンク条件について、Pro版を併設する本サービスへの適用確認が必要です。',termsUrl:'https://www.chunichi.co.jp/policy/link'}
};
export function assistedSourceReview(raw){
 if(assistedSource(raw))return null;
 try{const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password||u.port)return null;const policy=pendingHumanSources[u.hostname];return policy?{...policy,registrationAllowed:false,confirmationUrl:raw}:null;}catch{return null;}
}
export const assistedTypes={...productTypes,guitar_accessory:['ギター関連アクセサリー','acoustic_guitar']};
export const assistedActions={preview:'を先行紹介',variant_introduction:'の特別仕様を紹介',announcement:'を発表',release:'を発売',introduction:'を紹介',event_announcement:'の開催を案内',interview:'を公開'};
export function assistedUrl(raw){return assistedSource(raw)?raw:null;}
const safe=s=>typeof s==='string'&&s===s.trim()&&s.length>=2&&s.length<=100&&!/[<>\x00-\x1f]|https?:/.test(s);
export function assistedLabel(f){if(f?.kind!=='assisted_notice'||!safe(f.brand)||!safe(f.product)||!assistedTypes[f.productType]||!assistedActions[f.action]||f.category!==assistedTypes[f.productType][1])return null;
 if(f.typeEvidence&&!validTypeEvidence(f.typeEvidence,f.productType))return null;
 if(!f.typeEvidence&&!['acoustic_guitar','electro_acoustic','pickup','guitar_amp','guitar_accessory','interview','event','electric_guitar_bass','guitar_article'].includes(f.productType))return null;
 if(f.productType==='event'&&(f.action!=='event_announcement'||!/^20\d{2}-\d\d-\d\d$/.test(f.eventDate||'')||!safe(f.venue)))return null;
 if(f.productType==='interview'&&f.action!=='interview'||!['event','interview'].includes(f.productType)&&!['announcement','release','introduction','preview','variant_introduction'].includes(f.action))return null;
 if(f.productType==='guitar_article'&&f.action!=='introduction')return null;
 if(f.qualifier!==undefined&&f.qualifier!==''&&(!safe(f.qualifier)||!['preview','variant_introduction'].includes(f.action)))return null;
 if(f.action==='variant_introduction'&&!safe(f.qualifier))return null;
 if(['preview','variant_introduction'].includes(f.action))return `${f.brand}、${f.product}${assistedActions[f.action]}${f.qualifier&&!f.product.includes(f.qualifier)?'（'+f.qualifier+'）':''}`;
 return `${f.brand}、${assistedTypes[f.productType][0]}「${f.product}」${assistedActions[f.action]}`;}
export function assistedPredicate(alias='c'){
 if(!/^[a-z]$/.test(alias))throw Error('sql_alias_invalid');
 const scope=assistedSources.map(s=>`(${alias}.source_id='${s.id}' AND a.permission_ref='${s.permissionRef}')`).join(' OR ');
 return `(${alias}.origin='operator_assisted' AND EXISTS(SELECT 1 FROM news_assisted_edits a WHERE a.candidate_id=${alias}.id AND a.source_url=${alias}.source_url AND a.published_at=${alias}.published_at AND a.facts_json=${alias}.product_facts AND a.label=${alias}.label AND (${scope})))`;
}
export function assistedProvenance(source,requestId,now,actor){return JSON.stringify({method:source.basis==='publisher_permission'?'human_official_article_confirmation':'human_public_facts_confirmation',permissionRef:source.permissionRef,confirmationId:requestId,verifiedAt:now,actor,publisherHttpRequests:0,...(source.basis==='public_facts_conditions_review'?{usageBasis:source.basis,conditionsConfirmed:true,independentFactsOnly:true}:{} )});}
export async function assistedProof(store,row,now,registry){
 const source=assistedSource(row.source_url),registered=registry?.find(s=>s.id===row.source_id);
 if(row.origin!==ASSISTED_ORIGIN||source?.id!==row.source_id||registry&&(!registered||['DO_NOT_USE','PROHIBITED'].includes(registered.legalStatus)||registered.humanFactsProhibited===true))return false;
 const a=await store.db.prepare('SELECT * FROM news_assisted_edits WHERE candidate_id=? ORDER BY verified_at DESC,rowid DESC LIMIT 1').bind(row.id).first();let facts;try{facts=JSON.parse(row.product_facts);}catch{return false;}
 if(facts?.typeEvidence&&(!assistedLabel(facts)||!labelMatchesType(row.label,facts.productType)))return false;
 return !!a&&a.source_url===row.source_url&&a.published_at===row.published_at&&a.facts_json===row.product_facts&&a.label===row.label&&a.permission_ref===source.permissionRef&&a.verified_at<=now&&now-a.verified_at<90*86400000&&a.actor_type==='human_operator'&&row.facts_provenance===assistedProvenance(source,a.request_id,a.verified_at,a.actor_id);
}
