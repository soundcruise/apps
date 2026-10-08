// Source-bound editorial evidence. No product/brand whitelist and no related cards.
import {parseDocument,DomUtils} from 'htmlparser2';
import {optOut} from './policy.js';
import {explicitProductAction,validatedProductEvent,productActionSuffix} from './product-event.js';
export const SHIMAMURA_PRODUCT_PARSER='shimamura-product-fields-1';
const cls=(n,c)=>(n?.attribs?.class||'').split(/\s+/).includes(c);
const hidden=n=>{for(let p=n;p;p=p.parent)if(['script','style','aside','nav','footer','template','noscript'].includes(p.name)||p.attribs?.hidden!==undefined||p.attribs?.['aria-hidden']==='true'||/display\s*:\s*none|visibility\s*:\s*hidden/i.test(p.attribs?.style||''))return true;return false;};
const plain=n=>(hidden(n)?'':DomUtils.textContent(n)).replace(/[®™]/g,'').replace(/\s+/g,' ').trim();
const find=(n,p)=>DomUtils.findAll(x=>!!x.name&&!hidden(x)&&p(x),n.children||[]);
const urlOK=u=>/^https:\/\/www\.shimamura\.co\.jp\/update\/(guitar-bass|amp-effector|dtm-recording)\/20\d{2}\/\d{2}\/[1-9]\d*\/$/.test(u||'');
const nameOK=s=>typeof s==='string'&&s.length>=2&&s.length<=100&&/^[A-Za-z0-9][A-Za-z0-9 .&+()'/-]*$/.test(s)&&! /\b(?:ignore|instruction|prompt|script)\b/i.test(s);
const denied=/再入荷|中古|比較|レビュー|使い方|セール|特価|クーポン|在庫処分|発売済み|旧製品|登場しない|発表しない|発売しない|ではない|かもしれ|以前|かつて|過去|発売予定|関連商品|参考製品|付属品/;
const norm=s=>s.normalize('NFKC').replace(/[®™\s]/g,'').toLowerCase();
const types=[['effect_pedal','エフェクター','amps_effects',/エフェクター|(?:ディレイ|歪み|オーバードライブ|ディストーション)?ペダル(?!ボード)|オーバードライブ/],['guitar_pickup','ギター用ピックアップ','amps_effects',/ピックアップ/],['guitar','ギター','electric_guitar_bass',/ギター|テレキャスター|セミホロウ/],['audio_plugin','プラグイン','dtm_software',/プラグイン/]];
export function shimamuraProductSurface(row,source){return source?.id==='shimamura'&&row.source_id===source.id&&source.discoveryUrl==='https://www.shimamura.co.jp/update/common/new-item/'&&urlOK(row.source_url)&&['pending','reopened'].includes(row.review_status)?{url:row.source_url,method:'explicit_shimamura_product_fields',parser:SHIMAMURA_PRODUCT_PARSER}:null;}
export function validatedShimamuraProductFacts(f){return !!f&&f.identifierBasis==='explicit_shimamura_product_fields'&&f.listingSource==='shimamura'&&urlOK(f.articleUrl)&&nameOK(f.brand)&&Array.isArray(f.models)&&f.models.length>=1&&f.models.length<=4&&f.models.every(nameOK)&&new Set(f.models).size===f.models.length&&f.product===f.models.join(' / ')&&f.product.length<=110&&f.version===null&&types.some(([t,,c])=>t===f.productType&&c===f.category)&&(!f.productEvent||validatedProductEvent(f.productEvent))&&(f.signatureModel===undefined||f.signatureModel===true&&f.productType==='guitar')&&(!f.editionMarket||f.editionMarket==='Japan'&&f.productEvent?.action==='limited_edition');}
export function shimamuraProductLabel(f,event){if(!validatedShimamuraProductFacts(f)||!['new_product','release'].includes(event))return null;const type=types.find(([t])=>t===f.productType)[1],subject=`${f.brand}、${f.signatureModel?'シグネチャー':''}${type}「${f.product}」`;return subject+(f.productEvent?.action==='limited_edition'&&f.editionMarket==='Japan'?`の日本限定モデルを${event==='release'?'発売':'発表'}`:f.productEvent?productActionSuffix(f.productEvent):event==='release'?'を発売':'を発表');}
export function parseShimamuraProductEvidence(html,source,row){
 if(!shimamuraProductSurface(row,source))throw Error('facts_source_invalid');if(typeof html!=='string'||new TextEncoder().encode(html).length>512000)throw Error('facts_response_too_large');let doc=parseDocument(html);html='';
 try{
  if(find(doc,n=>n.name==='meta'&&/^(robots|SoundCruiseNewsBot)$/i.test(n.attribs.name||'')).some(n=>optOut(n.attribs.content||'')))throw Error('facts_optout');
  const canon=find(doc,n=>n.name==='link'&&n.attribs.rel==='canonical'),roots=find(doc,n=>cls(n,'p-content')),heads=find(doc,n=>n.name==='h1'&&cls(n.parent,'mb-80')),dates=find(doc,n=>n.name==='time'&&plain(n.parent).startsWith('公開：'));
  if(canon.length!==1||canon[0].attribs.href!==row.source_url||roots.length!==1||heads.length!==1||dates.length!==1)throw Error('facts_parser_failure');
  const day=new Date(Date.parse(row.published_at)+9*3600000).toISOString().slice(0,10);if(dates[0].attribs.datetime!==day)throw Error('facts_date_changed');
  const title=plain(heads[0]),root=roots[0];if(denied.test(title)||/ケース|スタンド|交換用|ケーブル|記事広告|PR記事/.test(title))throw Error('facts_scope_uncertain');
  const intro=root.children.filter(n=>n.name==='p'&&cls(n,'wp-block-paragraph')&&!hidden(n)).map(plain).filter(p=>p!=='目次に戻る').slice(0,2).join(' ');
  const statements=intro.split(/[。!?！？]/).filter(s=>!denied.test(s)&&/(?:発表され|登場(?:しました|します)|発売)/.test(s));if(!statements.length)throw Error('facts_event_missing');
  const launch=statements[0].split(/新シリーズとして/).at(-1);
  const quoted=[...launch.matchAll(/「([^」]{2,100})」/g)].map(m=>m[1].replace(/（[^）]*）/g,'').trim()).filter(nameOK);
  const models=[...new Set(quoted)];if(!models.length||models.length>4)throw Error('facts_identity_changed');
  const brandMatch=/([A-Za-z][A-Za-z0-9 .&'-]{1,60})(?:より|「)/.exec(title)||/([A-Za-z][A-Za-z0-9 .&'-]{1,60})(?:（[^）]*）)?(?:より|\s*から)/.exec(intro)||/([A-Za-z][A-Za-z0-9 .&'-]{1,60})「/.exec(title)||/^([A-Za-z][A-Za-z0-9 .&'-]{1,60})の/.exec(title);
  const brand=brandMatch?.[1].trim();if(!nameOK(brand)||!norm(title).includes(norm(brand.split(' ')[0])))throw Error('facts_identity_changed');
  const productHeads=find(root,n=>/^h[23]$/.test(n.name)||n.name==='tr'&&find(n,x=>x.name==='td').length&&/JANコード/.test(plain(n))).map(plain);
  if(!models.every(m=>norm(title).includes(norm(m))||productHeads.some(h=>norm(h).includes(norm(m)))))throw Error('facts_identity_changed');
  // Type comes from the subject/title, never the listing category or related products.
  const typeScope=title+' '+launch;const secondaryScope=root.children.filter(n=>n.name==='p'&&cls(n,'wp-block-paragraph')&&!hidden(n)).map(plain).filter(p=>p!=='目次に戻る').slice(0,4).filter(s=>!denied.test(s)&&! /関連商品|参考製品|付属品|例えば|他社/.test(s)).join(' ');let matches=types.filter(([, , ,re])=>re.test(typeScope));if(!matches.length)matches=types.filter(([, , ,re])=>re.test(secondaryScope));if(matches.some(([t])=>t==='guitar_pickup'))matches=matches.filter(([t])=>t!=='guitar');if(matches.some(([t])=>t==='effect_pedal'))matches=matches.filter(([t])=>t!=='guitar');if(matches.length!==1)throw Error('facts_scope_uncertain');
  const action=explicitProductAction(title);if(/限定|新色|コラボ|復刻/.test(title)&&!action)throw Error('facts_scope_uncertain');if(action&&!statements.some(s=>explicitProductAction(s)?.action===action.action&&explicitProductAction(s)?.signal===action.signal))throw Error('facts_scope_uncertain');
  const [productType,,category]=matches[0],facts={brand,product:models.join(' / '),models,version:null,category,productType,identifierBasis:'explicit_shimamura_product_fields',listingSource:source.id,articleUrl:row.source_url,...(action?{productEvent:{...action,basis:'verified_primary_article'}}:{}),...(/シグネ(?:イ|ー)?チャ[ーア]?モデル/.test(launch)?{signatureModel:true}:{}),...(action?.action==='limited_edition'&&/日本限定/.test(title)&&/日本限定/.test(intro)?{editionMarket:'Japan'}:{})};
  if(!validatedShimamuraProductFacts(facts))throw Error('facts_identity_changed');return {productFacts:facts,eventType:/発売/.test(title)&&/発売/.test(launch)?'release':'new_product',publishedAt:row.published_at};
 }finally{doc=null;}
}
