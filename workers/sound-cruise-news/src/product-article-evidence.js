// Non-event editorial evidence. No release inference, model catalogue or product-specific rules.
import {parseDocument,DomUtils} from 'htmlparser2';
import {calendarDate} from './legacy-listing.js';
import {optOut} from './policy.js';
import {ikebeProductSurface} from './ikebe-product-evidence.js';
export const PRODUCT_ARTICLE_PARSER='ikebe-product-article-1';
const names=s=>typeof s==='string'&&s.length>=2&&s.length<=110&&/^[A-Za-z0-9][A-Za-z0-9 .&+()'/-]*$/.test(s)&&! /\b(?:ignore|instruction|prompt|script)\b/i.test(s);
const models=s=>names(s)&&s.length<=70;
const types=['product_information','gear_information','review','hands_on','feature','explainer'];
const themes=['practice_tools','guitar_practice_recording','guitar_tone'];
const roles=['product','accessory'];
export function productArticleSurface(row,source){
 if(!ikebeProductSurface(row,source)||!['other','review','product_article'].includes(row.event_type))return null;
 return {url:row.source_url,method:'explicit_product_article_fields',parser:PRODUCT_ARTICLE_PARSER};
}
export function validatedProductArticle(f){
 return !!f&&f.kind==='product_article'&&f.identifierBasis==='verified_product_article_fields'&&f.listingSource==='ikebe'&&/^https:\/\/www\.ikebe-gakki-pb\.com\/new_product\/[1-9][0-9]*\/$/.test(f.articleUrl||'')&&names(f.brand)&&types.includes(f.articleType)&&themes.includes(f.theme)&&f.relevance===f.theme&&f.category==='amps_effects'&&f.version===null&&!f.scopeUncertain&&!f.productEvent&&!f.releaseEvent&&Array.isArray(f.models)&&f.models.length>=1&&f.models.length<=4&&f.models.every(models)&&new Set(f.models).size===f.models.length&&names(f.product)&&(f.product===f.models.join(' / ')||f.product===f.models[0])&&Array.isArray(f.components)&&f.components.length===f.models.length&&f.components.every((p,i)=>p.model===f.models[i]&&roles.includes(p.role))&&f.components.some(p=>p.role==='product')&&f.articleEvidence?.basis==='explicit_editorial_article_fields'&&f.articleEvidence.subject==='structured_product_sections'&&f.articleEvidence.substance===f.theme&&(f.theme!=='practice_tools'||f.productType==='tuner_metronome')&&(f.theme!=='guitar_tone'||f.productType==='guitar_amp');
}
export function productArticleLabel(f){
 if(!validatedProductArticle(f))return null;
 const subject=f.theme==='practice_tools'?`チューナー・メトロノーム「${f.models.join(' / ')}」`:`機材「${f.models.join(' / ')}」`;
 const action={product_information:'を紹介',gear_information:'を紹介',review:'をレビュー',hands_on:'を試奏',feature:'を特集',explainer:'を解説'}[f.articleType];
 const label=`${f.brand}、${subject}${action}`;return label.length<=140?label:null;
}
const cls=(n,c)=>(n.attribs?.class||'').split(/\s+/).includes(c);
const hidden=n=>{for(let p=n;p;p=p.parent)if(['script','style','nav','header','footer','template','noscript','aside'].includes(p.name)||p.attribs?.hidden!==undefined||p.attribs?.['aria-hidden']==='true'||/display\s*:\s*none|visibility\s*:\s*hidden/i.test(p.attribs?.style||''))return true;return false;};
const text=n=>hidden(n)?'':n.type==='text'?n.data:n.name==='br'?'\n':(n.children||[]).map(text).join('');
const plain=n=>text(n).replace(/\s+/g,' ').trim();
const find=(n,test)=>DomUtils.findAll(x=>!!x.name&&!hidden(x)&&test(x),n.children||[]);
const promotional=/再入荷|入荷情報|在庫|セール|特価|値下げ|クーポン|キャンペーン|中古|広告|PR記事|比較|以前|過去|かつて|旧製品|発売済み|かもしれ|\b(?:restock|sale|sponsored|advertorial|comparison)\b/i;
const launch=/新製品|新発売|新登場|発売|発表|登場|新色|限定モデル|限定生産|復刻|再発売|アップデート|新モデル|\b(?:launch|released?|announce|update)\b/i;
const boilerplate=/販売価格|税込|税抜|販売ページ|ご購入|お問い合わせ|掲載時点|変更になる|公開時点|予めご了承ください|あらかじめご了承ください|公式サイト|関連商品|関連記事|おすすめ商品/;
const functionSignals=[/チューナー|ピッチ|音程/,/メトロノーム|テンポ|リズム/,/ルーパー|ループ/,/トラック|DAW/,/アンプ|エフェクター/,/ヘッド[フホ][ォオ]ン|スピーカー/,/プリセット|Scene|シーン/];
export function parseIkebeInformationalEvidence(html,source,row){
 if(!productArticleSurface(row,source))throw Error('facts_source_invalid');
 if(typeof html!=='string'||new TextEncoder().encode(html).length>512000)throw Error('facts_response_too_large');
 let doc=parseDocument(html);html='';
 try{
  if(find(doc,n=>n.name==='meta'&&/^(robots|SoundCruiseNewsBot)$/i.test(n.attribs.name||'')).some(n=>optOut(n.attribs.content||'')))throw Error('facts_optout');
  const canonical=find(doc,n=>n.name==='link'&&n.attribs.rel==='canonical');if(canonical.length!==1||canonical[0].attribs.href!==row.source_url)throw Error('facts_source_invalid');
  const articles=find(doc,n=>n.name==='article'&&n.attribs.id==='main');if(articles.length!==1)throw Error('facts_parser_failure');
  const article=articles[0],bodies=find(article,n=>cls(n,'main_wrap')),headers=article.children.filter(n=>cls(n,'blog_title')&&!hidden(n));
  if(bodies.length!==1||bodies[0].parent!==article||headers.length!==1)throw Error('facts_parser_failure');
  const body=bodies[0],header=headers[0],titles=find(header,n=>n.name==='h1'),dates=find(header,n=>n.name==='time'&&cls(n,'sub_info_date'));
  if(titles.length!==1||dates.length!==1)throw Error('facts_parser_failure');
  const dm=/^(20\d{2})-(\d{2})-(\d{2})$/.exec(dates[0].attribs.datetime||''),written=/^(20\d{2})年(\d{2})月(\d{2})日公開$/.exec(plain(dates[0]));
  if(!dm||!written||dm.slice(1).join('-')!==written.slice(1).join('-')||!calendarDate(...dm.slice(1))||new Date(dm[0]+'T00:00:00+09:00').toISOString()!==row.published_at)throw Error('facts_date_changed');
  const title=plain(titles[0]);if(!title||title.length>250||promotional.test(title)||launch.test(title))throw Error('facts_scope_uncertain');
  const heads=body.children.filter(n=>/^h[1-3]$/.test(n.name||'')&&cls(n,'wp-block-heading')&&!hidden(n));
  if(!heads.length||heads.length>4||find(body,n=>/^h[1-3]$/.test(n.name)&&cls(n,'wp-block-heading')).length!==heads.length)throw Error('facts_identity_changed');
  const fields=heads.map(n=>{const p=text(n).trim().split(/\n/).map(s=>s.replace(/\s+/g,' ').trim()).filter(Boolean);if(p.length!==2||!names(p[0]))throw Error('facts_identity_changed');
   if(!models(p[1])){const match=/^[^/]{1,20} \/ ([A-Z]{2,}-[0-9]{1,5}[A-Z]{0,3}) [^<>\r\n]{1,40}$/.exec(p[1]);if(!match)throw Error('facts_identity_changed');p[1]=match[1];}return p;});
  const brand=fields[0][0],modelNames=fields.map(f=>f[1]);
  if(fields.some(f=>f[0]!==brand)||new Set(modelNames).size!==modelNames.length||!find(header,n=>n.name==='a'&&/^https:\/\/www\.ikebe-gakki-pb\.com\/new_product\/tag\/[a-z0-9-]+\/$/.test(n.attribs.href||'')).some(n=>plain(n)===brand))throw Error('facts_identity_changed');
  const sections=heads.map((h,i)=>{const p=[];for(let n=h.next;n&&n!==heads[i+1];n=n.next)if(n.name==='p'&&cls(n,'wp-block-paragraph')&&!hidden(n)){const s=plain(n);if(s&&!boilerplate.test(s))p.push(s);}return p;});
  // Require substantive editorial descriptions in the primary section. Related lists and
  // accessories cannot supply the main product's utility or create an unsupported alias.
  const family=m=>m.match(/^([A-Z]{2,}-\d+)/)?.[1];
  const sharedFamily=family(modelNames[0])&&modelNames.every(m=>family(m)===family(modelNames[0]));
  const main=(sharedFamily?sections.flat():sections[0]).filter(s=>s.length>=40).slice(0,6),description=main.join(' ');
  if(main.length<2||description.length<150||promotional.test(description)||(sharedFamily?sections.flat():sections[0]).some(s=>launch.test(s)))throw Error('facts_scope_uncertain');
  const signals=functionSignals.filter(re=>re.test(description));if(signals.length<2)throw Error('facts_scope_uncertain');
  let theme,productType;
  if(/チューナー[・／/と&＆ ]*メトロノーム/.test(title+' '+description)&&/練習/.test(description)&&/ピッチ|音程/.test(description)&&/テンポ|リズム/.test(description)){theme='practice_tools';productType='tuner_metronome';}
  else if(/ギター|ギタリスト/.test(description)&&/練習/.test(description)&&/録音|楽曲制作/.test(description)&&/ワークステーション|アンプ|エフェクター/.test(description))theme='guitar_practice_recording';
  else if(/ギターアンプ/.test(description)&&/音作り|音色/.test(description)&&/練習|演奏/.test(description)){theme='guitar_tone';productType='guitar_amp';}
  if(!theme)throw Error('facts_scope_uncertain');
  // A product reference must be explicit in the title/body, or an equally explicit
  // article-wide equipment workflow. A bare manufacturer tag is never evidence.
  const bound=modelNames.some(m=>(title+' '+description).includes(m)||family(m)&&(title+' '+description).includes(family(m)));
  if(!bound&&!(theme==='guitar_practice_recording'&&modelNames.length>=2&&sections.slice(1).every(p=>p.some(s=>/専用|対応/.test(s)&&s.length>=40))))throw Error('facts_identity_changed');
  const articleType=/レビュー/.test(title)?'review':/試奏/.test(title)?'hands_on':/特集/.test(title)?'feature':/解説/.test(title)?'explainer':modelNames.length===1||theme==='practice_tools'?'product_information':'gear_information';
  const components=modelNames.map((model,i)=>({model,role:!sharedFamily&&i>0&&sections[i].slice(0,2).some(s=>/専用|対応/.test(s))?'accessory':'product'}));
  const product=components.some(p=>p.role==='accessory')?modelNames[0]:modelNames.join(' / ');
  const productFacts={kind:'product_article',articleType,brand,product,models:modelNames,components,version:null,category:'amps_effects',...(productType?{productType}:{}),identifierBasis:'verified_product_article_fields',listingSource:source.id,articleUrl:row.source_url,theme,relevance:theme,articleEvidence:{basis:'explicit_editorial_article_fields',subject:'structured_product_sections',substance:theme}};
  if(!validatedProductArticle(productFacts)||productArticleLabel(productFacts)===title)throw Error('facts_scope_uncertain');
  return {productFacts,eventType:'product_article',publishedAt:row.published_at};
 }finally{doc=null;}
}

export function productArticleIdentityRefinement(row,old,facts,proof){
 return row.source_id==='ikebe'&&proof?.parserVersion===PRODUCT_ARTICLE_PARSER&&proof.sourceUrl===row.source_url&&facts.articleUrl===row.source_url&&validatedProductArticle(facts)&&String(old?.brand).toLowerCase()===facts.brand.toLowerCase()&&old.identifierBasis==='explicit_model_code'&&/^[A-Z]{2,}-\d{1,5}$/.test(old.product||'')&&facts.models.every(m=>new RegExp('^'+old.product+'[A-Z]{1,3}$').test(m))&&['artist','performer','person'].every(k=>!old[k]&&!facts[k]);
}
