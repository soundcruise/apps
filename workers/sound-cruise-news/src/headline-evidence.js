// Facts-only headline refinements. No categories, product names or publisher prose
// are used to guess a type. Source text is transient; only bounded enums are saved.
import {parseDocument,DomUtils} from 'htmlparser2';
import {optOut} from './policy.js';
const types=[
 ['voicebank','音声合成ソフト',/ボイスバンク|音声合成ソフト/],
 ['signal_buffer','バッファー',/バッファ[ーァ]|\bsignal buffer\b/i],
 ['wireless_headphone','ワイヤレスヘッドフォン',/ワイヤレスヘッド[フホ][ォオ]ン|Bluetooth(?:ワイヤレス)?ヘッド[フホ][ォオ]ン/i],
 ['headphone','ヘッドフォン',/ヘッド[フホ][ォオ]ン|\bheadphones?\b/i],
 ['usb_microphone','USBマイク',/USB(?:ダイナミック)?(?:・|\s*)マイク(?:ロ[フホ]ン)?/i],
 ['wireless_microphone','ワイヤレスマイク',/ワイヤレス(?:・|\s*)マイク(?:ロ[フホ]ン)?/],
 ['pad_controller','パッドコントローラー',/パッド[・ ]?コントローラー/],
 ['signature_pick','シグネチャーピック',/シグネチャ[ーア]?(?:モデル)?[・ ]?ピック/],
 ['guitar_stand','ギタースタンド',/ギター[・ ]?スタンド/],
 ['tuner_metronome','チューナー・メトロノーム',/チューナー[・／/・と&＆ ]{0,6}メトロノーム/],
 ['distortion_pedal','歪みペダル',/(?:オーバードライブ\s*[／/]\s*ディストーション|ディストーション|歪み)[・ ]?ペダル/],
 ['bass_effect_pedal','ベース用エフェクター',/ベース(?:用|専用|に特化した)[・ ]?(?:エフェクター|エフェクトペダル)/],
 ['octave_pedal','オクターブペダル',/オクターブ[・ ]?ペダル|オクターバー/],
 ['power_distribution','電源タップ',/電源タップ|電源プロテクター/],
 ['effect_pedal','エフェクター',/エフェクター|エフェクトペダル/],
 ['guitar_amp','ギターアンプ',/ギターアンプ/],
 ['acoustic_guitar','アコースティックギター',/アコースティックギター/],
 ['electric_guitar','エレキギター',/エレキギター/],
 ['bass_guitar','エレキベース',/エレキベース/],
 ['microphone','マイク',/マイクロ[フホ]ン/],
 ['audio_interface','オーディオインターフェース',/オーディオ[・ ]?インターフェ[イー]ス/],
 ['subwoofer','サブウーファー',/サブウーファー|\bsubwoofer\b/i],
 ['studio_monitor','モニタースピーカー',/スタジオモニター|モニタースピーカー/]
];
const parents={wireless_headphone:'headphone',usb_microphone:'microphone',wireless_microphone:'microphone',distortion_pedal:'effect_pedal',bass_effect_pedal:'effect_pedal',octave_pedal:'effect_pedal'};
const norm=s=>String(s).normalize('NFKC').replace(/[™®\s]/g,'').toLowerCase();
const keys=(v,allowed)=>Object.keys(v).every(k=>allowed.includes(k));
const unsafe=/レビュー|比較|再入荷|在庫|セール|旧製品|以前|かつて|例えば|他社|ではない|ではなく|かもしれ|発売しない|延期しない|予約しない|延期(?:は|が)?(?:ない|ありません)|予約受付を終了|\b(?:review|comparison|restock|sale)\b/i;
export function validHeadlineEvidence(f){
 if(f?.productTypeEvidence&&(!types.some(([t])=>t===f.productType)||f.productTypeEvidence.product!==f.product||!['explicit_primary_title','verified_primary_article'].includes(f.productTypeEvidence.basis)||!keys(f.productTypeEvidence,['product','basis'])))return false;
 const e=f?.releaseEvent;
 if(!e)return true;
 if(!['release','scheduled_release','release_delay','reservation_start'].includes(e.action)||!['explicit_primary_title','verified_primary_article'].includes(e.basis)||!keys(e,['action','basis','date','reason','period']))return false;
 if(e.period!==undefined&&(e.action!=='scheduled_release'||e.date!==undefined||!validReleasePeriod(e.period)))return false;
 if(e.date!==undefined&&(!/^20\d{2}(?:-\d{2}-\d{2})?$/.test(e.date)||e.date.length===10&&(!Number.isFinite(Date.parse(e.date))||new Date(e.date+'T00:00:00Z').toISOString().slice(0,10)!==e.date)))return false;
 return e.reason===undefined||e.action==='release_delay'&&e.reason==='redesign';
}
export function productTypeLabel(f){
 if(!validHeadlineEvidence(f))return null;
 // Existing strict Ikebe article fields predate the additive proof object.
 if(!f?.productTypeEvidence&&f?.identifierBasis!=='explicit_article_product_fields')return null;
 return types.find(([t])=>t===f.productType)?.[1]||null;
}
export function productSubject(f){const type=productTypeLabel(f);return type?`${type}「${f.product}${f.version?' '+f.version:''}」`:`${f.product}${f.version?' '+f.version:''}`;}
export function listingTypeFamily(type){
 if(['acoustic_guitar','electric_guitar','bass_guitar'].includes(type))return 'guitar';
 if(['signature_pick','guitar_stand'].includes(type))return 'guitar_accessory';
 if(['effect_pedal','distortion_pedal','bass_effect_pedal','octave_pedal','guitar_amp'].includes(type))return 'amp_effect';
 return null;
}
export function explicitReleaseAction(t){
 if(typeof t!=='string'||t.length>512||unsafe.test(t))return null;
 if(/発売(?:日|時期)?(?:の|を|が|は)?延期|発売時期.{0,12}延期/.test(t))return 'release_delay';
 if(/予約(?:受付)?(?:を)?(?:20\d{2}年\s*\d{1,2}月\s*\d{1,2}日(?:に|より)?)?(?:開始|スタート)/.test(t))return 'reservation_start';
 if(/発売予定|発売(?:を)?予定|発売時期.{0,20}予定/.test(t))return 'scheduled_release';
 return null;
}
function dateText(t){
 const m=/(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日/.exec(t);
 if(!m)return null;const day=`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
 return Number.isFinite(Date.parse(day))&&new Date(day).toISOString().slice(0,10)===day?day:null;
}
export function enrichHeadlineFacts(f,{title='',statements=[],releaseDates=[],publishedAt,basis='explicit_primary_title'}={}){
 if(!f?.product||!['explicit_primary_title','verified_primary_article'].includes(basis))return f;
 const primary=[title,...statements].filter(s=>typeof s==='string'&&s.length<=1500);
 if(unsafe.test(title))return f;
 const bound=primary.filter(s=>!unsafe.test(s)&&norm(s).includes(norm(f.product)));
 // Article identity is separately verified; the first editorial paragraphs may
 // use a shortened family name. No related cards/spec tables enter this scope.
 const models=f.models||f.product.split(/\s*\/\s*/);
 const common=models.length>1?models[0].split(/[^A-Za-z0-9-]+/).filter(t=>t.length>=3&&!/^(?:silver|limited|edition|power|special|model|new)$/i.test(t)&&models.every(m=>m.split(/[^A-Za-z0-9-]+/).includes(t))):[];
 const safeTypeStatement=s=>!unsafe.test(s)&&!/(?:対応|接続|使用|比較|関連|付属|取り付け)(?:する|した|できる|可能|用)|(?:用|対応)の?(?:ケース|スタンド|アーム|ホルダー|ケーブル|カバー|アクセサリ)|関連(?:商品|製品)|参考製品|比較対象|付属品|例えば/.test(s);
 const typeScope=basis==='verified_primary_article'?[
  ...(safeTypeStatement(title)&&(norm(title).includes(norm(f.product))||f.brand&&norm(title).includes(norm(f.brand)))?[title]:[]),
  ...statements.flatMap(s=>String(s).split(/[。!?！？]/)).filter(s=>safeTypeStatement(s)&&(norm(s).includes(norm(f.product))||common.some(t=>norm(s).includes(norm(t)))))
 ]:bound.filter(safeTypeStatement);
 const matches=types.filter(([, ,re])=>typeScope.some(s=>re.test(s)));
 const specific=matches.filter(([t])=>!matches.some(([x])=>parents[x]===t));
 let result={...f};
 if(specific.length===1)result={...result,productType:specific[0][0],productTypeEvidence:{product:f.product,basis}};
 const eventScope=basis==='verified_primary_article'?primary.filter(s=>s===title||norm(s).includes(norm(f.product))||common.some(t=>norm(s).includes(norm(t)))):bound;
 const actions=[...new Set(eventScope.map(explicitReleaseAction).filter(Boolean))];
 // A delay takes precedence over the new tentative year; conflicting reservation
 // and scheduled-release claims require separate editorial assessment.
 let action=actions.includes('release_delay')?'release_delay':actions.length===1?actions[0]:null;
 const dates=[...new Set((releaseDates.length?releaseDates:action?eventScope.filter(s=>explicitReleaseAction(s)===action):[]).map(dateText).filter(Boolean))];
 if(!action&&dates.length===1&&Number.isFinite(Date.parse(publishedAt))&&Date.parse(dates[0]+'T00:00:00+09:00')>Date.parse(publishedAt)&&eventScope.some(s=>/発売します|発売予定/.test(s)))action='scheduled_release';
 if(action){
  const date=dates.length===1?dates[0]:action==='release_delay'?/(20\d{2})年の予定/.exec(eventScope.join(' '))?.[1]:undefined;
  result.releaseEvent={action,basis,...(date?{date}:{}),...(action==='release_delay'&&/再設計/.test(eventScope.join(' '))?{reason:'redesign'}:{})};
 }
 return result;
}
export function validReleasePeriod(p){return !!p&&keys(p,['year','month','part'])&&Number.isInteger(p.year)&&p.year>=2000&&p.year<=2099&&Number.isInteger(p.month)&&p.month>=1&&p.month<=12&&['early','mid','late'].includes(p.part);}
export function releaseSuffix(e){
 if(!e)return null;
 const date=e.period?`${e.period.month}月${({early:'上旬',mid:'中旬',late:'下旬'})[e.period.part]}`:e.date?.length===10?`${Number(e.date.slice(5,7))}月${Number(e.date.slice(8,10))}日`:e.date?`${e.date}年`:null;
 if(e.action==='release_delay')return `${e.reason==='redesign'?'の再設計に伴い':'の'}発売を延期${date?`（${date}予定）`:''}`;
 if(e.action==='scheduled_release')return `を${date?date+'に':''}発売予定`;
 if(e.action==='reservation_start')return `の予約受付を${date?date+'に':''}開始`;
 return e.action==='release'?'を発売':null;
}
const cls=(n,c)=>(n.attribs?.class||'').split(/\s+/).includes(c);
const hidden=n=>{for(let p=n;p;p=p.parent)if(['script','style','nav','footer','aside','template','noscript'].includes(p.name)||p.attribs?.hidden!==undefined||p.attribs?.['aria-hidden']==='true'||/display\s*:\s*none|visibility\s*:\s*hidden/i.test(p.attribs?.style||''))return true;return false;};
const text=n=>hidden(n)?'':n.type==='text'?n.data:(n.children||[]).map(text).join(' ');
const plain=n=>text(n).replace(/\s+/g,' ').trim();
const find=(n,p)=>DomUtils.findAll(x=>!!x.name&&!hidden(x)&&p(x),n.children||[]);
export function releaseDateFields(root){
 const dates=[];
 for(const n of find(root,n=>/^h[1-3]$/.test(n.name)&&plain(n)==='発売日')){
  let sibling=n.next;while(sibling&&sibling.type==='text')sibling=sibling.next;
  if(sibling?.name==='p'&&!hidden(sibling))dates.push(plain(sibling));
 }
 return dates;
}
export function articleHeadlineFacts(html,f,row,source){
 if(!['shimamura','ikebe','zoom'].includes(source?.id)||row.source_id!==source.id||typeof html!=='string'||new TextEncoder().encode(html).length>512000)throw Error('headline_evidence_scope');
 const doc=parseDocument(html);
 if(find(doc,n=>n.name==='meta'&&/robots/i.test(n.attribs.name||'')&&optOut(n.attribs.content||'')).length)throw Error('headline_evidence_optout');
 const canon=find(doc,n=>n.name==='link'&&n.attribs.rel==='canonical');if(canon.length!==1||canon[0].attribs.href!==row.source_url)throw Error('headline_evidence_url');
 const roots=find(doc,n=>source.id==='shimamura'?cls(n,'p-content'):source.id==='ikebe'?cls(n,'main_wrap'):cls(n,'rich-text')&&cls(n.parent,'col-12'));
 if(roots.length!==1)throw Error('headline_evidence_structure');
 const titleNodes=find(doc,n=>n.name==='h1'&&(source.id==='shimamura'?cls(n.parent,'mb-80'):source.id==='ikebe'?cls(n.parent,'blog_title')||cls(n.parent?.parent,'blog_title'):n.attribs.id==='page-headline'));
 if(titleNodes.length!==1)throw Error('headline_evidence_structure');
 const title=plain(titleNodes[0]),root=roots[0],heads=find(root,n=>/^h[1-3]$/.test(n.name)).map(plain);
 const identity=norm([title,...heads].join(' '));
 if(source.id!=='zoom'&&f.brand&&!identity.includes(norm(f.brand)))throw Error('headline_evidence_identity');
 if(!(f.models||f.product.split(/\s*\/\s*/)).every(m=>identity.includes(norm(m))))throw Error('headline_evidence_identity');
 const times=find(doc,n=>n.name==='time'&&(source.id==='shimamura'?plain(n.parent).startsWith('公開：'):source.id==='ikebe'?cls(n,'sub_info_date'):cls(n,'hero-eyebrow')));
 const day=new Date(Date.parse(row.published_at)+9*3600000).toISOString().slice(0,10);
 if(times.length!==1||times[0].attribs.datetime?.slice(0,10)!==day)throw Error('headline_evidence_date');
 const paragraphs=root.children.filter(n=>n.name==='p'&&!hidden(n)).map(plain).filter(Boolean).slice(0,4);
 const releaseDates=releaseDateFields(root);
 // Official hero alt is a first-party, model-bound type declaration, not a related image.
 const hero=source.id==='zoom'?find(doc,n=>n.name==='img'&&cls(n.parent?.parent,'hero')&&norm(n.attribs.alt||'').includes(norm(f.product))).map(n=>n.attribs.alt.split('を取り付け')[0]):[];
 const result=enrichHeadlineFacts(f,{title,statements:[...paragraphs,...hero],releaseDates,publishedAt:row.published_at,basis:'verified_primary_article'});
 if(!validHeadlineEvidence(result))throw Error('headline_evidence_invalid');return result;
}
