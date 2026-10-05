// Existing Ikebe pending articles only: explicit editorial fields, never related cards.
import {parseDocument,DomUtils} from 'htmlparser2';
import {optOut} from './policy.js';
import {calendarDate} from './legacy-listing.js';
import {explicitProductAction,validatedProductEvent} from './product-event.js';
import {productSubject,enrichHeadlineFacts,validHeadlineEvidence} from './headline-evidence.js';
export const IKEBE_PRODUCT_PARSER='ikebe-product-fields-2';
const cls=(n,c)=>(n.attribs?.class||'').split(/\s+/).includes(c);
const hidden=n=>{for(let p=n;p;p=p.parent)if(['script','style','nav','header','footer','template','noscript','aside'].includes(p.name)||p.attribs?.hidden!==undefined||p.attribs?.['aria-hidden']==='true'||/display\s*:\s*none|visibility\s*:\s*hidden/i.test(p.attribs?.style||''))return true;return false;};
const text=n=>hidden(n)?'':n.type==='text'?n.data:n.name==='br'?'\n':(n.children||[]).map(text).join('');
const plain=n=>text(n).replace(/\s+/g,' ').trim();
const find=(n,test)=>DomUtils.findAll(x=>!!x.name&&!hidden(x)&&test(x),n.children||[]);
const urlOK=u=>typeof u==='string'&&/^https:\/\/www\.ikebe-gakki-pb\.com\/new_product\/[1-9][0-9]*\/$/.test(u);
export function ikebeProductSurface(row,source){
 if(source?.id!=='ikebe'||source.baseUrl!=='https://www.ikebe-gakki-pb.com/'||source.discoveryUrl!=='https://www.ikebe-gakki-pb.com/new_product/'||row.source_id!=='ikebe'||!urlOK(row.source_url)||!['pending','reopened'].includes(row.review_status))return null;
 return {url:row.source_url,method:'explicit_ikebe_product_fields',parser:IKEBE_PRODUCT_PARSER};
}
const nameOK=s=>typeof s==='string'&&s.length>=2&&s.length<=80&&/^[A-Za-z0-9][A-Za-z0-9 .&+()'/-]*$/.test(s)&&!/[\r\n]|https?:|\b(?:ignore|instruction|prompt|script)\b/i.test(s);
const modelOK=s=>nameOK(s)&&s.length<=70&&(/\d/.test(s)||/\b[A-Z]{2,}\b/.test(s));
const denied=/再入荷|入荷情報|再入荷予定|在庫|セール|特価|値下げ|クーポン|キャンペーン|中古|比較|レビュー|使い方|紹介します|旧製品|発売済み|以前|かつて|過去|他社|例えば|発売しない|発売していません|登場しない|登場していません|ではない|かもしれ|予定|\b(?:restock|sale|review|comparison|previous|not|might)\b/i;
const types=[
 ['effect_pedal','amps_effects','effector',/エフェクター|ペダル|\b(?:effects? pedal|overdrive|distortion pedal)\b/i],
 ['guitar_amp','amps_effects','amplifier',/ギターアンプ|\bguitar amplifier\b/i],
 ['acoustic_guitar','acoustic_guitar','acoustic-guitar',/アコースティックギター|\bacoustic guitar\b/i],
 ['electric_guitar','electric_guitar_bass','guitar',/エレキギター|\belectric guitar\b/i],
 ['bass_guitar','electric_guitar_bass','bass',/エレキベース|\bbass guitar\b/i],
 ['power_distribution','recording_audio','recording-pa',/電源タップ|電源プロテクター|\bpower (?:strip|distributor|protector)\b/i],
 ['microphone','recording_audio','recording-pa',/マイクロ[フホ]ン|\bmicrophone\b/i],
 ['audio_interface','recording_audio','recording-pa',/オーディオ[・ ]?インターフェ[イー]ス|\baudio interface\b/i],
 ['studio_monitor','recording_audio','recording-pa',/スタジオモニター|モニタースピーカー|\bstudio monitor\b/i]
];
export function validatedIkebeProductFacts(f){
 const parent={distortion_pedal:'effect_pedal',bass_effect_pedal:'effect_pedal',octave_pedal:'effect_pedal',usb_microphone:'microphone',wireless_microphone:'microphone'};
 return !!f&&validHeadlineEvidence(f)&&f.identifierBasis==='explicit_article_product_fields'&&f.listingSource==='ikebe'&&urlOK(f.articleUrl)&&nameOK(f.brand)&&Array.isArray(f.models)&&f.models.length>=1&&f.models.length<=4&&f.models.every(modelOK)&&new Set(f.models).size===f.models.length&&f.product===f.models.join(' / ')&&f.product.length<=110&&f.version===null&&types.some(([t,c])=>(t===f.productType||f.productTypeEvidence&&t===parent[f.productType])&&c===f.category)&&(!f.productEvent||validatedProductEvent(f.productEvent))&&(!f.editionMarket||f.editionMarket==='Japan'&&f.productEvent?.action==='limited_edition');
}
export function ikebeProductLabel(f,eventType){
 if(!validatedIkebeProductFacts(f)||!['new_product','release'].includes(eventType))return null;
 if(f.productEvent?.action==='limited_edition')return `${f.brand}、${productSubject(f)}の${f.editionMarket==='Japan'?'日本':''}限定モデルを${eventType==='release'?'発売':'発表'}`;
 return null; // Other actions use the existing factual label vocabulary.
}
export function parseIkebeProductEvidence(html,source,row){
 if(!ikebeProductSurface(row,source))throw Error('facts_source_invalid');
 if(typeof html!=='string'||new TextEncoder().encode(html).length>512000)throw Error('facts_response_too_large');
 let doc=parseDocument(html);html='';
 try{
  if(find(doc,n=>n.name==='meta'&&/^(robots|SoundCruiseNewsBot)$/i.test(n.attribs.name||'')).some(n=>optOut(n.attribs.content||'')))throw Error('facts_optout');
  const canonical=find(doc,n=>n.name==='link'&&n.attribs.rel==='canonical');if(canonical.length!==1||canonical[0].attribs.href!==row.source_url)throw Error('facts_source_invalid');
  const articles=find(doc,n=>n.name==='article'&&n.attribs.id==='main');if(articles.length!==1)throw Error('facts_parser_failure');
  const article=articles[0],bodies=find(article,n=>cls(n,'main_wrap'));if(bodies.length!==1||bodies[0].parent!==article)throw Error('facts_parser_failure');
  const body=bodies[0],headers=article.children.filter(n=>cls(n,'blog_title')&&!hidden(n));if(headers.length!==1)throw Error('facts_parser_failure');
  const header=headers[0],titles=find(header,n=>n.name==='h1'),dates=find(header,n=>n.name==='time'&&cls(n,'sub_info_date'));
  if(titles.length!==1||dates.length!==1)throw Error('facts_parser_failure');
  const dm=/^(20\d{2})-(\d{2})-(\d{2})$/.exec(dates[0].attribs.datetime||''),written=/^(20\d{2})年(\d{2})月(\d{2})日公開$/.exec(plain(dates[0]));
  if(!dm||!written||dm.slice(1).join('-')!==written.slice(1).join('-')||!calendarDate(...dm.slice(1))||new Date(dm[0]+'T00:00:00+09:00').toISOString()!==row.published_at)throw Error('facts_date_changed');
  const title=plain(titles[0]);if(!title||title.length>250||denied.test(title)||/ケース|スタンド|交換|アクセサリー|\b(?:case|stand|replacement)\b/i.test(title))throw Error('facts_scope_uncertain');
  const heads=body.children.filter(n=>/^h[1-3]$/.test(n.name||'')&&cls(n,'wp-block-heading')&&!hidden(n));
  if(!heads.length||heads.length>4||find(body,n=>/^h[1-3]$/.test(n.name)&&cls(n,'wp-block-heading')).length!==heads.length)throw Error('facts_identity_changed');
  const products=heads.map(n=>{const parts=text(n).trim().split(/\n/).map(p=>p.replace(/\s+/g,' ').trim()).filter(Boolean);if(parts.length!==2||!nameOK(parts[0])||!modelOK(parts[1]))throw Error('facts_identity_changed');return parts;});
  const brand=products[0][0],models=products.map(p=>p[1]);if(products.some(p=>p[0]!==brand)||new Set(models).size!==models.length)throw Error('facts_identity_changed');
  if(models.some(m=>/\b(?:case|stand|cable|replacement|accessory)\b/i.test(m)))throw Error('facts_scope_uncertain');
  if(models.length>1){const common=[];for(const [i,t] of models[0].split(' ').entries()){if(!models.every(m=>m.split(' ')[i]===t))break;common.push(t);}if(!common.some(t=>t.length>=3&&!/^(?:Silver|Limited|Edition|New|Special|Model)$/i.test(t)))throw Error('facts_identity_changed');}
  // Manufacturer tag corroborates every product heading; a mention in prose is insufficient.
  if(!find(header,n=>n.name==='a'&&/^https:\/\/www\.ikebe-gakki-pb\.com\/new_product\/tag\/[a-z0-9-]+\/$/.test(n.attribs.href||'')).some(n=>plain(n)===brand))throw Error('facts_identity_changed');
  const paras=body.children.filter(n=>n.name==='p'&&cls(n,'wp-block-paragraph')&&!hidden(n)).map(plain).filter(Boolean);
  const primary=paras.slice(0,4).join(' ');
  const typeMatches=types.filter(([, ,tag,re])=>find(header,n=>n.name==='li'&&cls(n,'cate-'+tag)).length&&re.test(title+' '+primary));
  if(typeMatches.length!==1)throw Error('facts_scope_uncertain');
  // Require the launch in the editorial title AND corroborated prose near product blocks.
  const linked=title.includes(brand)||models.every(m=>m.split(/\s+/).some(t=>t.length>=3&&!/^(?:Silver|Limited|Edition|POWER|Pro|New)$/i.test(t)&&title.includes(t)));
  if(!linked||!/(?:新登場|新発売|新製品|発売|登場|発表)/.test(title))throw Error('facts_scope_uncertain');
  const statements=paras.slice(0,4).filter(p=>!denied.test(p)&&/(?:新登場|新発売|新製品|発売|登場します|登場しました|発表)/.test(p));
  if(!statements.length||!statements.some(p=>p.includes(brand)||models.some(m=>m.split(/\s+/).some(t=>t.length>=3&&!/^(?:Silver|Limited|Edition|POWER|Pro|New)$/i.test(t)&&p.includes(t)))))throw Error('facts_scope_uncertain');
  const refinement=explicitProductAction(title),editionInBody=/限定(?:企画)?モデル|限定生産|limited edition/i.test(primary);
  if(/限定|特別|新色|コラボ|復刻|再発売/.test(title)&&(!refinement||!editionInBody&&refinement.action==='limited_edition'))throw Error('facts_scope_uncertain');
  const [productType,category]=typeMatches[0],eventType=/発売/.test(title)?'release':'new_product';
  const base={brand,models,product:models.join(' / '),version:null,category,productType,identifierBasis:'explicit_article_product_fields',listingSource:'ikebe',articleUrl:row.source_url,
   ...(refinement?{productEvent:{...refinement,basis:'verified_primary_article'}}:{}),
   ...(refinement?.action==='limited_edition'&&/日本限定/.test(title)&&/日本限定/.test(primary)?{editionMarket:'Japan'}:{})};
  const facts=enrichHeadlineFacts(base,{title,statements:paras.slice(0,4),publishedAt:row.published_at,basis:'verified_primary_article'});
  if(!validatedIkebeProductFacts(facts))throw Error('facts_identity_changed');
  return {productFacts:facts,eventType,publishedAt:row.published_at};
 }finally{doc=null;}
}
