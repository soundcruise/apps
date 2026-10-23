// Facts from one public NEWS card. No article request, model catalogue or copied prose.
import {attributedProductHeadline} from './product-attribution.js';
export const KIKUTANI_LISTING_PARSER='kikutani-listing-product-1';
const brandOK=s=>typeof s==='string'&&/^[A-Za-z][A-Za-z0-9 &.-]{1,59}$/.test(s)&&!/\b(?:ignore|prompt|script|instruction)\b/i.test(s);
const modelOK=s=>typeof s==='string'&&/^[A-Z][A-Z0-9]{0,9}-?\d{1,5}[A-Z0-9]{0,7}(?: [a-z]{1,5})?$/.test(s);
const purposes={truss_rod:'トラスロッド調整工具',fret_sprout:'フレットのバリ取り工具',fret_leveling:'フレットすり合わせ工具'};
export function validKikutaniListingFacts(f){
 return !!f&&f.identifierBasis==='explicit_kikutani_listing_product'&&f.listingSource==='kikutani'&&f.noticeType==='new_product_information'&&/^https:\/\/www\.kikutani\.co\.jp\/news\/[a-z0-9_%-]+\/$/i.test(f.articleUrl||'')&&brandOK(f.brand)&&Array.isArray(f.models)&&f.models.length>=1&&f.models.length<=4&&f.models.every(modelOK)&&new Set(f.models).size===f.models.length&&f.product===f.models.join(' / ')&&f.version===null&&!f.productEvent&&!f.releaseEvent&&(
  f.productType==='guitar'&&/\bGuitars?$/i.test(f.brand)&&f.category==='media_other'||
  f.productType==='acoustic_guitar'&&/\bGuitars?$/i.test(f.brand)&&f.category==='acoustic_guitar'||
  f.productType==='guitar_maintenance_tool'&&Object.hasOwn(purposes,f.purpose)&&f.category==='electric_guitar_bass');
}
export function kikutaniListingLabel(f,event){
 if(event!=='new_product'||!validKikutaniListingFacts(f))return null;
 const type=f.productType==='guitar_maintenance_tool'?purposes[f.purpose]:f.productType==='acoustic_guitar'?'エレアコ':'ギター';
 // The card proves new-product information, not a launch by the brand itself.
 return attributedProductHeadline({brand:f.brand,source:f.listingSource,subject:`${type}「${f.product}」`,action:f.noticeType});
}
export function kikutaniListingFacts(entry,source){
 if(source.id!=='kikutani'||source.discoveryUrl!=='https://www.kikutani.co.jp/news/'||entry.listingSection!=='official_news'||!entry.listingTags?.includes('新製品情報'))return null;
 const title=entry.title.normalize('NFKC');
 if(/再入荷|中古|値下げ|セール|クーポン|キャンペーン|中止|延期|旧製品|他社|比較|関連商品|交換用|未定|予定/.test(title))return null;
 const quoted=[...title.matchAll(/[「『]([^」』]{2,150})[」』]/g)];if(quoted.length!==1)return null;
 let brand,models,productType,category,purpose;
 const guitars=/^([A-Za-z][A-Za-z0-9 &.-]{1,45} Guitars?) ((?:[A-Z][A-Z0-9]{0,9}-?\d{1,5}[A-Z0-9]{0,7}(?: [a-z]{1,5})?)(?: & [A-Z][A-Z0-9]{0,9}-?\d{1,5}[A-Z0-9]{0,7}(?: [a-z]{1,5})?){0,3})$/.exec(quoted[0][1]);
 if(guitars){if(/ケース|スタンド|専用|対応|互換|保護/.test(title))return null;brand=guitars[1];models=guitars[2].split(' & ');productType=/エレアコ/.test(title)?'acoustic_guitar':'guitar';category=productType==='acoustic_guitar'?'acoustic_guitar':'media_other';}
 else {
  const b=/^([A-Za-z][A-Za-z0-9 &.-]{1,59})(?:から|より)/.exec(title),m=/^([A-Z][A-Z0-9]{0,9}-?\d{1,5}[A-Z0-9]{0,7}) [–−-] [A-Za-z0-9 .-]{2,100}$/.exec(quoted[0][1]);
  if(!b||!m||!/ツール|工具/.test(title)||!/登場|発表/.test(title.slice(quoted[0].index+quoted[0][0].length)))return null;
  const contexts=[['truss_rod',/トラスロッド.{0,12}調整/],['fret_sprout',/バリ取り/],['fret_leveling',/フレット.{0,8}すり合わせ/]].filter(([purpose,re])=>re.test(title.slice(0,quoted[0].index))&&(purpose!=='fret_sprout'||/フレット|\bFret\b/i.test(title)));
  if(contexts.length!==1)return null;
  brand=b[1];models=[m[1]];purpose=contexts[0][0];productType='guitar_maintenance_tool';category='electric_guitar_bass';
 }
 const facts={brand,models,product:models.join(' / '),version:null,category,productType,...(purpose?{purpose}:{}),identifierBasis:'explicit_kikutani_listing_product',listingSource:'kikutani',articleUrl:entry.url,noticeType:'new_product_information'};
 return validKikutaniListingFacts(facts)?facts:null;
}
export function kikutaniListingProvenance(f,proof){
 if(!proof||proof.sourceId!=='kikutani'||proof.sourceUrl!=='https://www.kikutani.co.jp/news/'||proof.parserVersion!==KIKUTANI_LISTING_PARSER||proof.extractionMethod!=='explicit_kikutani_listing_card'||!Number.isSafeInteger(proof.verifiedAt)||!/^[a-f0-9]{64}$/.test(proof.responseHash||''))return null;
 return JSON.stringify([...Object.keys(f),'event_type'].map(factField=>({...proof,articleUrl:f.articleUrl,factField})));
}
