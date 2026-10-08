import {productArticleLabel} from './product-article-evidence.js';
import {validatedShimamuraProductFacts,shimamuraProductLabel} from './shimamura-product-evidence.js';
import {namedWorkshopLabel} from './named-workshop-evidence.js';
import {guitarExhibitionLabel} from './guitar-exhibition-evidence.js';
import {agmEditorialAssessment,agmEditorialLabel} from './agm-sections.js';
import {highValueAssessment,highValueLabel,assessedRecordingFacts} from './high-value.js';
import {productActionSuffix,productEventFrom,validatedProductEvent,uncertainProductAction} from './product-event.js';
import {listingArticleUrl,listingExclusion} from './shimamura-listing.js';
import { fingerprint, headlineSimilarity } from './fingerprint.js';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import {validatedIkebeProductFacts,ikebeProductLabel} from './ikebe-product-evidence.js';
import {validHeadlineEvidence,productSubject,explicitReleaseAction,enrichHeadlineFacts,releaseSuffix,listingTypeFamily} from './headline-evidence.js';
import { sourceUrl, optOut, hash, DAY } from './policy.js';
import { assessSale, saleLabel, hasHype } from './sale.js';
const array=v=>v===undefined?[]:Array.isArray(v)?v:[v];
const string=v=>typeof v==='string'?v:typeof v?.['#text']==='string'?v['#text']:'';
export function parseMetadata(xml,type) {
 if(/<!DOCTYPE|<!ENTITY/i.test(xml)||xml.length>1000000)throw new Error('xml_unsafe');
 if(XMLValidator.validate(xml)!==true)throw new Error('xml_invalid');
 const parsed=new XMLParser({ignoreAttributes:false,processEntities:false,parseTagValue:false,trimValues:true}).parse(xml);
 let nodes;
 if(type==='rss' && parsed.rss?.channel)nodes=array(parsed.rss.channel.item);
 else if(type==='rss'&&parsed['rdf:RDF'])nodes=array(parsed['rdf:RDF'].item);
 else if((type==='atom'||type==='rss') && parsed.feed)nodes=array(parsed.feed.entry);
 else if(type==='sitemap' && parsed.urlset)nodes=array(parsed.urlset.url);
 else throw new Error('metadata_format');
 return nodes.slice(0,100).map(n=>({
  title:string(n.title||n['news:news']?.['news:title']),
  url:string(n.loc)||string(n.link)||array(n.link).find(l=>!l['@_rel']||l['@_rel']==='alternate')?.['@_href']||'',
  date:string(n.pubDate||n.published||n['dc:date']||n['news:news']?.['news:publication_date']),
  // Ordinary sitemap lastmod is NOT an article publication date. Keep unknown date pending.
  metadataCategories:array(n.category).map(string).filter(Boolean).slice(0,8),
  optOut:optOut(string(n.robots))||array(n.meta).some(m=>/robots/i.test(m['@_name']||'')&&optOut(m['@_content']))
 }));
}
export const CATEGORIES=['acoustic_guitar','electric_guitar_bass','amps_effects','recording_audio','dtm_software','creator_streaming','artist_guitar','live_guitar','media_other','sale'];
const PRODUCTS = [
 // Primary product identities outrank brand defaults and descriptive use/design words.
 // Sources: Yamaha RS20MM electric-guitar product page; assessed Shimamura articles
 // 91045 (FLpad), 89868 (Silver Sky), 89963 (SJ-200 / Hummingbird).
 {brandRe:/\bYamaha\b|ヤマハ/i,re:/\bRS20MM\b/i,brand:'Yamaha',product:'RS20MM',category:'electric_guitar_bass'},
 {brandRe:/\bNovation\b/i,re:/\bFLpad(?:\s*Mini)?\b/i,brand:'Novation',product:'FLpad',category:'recording_audio'},
 {brandRe:/\bPRS\b/i,re:/\bSilver Sky\b/i,brand:'PRS',product:'Silver Sky',category:'electric_guitar_bass'},
 {brandRe:/\bGibson\b/i,re:/(?=[\s\S]*\bSJ-200\b)(?=[\s\S]*\bHummingbird\b)/i,brand:'Gibson',product:'SJ-200 / Hummingbird',category:'acoustic_guitar'},
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
// Identifiers, not headline phrases. Explicit brand + model (or reviewed alias) is mandatory.
const BRANDS=Object.freeze([
 ['LAVA MUSIC','amps_effects',['LAVA MUSIC','LAVA']],['ESP','electric_guitar_bass',['ESP']],['HISTORY','electric_guitar_bass',['HISTORY']],['Jackson','electric_guitar_bass',['Jackson']],['Gretsch','electric_guitar_bass',['Gretsch']],
 ['Headway','acoustic_guitar',['Headway','ヘッドウェイ']],['Bacchus','electric_guitar_bass',['Bacchus','バッカス']],['Momose','electric_guitar_bass',['Momose','momose']],
 ['Godin','acoustic_guitar',['Godin','ゴダン']],['KIKUTANI','recording_audio',['KIKUTANI','キクタニ']],['JAM Pedals','amps_effects',['JAM Pedals']],
 ['dBTechnologies','recording_audio',['dBTechnologies']],['DE','recording_audio',['DE']],
 ['IK Multimedia','dtm_software',['IK Multimedia','IKマルチメディア','IKマルチメディア']],['Synchro Arts','dtm_software',['Synchro Arts','SynchroArts']],
 ['DOTEC-AUDIO','dtm_software',['DOTEC-AUDIO']],['Leapwing','dtm_software',['Leapwing']],['Toontrack','dtm_software',['Toontrack']],
 ['Auburn Sounds','dtm_software',['AUBURN SOUNDS']],['Lunacy Audio','dtm_software',['Lunacy Audio','LunacyAudio']],['Universal Audio','dtm_software',['Universal Audio','UniversalAudio','ユニバーサルオーディオ']],
 ['Impact Soundworks','dtm_software',['Impact Soundworks']],['ZOOM','recording_audio',['ZOOM']],['AHS','dtm_software',['AHS']],
 ['Yamaha','acoustic_guitar',['Yamaha','YAMAHA','ヤマハ']],['Fender','electric_guitar_bass',['Fender','フェンダー']],['BOSS','amps_effects',['BOSS']],['VOX','amps_effects',['VOX']],
 ['Roland','recording_audio',['Roland']],['SHURE','recording_audio',['SHURE']],['AKG','recording_audio',['AKG']],['Sennheiser','recording_audio',['Sennheiser']],['MOTU','recording_audio',['MOTU']]
]);
const IDENTIFIERS=Object.freeze([
 ['LAVA MUSIC',/\bLAVA\s+(?:MUSIC\s+)?STUDIO\b/i,'LAVA STUDIO','amps_effects'],
 ['ESP',/PA-MF-10(?:[^A-Za-z0-9]|$)/,'PA-MF-10','electric_guitar_bass'],['ESP',/PA-MF-08(?:[^A-Za-z0-9]|$)/,'PA-MF-08','electric_guitar_bass'],
 ['HISTORY',/\bHSLC-/,'HSLCシリーズ','electric_guitar_bass'],['Jackson',/Flex\s*A-Frame\s*Stand/i,'Flex A-Frame Stand','electric_guitar_bass'],
 ['Jackson',/\bPC1-E\b/i,'PC1-E','electric_guitar_bass'],['Gretsch',/Logo\s*Barstool/i,'Logo Barstool','electric_guitar_bass'],
 ['JAM Pedals',/Wahcko\s*mk[. ]*2/i,'Wahcko mk.2','amps_effects'],['Godin',/Century\s*Maho\s*EQ/i,'Century Maho EQ','acoustic_guitar'],
 ['DOTEC-AUDIO',/DeeMultiWider/i,'DeeMultiWider','dtm_software'],['Leapwing',/CenterOne\s*3/i,'CenterOne 3','dtm_software'],
 ['Toontrack',/Session Legend/i,'Session Legend EBX','dtm_software'],['Auburn Sounds',/Psypan\s*2/i,'Psypan 2','dtm_software'],
 ['IK Multimedia',/SINPHONICA/i,'SINPHONICA','dtm_software'],['Synchro Arts',/VocAlign\s*7/i,'VocAlign 7','dtm_software'],
 ['Lunacy Audio',/\bNOVA\b/,'NOVA','dtm_software'],['Universal Audio',/\bLUNA\s*3\b/,'LUNA','dtm_software']
]);
const normalizeIdentifier=t=>t.replace(/[™®]/g,'').normalize('NFKC');
const brandMention=(t,aliases)=>aliases.some(a=>new RegExp('(?:^|[^A-Za-z])'+a.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:[^A-Za-z]|$)',['BOSS','DE'].includes(a)?'':'i').test(t));
const safeModel=value=>typeof value==='string'&&value.length<=50&&/^[A-Za-z][A-Za-z0-9-]*(?:[ /][A-Za-z0-9-]+){0,3}$/.test(value)&&/\d/.test(value)&&!/^(?:IP\d+|HDMI|USB|DTM|DAW|AI)$/i.test(value);
// Only an explicitly quoted, bounded family + generation noun is accepted.
// A generation token alone is never a product identity. No headline adjectives are retained.
export function quotedGenerationProduct(title) {
 const names=[...normalizeIdentifier(title).matchAll(/[「『“"]([A-Za-z][A-Za-z0-9-]*(?: [A-Za-z][A-Za-z0-9-]*){0,2} (?:Gen ?[1-9][0-9]?|MK ?(?:II|III|IV|[1-9])|V[1-9][0-9]?|Series (?:II|III|IV)))[」』”"]/gi)]
  .map(m=>m[1].replace(/\bGen ?([1-9][0-9]?)$/i,'Gen $1'));
 const unique=[...new Set(names)];
 return unique.length===1&&safeModel(unique[0])?unique[0]:null;
}
function extendedProductFacts(title){
 const t=normalizeIdentifier(title);
 for(const [brand,category,aliases] of BRANDS){if(!brandMention(t,aliases))continue;
  for(const [b,re,product,cat] of IDENTIFIERS)if(b===brand&&re.test(t))return {brand,product,version:brand==='Universal Audio'?'3':null,category:cat,identifierBasis:'reviewed_alias'};
  // Model codes are bounded nouns. No adjectives, arbitrary quoted phrases or instructions.
  const at=aliases.map(a=>t.toLowerCase().indexOf(a.toLowerCase())).filter(n=>n>=0).sort((a,b)=>a-b)[0];
  const nearby=t.slice(at,at+100).match(/\b[A-Z][A-Za-z]{0,8}[-]?\d{1,4}[A-Za-z0-9-]{0,14}\b/g)||[];
  const product=quotedGenerationProduct(t.slice(at,at+200))||nearby.find(x=>safeModel(x)&&!/^Gen[0-9]+$/i.test(x));if(product)return {brand,product,version:null,category,identifierBasis:'explicit_model_code'};
 }
 return null;
}
// Brand uncertainty does not invent an owner or block a verified, distinctive model noun.
const SOFTWARE_MODELS=Object.freeze([
 ['VocAlign 7',/VocAlign\s*7/i],['CenterOne 3',/CenterOne\s*3/i],['DeeMultiWider',/DeeMultiWider/i],
 ['Psypan 2',/Psypan\s*2/i],['SINPHONICA',/SINPHONICA/i],['Session Legend EBX',/Session Legend/i],
 ['NOVA',/\bNOVA\b/,/\bDAW\b|音源|プラグイン|ソフトウェア/],['LUNA',/\bLUNA\s*(3)\b/,/\bDAW\b|音源|プラグイン|ソフトウェア/]
]);
function modelOnlyFacts(title){const t=normalizeIdentifier(title);if(/LUNA\s+SEA|新曲|バンド|MV公開/i.test(t))return null;
 for(const [product,re,context] of SOFTWARE_MODELS){const m=re.exec(t);if(m&&(!context||context.test(t)))return {brand:null,product,version:m[1]||null,category:'dtm_software',identifierBasis:'distinctive_software_model'};}return null;
}
const IKEBE_MODELS=Object.freeze([
 // Exact manufacturer + model nouns on the assessed listing; never infer an owner
 // from a bare model or treat unrelated nearby digits as a product identifier.
 ['Fortin Amplification',/(?=[\s\S]*Fortin)[\s\S]*[「『【]3\.33[」』】]/i,'3.33','amps_effects'],
 ['Ibanez',/(?:^|[^A-Za-z0-9])Ibanez\s*j\.custom\s+RG8570EM-NT(?:[^A-Za-z0-9]|$)/i,'j.custom RG8570EM-NT','electric_guitar_bass'],
 ['Fender',/(?:^|[^A-Za-z0-9])Fender\s+MEX\s*Limited Edition Player Fusion(?: Series| Stratocaster HSS)?(?:[^A-Za-z0-9]|$)/i,'Limited Edition Player Fusion','electric_guitar_bass'],
 ['Epiphone',/(?:^|[^A-Za-z0-9])Epiphone\s*Joan Jett Olympic Special(?:[^A-Za-z0-9]|$)/i,'Joan Jett Olympic Special','electric_guitar_bass'],
 ['KORG',/(?:^|[^A-Za-z0-9])KORG\s*Nu\s*[:：]?\s*Tekt\s+NuTube\s+HIGH GAIN OD(?:[^A-Za-z0-9]|$)/i,'Nu:Tekt NuTube HIGH GAIN OD','amps_effects'],
 ['KORG',/(?:^|[^A-Za-z0-9])KORG\s*Nu\s*[:：]?\s*Tekt\s+NuTube\s+OD-KIT CUSTOM CRAFT BD-S(?:[^A-Za-z0-9]|$)/i,'Nu:Tekt NuTube OD-KIT CUSTOM CRAFT BD-S','amps_effects'],
 ['KLOWRA',/(?:^|[^A-Za-z0-9])KLOWRA\s*Leap Octave(?:[^A-Za-z0-9]|$)/i,'Leap Octave','amps_effects'],
 ['KORG',/(?:^|[^A-Za-z0-9])KORG\s*TM-1(?:[^A-Za-z0-9]|$)/i,'TM-1','electric_guitar_bass',/チューナー|メトロノーム|\b(?:tuner|metronome)\b/i],
 ['BOSS',/(?:^|[^A-Za-z0-9])BOSS\s*EX-4(?:EffectsExpander)?(?:[^A-Za-z0-9]|$)/i,'EX-4','amps_effects'],
 ['Xotic',/(?:^|[^A-Za-z0-9])Xotic\s*XXP-1(?:[^A-Za-z0-9]|$)/i,'XXP-1','amps_effects'],
 ['Yamaha',/(?:^|[^A-Za-z0-9])Yamaha\s*RS20MM(?:[^A-Za-z0-9]|$)/i,'RS20MM','electric_guitar_bass'],
 ['KORG',/(?:^|[^A-Za-z0-9])KORG\s*OD-KIT\s*CUSTOM\s*CRAFT(?:[^A-Za-z0-9]|$)/i,'OD-KIT CUSTOM CRAFT','amps_effects'],
 ['VOX',/(?:^|[^A-Za-z0-9])VOX\s*AC[- ]?MINI(?:[^A-Za-z0-9]|$)/i,'AC MINI','amps_effects']
]);
const IKEBE_BRANDS=Object.freeze([...BRANDS,['MXR','amps_effects',['MXR']],['Gibson','electric_guitar_bass',['Gibson']],['KORG','amps_effects',['KORG']]]);
const IKEBE_TYPES=Object.freeze([
 ['acoustic_guitar',/アコースティックギター|アコギ|\bacoustic guitar\b/i,'guitar'],
 ['amps_effects',/ギターアンプ|エフェクター|ペダル|\b(?:guitar amp|pedal|effects?)\b/i,'amp_effect'],
 ['electric_guitar_bass',/エレキギター|エレキベース|ギター|ベース|\b(?:electric guitar|bass guitar|guitar)\b/i,'guitar'],
 ['electric_guitar_bass',/ギタースタンド|ギター用|ギターケース|ピックアップ|\b(?:guitar stand|guitar case|pickup)\b/i,'guitar_accessory']
]);
export function ikebeListingFacts(entry,source){
 if(source.id!=='ikebe'||source.baseUrl!=='https://www.ikebe-gakki-pb.com/'||source.discoveryUrl!=='https://www.ikebe-gakki-pb.com/new_product/'||entry.listingSection!=='product_news')return null;
 const title=normalizeIdentifier(entry.title),type=IKEBE_TYPES.find(([,re])=>re.test(title));if(!type)return null;
 const brands=IKEBE_BRANDS.filter(([, ,aliases])=>brandMention(title,aliases));if(brands.length!==1)return null;
 const [brand,,aliases]=brands[0];const at=aliases.map(a=>title.toLowerCase().indexOf(a.toLowerCase())).filter(n=>n>=0).sort((a,b)=>a-b)[0];
 const after=title.slice(at).replace(new RegExp('^'+aliases.find(a=>title.slice(at).toLowerCase().startsWith(a.toLowerCase())).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'),'');
 // Require the model immediately after the explicit brand, never an unrelated nearby number.
 const match=/^[\s「『“"【:：-]*([A-Z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*)(?=$|[\s」』”"】、。,.;！!（）()])/i.exec(after);
 if(!match||!safeModel(match[1])||/^(?:USB|HDMI|IP)\d/i.test(match[1]))return null;
 return {brand,product:match[1],version:null,category:type[0],productType:type[2],identifierBasis:'explicit_listing_facts',listingSource:'ikebe'};
}
const IK_MODELS=Object.freeze([['TONEX Board','amps_effects'],['TONEX ONE Plus','amps_effects'],['TONEX ONE','amps_effects'],['TONEX','amps_effects'],['iRig HD X','recording_audio'],['iRig HD 2','recording_audio'],['iRig Pro I/O','recording_audio'],['AXE I/O ONE','recording_audio'],['AXE I/O','recording_audio'],['AmpliTube 5','dtm_software'],['AmpliTube','dtm_software'],['ReSing','dtm_software'],['SINPHONICA','dtm_software'],['iLoud Sub','recording_audio'],['ARC On-Ear','recording_audio']]);
const ZOOM_MODELS=Object.freeze(['F6','TCA-1','H2essential','WLM-1','H1essential','H5studio','H6studio','H6essential']);
function manufacturerFacts(entry,source){
 if(source.id==='ikebe'&&source.baseUrl==='https://www.ikebe-gakki-pb.com/'&&source.discoveryUrl==='https://www.ikebe-gakki-pb.com/new_product/'&&entry.listingSection==='product_news'){
  const t=normalizeIdentifier(entry.title),matches=IKEBE_MODELS.filter(([,re,,,context])=>re.test(t)&&(!context||context.test(t)));
  if(matches.length===1){const [brand,,product,category]=matches[0];return {brand,product,category,version:null,identifierBasis:'reviewed_listing_model',listingSource:'ikebe'};}
 }
 if(source.id==='ik'&&source.sourceKind==='official'&&source.discoveryUrl==='https://www.ikmultimedia.com/press/'&&entry.listingSection==='ik_press'){
  const t=normalizeIdentifier(entry.title);const match=IK_MODELS.filter(([m])=>!['TONEX','AmpliTube'].includes(m)).find(([m])=>new RegExp('(?:^|[^A-Za-z0-9])'+m+'(?:[^A-Za-z0-9]|$)','i').test(t));
  return match?{brand:'IK Multimedia',product:match[0],version:null,category:match[1],identifierBasis:'official_manufacturer_model',manufacturerSource:'ik'}:null;
 }
 if(source.id!=='zoom'||source.sourceKind!=='official'||source.discoveryUrl!=='https://zoomcorp.com/ja/jp/news/'||entry.listingSection!=='official_news')return null;
 const product=ZOOM_MODELS.find(m=>new RegExp('(?:^|[^A-Za-z0-9])'+m+'(?:[^A-Za-z0-9]|$)','i').test(entry.title));
 return product?{brand:'ZOOM',product,version:null,category:'recording_audio',identifierBasis:'official_manufacturer_model',manufacturerSource:'zoom'}:null;
}
export function validatedProductFacts(facts){
 if(!facts||!validHeadlineEvidence(facts))return false;
 if(facts.identifierBasis==='explicit_shimamura_product_fields')return validatedShimamuraProductFacts(facts);
 if(facts.identifierBasis==='explicit_article_product_fields')return validatedIkebeProductFacts(facts);
 if(assessedRecordingFacts(facts))return true;
 if(facts.identifierBasis==='verified_article_facts')return facts.articleSource==='ik'&&facts.brand==='IK Multimedia'&&facts.product==='TONEX software'&&facts.category==='dtm_software'&&facts.version==='2.0';
 if(facts.identifierBasis==='explicit_listing_facts')return facts.listingSource==='ikebe'&&IKEBE_BRANDS.some(([b])=>b===facts.brand)&&safeModel(facts.product)&&IKEBE_TYPES.some(([c,,t])=>c===facts.category&&t===(facts.productTypeEvidence?listingTypeFamily(facts.productType):facts.productType));
 if(facts.identifierBasis==='reviewed_listing_model')return facts.listingSource==='ikebe'&&IKEBE_MODELS.some(([b,,p,c])=>b===facts.brand&&p===facts.product&&c===facts.category);
 if(facts.identifierBasis==='official_manufacturer_model'&&facts.manufacturerSource==='ik')return facts.brand==='IK Multimedia'&&IK_MODELS.some(([p,c])=>facts.product===p&&facts.category===c);
 if(facts.identifierBasis==='official_manufacturer_model')return facts.manufacturerSource==='zoom'&&facts.brand==='ZOOM'&&facts.category==='recording_audio'&&ZOOM_MODELS.includes(facts.product);
 if(facts.brand===null&&facts.category==='dtm_software'&&facts.identifierBasis==='distinctive_software_model')return SOFTWARE_MODELS.some(([p])=>p===facts.product);
 if(PRODUCTS.some(p=>p.brand===facts.brand&&p.product===facts.product&&p.category===facts.category))return true;
 if(facts.identifierBasis==='reviewed_alias')return IDENTIFIERS.some(([b,,p,c])=>b===facts.brand&&p===facts.product&&c===facts.category);
 return facts.identifierBasis==='explicit_model_code'&&BRANDS.some(([b,c])=>b===facts.brand&&c===facts.category)&&safeModel(facts.product);
}
export function factualTopicKey(facts,eventType){
 if(eventType==='product_article'&&facts.kind==='product_article')return 'article:'+JSON.stringify([facts.brand,facts.models,facts.articleType,facts.theme]).toLowerCase();
 const family=['new_product','release','other'].includes(eventType)?'product':eventType;
 return 'facts:'+(facts.brand||'unknown').toLowerCase().replace(/[^a-z0-9]/g,'')+':'+facts.product.toLowerCase().replace(/[^a-z0-9]/g,'')+':'+(facts.version||'')+':'+family;
}
const GUITAR_EVENTS=Object.freeze([['信州ギター祭',/信州ギター祭/]]);
const ARTISTS=Object.freeze(['山崎まさよし','森山直太朗','斉藤和義','秦基博','あいみょん','スガシカオ','優里','矢井田瞳','奥田民生','竹原ピストル','森恵','大石昌良','長澤知之','Caravan']);
export function guitarEventFacts(title,source){
 if(!source.contentTypes?.includes('artist')||source.gearOnly)return null;
 const t=normalizeIdentifier(title);
 if(/ピアノ弾き語り|piano/i.test(t)&&!/ギター|guitar/i.test(t))return null;
 for(const [name,re] of GUITAR_EVENTS)if(re.test(t)&&/開催|出展|公演|出演/.test(t))return {kind:'guitar_event',category:'live_guitar',event:name,evidence:'guitar_gear',action:/出展/.test(t)?'exhibiting':'information'};
 if(source.id==='kikutani'&&/ギター|guitar/i.test(t)&&/リサイタル|\brecital\b/i.test(t)&&!/中止|延期|ピアノ|piano/i.test(t))return {kind:'guitar_event',category:'live_guitar',event:'ギターリサイタル',evidence:'explicit_guitar_recital',action:'information'};
 if(!/ギター|guitar|弾き語り/i.test(t)||!/ライブ|公演|開催|出演|弾き語り/.test(t))return null;
 const artist=ARTISTS.find(name=>t.startsWith(name+'、')||t.startsWith(name+'が')||t.startsWith(name+' '));
 return artist?{kind:'guitar_event',category:'live_guitar',event:artist,evidence:/弾き語り/.test(t)?'acoustic_guitar_vocal':'guitar_performance',action:'performance'}:null;
}
export function guitarEventLabel(facts){
 if(facts?.kind!=='guitar_event'||facts.category!=='live_guitar')return null;
 if(facts.event==='ギターリサイタル'&&facts.evidence==='explicit_guitar_recital'&&facts.action==='information')return 'ギターリサイタルの開催情報';
 if(GUITAR_EVENTS.some(([name])=>name===facts.event)&&facts.evidence==='guitar_gear'&&['information','exhibiting'].includes(facts.action))return facts.event+'、ギター関連イベントの'+(facts.action==='exhibiting'?'出展情報':'開催情報');
 if(ARTISTS.includes(facts.event)&&['acoustic_guitar_vocal','guitar_performance'].includes(facts.evidence)&&facts.action==='performance')return facts.event+'、ギター'+(facts.evidence==='acoustic_guitar_vocal'?'弾き語り':'演奏')+'の公演情報';
 return null;
}
const GUITARIST_ALIASES=Object.freeze([['リック・ニールセン',['リック・ニールセン','Rick Nielsen']]]);
function artistFacts(title,source){
 if(source.id!=='amass'||source.discoveryUrl!=='https://amass.jp/rss/3745'||!source.artistOnly)return null;
 const t=normalizeIdentifier(title);if(!/ギター|guitar/i.test(t)||/ゴシップ|不倫|逮捕|ピアノ|piano/i.test(t))return null;
 const performer=GUITARIST_ALIASES.find(([,aliases])=>aliases.some(a=>t.toLowerCase().includes(a.toLowerCase())));
 return performer?{kind:'guitar_artist',category:'artist_guitar',performer:performer[0],evidence:'named_guitarist_and_instrument',action:'guitar_information'}:null;
}
function artistLabel(facts){return facts?.kind==='guitar_artist'&&facts.category==='artist_guitar'&&facts.evidence==='named_guitarist_and_instrument'&&facts.action==='guitar_information'&&GUITARIST_ALIASES.some(([name])=>name===facts.performer)?facts.performer+'、ギター演奏に関する話題':null;}
export function productFacts(title) {
 const normalized=normalizeIdentifier(title);
 // Require both names in the same headline. Product aliases never supply a missing brand.
 if(/\bLUNA\s+SEA\b/i.test(normalized))return null;
 for(const p of PRODUCTS){const m=p.re.exec(normalized);if(p.brandRe.test(normalized)&&m)return {brand:p.brand,product:p.product,version:m[1]||null,category:p.category};}
 return extendedProductFacts(title)||modelOnlyFacts(title);
}
export function classify(title) {
 const known=productFacts(title);if(known)return known.category;
 if(/ピアノ弾き語り|piano\s*(and|\+|&)\s*vocal/i.test(title)&&!/ギター|\bguitar\b/i.test(title))return null;
 if(/弾き語り|ライブ(?!ラリ)|ツアー|\b(concert|tour)\b/i.test(title))return /ギター|\bguitar\b|\bpedalboard\b/i.test(title)?'live_guitar':null;
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
 // A sale signal routes to sale assessment (NEWS 1.5.0); it is no longer an automatic rejection.
 if(/セール|クーポン|中古|下取り|買取|特価|プライスダウン|送料無料|ブラック\s*フライデー|サイバー\s*マンデー|決算|期間限定.{0,20}(?:値下げ|割引|オフ)|ポイント.{0,8}倍|\b(?:sale|coupon|used|black\s*friday|cyber\s*monday|price\s*down)\b|\d+\s*%\s*(?:off|オフ)/i.test(title))return 'sale';
 if(/キャンペーン|\bcampaign\b/i.test(title)&&!/新製品|新登場|発売|発表|リリース|アップデート|ファームウェア|価格改定|リコール|生産終了|販売終了|\b(?:new product|new model|release|announce|update|firmware|recall)\b/i.test(title))return 'sale';
 if(/イベント|体験会|試奏会|展示会|レッスン|生徒募集|採用|求人|店舗から|店舗案内|営業案内|営業時間|開店|閉店|休業|入荷情報|\b(?:event|lesson|recruit|workshop|shop notice)\b/i.test(title))return 'event_or_shop';
 if(/チュートリアル|使い方|入門|基礎講座|活用術|\b(?:tutorial|how to|beginner|tips)\b/i.test(title))return 'tutorial';
 if(/開発秘話|開発ストーリー|歴史|とは[？?]|選び方|完全ガイド|\bevergreen\b/i.test(title))return 'evergreen';
 // Keep the existing product/duplicate family. The precise lifecycle is stored
 // in releaseEvent, not a schema/category migration.
 if(explicitReleaseAction(title))return 'release';
 for(const [type,re] of [
 ['recall',/リコール|\brecall\b/i],['discontinued',/生産終了|販売終了|\bdiscontinued\b/i],
 ['firmware',/ファームウェア|\bfirmware\b/i],['price_change',/価格改定|値上げ|値下げ|\bprice change\b/i],
 ['update',/アップデート|更新|新機能|\bupdate\b/i],['new_product',/新製品|新登場|登場|発表|\b(?:new product|new model|introduc(?:ing|es|e)|announce(?:ment|d)?)\b/i],
 ['release',/発売|リリース|\brelease(?:d|s)?\b/i],['review',/レビュー|紹介|\breview\b/i]])if(re.test(title))return type;
 return 'other';
}
export function allowedArticlePath(url,source) {
 let path;try{path=decodeURIComponent(new URL(url).pathname);}catch{return false;}
 if(source.articlePathPattern&&!new RegExp(source.articlePathPattern).test(path))return false;
 if(path.split('/').some(segment=>(source.deniedPathSegments||[]).includes(segment.toLowerCase())))return false;
 return !(source.deniedPaths||[]).some(p=>path.startsWith(p))&&(!(source.allowedPaths||[]).length||source.allowedPaths.some(p=>path.startsWith(p)));
}
const actions={other:'の製品情報',new_product:'を発表',release:'を発売',update:'を更新',firmware:'のファームウェア更新',price_change:'の価格改定',discontinued:'の販売終了',recall:'のリコール情報',review:'の製品レビュー'};
export function factualLabel(facts,eventType){
 if(eventType==='product_article')return productArticleLabel(facts);
 if(eventType==='agm_editorial')return agmEditorialLabel(facts,eventType);
 if(eventType==='sale')return saleLabel(facts);
 if(eventType==='guitar_event')return namedWorkshopLabel(facts)||guitarExhibitionLabel(facts)||highValueLabel(facts,eventType)||guitarEventLabel(facts);
 if(eventType==='guitar_artist')return highValueLabel(facts,eventType)||artistLabel(facts);
 if(!facts||eventType==='review'||!actions[eventType]||!validatedProductFacts(facts)||facts.version!==null&&facts.version!==undefined&&!/^\d{1,3}(?:\.\d{1,3}){0,2}$/.test(facts.version))return null;
 if(facts.productEvent&&(!['new_product','release','other'].includes(eventType)||!validatedProductEvent(facts.productEvent)))return null;
 if(facts.releaseEvent&&!['release','new_product','other'].includes(eventType))return null;
 if(facts.releaseEvent){
  const descriptors={limited_edition:`の${facts.editionMarket==='Japan'?'日本':''}限定モデル`,special_edition:'の特別仕様',new_color:'の新色',collaboration:'のコラボモデル',reissue:'の復刻版',rerelease:'の再発売モデル',new_variant:'の新仕様'};
  if(facts.productEvent?.signal==='explicit_limited_color')descriptors.limited_edition='の限定カラー';
  if(facts.productEvent?.signal==='explicit_collaboration_color')descriptors.collaboration='のコラボカラー';
  return `${facts.brand?facts.brand+'、':''}${productSubject(facts)}${facts.productEvent?descriptors[facts.productEvent.action]:''}${releaseSuffix(facts.releaseEvent)}`;
 }
 if(facts.identifierBasis==='explicit_shimamura_product_fields')return shimamuraProductLabel(facts,eventType);
 const primary=ikebeProductLabel(facts,eventType);if(primary)return primary;
 return `${facts.brand?facts.brand+'、':''}${productSubject(facts)}${facts.productEvent?productActionSuffix(facts.productEvent):actions[eventType]}`;
}
export function validLabel(label,original='') {
 return typeof label==='string'&&label.trim().length>=4&&label.length<=140&&!/[<>\x00-\x1f]/.test(label)&&label.trim()!==original.trim()&&!hasHype(label);
}
// Major equipment sales are NEWS-eligible. Small promotions, coupons, points, single items and
// ended sales are rejected; anything uncertain goes to human review (recall-first).
async function saleCandidateFrom(entry,source,url,now,pepper,hasDate,timestamp) {
 if(source.artistOnly)return {decision:'REJECT',reason:'source_scope'};
 const sale=assessSale(entry,source,now,{hasDate,known:!!productFacts(entry.title)});
 if(sale.decision==='REJECT')return sale;
 const titleFingerprint=await fingerprint(entry.title,pepper);
 const factual=saleLabel(sale.facts);
 const label=factual||'審査待ち（セールの販売元・期間・対象の確認が必要）';
 if(!validLabel(label))return {decision:'REJECT',reason:'label_invalid'};
 const auto=sale.decision==='AUTO_PUBLISHABLE'&&!!factual;
 const factualSimilarity=auto&&await headlineSimilarity(label,titleFingerprint,pepper);
 const id=await hash(url);
 return {item:{id,sourceId:source.id,sourceName:source.name,sourceUrl:url,normalizedUrl:url,
  publishedAt:hasDate?new Date(timestamp).toISOString():null,category:'sale',label,
  topicKey:id,collectedAt:new Date(now).toISOString(),
  eventType:'sale',productFacts:sale.facts,titleFingerprint:JSON.stringify(titleFingerprint),feedPublishedAt:hasDate?new Date(timestamp).toISOString():null,
  publicationDecision:auto?'AUTO_PUBLISHABLE':'PUBLISH_REVIEW',
  decisionReason:auto?(factualSimilarity?'factual_label_similarity':'factual_label_ready'):sale.decisionReason,
  manualReviewStatus:'pending',reviewReason:auto?'structured_review_required':sale.decisionReason}};
}
export async function candidateFrom(entry,source,robots,now,pepper) {
 const url=sourceUrl(entry.url,source);
 if(!url||!allowedArticlePath(url,source)||entry.optOut||robots.isAllowed(url,'SoundCruiseNewsBot')!==true)return {decision:'REJECT',reason:'url_or_optout'};
 if(source.discoveryType==='shimamura_listing'&&(entry.listingSection!=='product_news'||!listingArticleUrl(url)))return {decision:'REJECT',reason:'listing_entry_invalid'};
 const timestamp=Date.parse(entry.date);const hasDate=Number.isFinite(timestamp);
 if(hasDate&&(timestamp>now||now-timestamp>90*DAY))return {decision:'REJECT',reason:'date_outside_window'};
 if(typeof entry.title!=='string'||!entry.title.trim()||entry.title.length>512)return {decision:'REJECT',reason:'title_invalid'};
 if(source.discoveryType==='shimamura_listing'){const reason=listingExclusion(entry.title);if(reason)return {decision:'REJECT',reason};}
 if(source.id==='agm'&&source.agmSections&&entry.agmSection){
  const assessed=agmEditorialAssessment(entry);if(assessed.reject)return {decision:'REJECT',reason:assessed.reject};
  // Existing product rules remain authoritative for launches; other editorial kinds
  // are explicit human-review candidates, never permission-driven auto approvals.
  let facts=assessed.facts,eventType='agm_editorial',category=assessed.category;
  if(!assessed.kind&&entry.agmSection==='news'){
   const product=productFacts(entry.title),event=contentType(entry.title);
   if(product&&['release','new_product'].includes(event)){
    facts=enrichHeadlineFacts({...product,...(productEventFrom(entry.title,product,event)?{productEvent:productEventFrom(entry.title,product,event)}:{})},{title:entry.title,publishedAt:entry.date});
    eventType=event;category=facts.category;
   }
  }
  const recovered=entry.articleRecovery;
  if(!factualLabel(facts,eventType)&&recovered?.eventType==='agm_editorial'&&hasDate&&recovered.publishedAt===new Date(timestamp).toISOString()&&recovered.productFacts?.articleUrl===url&&recovered.productFacts.section===entry.agmSection&&agmEditorialLabel(recovered.productFacts,'agm_editorial')){
   facts=recovered.productFacts;category=facts.category;eventType='agm_editorial';
  }
  const label=factualLabel(facts,eventType),id=await hash(url);
  return {item:{id,sourceId:source.id,sourceName:source.name,sourceUrl:url,normalizedUrl:url,publishedAt:hasDate?new Date(timestamp).toISOString():null,
   category,label:label&&validLabel(label,entry.title)?label:'審査待ち（記事の対象・テーマ・出来事の確認が必要）',topicKey:eventType==='agm_editorial'?id:facts?factualTopicKey(facts,eventType):id,
   collectedAt:new Date(now).toISOString(),eventType,productFacts:facts,titleFingerprint:JSON.stringify(await fingerprint(entry.title,pepper)),feedPublishedAt:hasDate?new Date(timestamp).toISOString():null,
   publicationDecision:'PUBLISH_REVIEW',decisionReason:!hasDate?'missing_date':label?'agm_editorial_review':'label_required',manualReviewStatus:'pending',reviewReason:'agm_editorial_review'}};
 }
 const assessed=highValueAssessment(entry,source,now);
 if(assessed){
  if(assessed.reject)return {decision:'REJECT',reason:assessed.reject};
  const {facts,category,eventType}=assessed,label=factualLabel(facts,eventType),ready=!!label&&hasDate&&!entry.listingUncertainty;
  const id=await hash(url),titleFingerprint=JSON.stringify(await fingerprint(entry.title,pepper));
  return {item:{id,sourceId:source.id,sourceName:source.name,sourceUrl:url,normalizedUrl:url,publishedAt:hasDate?new Date(timestamp).toISOString():null,category,label:ready?label:'審査待ち（人物・日時・会場の確認が必要）',topicKey:facts?.artist?'event:'+await hash([facts.artist,facts.eventType,facts.eventDate||(hasDate?new Date(timestamp).toISOString():url),facts.venue||''].join('|')):facts?factualTopicKey(facts,eventType):id,collectedAt:new Date(now).toISOString(),eventType,productFacts:facts,titleFingerprint,feedPublishedAt:hasDate?new Date(timestamp).toISOString():null,publicationDecision:ready?'AUTO_PUBLISHABLE':'PUBLISH_REVIEW',decisionReason:ready?'factual_label_ready':'classification_uncertain',manualReviewStatus:'pending',reviewReason:ready?'structured_review_required':'classification_uncertain'}};
 }

 if(source.id==='hookup'&&/インタビュー|対談|解説|使い方|活用|\b(?:interview|how[- ]to|tutorial|support|tips)\b/i.test(entry.title))return {decision:'REJECT',reason:'hookup_editorial_scope'};
 if(source.id==='ikebe'&&source.discoveryType==='official_listing'&&entry.listingSection==='product_news'&&/ライブショッピング|店舗|レッスン|中古|クーポン|ポイント/i.test(entry.title))return {decision:'REJECT',reason:'ikebe_editorial_scope'};
 const exhibitionPending=source.id==='kikutani'&&/ギター|ペダル|エフェクター/.test(entry.title)&&/出展|展示会/.test(entry.title)&&!/過去|昨年|中止|延期|レビュー|比較/.test(entry.title);
 const guitarEvent=guitarEventFacts(entry.title,source);
 const guitarArtist=artistFacts(entry.title,source);
 let eventType=exhibitionPending?'guitar_event':guitarEvent?'guitar_event':guitarArtist?'guitar_artist':contentType(entry.eventTitle||entry.title);
 if(source.allowedEventTypes&&!source.allowedEventTypes.includes(eventType))return {decision:'REJECT',reason:'source_event_scope'};
 if(['tutorial','evergreen','event_or_shop'].includes(eventType))return {decision:'REJECT',reason:eventType};
 if(eventType==='sale')return saleCandidateFrom(entry,source,url,now,pepper,hasDate,timestamp);
 const titleFacts=manufacturerFacts(entry,source)||ikebeListingFacts(entry,source)||productFacts(entry.title);
 let facts=guitarEvent||guitarArtist||titleFacts;
 const productEvent=productEventFrom(entry.eventTitle||entry.title,titleFacts,eventType);
 const eventUncertain=!!titleFacts&&uncertainProductAction(entry.eventTitle||entry.title,eventType,productEvent);
 if(eventUncertain)facts={...facts,scopeUncertain:true};
 if(productEvent){
  facts={...facts,productEvent};
  if(eventType==='other')eventType='new_product';
  if(source.allowedEventTypes&&!source.allowedEventTypes.includes(eventType))return {decision:'REJECT',reason:'source_event_scope'};
 }
 if(titleFacts)facts=enrichHeadlineFacts(facts,{title:entry.eventTitle||entry.title,publishedAt:entry.date});
 let category=guitarEvent||exhibitionPending?'live_guitar':classify(entry.title);
 if(!category&&entry.listingSection==='product_news'&&source.discoveryType==='shimamura_listing'){
  if(entry.listingCategory==='amp-effector')category='amps_effects';
  if(entry.listingCategory==='guitar-bass')category='electric_guitar_bass';
  if(entry.listingCategory==='dtm-recording')category='recording_audio';
 }
 if(!category&&source.id==='ikebe'&&entry.listingSection==='product_news')category=entry.listingCategory;
 if(!category&&source.id==='ik'&&entry.listingSection==='ik_press'){
  if(/\bTONEX\b|\bAmpliTube\b/i.test(entry.title))category='amps_effects';
  else if(/\biRig\b|\bAXE I\/O\b/i.test(entry.title))category='recording_audio';
 }
 if(facts)category=facts.category;
 if(source.gearOnly&&['artist_guitar','live_guitar','media_other'].includes(category))return {decision:'REJECT',reason:'source_scope'};
 if(source.artistOnly&&!['artist_guitar','live_guitar'].includes(category))return {decision:'REJECT',reason:'source_scope'};
 if(!category)return {decision:'REJECT',reason:'not_relevant'};
 // Conservative deterministic template. No source phrase or instructions interpolated.
 // Detailed product labels require local human editing, never automatic publication.
 const informationalUncertain=!!facts?.releaseEvent||/機能一覧|仕様一覧|スペック一覧|発売予定|年内|発売(?:が)?決定/.test(entry.title)||(source.id==='ik'&&/パック|プリセット|トーンモデル|コレクション|追加(?:ボイス|音色)|拡張|\b(?:pack|collection|presets?|tone models?|for|vol(?:ume)?)\b/i.test(entry.title));
 if(facts&&source.id==='ik'&&informationalUncertain)facts={...facts,scopeUncertain:true};
 const relevanceUncertain=(source.id==='ikebe'&&facts?.identifierBasis==='explicit_model_code')||facts?.brand==='DE'||facts?.brand==='dBTechnologies'||facts?.product==='Logo Barstool';
 let confident=!!(guitarArtist?.action!=='guitar_information'&&!eventUncertain&&!relevanceUncertain&&!informationalUncertain&&facts&&(!!titleFacts||!!guitarEvent||!!guitarArtist||eventType!=='other')&&eventType!=='other'&&['new_product','release','update','firmware','price_change','discontinued','recall','other','guitar_event','guitar_artist'].includes(eventType)&&hasDate&&!entry.listingUncertainty&&!/キャンペーン|\bcampaign\b/i.test(entry.title));
 const titleFingerprint=await fingerprint(entry.title,pepper);
 let label=guitarArtist?.action==='guitar_information'?'審査待ち（ギター関連の出来事の確認が必要）':confident?factualLabel(facts,eventType):facts?`${facts.product}${facts.version?' '+facts.version:''}の製品情報（要確認）`:'審査待ち（製品名と出来事の確認が必要）';
 if(facts?.releaseEvent&&!eventUncertain&&!relevanceUncertain&&hasDate&&!entry.listingUncertainty)label=factualLabel(facts,eventType)||label;
 // A verified facts-only template remains safe even when the source states the same facts.
 const factualSimilarity=confident&&await headlineSimilarity(label,titleFingerprint,pepper);
 if(confident&&!label){confident=false;label='審査待ち（製品名と出来事の確認が必要）';}
 if(!validLabel(label))return {decision:'REJECT',reason:'label_invalid'};
 const firmwareReview=eventType==='firmware';
 const decision=confident&&!firmwareReview?'AUTO_PUBLISHABLE':'PUBLISH_REVIEW';
 const decisionReason=eventUncertain?'product_event_uncertain':relevanceUncertain?'relevance_uncertain':informationalUncertain?'label_required':!hasDate?'missing_date':entry.listingUncertainty|| (!facts||!actions[eventType]?'label_required':'classification_uncertain');
 const id=await hash(url);
 return {item:{id,sourceId:source.id,sourceName:source.name,sourceUrl:url,normalizedUrl:url,
  publishedAt:hasDate?new Date(timestamp).toISOString():null,category:category||'media_other',label,
  topicKey:['guitar_event','guitar_artist'].includes(facts?.kind)?id:facts?factualTopicKey(facts,eventType):id,collectedAt:new Date(now).toISOString(),
  eventType,productFacts:facts,titleFingerprint:JSON.stringify(titleFingerprint),feedPublishedAt:hasDate?new Date(timestamp).toISOString():null,
  publicationDecision:decision,decisionReason:firmwareReview?'firmware_significance_review':confident?(factualSimilarity?'factual_label_similarity':'factual_label_ready'):decisionReason,
  manualReviewStatus:'pending',reviewReason:firmwareReview?'firmware_significance_review':confident?'structured_review_required':decisionReason}};
}
