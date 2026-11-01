// Source-bound primary product definitions. Publisher expressions are transient.
// Product identity, component mentions and announcement actor are separate facts.
import {parseDocument,DomUtils as D} from 'htmlparser2';
import {optOut} from './policy.js';
import {releaseDateFields} from './headline-evidence.js';
import {subjectProductTypes} from './product-type-evidence.js';
export const PRIMARY_ANNOUNCEMENT_PARSER='primary-announcement-5';
export const PRIMARY_ANNOUNCEMENT_PARSERS=Object.freeze(['primary-announcement-1','primary-announcement-2','primary-announcement-3','primary-announcement-4',PRIMARY_ANNOUNCEMENT_PARSER]);
const cls=(n,c)=>(n?.attribs?.class||'').split(/\s+/).includes(c);
const hidden=n=>{for(let p=n;p;p=p.parent)if(['script','style','aside','nav','footer','header','template','noscript'].includes(p.name)||p.attribs?.hidden!==undefined||p.attribs?.['aria-hidden']==='true'||/display\s*:\s*none|visibility\s*:\s*hidden/i.test(p.attribs?.style||''))return true;return false;};
const text=n=>hidden(n)?'':n.type==='text'?n.data:n.name==='br'?'\n':(n.children||[]).map(text).join('');
const plain=n=>text(n).replace(/[®™]/g,'').replace(/\s+/g,' ').trim();
const find=(n,p)=>D.findAll(x=>x.name&&!hidden(x)&&p(x),n.children||[]);
const norm=s=>s.normalize('NFKC').replace(/[®™\s]/g,'').toLowerCase();
const identity=s=>typeof s==='string'&&s.length>=2&&s.length<=110&&/^[A-Za-z0-9][A-Za-z0-9 .&+()'/:_-]*$/.test(s)&&!s.includes('://')&&!/\b(?:ignore|instruction|prompt|script)\b/i.test(s);
const unsafe=/旧製品|関連商品|参考製品|他社|例えば|発売しない|登場しない|ではない|かもしれ|再入荷|中古|クーポン|レビュー|比較/;
const reservation=/受注を開始(?:いたします|します|しました)|予約受付を開始(?:いたします|します|しました)/;
const purchase=/^[＝=]+$|^[★●■]?【[^】]+】$|^(?:※|【ご注意】|[—–−-]+$)|^ご予約|^店舗での|^発売後の|^発売予定日以降|^入荷状況|^誠に申し訳|^お支払/;
const types={mini_keyboard:['ミニキーボード','dtm_software'],midi_keyboard:['MIDIキーボード','dtm_software'],headset:['ヘッドセット','recording_audio'],headphone:['ヘッドフォン','recording_audio'],guitar_amp_bundle:['ギターアンプセット','amps_effects'],electric_guitar:['エレキギター','electric_guitar_bass'],guitar:['ギター','electric_guitar_bass'],software_instrument:['ソフトウェア音源','dtm_software'],clip_tuner:['クリップチューナー','amps_effects'],effect_pedal:['オーバードライブ','amps_effects'],head_amp:['ヘッドアンプ','amps_effects']};
const signal={appearance:'explicit_new_appearance',announcement:'explicit_new_model',scheduled_release:'explicit_scheduled_release',release:'explicit_release',release_notice:'explicit_undated_release_notice',reservation_start:'explicit_reservation_start'};
// Closed field codes, never publisher sentences or unvalidated headline text.
export function primaryAnnouncementErrors(f){
 const errors=[],check=(ok,field)=>{if(!ok)errors.push(field);};
 check(f?.kind==='primary_product_notice','kind');
 check(f?.identifierBasis==='verified_primary_announcement','identifierBasis');
 check(['ikebe','shimamura'].includes(f?.listingSource),'listingSource');
 check(!!f?.articleUrl,'articleUrl');check(identity(f?.brand),'brand');
 const models=Array.isArray(f?.models)?f.models:[];
 check(models.length>=1&&models.length<=4&&models.every(identity)&&new Set(models).size===models.length,'models');
 check(typeof f?.product==='string'&&f.product===models.join(' / ')&&f.product.length<=110,'product');
 check(f?.version===null,'version');check(Object.hasOwn(types,f?.productType||'')&&types[f.productType][1]===f.category,'productType_category');
 check(f?.keyboardKeys===undefined||Number.isInteger(f.keyboardKeys)&&f.keyboardKeys>=8&&f.keyboardKeys<=128&&f.productType==='mini_keyboard','keyboardKeys');
 check(f?.signatureModel===undefined||f.signatureModel===true&&f.productType==='electric_guitar','signatureModel');
 check(f?.subjectEvidence?.role==='primary_product_definition','subjectEvidence_role');
 check(f?.subjectEvidence?.boundModels===models.length,'subjectEvidence_boundModels');
 check(['explicit_type','bound_guitar_construction','explicit_bundle','bound_section_definition','bound_group_definition','bound_family_definition'].includes(f?.subjectEvidence?.typeBasis),'subjectEvidence_typeBasis');
 check(!['software_instrument','clip_tuner','effect_pedal','head_amp'].includes(f?.productType)||f.subjectEvidence?.corroborated===true,'subjectEvidence_corroborated');
 check(!['bound_section_definition','bound_group_definition','bound_family_definition'].includes(f?.subjectEvidence?.typeBasis)||f.subjectEvidence.corroborated===true,'subjectEvidence_bound_proof');
 check(f?.productType!=='guitar'||f.subjectEvidence?.typeBasis==='bound_guitar_construction'&&f.subjectEvidence.titleAndTableBound===true&&f.subjectEvidence.qualifiedBodyModel===true,'guitar_primary_binding');
 check(f?.announcement?.actor===f?.listingSource&&!!f?.listingSource,'announcement_actor');
 check(Object.hasOwn(signal,f?.announcement?.action||'')&&signal[f.announcement.action]===f.announcement.signal,'announcement_action');
 const date=f?.announcement?.date;
 check(f?.announcement?.action!=='scheduled_release'||!!date,'announcement_date_required');
 check(f?.announcement?.action!=='release_notice'||date===undefined&&f.announcement.dateStatus==='not_stated'&&f.announcement.actionBasis==='primary_subject_future_release','announcement_notice_evidence');
 check(!date||typeof date==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date,'announcement_date_invalid');
 return errors;
}
export const validPrimaryAnnouncement=f=>primaryAnnouncementErrors(f).length===0;
export function primaryAnnouncementLabel(f){
 if(!validPrimaryAnnouncement(f))return null;const subject=`${f.brand}の${f.signatureModel?'シグネチャー':''}${f.keyboardKeys?f.keyboardKeys+'鍵':''}${types[f.productType][0]}「${f.product}」`,a=f.announcement;
 const date=a.date?`${Number(a.date.slice(5,7))}月${Number(a.date.slice(8,10))}日`:'';
 return subject+({appearance:'が登場',announcement:'を紹介',scheduled_release:`、${date}発売予定`,release:`、${date}発売と案内`,release_notice:'の発売を案内',reservation_start:'の受注開始を案内'})[a.action];
}
export function parsePrimaryAnnouncement(html,source,row){
 const url=new URL(row.source_url);if(!['ikebe','shimamura'].includes(source?.id)||row.source_id!==source.id||url.origin!==new URL(source.baseUrl).origin||!/^\/(?:new_product\/\d+|update\/(?:guitar-bass|amp-effector|dtm-recording)\/20\d{2}\/\d{2}\/\d+)\/$/.test(url.pathname))throw Error('facts_source_invalid');
 if(typeof html!=='string'||new TextEncoder().encode(html).length>512000)throw Error('facts_response_too_large');
 const doc=parseDocument(html),canon=find(doc,n=>n.name==='link'&&n.attribs.rel==='canonical');
 if(find(doc,n=>n.name==='meta'&&/^(robots|SoundCruiseNewsBot)$/i.test(n.attribs.name||'')).some(n=>optOut(n.attribs.content||'')))throw Error('facts_optout');
 if(canon.length!==1||canon[0].attribs.href!==row.source_url)throw Error('facts_source_invalid');
 let title,root,header,models,brand,sections,tableBound=false,productTable=[];
 const day=new Date(Date.parse(row.published_at)+9*3600000).toISOString().slice(0,10);
 if(source.id==='ikebe'){
  const articles=find(doc,n=>n.name==='article'&&n.attribs.id==='main');if(articles.length!==1)throw Error('facts_parser_failure');
  const hs=articles[0].children.filter(n=>cls(n,'blog_title')),bs=articles[0].children.filter(n=>cls(n,'main_wrap'));if(hs.length!==1||bs.length!==1)throw Error('facts_parser_failure');header=hs[0];root=bs[0];
  const titles=find(header,n=>n.name==='h1'),dates=find(header,n=>n.name==='time'&&cls(n,'sub_info_date')&&/公開$/.test(plain(n)));if(titles.length!==1||dates.length!==1||dates[0].attribs.datetime!==day||plain(dates[0])!==day.replace(/(\d{4})-(\d{2})-(\d{2})/,'$1年$2月$3日公開'))throw Error('facts_date_changed');title=plain(titles[0]);
  const productHeads=root.children.filter(n=>/^h[1-3]$/.test(n.name||'')&&cls(n,'wp-block-heading')&&!hidden(n));
  const heads=productHeads.filter(n=>text(n).trim().split('\n').filter(Boolean).length===2);
  if(heads.length!==productHeads.length)throw Error('facts_identity_changed');
  if(!heads.length||heads.length>4)throw Error('facts_identity_changed');
  const fields=heads.map(n=>text(n).trim().split('\n').map(v=>v.replace(/\s+/g,' ').trim()).filter(Boolean));brand=fields[0][0];models=fields.map(v=>v[1].replace(/\s*\[(?:[A-Z][A-Z0-9 -]{1,30} ORIGINAL MODEL|Limited Model)\]$/,'').replace(/\s+\([A-Za-z]+(?: [A-Za-z]+){0,3}\)$/,''));
  const tags=find(header,n=>n.name==='a'&&/^https:\/\/www\.ikebe-gakki-pb\.com\/new_product\/tag\/[a-z0-9-]+\/$/.test(n.attribs.href||'')).map(plain);
  if(fields.some(v=>v[0]!==brand)||!tags.some(v=>norm(v)===norm(brand)))throw Error('facts_identity_changed');
  sections=heads.map((h,i)=>{const ps=[];for(let n=h.next;n&&n!==heads[i+1];n=n.next)if(n.name==='p'&&cls(n,'wp-block-paragraph')&&!hidden(n)){const p=plain(n);if(p&&!purchase.test(p))ps.push(p);}return ps.slice(0,16);});
 }else{
  const roots=find(doc,n=>cls(n,'p-content')),titles=find(doc,n=>n.name==='h1'&&cls(n.parent,'mb-80')),dates=find(doc,n=>n.name==='time'&&plain(n.parent).startsWith('公開：'));
  if(roots.length!==1||titles.length!==1||dates.length!==1||dates[0].attribs.datetime!==day)throw Error('facts_date_changed');root=roots[0];title=plain(titles[0]);header=doc;
  const lead=root.children.filter(n=>n.name==='p'&&cls(n,'wp-block-paragraph')&&!hidden(n)).map(plain).find(p=>!purchase.test(p)&&p!=='目次に戻る');
  const match=/^([A-Za-z][A-Za-z0-9 .&'-]{1,60}?)\s*(?:\([ァ-ヶー・\s]+\))?\s*(?:が|より|から)[、,]?/.exec(lead||'')||/(?:^|[、。])\s*([A-Za-z][A-Za-z0-9 .&'-]{1,60}?)「/.exec(lead||'');models=[...String(lead).matchAll(/「([^」]{2,100})」/g)].map(m=>m[1].trim());brand=match?.[1]?.trim();
  const quotedTitle=[...title.matchAll(/「([^」]{2,100})」/g)].map(m=>m[1]);const tableRows=find(root,n=>n.name==='tr'&&/JANコード/.test(plain(n))).map(plain);productTable=tableRows;
  if(!models.length){const m=/^(?:[A-Za-z][A-Za-z0-9 .&'-]{1,60}?)(?:より|から)([A-Za-z0-9][A-Za-z0-9 .&+()'/-]{1,70})が登場/.exec(lead||'');if(m&&norm(title).includes(norm(m[1]))&&tableRows.some(t=>norm(t).startsWith(norm(m[1]))))models=[m[1].trim()];}
  if(models.length===1&&quotedTitle.length===1&&identity(quotedTitle[0])){const base=quotedTitle[0],full=models[0];const suffix=full.startsWith(base+' ')?full.slice(base.length+1):'';tableBound=!!suffix&&/^[A-Z0-9]{2,6}$/.test(suffix)&&tableRows.length>=1&&tableRows.length<=8&&tableRows.every(t=>t.startsWith(base+',')||t.startsWith(base+'JANコード'));if(tableBound)models=[base];}
  if(!brand||!models.length||!models.every(m=>norm(title).includes(norm(m)))||!norm(title).includes(norm(brand.split(' ')[0])))throw Error('facts_identity_changed');sections=models.map(()=>root.children.filter(n=>n.name==='p'&&cls(n,'wp-block-paragraph')&&!hidden(n)).map(plain).filter(p=>!purchase.test(p)&&p!=='目次に戻る').slice(0,4));
 }
 if(!identity(brand)||!models.every(identity)||new Set(models).size!==models.length||models.join(' / ').length>110||unsafe.test(title)||/セール|特価|PR記事/.test(title))throw Error('facts_scope_uncertain');
 if(models.some(m=>/\b(?:case|stand|replacement|accessory|cable)\b/i.test(m)))throw Error('facts_primary_type_unbound');
 const descriptor=sections.map(ps=>ps.slice(0,2).join(' '));const categoryText=plain(header);
 const definitions=sections.map(ps=>ps.filter(p=>!unsafe.test(p)&&!/関連(?:製品|モデル)|付属(?:品|の)|比較対象|保護対象/.test(p)));
 const construction=definitions.every(ps=>[/ネック/,/ボディ/,/指板/,/フレット/,/ピックアップ/,/ブリッジ/].filter(re=>re.test(ps.join(' '))).length>=3);
 const explicit=(re)=>descriptor.every(s=>subjectProductTypes([s],[['primary_type',re]]).length===1&&!unsafe.test(s));
 let productType,typeBasis='explicit_type';
 if(models.length===1&&explicit(/\d+鍵[^。]{0,20}ミニキーボード/)&&!/シンセサイザー(?:です|を発売)/.test(descriptor[0]))productType='mini_keyboard';
 else if(models.length===1&&explicit(/MIDIキーボード/))productType='midi_keyboard';
 else if(models.length<=4&&/ヘッドセット/.test(title)&&explicit(/ヘッドセット/))productType='headset';
 else if(models.length===1&&/ヘッド(?:フォン|ホン|フォーン)/.test(title)&&explicit(/ヘッド(?:フォン|ホン|フォーン)/))productType='headphone';
 else if(models.length===1&&/\bbundle\b/i.test(title)&&explicit(/ハーフスタックとペダルのセット|アンプと.{0,25}のセット/)&&/ギターアンプ|アンプ/.test(categoryText)){productType='guitar_amp_bundle';typeBasis='explicit_bundle';}
 else if(source.id==='shimamura'&&tableBound&&construction&&/ピックアップ/.test(definitions.flat().join(' '))&&!/ベース|ウクレレ|マンドリン|\bbass\b/i.test(title+' '+descriptor.join(' '))){productType='guitar';typeBasis='bound_guitar_construction';}
 else if(construction&&/エレキギター/.test(categoryText)&&/新モデル|シグネチャー.{0,5}モデル/.test(title)){productType='electric_guitar';typeBasis='bound_guitar_construction';}
 else {
  const own=sections.map(ps=>ps.slice(0,6).filter(p=>!unsafe.test(p)&&!/関連商品|参考製品|付属品|例えば|他社/.test(p)));
  const bound=(s,m)=>modelMention(s,m);
  const software=/ソフトウェア(?:音源|シンセサイザー)|スコアリング音源/;
  const quotedModel=(s,m)=>new RegExp('[「『]'+escapeModel(m)+'[」』]').test(s.normalize('NFKC'));
  const softwareDefinition=models.length===1&&own[0].some(p=>bound(p,models[0])&&software.test(p)&&/を発売/.test(p))&&productTable.filter(t=>norm(t).startsWith(norm(models[0])+'janコード')).length===1;
  const tunerDefinition=models.length===1&&/クリップチューナー/.test(title)&&own[0].some(p=>/クリップチューナーです/.test(p))&&bound(title,models[0])&&own[0].some(p=>bound(p,models[0])&&/が登場/.test(p))&&productTable.some(t=>norm(t).startsWith(norm(models[0])));
  const shortHeadphone=source.id==='ikebe'&&shortHeadphoneDefinition(title,sections,models,brand);
  const groupCount=/オーバードライブ([2-4])機種/.exec(title);
  const groupedPedals=source.id==='ikebe'&&groupCount&&modelMention(title,brand)&&Number(groupCount[1])===models.length&&own.every((ps,i)=>ps.some(p=>bound(p,models[i])&&/数量限定での発売/.test(p)))&&own.every(ps=>ps.some(p=>/クリッピング|歪み|オーバードライブ/.test(p)));
  const family=models[0],variants=models.slice(1).map(m=>m.startsWith(family+' ')?m.slice(family.length+1):null);
  // The explicit variant definition stays in the first six own paragraphs.
  // Power corroboration may occur later in that same bounded (16 paragraph)
  // product section, never across the following product heading/related links.
  const familyAmp=source.id==='ikebe'&&models.length>=2&&variants.every(v=>v&&identity(v))&&bound(title,family)&&variants.every(v=>quotedModel(title,v))&&own.slice(1).every((ps,i)=>ps.some(p=>new RegExp('ヘッドアンプ'+escapeModel(family)).test(p.normalize('NFKC'))&&quotedModel(p,variants[i])&&/オリジナル|カラー/.test(p)))&&definitions.every(ps=>ps.some(p=>bound(p,family)&&/出力|パワーアンプ/.test(p)));
  if(softwareDefinition)productType='software_instrument';else if(tunerDefinition)productType='clip_tuner';else if(shortHeadphone)productType='headphone';else if(groupedPedals)productType='effect_pedal';else if(familyAmp)productType='head_amp';else throw Error('facts_primary_type_unbound');
  typeBasis=groupedPedals?'bound_group_definition':familyAmp?'bound_family_definition':'bound_section_definition';
 }

 // A product heading provides identity; a separate primary definition and the
 // editorial launch statement must corroborate it. No related/accessory borrow.
 if(source.id==='ikebe'&&productType==='headphone'&&shortHeadphoneDefinition(title,sections,models,brand))typeBasis='bound_section_definition';
 if(source.id==='ikebe'&&typeBasis==='explicit_type'&&!models.every((m,i)=>{const tokens=m.replace(/\b([A-Za-z]{2,8})\s+(\d{2,6})\b/g,'$1$2').split(/[^A-Za-z0-9-]+/).flatMap(t=>[t,t.split('-')[0]]).filter(t=>t.length>=4&&!/^(standard|custom|guitar|black|white|model|wireless|reference|bundle|anniversary)$/i.test(t));return sections[i].length&&(norm(title).includes(norm(brand))||tokens.some(t=>norm(title+' '+sections[i].slice(0,5).join(' ')).includes(norm(t))));}))throw Error('facts_primary_action_unbound');
 const actionText=title+' '+(source.id==='shimamura'?sections.map(ps=>ps[0]||''):descriptor).join(' ');
 let action=/発売します|発売予定/.test(actionText)?'scheduled_release':/発売(?:開始|します|！|!|。|$)|新発売/.test(title)?'release':/新登場|登場/.test(title)?'appearance':/新(?:たな)?[^。]{0,25}(?:モデル|製品).{0,15}誕生/.test(title)?'announcement':null;
 if(!action&&source.id==='shimamura'&&productType==='clip_tuner'&&sections[0].some(p=>modelMention(p,models[0])&&norm(p).startsWith(norm(brand+'より'))&&/が登場(?:いたします|します|しました)/.test(p)))action='appearance';
 const dateMatch=/(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日[^。]{0,8}発売/.exec(title);const explicitDates=releaseDateFields(root).map(v=>/(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日/.exec(v)).filter(Boolean).map(m=>m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0'));
 const dates=[...new Set([...explicitDates,...(dateMatch?[dateMatch[1]+'-'+dateMatch[2].padStart(2,'0')+'-'+dateMatch[3].padStart(2,'0')]:[])])];
 if(dates.length>1)throw Error('facts_date_changed');const date=dates[0]||null;
 if(source.id==='ikebe'&&models.length===1&&sections[0].slice(0,6).some(p=>!unsafe.test(p)&&modelMention(p,models[0])&&reservation.test(p)))action='reservation_start';
 if(date&&date>day)action='scheduled_release';else if(date&&/発売/.test(actionText))action='release';if(!action)throw Error('facts_primary_action_unbound');
 // An explicit intention to release is a reportable notice without a guessed
 // shipping date. Bind the grammatical subject and every named product in the
 // primary definition; a future verb about bundled/related software cannot qualify.
 const futureNotice=source.id==='shimamura'&&!date&&sections.every(ps=>{const lead=ps[0]||'';return norm(lead).startsWith(norm(brand+'が'))&&models.every(m=>norm(lead).includes(norm('「'+m+'」')))&&/[」』]を発売します(?:[。！!]|$)/.test(lead)&&!unsafe.test(lead);});
 if(action==='scheduled_release'&&futureNotice)action='release_notice';
 const keyMatch=productType==='mini_keyboard'?/(\d{1,3})鍵/.exec(descriptor[0]):null;
 const facts={...(keyMatch?{keyboardKeys:Number(keyMatch[1])}:{}),...(/シグネ(?:イ|ー)?チャ[ーア]?[^。]{0,5}モデル/.test(title)&&productType==='electric_guitar'?{signatureModel:true}:{}),kind:'primary_product_notice',brand,product:models.join(' / '),models,version:null,category:types[productType][1],productType,identifierBasis:'verified_primary_announcement',listingSource:source.id,articleUrl:row.source_url,subjectEvidence:{role:'primary_product_definition',boundModels:models.length,typeBasis,...(typeBasis.startsWith('bound_')&&typeBasis!=='bound_guitar_construction'?{corroborated:true}:{}),...(tableBound?{titleAndTableBound:true,qualifiedBodyModel:true}:{} )},announcement:{actor:source.id,action,signal:signal[action],...(date?{date}:{}),...(action==='release_notice'?{dateStatus:'not_stated',actionBasis:'primary_subject_future_release'}:{})}};
 const missingFields=primaryAnnouncementErrors(facts);
 if(missingFields.length){const error=Error('facts_primary_invalid');error.primaryDiagnostics={stage:'facts_schema',missingFields};throw error;}
 return {productFacts:facts,eventType:['release','scheduled_release','release_notice'].includes(action)?'release':'new_product',publishedAt:row.published_at};
}

// Exact token boundaries keep short model codes from matching a different device.
function escapeModel(s){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\s+/g,'\\s*');}
function modelMention(s,m){const clean=s.normalize('NFKC').replace(/\([ァ-ヶー・\s]+\)/g,'');return new RegExp('(?:^|[^A-Za-z0-9])'+escapeModel(m)+'(?=$|[^A-Za-z0-9])','i').test(clean);}

function shortHeadphoneDefinition(title,sections,models,brand){return models.length===1&&/ヘッド(?:フォン|ホン|フォーン)/.test(title)&&sections[0].slice(0,6).some(p=>!unsafe.test(p)&&modelMention(p,brand)&&new RegExp('ヘッド(?:フォン|ホン|フォーン)[「『]'+escapeModel(models[0])+'[」』]').test(p.normalize('NFKC'))&&reservation.test(p))&&new RegExp('[「『]'+escapeModel(models[0])+'[」』]が発売').test(title);}

export function primaryParserSupports(facts,parser){
 if(!PRIMARY_ANNOUNCEMENT_PARSERS.includes(parser))return false;
 if(facts?.subjectEvidence?.corroborated===true||facts?.announcement?.action==='reservation_start')return ['primary-announcement-4',PRIMARY_ANNOUNCEMENT_PARSER].includes(parser);
 return facts?.announcement?.action!=='release_notice'||parser!=='primary-announcement-1';
}
