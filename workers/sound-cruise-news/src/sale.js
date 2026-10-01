// NEWS 1.5.0 sale support. Major equipment sales are NEWS-eligible; small promotions are not.
// Everything here is deterministic and offline. Labels are assembled only from fixed vocabulary,
// the registry seller name, a known brand name and dates: publisher sale copy is never reused.
const DAY=86400000;

export const SALE_EVENTS=Object.freeze([
 ['決算セール',/決算/],
 ['周年記念セール',/周年|アニバーサリー|\banniversary\b/i],
 ['ブラックフライデーセール',/ブラック\s*フライデー|\bblack\s*friday\b/i],
 ['サイバーマンデーセール',/サイバー\s*マンデー|\bcyber\s*monday\b/i],
 ['初売りセール',/初売り|新春/],
 ['年末年始セール',/年末年始|歳末|年末/],
 ['サマーセール',/サマー|夏(?:の|季)?大?セール|\bsummer\b/i],
 ['ウィンターセール',/ウィンター|冬(?:の|季)?大?セール|\bwinter\b/i],
 ['大感謝祭セール',/感謝祭/],
 ['クリアランスセール',/クリアランス|在庫一掃|\bclearance\b/i]
]);
const GENERIC_EVENTS=Object.freeze(['期間限定セール','期間限定の値下げ']);
export const SALE_EQUIPMENT=Object.freeze([
 ['ギター',/ギター|\bguitars?\b/i],
 ['ベース',/ベース(?!ボール)|\bbass(?:es)?\b/i],
 ['エフェクター',/エフェクター|ペダル|\beffects?\b|\bpedals?\b/i],
 ['アンプ',/アンプ|\bamps?\b|\bamplifiers?\b/i],
 ['DTM製品',/DTM|DAW|プラグイン|音源|ソフトウェア|\bplug-?ins?\b|\bsoftware\b/i],
 ['録音機材',/録音|レコーディング|オーディオ\s*インターフェ|マイク|モニタースピーカー|\brecording\b|\bmicrophones?\b|\baudio\s+interfaces?\b/i],
 ['シンセサイザー',/シンセ|\bsynth/i],
 ['キーボード',/キーボード|鍵盤|電子ピアノ/],
 ['ドラム',/ドラム|\bdrums?\b/i]
]);
// Brand names are facts; a single named brand without other scope needs human review.
export const SALE_BRANDS=Object.freeze(['Fender','Gibson','Epiphone','Squier','Ibanez','PRS','Martin','Taylor','Gretsch','Jackson',
 'ESP','YAMAHA','Yamaha','Roland','BOSS','KORG','VOX','Marshall','Line 6','Positive Grid','Universal Audio','Native Instruments',
 'Waves','Steinberg','IK Multimedia','Plugin Alliance','iZotope','Arturia','Spitfire Audio','Softube','FabFilter','Soundtoys','Focusrite',
 'Audio-Technica','SHURE','Neumann','TC Electronic','Electro-Harmonix','Strymon','MXR','Zoom','ZOOM']);
const HYPE=/衝撃|激安|爆安|史上最大|過去最大|見逃し厳禁|お見逃しなく|超お得|今だけ|最安|破格|驚愕|超特価|必見|大放出|ラストチャンス|急げ/;
const PRICE=/セール|\bsale\b|値下げ|値引|プライスダウン|price\s*down|割引|\d+\s*%\s*(?:off|オフ)|特別価格|特価|\bdeals?\b/i;
const BROAD=/全品|全商品|全ブランド|複数ブランド|多数|数百|数千|\d{2,}\s*(?:点|機種|製品|アイテム|ブランド)|ブランド横断|カテゴリ(?:ー)?全|などが対象|製品が対象|シリーズ全|全ラインナップ|大型|ビッグ|\bbig\s+sale\b|\bmega\s+sale\b|\bstorewide\b|\bsitewide\b/i;
const MODEL=/\b[A-Z][A-Za-z]{0,6}[- ]?\d{1,4}[A-Z]{0,3}\b/g;

export function saleSignal(title) {
 const t=String(title).normalize('NFKC');
 return PRICE.test(t)||SALE_EVENTS.some(([,re])=>re.test(t))||/クーポン|\bcoupon\b|ポイント|送料無料|キャンペーン|\bcampaign\b|中古|下取り|買取/i.test(t);
}

