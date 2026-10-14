// Bounded series announcements: retain every explicit model, never truncate to four.
// No brand/model catalogue, release-date inference or classification from category labels.
import {parseDocument,DomUtils as D} from 'htmlparser2';
import {optOut} from './policy.js';
export const PRODUCT_FAMILY_PARSER='product-family-fields-1';
const cls=(n,c)=>(n?.attribs?.class||'').split(/\s+/).includes(c);
const hidden=n=>{for(let p=n;p;p=p.parent)if(['script','style','nav','aside','footer','template','noscript'].includes(p.name)||p.attribs?.hidden!==undefined||p.attribs?.['aria-hidden']==='true'||(p.attribs?.class||'').split(/\s+/).some(c=>/^(?:related|profile|recommend|wp-block-latest)/.test(c))||/display\s*:\s*none|visibility\s*:\s*hidden/i.test(p.attribs?.style||''))return true;return false;};
const text=n=>hidden(n)?'':n.type==='text'?n.data:n.name==='br'?'\n':(n.children||[]).map(text).join('');
const plain=n=>text(n).replace(/\s+/g,' ').trim();
const find=(n,p)=>D.findAll(x=>!!x.name&&!hidden(x)&&p(x),n.children||[]);
const name=s=>typeof s==='string'&&s.length>=2&&s.length<=100&&/^[A-Za-z0-9][A-Za-z0-9 .&+()'/-]*$/.test(s)&&! /\b(?:script|prompt|instruction|ignore)\b/i.test(s);
const denied=/再入荷|在庫処分|中古|比較|レビュー|セール|クーポン|旧製品|以前|かつて|過去の|関連商品|参考製品|付属品|発売予定|かもしれ|ではない|登場しない|新製品では|限定|新色|復刻|コラボ|特別仕様/;
const norm=s=>s.normalize('NFKC').replace(/\s+/g,' ').toLowerCase();
const articleUrl=(url,source)=>source==='ikebe'?/^https:\/\/www\.ikebe-gakki-pb\.com\/new_product\/[1-9]\d*\/$/.test(url||''):source==='shimamura'&&/^https:\/\/www\.shimamura\.co\.jp\/update\/guitar-bass\/20\d{2}\/\d{2}\/[1-9]\d*\/$/.test(url||'');
export function validProductFamily(f){
 return !!f&&f.kind==='product_family'&&f.identifierBasis==='explicit_product_family_fields'&&['ikebe','shimamura'].includes(f.listingSource)&&name(f.brand)&&name(f.family)&&f.product===f.family&&f.category==='electric_guitar_bass'&&f.action==='announce'&&f.version===null&&f.releaseEvent===undefined&&f.productEvent===undefined&&Array.isArray(f.models)&&f.models.length>=2&&f.models.length<=24&&new Set(f.models).size===f.models.length&&f.models.every(m=>name(m)&&norm(m).startsWith(norm(f.family)+' '))&&['unspecified','bass'].includes(f.instrumentGroup)&&f.familyEvidence?.basis==='verified_primary_article'&&f.familyEvidence.subject==='explicit_product_sections'&&f.familyEvidence.memberCount===f.models.length&&f.models.every(m=>f.instrumentGroup==='bass'?/\bBass\b/.test(m):! /\bBass\b/.test(m))&&articleUrl(f.articleUrl,f.listingSource);
}
export function productFamilyLabel(f,event){return validProductFamily(f)&&event==='new_product'?`${f.brand}、「${f.family}」シリーズ${f.instrumentGroup==='bass'?'のベース':'の'}新モデルを発表`:null;}
export function productFamilyKey(f){return JSON.stringify([norm(f.brand),norm(f.family),[...f.models].map(norm).sort()]);}
export function parseProductFamilyEvidence(html,source,row){
 if(!['ikebe','shimamura'].includes(source?.id)||row.source_id!==source.id||row.category!=='electric_guitar_bass')throw Error('facts_scope_uncertain');
 if(!articleUrl(row.source_url,source.id))throw Error('facts_source_invalid');
 if(typeof html!=='string'||new TextEncoder().encode(html).length>512000)throw Error('facts_response_too_large');
 const d=parseDocument(html),ik=source.id==='ikebe';
 if(find(d,n=>n.name==='meta'&&/^(robots|SoundCruiseNewsBot)$/i.test(n.attribs.name||'')).some(n=>optOut(n.attribs.content||'')))throw Error('facts_optout');
 const canon=find(d,n=>n.name==='link'&&n.attribs.rel==='canonical');if(canon.length!==1||canon[0].attribs.href!==row.source_url)throw Error('facts_source_invalid');
 const roots=find(d,n=>ik?n.name==='article'&&n.attribs.id==='main':cls(n,'p-content'));
 const headers=ik&&roots.length===1?roots[0].children.filter(n=>cls(n,'blog_title')):[];
 const titles=ik&&headers.length===1?find(headers[0],n=>n.name==='h1'):find(d,n=>n.name==='h1'&&cls(n.parent,'mb-80'));
 const dates=ik&&headers.length===1?find(headers[0],n=>n.name==='time'&&cls(n,'sub_info_date')&&/公開$/.test(plain(n))):find(d,n=>n.name==='time'&&plain(n.parent).startsWith('公開：'));
 if(roots.length!==1||titles.length!==1||dates.length!==1)throw Error('facts_parser_failure');
 const day=dates[0].attribs.datetime;if(!/^20\d{2}-\d{2}-\d{2}$/.test(day||'')||new Date(day+'T00:00:00+09:00').toISOString()!==row.published_at)throw Error('facts_date_changed');
 if(ik&&plain(dates[0])!==day.replace(/(\d{4})-(\d{2})-(\d{2})/,'$1年$2月$3日公開'))throw Error('facts_date_changed');
 const title=plain(titles[0]);if(denied.test(title)||! /登場|誕生|発表/.test(title))throw Error('facts_scope_uncertain');
 const root=ik?roots[0].children.find(n=>cls(n,'main_wrap')):roots[0];if(!root)throw Error('facts_parser_failure');
 let brand,models,descriptions,corroborated=null;
 if(ik){
  const heads=root.children.filter(n=>/^h[123]$/.test(n.name||'')&&cls(n,'wp-block-heading')&&!hidden(n));
  if(heads.length<2||heads.length>24||find(root,n=>/^h[123]$/.test(n.name)&&cls(n,'wp-block-heading')).length!==heads.length)throw Error('facts_scope_uncertain');
  const fields=heads.map(n=>text(n).trim().split('\n').map(v=>v.replace(/\s+/g,' ').trim()).filter(Boolean));
  if(fields.some(f=>f.length!==2||!name(f[0])||!name(f[1])))throw Error('facts_identity_changed');
  const printedBrand=fields[0][0];if(fields.some(f=>f[0]!==printedBrand))throw Error('facts_identity_changed');
  const tags=find(headers[0],n=>n.name==='a'&&/^https:\/\/www\.ikebe-gakki-pb\.com\/new_product\/tag\/[a-z0-9-]+\/$/.test(n.attribs.href||'')).map(plain);
  if(!tags.includes(printedBrand))throw Error('facts_identity_changed');
  // A separately printed parent tag may corroborate a regional manufacturer label.
  brand=tags.find(v=>name(v)&&new RegExp('^'+v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+' (?:USA|UK|Japan)$').test(printedBrand))||printedBrand;
  models=[...new Set(fields.map(f=>f[1].replace(/ \([A-Za-z0-9 -]+\/(?:Rosewood|Maple|Ebony|Laurel)\)$/,'').trim()))];
  descriptions=find(root,n=>n.name==='p'&&cls(n,'wp-block-paragraph')).map(plain).filter(p=>! /お問い合わせ|取扱店舗/.test(p));
 }else{
  const intro=root.children.filter(n=>n.name==='p'&&cls(n,'wp-block-paragraph')).map(plain).slice(0,2).join(' ');
  if(denied.test(intro)||! /登場しました|発表され/.test(intro))throw Error('facts_scope_uncertain');
  brand=title.match(/^【([A-Za-z][A-Za-z0-9 .&'-]{1,40})】/)?.[1];
  // Only top-level model headings corroborated by the same section's product table.
  const heads=root.children.filter(n=>/^h[23]$/.test(n.name||'')&&name(plain(n))&&!hidden(n));
  models=heads.filter((h,i)=>root.children.slice(root.children.indexOf(h)+1,i+1<heads.length?root.children.indexOf(heads[i+1]):undefined).some(n=>find(n,x=>x.name==='table').some(t=>/品名/.test(plain(t))&&norm(plain(t)).includes(norm(plain(h)))&&find(t,x=>x.name==='td').length))).map(plain);
  corroborated=models;
  descriptions=[intro,...find(root,n=>n.name==='p'&&cls(n,'wp-block-paragraph')||/^h[23]$/.test(n.name)).map(plain)];
 }
 if(!name(brand)||models.length<2||models.length>24||models.some(m=>!name(m)))throw Error('facts_identity_changed');
 if(models.some(m=>/\b(?:case|stand|pickup|cable|replacement|accessory|pedal)\b/i.test(m)))throw Error('facts_scope_uncertain');
 // Explicit instrument construction, rather than a category or a bare brand tag.
 const instrumentText=descriptions.join(' '),signals=[/ネック/,/指板/,/フレット/,/ピックアップ/,/ブリッジ/].filter(re=>re.test(instrumentText));
 if(signals.length<3)throw Error('facts_scope_uncertain');
 let common=models[0].split(' ');for(const m of models.slice(1)){const words=m.split(' ');common=common.filter((v,i)=>common.slice(0,i).every((x,j)=>x===words[j])&&v===words[i]);}
 const family=common.join(' ');if(common.length<2||family.length<8||!title.includes(family)||! /シリーズ|Series/.test(title+' '+descriptions.slice(0,1).join(' '))||models.some(m=>!corroborated?.includes(m)&&!descriptions.some(p=>!denied.test(p)&&norm(p).includes(norm(m)))))throw Error('facts_identity_changed');
 const bass=models.every(m=>/\bBass\b/.test(m));if(!bass&&models.some(m=>/\bBass\b/.test(m)))throw Error('facts_scope_uncertain');
 const facts={kind:'product_family',identifierBasis:'explicit_product_family_fields',listingSource:source.id,articleUrl:row.source_url,brand,family,product:family,models,version:null,category:'electric_guitar_bass',instrumentGroup:bass?'bass':'unspecified',action:'announce',familyEvidence:{basis:'verified_primary_article',subject:'explicit_product_sections',memberCount:models.length}};
 if(!validProductFamily(facts))throw Error('facts_identity_changed');return {publishedAt:row.published_at,eventType:'new_product',productFacts:facts};
}
