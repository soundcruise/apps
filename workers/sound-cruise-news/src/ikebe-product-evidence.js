// Existing Ikebe pending articles only: explicit editorial fields, never related cards.
import {parseDocument,DomUtils} from 'htmlparser2';
import {optOut} from './policy.js';
import {calendarDate} from './legacy-listing.js';
import {explicitProductAction,validatedProductEvent} from './product-event.js';
import {productSubject,enrichHeadlineFacts,validHeadlineEvidence} from './headline-evidence.js';
export const IKEBE_PRODUCT_PARSER='ikebe-product-fields-9';
const cls=(n,c)=>(n.attribs?.class||'').split(/\s+/).includes(c);
const hidden=n=>{for(let p=n;p;p=p.parent)if(['script','style','nav','header','footer','template','noscript','aside'].includes(p.name)||p.attribs?.hidden!==undefined||p.attribs?.['aria-hidden']==='true'||/display\s*:\s*none|visibility\s*:\s*hidden/i.test(p.attribs?.style||''))return true;return false;};
const text=n=>hidden(n)?'':n.type==='text'?n.data:n.name==='br'?'\n':(n.children||[]).map(text).join('');
const plain=n=>text(n).replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim();
const find=(n,test)=>DomUtils.findAll(x=>!!x.name&&!hidden(x)&&test(x),n.children||[]);
const urlOK=u=>typeof u==='string'&&/^https:\/\/www\.ikebe-gakki-pb\.com\/new_product\/[1-9][0-9]*\/$/.test(u);
export function ikebeProductSurface(row,source){
 if(source?.id!=='ikebe'||source.baseUrl!=='https://www.ikebe-gakki-pb.com/'||source.discoveryUrl!=='https://www.ikebe-gakki-pb.com/new_product/'||row.source_id!=='ikebe'||!urlOK(row.source_url)||!['pending','reopened'].includes(row.review_status))return null;
 return {url:row.source_url,method:'explicit_ikebe_product_fields',parser:IKEBE_PRODUCT_PARSER};
}
const asciiName=s=>typeof s==='string'&&s.length>=2&&s.length<=80&&/^[A-Za-z0-9][A-Za-z0-9 .&+()'/-]*$/.test(s)&&!/[\r\n]|https?:|\b(?:ignore|instruction|prompt|script)\b/i.test(s);
const nameOK=s=>asciiName(s)||typeof s==='string'&&s.length<=100&&/^([A-Za-z0-9][A-Za-z0-9 .&+()'/-]{1,65}) [ァ-ヶー一-龯]{2,15}限定カラー [ァ-ヶー一-龯]{2,30}$/.test(s);
const modelOK=s=>nameOK(s)&&s.length<=100&&(/限定カラー/.test(s)||/\d/.test(s)||/\b[A-Z]{2,}\b/.test(s)||/^[A-Z][a-z]+(?:[A-Z][a-z]+)+$|^[A-Z][a-z]+(?: [A-Z][a-z]+){1,5}$/.test(s));
const denied=/再入荷|入荷情報|再入荷予定|在庫|セール|特価|値下げ|クーポン|キャンペーン|中古|比較|レビュー|使い方|紹介します|旧製品|発売済み|以前|かつて|過去|他社|例えば|発売しない|発売していません|登場しない|登場していません|ではない|かもしれ|予定|\b(?:restock|sale|review|comparison|previous|not|might)\b/i;
const types=[
 ['contact_cleaner','electric_guitar_bass','guitar',/接点復活剤/],
 ['signal_buffer','amps_effects','effector',/バッファ[ーァ]|\bsignal buffer\b/i],
 ['multi_effect_processor','amps_effects','effector',/マルチ[・ ]?エフェクト[・ ]?(?:プラットフォーム|プロセッサー)|マルチエフェクター/i],
 ['hardware_compressor','recording_audio','recording-pa',/バスコンプ(?:レッサー)?|ハードウェア[・ ]?コンプレッサー/],
 ['effect_pedal','amps_effects','effector',/エフェクター|ペダル|ファズ|\b(?:effects? pedal|overdrive|distortion pedal)\b/i],
 ['guitar_amp','amps_effects','amplifier',/ギターアンプ|ギター用アンプ|\bguitar amplifier\b/i],
 ['acoustic_guitar','acoustic_guitar','acoustic-guitar',/アコースティックギター|\bacoustic guitar\b/i],
 ['electric_guitar','electric_guitar_bass','guitar',/エレキギター|\belectric guitar\b/i],
 ['bass_guitar','electric_guitar_bass','bass',/エレキベース|\bbass guitar\b/i],
 ['power_distribution','recording_audio','recording-pa',/電源タップ|電源プロテクター|\bpower (?:strip|distributor|protector)\b/i],
 ['microphone','recording_audio','recording-pa',/マイクロ[フホ]ン|\bmicrophone\b/i],
 ['audio_interface','recording_audio','recording-pa',/オーディオ[・ ]?インターフェ[イー]ス|\baudio interface\b/i],
 ['headphone','recording_audio','recording-pa',/ヘッド[フホ][ォオ]ン|\bheadphones?\b/i],
 ['tuner_metronome','amps_effects','sx',/チューナー[・／/と&＆ ]*メトロノーム/],
 ['subwoofer','recording_audio','recording-pa',/サブウーファー|\bsubwoofer\b/i],
 ['studio_monitor','recording_audio','recording-pa',/スタジオモニター|モニタースピーカー|\bstudio monitor\b/i]
];
export function validatedIkebeProductFacts(f){
 const edition=f?.editionEvidence?.basis==='verified_primary_article'&&f.editionEvidence.subject==='explicit_custom_colour_sections'&&JSON.stringify(f.editionEvidence.models)===JSON.stringify(f.models)&&f.productEvent?.action==='limited_edition'&&f.productEvent.signal==='explicit_limited_color'&&f.productType==='effect_pedal';
 const parent={distortion_pedal:'effect_pedal',bass_effect_pedal:'effect_pedal',octave_pedal:'effect_pedal',usb_microphone:'microphone',wireless_microphone:'microphone',wireless_headphone:'headphone'};
 return !!f&&(!f.articleIdentity||f.articleIdentity.basis==='explicit_primary_definition'&&asciiName(f.articleIdentity.brand)&&f.brand.startsWith(f.articleIdentity.brand+' ')&&Array.isArray(f.articleIdentity.models)&&f.articleIdentity.models.length===1&&f.articleIdentity.models.every(modelOK))&&validHeadlineEvidence(f)&&f.identifierBasis==='explicit_article_product_fields'&&f.listingSource==='ikebe'&&urlOK(f.articleUrl)&&nameOK(f.brand)&&Array.isArray(f.models)&&f.models.length>=1&&f.models.length<=4&&f.models.every(m=>modelOK(m)||edition&&nameOK(m))&&new Set(f.models).size===f.models.length&&f.product===f.models.join(' / ')&&f.product.length<=110&&f.version===null&&types.some(([t,c])=>(t===f.productType||f.productTypeEvidence&&t===parent[f.productType])&&c===f.category)&&(!f.productEvent||validatedProductEvent(f.productEvent))&&(f.signatureModel===undefined||f.signatureModel===true&&['electric_guitar','guitar_amp'].includes(f.productType))&&(f.stringsCount===undefined||f.stringsCount===12&&f.productType==='electric_guitar')&&(f.limitedReissue===undefined||f.limitedReissue===true&&f.productEvent?.action==='reissue')&&(!f.editionMarket||f.editionMarket==='Japan'&&f.productEvent?.action==='limited_edition');
}
export function ikebeProductLabel(f,eventType){
 if(!validatedIkebeProductFacts(f)||!['new_product','release'].includes(eventType))return null;
 if(f.limitedReissue)return `${f.brand}、${productSubject(f)}の限定復刻モデルを${eventType==='release'?'発売':'発表'}`;
 if(f.signatureModel)return `${f.brand}、${f.stringsCount===12?'12弦':''}シグネチャー${f.productType==='guitar_amp'?'ギターアンプ':'エレキギター'}「${f.product}」を${eventType==='release'?'発売':'発表'}`;
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
  const header=headers[0],titles=find(header,n=>n.name==='h1'),dates=find(header,n=>n.name==='time'&&cls(n,'sub_info_date')&&/公開$/.test(plain(n)));
  if(titles.length!==1||dates.length!==1)throw Error('facts_parser_failure');
  const dm=/^(20\d{2})-(\d{2})-(\d{2})$/.exec(dates[0].attribs.datetime||''),written=/^(20\d{2})年(\d{2})月(\d{2})日公開$/.exec(plain(dates[0]));
  if(!dm||!written||dm.slice(1).join('-')!==written.slice(1).join('-')||!calendarDate(...dm.slice(1))||new Date(dm[0]+'T00:00:00+09:00').toISOString()!==row.published_at)throw Error('facts_date_changed');
  const title=plain(titles[0]).replace(/【発売記念[^】]*キャンペーン[^】]*】$/,'').trim();if(!title||title.length>250||denied.test(title)||/ケース|スタンド|交換|アクセサリー|\b(?:case|stand|replacement)\b/i.test(title))throw Error('facts_scope_uncertain');
  const heads=body.children.filter(n=>/^h[1-3]$/.test(n.name||'')&&cls(n,'wp-block-heading')&&!hidden(n));
  if(!heads.length||heads.length>4||find(body,n=>/^h[1-3]$/.test(n.name)&&cls(n,'wp-block-heading')).length!==heads.length)throw Error('facts_identity_changed');
  const blocks=heads.map((head,index)=>{const nodes=[];for(let n=head.next;n&&n!==heads[index+1];n=n.next)if(n.name==='p'&&cls(n,'wp-block-paragraph')&&!hidden(n))nodes.push(plain(n));return nodes.slice(0,12).join(' ');});
  const productField=raw=>{const s=raw.replace(/\s*\[[A-Za-z0-9 .&+()'/-]{2,70}\]$/,'').replace(/\s+\((?:[A-Za-z]+(?: [A-Za-z]+){0,3})\)$/,'').trim();const m=/^(.{2,70}) [–−-] ([a-z0-9-]+)$/.exec(s);return m&&m[1].toLowerCase().replace(/[^a-z0-9]/g,'')===m[2].replace(/-/g,'')?m[1]:s;};
  const products=heads.map(n=>{const parts=text(n).replace(/[’‘]/g,"'").trim().split(/\n/).map(p=>p.replace(/\s+/g,' ').trim()).filter(Boolean);if(parts.length===2)parts[1]=productField(parts[1]);if(parts.length!==2||!nameOK(parts[0])||!modelOK(parts[1])&&!/^[^/]{1,20} \/ [A-Z]{2,}-[0-9]{1,5}[A-Z]{0,3} [^<>\r\n]{1,40}$/.test(parts[1]))throw Error('facts_identity_changed');if(!modelOK(parts[1]))parts[1]=/ \/ ([A-Z]{2,}-[0-9]{1,5}[A-Z]{0,3}) /.exec(parts[1])[1];return parts;});
  const brand=products[0][0],models=products.map(p=>p[1]);if(products.some(p=>p[0]!==brand)||new Set(models).size!==models.length)throw Error('facts_identity_changed');
  // Manufacturer tag corroborates every product heading, including incomplete component facts.
  if(!find(header,n=>n.name==='a'&&/^https:\/\/www\.ikebe-gakki-pb\.com\/new_product\/tag\/[a-z0-9-]+\/$/.test(n.attribs.href||'')).some(n=>plain(n).toLowerCase()===brand.toLowerCase()))throw Error('facts_identity_changed');
  // A drum pedal is not a guitar effect pedal. Require the article's own
  // percussion category AND a role explicitly bound to every product heading.
  // A related drum mention/category alone can never exclude a guitar product.
  const percussion=heads.every((head,i)=>/\b(?:Chain (?:Single|Double) Pedal|Quad-beater|Drum Pedal|Bass Drum Beater)\b/i.test(plain(head))||blocks[i].split(/[。!?！？]/).some(s=>modelBound(s,models[i])&&/バスドラム用ペダル|ドラム用(?:ペダル|ビーター)|キックペダル/.test(s)&&!/関連|対応|接続|保護|例えば/.test(s)));
  if(find(header,n=>n.name==='li'&&cls(n,'cate-drum')).length&&percussion&&!/ギター用|エフェクター|オーバードライブ|ディストーション/.test(title))return {productFacts:{kind:'source_policy_evidence',brand,models,category:row.category,subjectType:'percussion_equipment',usage:'drum_performance',identifierBasis:'verified_source_policy_article_fields',listingSource:source.id,articleUrl:row.source_url},eventType:row.event_type,publishedAt:row.published_at};
  if(models.some(m=>/\b(?:case|stand|cable|replacement|accessory)\b/i.test(m))){
   // Mixed main product/accessory article: retain explicit identity components, never assert a launch.
   if(/新登場|新発売|新製品|発売|登場|発表/.test(title))throw Error('facts_scope_uncertain');
   return {productFacts:{brand,product:models[0],models,version:null,category:'amps_effects',scopeUncertain:true,identifierBasis:'explicit_article_component_fields',listingSource:'ikebe',articleUrl:row.source_url,components:models.map((model,i)=>({model,role:/\b(?:stand|case|cable|accessory)\b/i.test(model)||i>0&&/専用|対応|互換/.test(blocks[i])?'accessory':'unresolved_main_product'}))},eventType:'other',publishedAt:row.published_at};
  }
  const explicitMulti=heads.length>1&&/限定モデル.{0,8}[2-4]機種|[2-4]機種.{0,8}限定モデル/.test(title)&&heads.every(h=>/\[Limited Model\]/i.test(plain(h)));
  if(models.length>1&&!explicitMulti){const common=[];for(const [i,t] of models[0].split(' ').entries()){if(!models.every(m=>m.split(' ')[i]===t))break;common.push(t);}const family=models[0].match(/^([A-Za-z]{2,}-?)\d/)?.[1];if(!common.some(t=>t.length>=3&&!/^(?:Silver|Limited|Edition|New|Special|Model)$/i.test(t))&&!(family&&models.every(m=>m.startsWith(family)&&/^\d/.test(m.slice(family.length)))))throw Error('facts_identity_changed');}
  const paras=body.children.filter(n=>n.name==='p'&&cls(n,'wp-block-paragraph')&&!hidden(n)).map(plain).filter(p=>p&&!/^※本記事は|^【※ご注意※】|^[—–−-]+$/.test(p));
  const primary=paras.slice(0,8).join(' ');
  let typeMatches=types.filter(([t, ,tag,re])=>(find(header,n=>n.name==='li'&&cls(n,'cate-'+tag)).length||tag==='recording-pa'&&find(header,n=>n.name==='li'&&cls(n,'cate-dtm')).length||tag==='effector'&&find(header,n=>n.name==='li'&&cls(n,'cate-bass')).length&&/歪みペダル/.test(title))&&(re.test(title+' '+primary)||t==='electric_guitar'&&find(header,n=>n.name==='li'&&cls(n,'cate-'+tag)).some(n=>/エレキギター/.test(plain(n)))&&blocks.every((b,i)=>(modelBound(b,models[i])||/ネック/.test(b)&&/ボディ/.test(b))&&!denied.test(b.replace(/(?:入荷|納品|発送|出荷)予定/g,'')))));
  // An explicitly named buffer is not an amplifier/pedal merely because its
  // signal chain mentions an amp or pedalboard. Require model-bound proof.
  if(typeMatches.some(([t])=>t==='signal_buffer')&&types.find(([t])=>t==='signal_buffer')[3].test(title)&&blocks.every((b,i)=>b.split(/[。!?！？]/).some(v=>modelBound(v,models[i])&&types.find(([t])=>t==='signal_buffer')[3].test(v)&&!denied.test(v))))typeMatches=typeMatches.filter(([t])=>!['guitar_amp','effect_pedal'].includes(t));
  typeMatches=typeMatches.filter(([t])=>t!=='signal_buffer'||/バッファ[ーァ]/.test(title)||blocks.some((b,i)=>b.split(/[。!?！？]/).some(v=>modelBound(v,models[i])&&/バッファ[ーァ](?:です|として)/.test(v))));
  if(typeMatches.some(([t])=>t==='multi_effect_processor')&&blocks.some(b=>/マルチ[・ ]?エフェクト[・ ]?(?:プラットフォーム|プロセッサー)|マルチエフェクター/.test(b)))typeMatches=typeMatches.filter(([t])=>!['guitar_amp','effect_pedal'].includes(t));
  if(typeMatches.length!==1)throw Error('facts_scope_uncertain');
  // Launches require a product-bound editorial title and corroborating article fields.
  // Facts-only extraction may retain 'other'; publication still rejects missing events.
  const titleDescription=title.replace(/(?:が)?(?:新)?登場[！!。]*$/,'').replace(/[！!。]$/,'').trim();
  const descriptiveLead=paras.slice(0,2).join(' ').replace(/[！!。]$/,'').replace(/\s/g,'');
  const manufacturerLead=paras.slice(0,2).some(p=>p.replace(/\s/g,'').length>=24&&p.includes(brand)&&typeMatches[0][3].test(p)&&titleDescription.replace(/\s/g,'').includes(p.replace(/[！!。]$/,'').replace(/\s/g,'')));
  const definedSubject=typeMatches[0][0]!=='signal_buffer'&&heads.length===1&&title.includes(brand)&&blocks[0].split(/[。!?！？]/).slice(0,5).some(v=>modelBound(v,models[0])&&typeMatches[0][3].test(v)&&/は.{1,200}です$/.test(v)&&!denied.test(v));
  const uniqueSubject=definedSubject||heads.length===1&&titleDescription.length>=30&&(paras[0]?.replace(/[！!。]$/,'').trim()===titleDescription||title.includes(brand)&&descriptiveLead===titleDescription.replace(/\s/g,'')||manufacturerLead)&&blocks.every((b,i)=>modelBound(b,models[i])&&!denied.test(b));
  const linked=uniqueSubject||title.includes(brand)||models.every(m=>m.split(/\s+/).some(t=>t.length>=3&&!/^(?:Silver|Limited|Edition|POWER|Pro|New)$/i.test(t)&&title.includes(t)));
  if(!linked)throw Error('facts_scope_uncertain');
  const titleSubject=explicitMulti||models.every(m=>m.split(/[^A-Za-z0-9-]+/).filter(t=>t.length>=4&&!/^(?:master|limited|edition|model|special)$/i.test(t)).filter(t=>title.toLowerCase().includes(t.toLowerCase())).length>=2)||models.every(m=>title.toLowerCase().includes(m.toLowerCase()));
  const titleLaunch=/(?:新登場|新発売|新製品|発売|登場|発表|復刻|復活)/.test(title),signature=/シグネ(?:イ|ー)?チャ[ーア]?モデル/.test(title)&&['electric_guitar','guitar_amp'].includes(typeMatches[0][0])&&blocks.every((b,i)=>modelBound(b,models[i])&&!denied.test(b));
  if(!titleLaunch&&!models.some(m=>modelBound(title,m)||m.match(/^([A-Z]{2,}-\d+)/)?.[1]&&title.includes(m.match(/^([A-Z]{2,}-\d+)/)[1])))throw Error('facts_scope_uncertain');
  const statements=[...paras.slice(0,4),paras.slice(0,2).join(' '),...paras.slice(0,4).flatMap(p=>p.split(/[。!?！？]/)),...paras.slice(0,4).flatMap(p=>{const a=p.split(/[。!?！？]/);return a.flatMap((v,i)=>/モデルを生み出しました/.test(v)&&/^それが/.test(a[i+1]||'')?[v+'。'+a[i+1]]:[]);})].filter(p=>!denied.test(p)&&/(?:新登場|新発売|新製品|発売|登場(?:します|しました|！|!|。|$)|発表|復刻|モデルを生み出しました)/.test(p));
  if(titleLaunch&&!signature&&!explicitMulti&&!((titleSubject||uniqueSubject)&&blocks.every((b,i)=>! /関連商品|参考製品|付属品|例えば|他社/.test(b)&&b.split(/[。!?！？]/).some(sentence=>modelBound(sentence,models[i])&&!denied.test(sentence))))&&(!statements.length||!statements.some(p=>p.toLowerCase().includes(brand.toLowerCase())||models.some(m=>modelBound(p,m)))))throw Error('facts_scope_uncertain');
  const refinement=explicitProductAction(title),editionInBody=(/限定(?:企画)?モデル|限定生産|limited edition/i.test(primary)||heads.every(h=>/\[Limited Model\]/i.test(plain(h))));
  if(/限定|特別仕様|特別モデル|新色|コラボ|復刻|再発売/.test(title)&&(!refinement||!editionInBody&&refinement.action==='limited_edition'))throw Error('facts_scope_uncertain');
  const [productType,category]=typeMatches[0],eventType=!titleLaunch?'other':/発売/.test(title)?'release':'new_product';
  const parentBrand=brand.replace(/ (?:USA|UK|Japan|MEX)$/,'');
  const parentCorroborated=parentBrand!==brand&&find(header,n=>n.name==='a').some(n=>plain(n)===parentBrand);
  const definitions=models.map((model,i)=>{const words=model.toLowerCase().split(/\s+/);const names=[...blocks[i].matchAll(/([A-Za-z][A-Za-z0-9 .&+'/-]{4,110})は[^。]{0,180}(?:モデル|ギター)です/g)].map(m=>m[1].trim()).filter(v=>v!==model&&v.split(/\s+/).length>=4&&v.toLowerCase().split(/\s+/).every(t=>words.includes(t))&&words.length-v.split(/\s+/).length<=2);return [...new Set(names)];});
  const articleIdentity=parentCorroborated&&definitions.length===1&&definitions[0].length===1?{brand:parentBrand,models:definitions[0],basis:'explicit_primary_definition'}:null;
  const base={brand,models,product:models.join(' / '),version:null,category,productType,identifierBasis:'explicit_article_product_fields',listingSource:'ikebe',articleUrl:row.source_url,
   ...(refinement?.action==='reissue'&&/限定復刻/.test(title)&&paras.slice(0,4).some(p=>p.split(/[。!?！？]/).some(v=>!denied.test(v)&&/限定復刻モデル/.test(v)&&modelBound(v,models[0])))?{limitedReissue:true}:{}),
   ...(articleIdentity?{articleIdentity}:{}),
   ...(signature?{signatureModel:true}:{}),
   ...(signature&&blocks.every(b=>/12弦/.test(b))?{stringsCount:12}:{}),
   ...(refinement?{productEvent:{...refinement,basis:'verified_primary_article'}}:{}),
   ...(refinement?.action==='limited_edition'&&/日本限定/.test(title)&&/日本限定/.test(primary)?{editionMarket:'Japan'}:{})};
  let facts=enrichHeadlineFacts(base,{title,statements:paras.slice(0,4),publishedAt:row.published_at,basis:'verified_primary_article'});
  if(['multi_effect_processor','hardware_compressor'].includes(productType))facts={...facts,productType,productTypeEvidence:{product:base.product,basis:'verified_primary_article'}};
  const printedRelease=title.match(/(20\d{2})年(\d{1,2})月(\d{1,2})日に新発売/);
  if(printedRelease){const day=printedRelease[1]+'-'+printedRelease[2].padStart(2,'0')+'-'+printedRelease[3].padStart(2,'0');if(calendarDate(...day.split('-'))&&Date.parse(day+'T00:00:00+09:00')>Date.parse(row.published_at))facts={...facts,releaseEvent:{action:'scheduled_release',date:day,basis:'verified_primary_article'}};}
  if(!validatedIkebeProductFacts(facts))throw Error('facts_identity_changed');
  return {productFacts:facts,eventType:facts.releaseEvent?'release':eventType,publishedAt:row.published_at};
 }finally{doc=null;}
}

// Binding requires a distinctive model token/family, not merely a manufacturer/category.
function modelBound(statement,model){const norm=s=>s.toLowerCase().replace(/[()\s]/g,'');if(norm(statement).includes(norm(model)))return true;return model.split(/[^A-Za-z0-9-]+/).some(t=>(t.length>=5||/^[A-Z]{1,5}-\d+[A-Z]*$|^[A-Z]{2,}$/.test(t))&&!/^(?:silver|limited|edition|germanium|compressor|power|white|black|model|special|phantom|guitar|bass|pedal|amplifier|effect|processor|classic|standard)$/i.test(t)&&norm(statement).includes(norm(t)));}
export function ikebeIdentityRefinement(row,old,facts,proof){
 if(row.source_id!=='ikebe'||proof?.parserVersion!==IKEBE_PRODUCT_PARSER||proof.sourceUrl!==row.source_url||facts.articleUrl!==row.source_url||facts.identifierBasis!=='explicit_article_product_fields'||!validatedIkebeProductFacts(facts)||String(old?.brand).toLowerCase()!==facts.brand.toLowerCase()||old.identifierBasis!=='explicit_model_code')return false;
 // A verified family code can expand into explicitly labeled suffix/color models only.
 return /^[A-Z]{2,}-\d{1,5}$/.test(old.product||'')&&facts.models.every(m=>new RegExp('^'+old.product+'[A-Z]{1,3}$').test(m))&&['artist','performer','person'].every(k=>!old[k]&&!facts[k]);
}