// Dates in a sale headline, in Japan time. Year defaults to the publication year and rolls
// forward when the month is clearly past it (a December article announcing a January end).
function isoDay(y,m,d){if(y<2000||y>2099||m<1||m>12||d<1||d>31)return null;const date=new Date(Date.UTC(y,m-1,d));return date.getUTCMonth()===m-1&&date.getUTCDate()===d?date.toISOString().slice(0,10):null;}
export function saleDates(title,referenceMs) {
 const t=String(title).normalize('NFKC').replace(/\([^)]{1,4}\)/g,'');
 const ref=new Date(referenceMs+9*3600000);const baseYear=ref.getUTCFullYear(),baseMonth=ref.getUTCMonth()+1;
 const year=(y,m)=>y?Number(y):m<baseMonth-6?baseYear+1:baseYear;
 const md='(?:(20\\d{2})[年/.])?(\\d{1,2})[月/](\\d{1,2})日?';
 const clock='(?:\\s*(\\d{1,2})(?::(\\d{2})|時(?:(\\d{1,2})分)?))?';
 let start=null,end=null,endTime,m,rollover=false;
 if((m=new RegExp(md+'\\s*[~〜\\-ー]\\s*'+md+clock).exec(t))){start=isoDay(year(m[1],+m[2]),+m[2],+m[3]);end=isoDay(m[4]?+m[4]:year(null,+m[5]),+m[5],+m[6]);rollover=!m[4]&&+m[5]<+m[2];if(m[7]!==undefined)endTime=`${m[7].padStart(2,'0')}:${(m[8]||m[9]||'00').padStart(2,'0')}`;}
 else if((m=new RegExp(md+'\\s*[~〜\\-ー]\\s*(\\d{1,2})日'+clock).exec(t))){start=isoDay(year(m[1],+m[2]),+m[2],+m[3]);end=isoDay(year(m[1],+m[2]),+m[2],+m[4]);if(m[5]!==undefined)endTime=`${m[5].padStart(2,'0')}:${(m[6]||m[7]||'00').padStart(2,'0')}`;}
 else if((m=new RegExp(md+clock+'\\s*(?:まで|迄|終了)').exec(t))){end=isoDay(year(m[1],+m[2]),+m[2],+m[3]);if(m[4]!==undefined)endTime=`${m[4].padStart(2,'0')}:${(m[5]||m[6]||'00').padStart(2,'0')}`;}
 if(rollover&&start&&end&&end<start)end=isoDay(Number(end.slice(0,4))+1,+end.slice(5,7),+end.slice(8,10));
 return {startDate:start,endDate:end,...(endTime!==undefined?{endTime}:{})};
}
// Inclusive deadline, in epoch milliseconds. null = unknown; NaN = malformed.
// Date-only lasts through the last millisecond of the JST day; explicit time wins.
export function saleEndsAt(endDate,endTime=null){
 if(endDate==null)return endTime==null?null:NaN;
 if(typeof endDate!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(endDate)||isoDay(+endDate.slice(0,4),+endDate.slice(5,7),+endDate.slice(8,10))!==endDate)return NaN;
 if(endTime==null)return Date.parse(endDate+'T00:00:00+09:00')+DAY-1;
 if(typeof endTime!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime))return NaN;
 return Date.parse(endDate+'T'+endTime+':00+09:00');
}
export function saleAuthorized(source){
 return Array.isArray(source?.contentTypes)&&source.contentTypes.every(t=>typeof t==='string')&&source.contentTypes.includes('sale')&&source.saleCollection==='approved';
}
export function isSaleRecord(row,facts){
 return row?.category==='sale'||row?.event_type==='sale'||row?.eventType==='sale'||facts?.kind==='sale'||facts?.category==='sale';
}
// Qualifiers do not create independent categories: a guitar pedal is not a guitar + pedal sale.
export function saleEquipment(title){
 const t=title.replace(/(?:ギター|ベース)(?:用|向け|の)?\s*(?=エフェクター|ペダル|アンプ|録音)/g,'')
  .replace(/\b(?:guitar|bass)\s+(?=effects?\b|pedals?\b|amps?\b|amplifiers?\b)/gi,'');
 return SALE_EQUIPMENT.filter(([,re])=>re.test(t)).map(([name])=>name);
}
const REDUCTION=/値下げ|値引|プライスダウン|price\s*down|割引|\d+\s*%\s*(?:off|オフ)|特別価格|特価/i;
function noise(t,broad) {
 // Remove benefit clauses before looking for a separate price reduction. An event name or
 // the word "sale" cannot turn a coupon / points / shipping promotion into a price sale.
 const benefits=[['coupon_only',/[^、。！!;；\n]*(?:クーポン|\bcoupon\b)[^、。！!;；\n]*/gi],
  ['points_only',/[^、。！!;；\n]*(?:ポイント|\bpoints?\b)[^、。！!;；\n]*/gi],
  ['shipping_only',/[^、。！!;；\n]*(?:送料無料|\bfree\s+shipping\b)[^、。！!;；\n]*/gi],
  ['novelty_or_lottery',/[^、。！!;；\n]*(?:ノベルティ|抽選|もれなく|プレゼント|特典|\bgiveaway\b|\blottery\b)[^、。！!;；\n]*/gi],
  ['trade_in',/[^、。！!;；\n]*(?:下取り|買取|\btrade[ -]?in\b|\bbuyback\b)[^、。！!;；\n]*/gi]];
 const found=benefits.filter(([,re])=>{re.lastIndex=0;return re.test(t);});
 const priceText=benefits.reduce((text,[,re])=>text.replace(re,''),t);
 if(found.length&&!REDUCTION.test(priceText))return /値下げ|値引|プライスダウン|price\s*down/i.test(t)?'sale_benefit_uncertain':found[0][0];
 if(/[1一]点(?:限定|限り|もの|物)|単品|単一商品|\bsingle[ -](?:sku|item)\b/i.test(t))return 'single_item_markdown';
 if(!broad&&/中古|\bused\b|展示品|アウトレット|訳あり|B級/i.test(t))return 'single_item_markdown';
 if(!broad&&/週末|土日|本日限り|今日だけ|タイムセール|3日間|三日間|小規模|少量/.test(t))return 'minor_promotion';
 return null;
}

