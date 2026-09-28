import {listingArticleUrl,listingExclusion} from './shimamura-listing.js';
import { fingerprint, headlineSimilarity } from './fingerprint.js';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { sourceUrl, optOut, hash, DAY } from './policy.js';
const array=v=>v===undefined?[]:Array.isArray(v)?v:[v];
const string=v=>typeof v==='string'?v:typeof v?.['#text']==='string'?v['#text']:'';
export function parseMetadata(xml,type) {
 if(/<!DOCTYPE|<!ENTITY/i.test(xml)||xml.length>1000000)throw new Error('xml_unsafe');
 if(XMLValidator.validate(xml)!==true)throw new Error('xml_invalid');
 const parsed=new XMLParser({ignoreAttributes:false,processEntities:false,parseTagValue:false,trimValues:true}).parse(xml);
 let nodes;
 if(type==='rss' && parsed.rss?.channel)nodes=array(parsed.rss.channel.item);
 else if(type==='atom' && parsed.feed)nodes=array(parsed.feed.entry);
 else if(type==='sitemap' && parsed.urlset)nodes=array(parsed.urlset.url);
 else throw new Error('metadata_format');
 return nodes.slice(0,100).map(n=>({
  title:string(n.title||n['news:news']?.['news:title']),
  url:string(n.loc)||string(n.link)||array(n.link).find(l=>!l['@_rel']||l['@_rel']==='alternate')?.['@_href']||'',
  date:string(n.pubDate||n.published||n['dc:date']||n['news:news']?.['news:publication_date']),
  // Ordinary sitemap lastmod is NOT an article publication date. Keep unknown date pending.
  optOut:optOut(string(n.robots))||array(n.meta).some(m=>/robots/i.test(m['@_name']||'')&&optOut(m['@_content']))
 }));
}
export const CATEGORIES=['acoustic_guitar','electric_guitar_bass','amps_effects','recording_audio','dtm_software','creator_streaming','artist_guitar','live_guitar','media_other'];
const PRODUCTS = [
 {brandRe:/\bBOSS\b/,re:/\bEX-4\b/,brand:'BOSS',product:'EX-4',category:'amps_effects'},
 {brandRe:/\bVOX\b/i,re:/\bAC MINI\b/i,brand:'VOX',product:'AC MINI',category:'amps_effects'},
 {brandRe:/\bKORG\b/i,re:/\bOD-KIT CUSTOM CRAFT\b/i,brand:'KORG',product:'OD-KIT CUSTOM CRAFT',category:'amps_effects'},
 {brandRe:/\bKHAN AUDIO\b/i,re:/\b9VDI\b/i,brand:'KHAN AUDIO',product:'9VDI',category:'amps_effects'},
 {brandRe:/\bXotic\b/i,re:/\bXXP-1\b/i,brand:'Xotic',product:'XXP-1',category:'amps_effects'},
 {brandRe:/\bMOTU\b/i,re:/\bDigital Performer(?:\s+(\d{1,2}))?\b/i,brand:'MOTU',product:'Digital Performer',category:'dtm_software'},
 {brandRe:/\bAcon Digital\b/i,re:/\bAcoustica(?:\s+(\d{1,2}))?\b/i,brand:'Acon Digital',product:'Acoustica',category:'dtm_software'},
 {brandRe:/\bFender\b/i,re:/\bFSR American Acoustasonic Telecaster\b/i,brand:'Fender',product:'FSR American Acoustasonic Telecaster',category:'acoustic_guitar'},
 {brandRe:/\bUniversal\s+Audio\b/i,re:/\bLUNA(?:\s+([0-9]+(?:\.[0-9]+){0,2}))?\b/i,brand:'Universal Audio',product:'LUNA',category:'dtm_software'},
 {brandRe:/\bLAVA\s+MUSIC\b/i,re:/\bLAVA\s+STUDIO\b/i,brand:'LAVA MUSIC',product:'LAVA STUDIO',category:'amps_effects'},
 {brandRe:/\bLunacy\s+Audio\b/i,re:/\bNOVA\b/i,brand:'Lunacy Audio',product:'NOVA',category:'dtm_software'},
 {brandRe:/\bBOSS\b/,re:/\bGX-1\b/,brand:'BOSS',product:'GX-1',category:'amps_effects'},
];
export function productFacts(title) {
 const normalized=title.normalize('NFKC');
 // Require both names in the same headline. Product aliases never supply a missing brand.
 if(/\bLUNA\s+SEA\b/i.test(normalized))return null;
 for(const p of PRODUCTS){const m=p.re.exec(normalized);if(p.brandRe.test(normalized)&&m)return {brand:p.brand,product:p.product,version:m[1]||null,category:p.category};}
 return null;
}
export function classify(title) {
 if(/ピアノ弾き語り|piano\s*(and|\+|&)\s*vocal/i.test(title)&&!/ギター|\bguitar\b/i.test(title))return null;
 if(/弾き語り|ライブ(?!ラリ)|ツアー|\b(concert|tour)\b/i.test(title))return /ギター|\bguitar\b|\bpedalboard\b/i.test(title)?'live_guitar':null;
 const known=productFacts(title);if(known)return known.category;
 for(const [category,re] of [
 ['acoustic_guitar',/アコギ|アコースティックギター|\bacoustic guitar\b|\bAcoustasonic\b|\b(?:FG7|FS7)\b/i],
 ['amps_effects',/エフェクター|ペダル|ギターアンプ|\b(?:pedal|amplifier)\b|\bBOSS\s+[A-Z]{1,4}-[0-9]/i],
 ['electric_guitar_bass',/ギター|エレキベース|\b(?:guitar|bass guitar|Fender|Gretsch|Jackson)\b/i],
 ['recording_audio',/マイク|オーディオ|録音|\b(?:microphone|audio interface|mixer)\b/i],
 ['dtm_software',/\b(?:DTM|DAW|plugin|synth|Cubase|Logic Pro|Reason Studios|ReSing)\b|プラグイン|音源|シンセ/i],
 ['creator_streaming',/配信|\bstreaming\b/i]])if(re.test(title))return category;
 return null;
}
export function contentType(title) {
 if(/セール|クーポン|中古|キャンペーン|下取り|買取|特価|\b(?:sale|coupon|used|campaign)\b/i.test(title))return 'sale';
 if(/イベント|体験会|試奏会|展示会|レッスン|生徒募集|採用|求人|店舗から|店舗案内|営業案内|営業時間|開店|閉店|休業|入荷情報|\b(?:event|lesson|recruit|workshop|shop notice)\b/i.test(title))return 'event_or_shop';
 if(/チュートリアル|使い方|入門|基礎講座|活用術|\b(?:tutorial|how to|beginner|tips)\b/i.test(title))return 'tutorial';
 if(/とは[？?]|選び方|完全ガイド|\bevergreen\b/i.test(title))return 'evergreen';
 for(const [type,re] of [
 ['recall',/リコール|\brecall\b/i],['discontinued',/生産終了|販売終了|\bdiscontinued\b/i],
 ['firmware',/ファームウェア|\bfirmware\b/i],['price_change',/価格改定|値上げ|値下げ|\bprice change\b/i],
 ['update',/アップデート|更新|新機能|\bupdate\b/i],['new_product',/新製品|新登場|登場|発表|\b(?:new product|new model|announce(?:ment|d)?)\b/i],
 ['release',/発売|リリース|\brelease\b/i],['review',/レビュー|紹介|\breview\b/i]])if(re.test(title))return type;
 return 'other';
}
export function allowedArticlePath(url,source) {
 let path;try{path=decodeURIComponent(new URL(url).pathname);}catch{return false;}
 if(path.split('/').some(segment=>(source.deniedPathSegments||[]).includes(segment.toLowerCase())))return false;
 return !(source.deniedPaths||[]).some(p=>path.startsWith(p))&&(!(source.allowedPaths||[]).length||source.allowedPaths.some(p=>path.startsWith(p)));
}
const actions={new_product:'を発表',release:'を発売',update:'を更新',firmware:'のファームウェア更新',price_change:'の価格改定',discontinued:'の販売終了',recall:'のリコール情報',review:'の製品レビュー'};
export function validLabel(label,original='') {
 return typeof label==='string'&&label.trim().length>=4&&label.length<=140&&!/[<>\x00-\x1f]/.test(label)&&label.trim()!==original.trim();
}
export async function candidateFrom(entry,source,robots,now,pepper) {
 const url=sourceUrl(entry.url,source);
 if(!url||!allowedArticlePath(url,source)||entry.optOut||robots.isAllowed(url,'SoundCruiseNewsBot')!==true)return {reason:'url_or_optout'};
 if(source.discoveryType==='shimamura_listing'&&(entry.listingSection!=='product_news'||!listingArticleUrl(url)))return {reason:'listing_entry_invalid'};
 const timestamp=Date.parse(entry.date);const hasDate=Number.isFinite(timestamp);
 if(hasDate&&(timestamp>now||now-timestamp>90*DAY))return {reason:'date_outside_window'};
 if(typeof entry.title!=='string'||!entry.title.trim()||entry.title.length>512)return {reason:'title_invalid'};
 if(source.discoveryType==='shimamura_listing'){const reason=listingExclusion(entry.title);if(reason)return {reason};}
 const eventType=contentType(entry.title);
 if(['tutorial','evergreen','sale','event_or_shop'].includes(eventType))return {reason:eventType};
 const facts=productFacts(entry.title);
 let category=classify(entry.title);
 if(!category&&entry.listingSection==='product_news'&&source.discoveryType==='shimamura_listing'){
  if(entry.listingCategory==='amp-effector')category='amps_effects';
  if(entry.listingCategory==='guitar-bass')category='electric_guitar_bass';
  if(entry.listingCategory==='dtm-recording')category=null;
 }
 if(source.gearOnly&&['artist_guitar','live_guitar','media_other'].includes(category))return {reason:'source_scope'};
 if(source.artistOnly&&!['artist_guitar','live_guitar'].includes(category))return {reason:'source_scope'};
 if(!category && entry.title)return {reason:'not_relevant'};
 // Conservative deterministic template. No source phrase or instructions interpolated.
 // Detailed product labels require local human editing, never automatic publication.
 let confident=facts&&actions[eventType];
 const titleFingerprint=await fingerprint(entry.title,pepper);
 let label=confident?`${facts.brand?facts.brand+'、':''}${facts.product}${facts.version?' '+facts.version:''}${actions[eventType]}`:facts?`${facts.product}${facts.version?' '+facts.version:''}の製品情報（要確認）`:'審査待ち（製品名と出来事の確認が必要）';
 if(confident&&await headlineSimilarity(label,titleFingerprint,pepper)){label=`${facts.product}の製品情報（要確認）`;confident=false;}
 if(!validLabel(label,entry.title))return {reason:'label_invalid'};
 const id=await hash(url);
 return {item:{id,sourceId:source.id,sourceName:source.name,sourceUrl:url,normalizedUrl:url,
  publishedAt:hasDate?new Date(timestamp).toISOString():null,category:category||'media_other',label,
  topicKey:id,collectedAt:new Date(now).toISOString(),
  eventType,productFacts:facts,titleFingerprint:JSON.stringify(titleFingerprint),feedPublishedAt:hasDate?new Date(timestamp).toISOString():null,
  manualReviewStatus:'pending',reviewReason:!confident?'label_required':hasDate?'structured_review_required':'publication_date_and_optout_review'}};
}
