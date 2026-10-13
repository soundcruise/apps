// Supplemental, primary-section evidence. No model/brand-specific exceptions.
import {parseDocument,DomUtils as D} from 'htmlparser2';
import {optOut} from './policy.js';
const cls=(n,c)=>(n.attribs?.class||'').split(/\s+/).includes(c);
const hidden=n=>{for(let p=n;p;p=p.parent)if(['script','style','nav','header','footer','aside','template','noscript'].includes(p.name)||p.attribs?.hidden!==undefined||p.attribs?.['aria-hidden']==='true'||/display\s*:\s*none|visibility\s*:\s*hidden/i.test(p.attribs?.style||''))return true;return false;};
const text=n=>hidden(n)?'':n.type==='text'?n.data:n.name==='br'?'\n':(n.children||[]).map(text).join('');
const plain=n=>text(n).replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim();
const find=(n,p)=>D.findAll(x=>x.name&&!hidden(x)&&p(x),n.children||[]);
const name=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9 .&+()'/-]{1,79}$/.test(v)&&!/\b(?:ignore|instruction|prompt|script)\b/i.test(v);
const denied=/再入荷|在庫|セール|クーポン|中古|比較|レビュー|旧製品|以前|過去|かもしれ|ではない|関連商品|参考製品|付属品|他社|例えば|交換用|専用のペダル|対応機器/;
const bound=(s,m)=>new RegExp('(?:^|[^A-Za-z0-9])'+m.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?=$|[^A-Za-z0-9])','i').test(s);
export function structuredIkebeEvidence(html,row){
 if(row.source_id!=='ikebe'||!/^https:\/\/www\.ikebe-gakki-pb\.com\/new_product\/[1-9][0-9]*\/$/.test(row.source_url||''))throw Error('facts_source_invalid');
 if(typeof html!=='string'||new TextEncoder().encode(html).length>512000)throw Error('facts_response_too_large');
 const doc=parseDocument(html);
 if(find(doc,n=>n.name==='meta'&&/^(robots|SoundCruiseNewsBot)$/i.test(n.attribs.name||'')).some(n=>optOut(n.attribs.content||'')))throw Error('facts_optout');
 const canon=find(doc,n=>n.name==='link'&&n.attribs.rel==='canonical'),roots=find(doc,n=>n.name==='article'&&n.attribs.id==='main');
 if(canon.length!==1||canon[0].attribs.href!==row.source_url||roots.length!==1)throw Error('facts_source_invalid');
 const root=roots[0],headers=root.children.filter(n=>cls(n,'blog_title')&&!hidden(n)),bodies=root.children.filter(n=>cls(n,'main_wrap')&&!hidden(n));
 if(headers.length!==1||bodies.length!==1)throw Error('facts_parser_failure');
 const hs=find(headers[0],n=>n.name==='h1'),dates=find(headers[0],n=>n.name==='time'&&cls(n,'sub_info_date'));
 if(hs.length!==1||dates.length!==1||!/^20\d{2}-\d{2}-\d{2}$/.test(dates[0].attribs.datetime||'')||new Date(dates[0].attribs.datetime+'T00:00:00+09:00').toISOString()!==row.published_at||plain(dates[0])!==dates[0].attribs.datetime.replace(/(\d{4})-(\d{2})-(\d{2})/,'$1年$2月$3日公開'))throw Error('facts_date_changed');
 const title=plain(hs[0]),body=bodies[0],heads=body.children.filter(n=>/^h[1-3]$/.test(n.name||'')&&cls(n,'wp-block-heading')&&!hidden(n));
 if(!title||title.length>250||denied.test(title)||!heads.length||heads.length>4||find(body,n=>/^h[1-3]$/.test(n.name)&&cls(n,'wp-block-heading')).length!==heads.length)throw Error('facts_scope_uncertain');
 const fields=heads.map(h=>text(h).replace(/[’‘]/g,"'").trim().split(/\n/).map(v=>v.replace(/\s+/g,' ').trim()).filter(Boolean));
 const headBrand=fields[0]?.[0];
 const tagBrands=find(headers[0],n=>n.name==='a'&&/^https:\/\/www\.ikebe-gakki-pb\.com\/new_product\/tag\/[a-z0-9-]+\/$/.test(n.attribs.href||'')).map(plain);
 const brand=tagBrands.find(v=>v.toLowerCase()===String(headBrand).toLowerCase())||headBrand;
 if(!name(brand)||fields.some(f=>f.length!==2||f[0].toLowerCase()!==brand.toLowerCase())||!find(headers[0],n=>n.name==='a'&&/^https:\/\/www\.ikebe-gakki-pb\.com\/new_product\/tag\/[a-z0-9-]+\/$/.test(n.attribs.href||'')).some(n=>plain(n).toLowerCase()===brand.toLowerCase()))throw Error('facts_identity_changed');
 const sections=heads.map((h,i)=>{const p=[];for(let n=h.next;n&&n!==heads[i+1];n=n.next)if(n.name==='p'&&cls(n,'wp-block-paragraph')&&!hidden(n))p.push(plain(n));return p;});
 const first=sections[0].slice(0,8).join(' ');
 // Explicit playback-only outdoor/party purpose, not a studio monitor or PA.
 // Ambiguous speakers, recording/performing inputs and related mentions stay held.
 if(/Bluetooth/.test(title)&&/Bluetooth[^。]{0,80}ポータブルスピーカーです/.test(first)&&/パーティー|ピクニック|公園/.test(first)&&!denied.test(first)&&!/録音|収録|スタジオ|モニター|PA\b|楽器入力|マイク入力|ギター|演奏用/.test(title+' '+sections.flat().join(' '))){
  const models=fields.map(f=>f[1]);if(!models.every(m=>name(m)&&!/\b(?:case|stand|cable|related|replacement|accessory)\b/i.test(m))||new Set(models).size!==models.length||!first.toLowerCase().includes(brand.toLowerCase()))throw Error('facts_identity_changed');
  return {productFacts:{kind:'source_policy_evidence',category:row.category,subjectType:'consumer_portable_speaker',usage:'outdoor_party_playback',brand,models,product:models.join(' / '),identifierBasis:'verified_source_policy_article_fields',listingSource:'ikebe',articleUrl:row.source_url},eventType:row.event_type,publishedAt:row.published_at};
 }
 // An explicitly labeled maintenance product with a unique printed model code.
 const code=fields.length===1?fields[0][1].match(/^([A-Za-z][A-Za-z ]{2,35}) \[([A-Z]{1,5}(?:-[A-Z0-9]{1,6}){1,4})\]$/):null;
 if(code&&/接点復活剤.{0,35}登場/.test(title)&&/電気接点部分の汚れを落とし、通電を復活/.test(first)&&/ポット、ジャック、プラグ、スイッチ、コネクター/.test(first)&&!denied.test(first)){
  return {productFacts:{brand,models:[code[2]],product:code[2],version:null,category:'electric_guitar_bass',productType:'contact_cleaner',identifierBasis:'explicit_article_product_fields',listingSource:'ikebe',articleUrl:row.source_url,productTypeEvidence:{product:code[2],basis:'verified_primary_article'}},eventType:'new_product',publishedAt:row.published_at};
 }
 // One explicitly realized custom-colour launch can contain distinct pedal models.
 // Keep only printed ASCII product identifiers; decorative colour/subtitle text
 // cannot invent a new identity or a device subtype.
 const realized=/実現した特別オーダーカラー限定モデル/;
 if(realized.test(title)&&realized.test(first)&&fields.length>=1&&fields.length<=4&&!denied.test(first)){
  const models=fields.map(f=>f[1].match(/^([A-Za-z][A-Za-z0-9-]{2,30} [A-Za-z][A-Za-z ']{2,35}) [ァ-ヶー一-龯]{1,15}[（(][A-Za-z]{2,20}[）)]\[[^\]\r\n]{2,60}\]$/)?.[1]);
  if(!models.every(name)||new Set(models).size!==models.length||!models.every((m,i)=>bound(title,m.split(' ')[0])&&sections[i].slice(0,5).some(v=>bound(v,m.split(' ')[0])&&/ペダル|オーバードライブ|ディレイ/.test(v)&&!denied.test(v))))throw Error('facts_identity_changed');
  return {productFacts:{brand,models,product:models.join(' / '),version:null,category:'amps_effects',productType:'effect_pedal',identifierBasis:'explicit_article_product_fields',listingSource:'ikebe',articleUrl:row.source_url,productEvent:{action:'limited_edition',signal:'explicit_limited_color',basis:'verified_primary_article'},editionEvidence:{basis:'verified_primary_article',models,subject:'explicit_custom_colour_sections'}},eventType:'new_product',publishedAt:row.published_at};
 }
 throw Error('facts_scope_uncertain');
}