export function assessSale(entry,source,now,{hasDate,known}) {
 const t=String(entry.title).normalize('NFKC');
 const eventMatch=SALE_EVENTS.find(([,re])=>re.test(t));
 const equipment=saleEquipment(t);
 const brands=SALE_BRANDS.filter(b=>new RegExp(`(?:^|[^A-Za-z])${b.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?:[^A-Za-z]|$)`,'i').test(t))
  .filter((b,i,all)=>all.findIndex(x=>x.toLowerCase()===b.toLowerCase())===i);
 const modelText=t.replace(/\b(?:DTM|DAW)\b/gi,'').replace(/(?:(?:20\d{2})[年/.])?\d{1,2}[月/]\d{1,2}日?/g,'').replace(/\d+\s*%\s*(?:off|オフ)?/gi,'');
 const models=(modelText.match(MODEL)||[]).filter(code=>!SALE_BRANDS.some(brand=>brand.replaceAll(' ','').toLowerCase()===code.replaceAll(' ','').toLowerCase()));
 const official=source.sourceKind==='official';
 const manufacturerWide=official&&/期間限定/.test(t)&&PRICE.test(t)&&/製品|シリーズ|対象|全/.test(t);
 const range=BROAD.test(t)||manufacturerWide;
 // Count separate list members, not compound terms such as amp-simulator plugins.
 const listedEquipment=new Set(t.split(/[・、,／/+＆&]|と|および|及び|\band\b/i).flatMap(part=>{const found=saleEquipment(part);return found.length===1?found:[];}));
 const broad=range||listedEquipment.size>=2||brands.length>=2;
 const shopScoped=/店舗限定|店頭限定|店舗にて|[^\s、。]{1,12}店(?:限定|のみ|にて)/.test(t);
 const explicitRange=/全商品|全ブランド|複数ブランド|多数|数百|数千|\d{2,}\s*(?:点|機種|製品|アイテム)|シリーズ全|全ラインナップ/.test(t);
 const single=!explicitRange&&brands.length<=1&&models.length<=1&&(known||models.length===1);
 const reason=noise(t,broad)||(single?'single_product_markdown':null);
 if(reason&&reason!=='sale_benefit_uncertain')return {decision:'REJECT',reason};
 const campaignOnly=!PRICE.test(t)||reason==='sale_benefit_uncertain';
 const {startDate,endDate,endTime}=saleDates(t,hasDate?Date.parse(entry.date):now);
 const deadline=saleEndsAt(endDate,endTime);
 const ordered=!startDate||!endDate||startDate<=endDate;
 if(Number.isFinite(deadline)&&deadline<now)return {decision:'REJECT',reason:'sale_ended'};
 const seller=['official','retailer_editorial','distributor'].includes(source.sourceKind)?source.name:null;
 const scope=shopScoped?'shop':brands.length===1&&!broad&&!official?'brand':broad?'broad':'unknown';
 const event=eventMatch?eventMatch[0]:manufacturerWide?'期間限定の値下げ':'期間限定セール';
 const facts={kind:'sale',category:'sale',seller,sellerKind:source.sourceKind,event,scope,
  brand:scope==='brand'?brands[0]:null,equipment:equipment.slice(0,3),startDate,endDate,...(endTime!==undefined?{endTime}:{}),nature:campaignOnly?'campaign':'sale'};
 const saleReady=saleAuthorized(source);
 const auto=saleReady&&ordered&&!!seller&&Number.isFinite(deadline)&&equipment.length>0&&scope==='broad'&&!campaignOnly&&hasDate&&!entry.listingUncertainty;
 const decisionReason=!hasDate?'missing_date':!saleReady?'sale_source_scope_unreviewed':!seller?'sale_seller_unclear':
  campaignOnly?'sale_campaign_boundary':!ordered?'sale_dates_uncertain':['brand','shop'].includes(scope)?'sale_scope_uncertain':!equipment.length?'sale_equipment_unclear':scope!=='broad'?'sale_scope_uncertain':!Number.isFinite(deadline)?'sale_end_date_unknown':entry.listingUncertainty||'sale_label_ready';
 return {decision:auto?'AUTO_PUBLISHABLE':'PUBLISH_REVIEW',decisionReason,facts};
}

const jpDay=iso=>`${Number(iso.slice(5,7))}月${Number(iso.slice(8,10))}日`;
// The only sale label format. Every part is re-validated so stored facts cannot inject copy.
export function saleLabel(facts) {
 if(!facts||facts.kind!=='sale'||facts.category!=='sale'||typeof facts.seller!=='string'||!facts.seller.trim()||facts.seller.length>60||HYPE.test(facts.seller))return null;
 if(!SALE_EVENTS.some(([name])=>name===facts.event)&&!GENERIC_EVENTS.includes(facts.event))return null;
 if(!Array.isArray(facts.equipment)||facts.equipment.length>3||facts.equipment.some(e=>!SALE_EQUIPMENT.some(([name])=>name===e)))return null;
 if(facts.brand!==null&&facts.brand!==undefined&&!SALE_BRANDS.includes(facts.brand))return null;
 if(Number.isNaN(saleEndsAt(facts.endDate,facts.endTime))||(facts.startDate&&facts.endDate&&facts.startDate>facts.endDate))return null;
 if(facts.percentOff!==undefined&&(!Number.isInteger(facts.percentOff)||facts.percentOff<1||facts.percentOff>100))return null;
 if(facts.brands!==undefined&&(!Array.isArray(facts.brands)||facts.brands.length>10||facts.brands.some(b=>!SALE_BRANDS.includes(b))))return null;
 const what=facts.brand?`${facts.brand}製品の${facts.event==='期間限定セール'?'セール':facts.event}`:facts.event==='期間限定の値下げ'?'対象製品の期間限定値下げ':facts.event;
 const verb=facts.event==='期間限定の値下げ'?'実施':'開催';
 const when=facts.endDate?`を${jpDay(facts.endDate)}${facts.endTime?' '+facts.endTime:''}まで${verb}`:`を${verb}`;
 const target=facts.equipment.length?`。${facts.equipment.join('・')}などが対象`:'';
 return `${facts.seller}、${what}${when}${facts.percentOff?`（${facts.percentOff}%値下げ）`:""}${target}${facts.brands?.length?`。対象ブランド：${facts.brands.join("・")}`:""}`;
}

export function hasHype(text){return HYPE.test(String(text));}
