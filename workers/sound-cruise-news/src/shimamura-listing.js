import {parseDocument,DomUtils} from 'htmlparser2';
import {optOut} from './policy.js';
export const SHIMAMURA_LISTING_URL='https://www.shimamura.co.jp/update/common/new-item/';
export const LISTING_MAX_BYTES=512000;
export const SHIMAMURA_PATHS=Object.freeze(['/update/guitar-bass/','/update/amp-effector/','/update/dtm-recording/']);
const tags=(node,predicate)=>DomUtils.findAll(n=>!!n.name&&predicate(n),node.children||[]);
const ignored=new Set(['script','style','noscript','template','svg']);
function hidden(node){for(let n=node;n;n=n.parent)if(ignored.has(n.name)||n.attribs?.hidden!==undefined||n.attribs?.['aria-hidden']==='true'||/display\s*:\s*none|visibility\s*:\s*hidden/i.test(n.attribs?.style||''))return true;return false;}
function visibleText(node){if(hidden(node))return '';if(node.type==='text')return node.data;return (node.children||[]).map(visibleText).join('');}
const text=n=>visibleText(n).replace(/\s+/g,' ').trim();
export function listingArticleUrl(raw){
 try{const u=new URL(raw,SHIMAMURA_LISTING_URL);if(u.origin!=='https://www.shimamura.co.jp'||u.username||u.password||u.port||u.search||u.hash)return null;
  if(!/^\/update\/(guitar-bass|amp-effector|dtm-recording)\/20\d{2}\/(0[1-9]|1[0-2])\/[0-9]+\/$/i.test(u.pathname))return null;return u.href;
 }catch{return null;}
}
export function listingDate(value){
 const m=/^(20\d{2})\/(\d{2})\/(\d{2})$/.exec(value);if(!m)return null;
 const [y,month,d]=m.slice(1).map(Number),date=new Date(Date.UTC(y,month-1,d));
 if(date.getUTCFullYear()!==y||date.getUTCMonth()!==month-1||date.getUTCDate()!==d)return null;
 return `${m[1]}-${m[2]}-${m[3]}T00:00:00+09:00`;
}
export function listingExclusion(title){
 const t=title.normalize('NFKC');
 const productNews=/新製品|新登場|発売|発表|リリース|アップデート|ファームウェア|価格改定|リコール|生産終了|販売終了|\b(?:new product|new model|release|announce|update|firmware|recall)\b/i.test(t);
 for(const [reason,re] of [
  ['tutorial',/チュートリアル|使い方|入門|初心者|基礎講座|活用術|\b(?:tutorial|how[ -]to|beginner|tips)\b/i],
  ['sale_campaign',/セール|クーポン|中古|特価|買取|下取り|\b(?:sale|coupon|used)\b/i],
  ['campaign_only',/キャンペーン|\bcampaign\b/i],
  ['event_or_shop',/イベント|フェア|試奏会|体験会|展示会|セミナー|ワークショップ|レッスン|求人|採用|入荷|在庫|営業時間|営業案内|店舗案内|開店|閉店|休業|\b(?:event|fair|seminar|workshop|lesson|recruit|stock|store notice)\b/i],
  ['comparison_evergreen',/比較|選び方|完全ガイド|とは[?？]|おすすめ|\b(?:comparison|versus|evergreen|guide)\b/i],
  ['artist_or_lifestyle',/ライブ(?!ラリ)|コンサート|ツアー|新曲|旅行|料理|\b(?:concert|tour|lifestyle)\b/i]
 ])if(re.test(t)&&!(reason==='campaign_only'&&productNews))return reason;
 return null;
}
const excludedContainers=new Set(['header','footer','nav','aside','form']);
function isNavigation(node){
 for(let n=node;n;n=n.parent)if(excludedContainers.has(n.name)||n.attribs?.role==='navigation')return true;
 return false;
}
const categoryBadge={
 'guitar-bass':/ギター|ベース/,
 'amp-effector':/アンプ|エフェクター/,
 'dtm-recording':/DTM|レコーディング/i
};
// Fixed official listing only. The page heading and article anchors need not share a section.
// Titles remain transient and are cleared by the caller; no scripts/assets/links are loaded.
export function parseShimamuraListing(html,url=SHIMAMURA_LISTING_URL,{since=0}={}){
 if(url!==SHIMAMURA_LISTING_URL)throw Error('listing_url_blocked');
 if(typeof html!=='string'||new TextEncoder().encode(html).length>LISTING_MAX_BYTES)throw Error('listing_too_large');
 let doc=parseDocument(html);html='';
 try{
  if(tags(doc,()=>true).length>20000)throw Error('listing_structure_changed');
  if(tags(doc,n=>n.name==='meta'&&/^(robots|SoundCruiseNewsBot)$/i.test(n.attribs?.name||'')).some(n=>optOut(n.attribs?.content||'')))throw Error('listing_optout');
  const identity=tags(doc,n=>/^h[12]$/.test(n.name)&&!hidden(n)&&/製品ニュース/.test(text(n))&&/記事一覧/.test(text(n)));
  if(identity.length!==1)throw Error('listing_structure_changed');
  const cards=tags(doc,n=>n.name==='a'&&n.attribs?.href&&!hidden(n)&&!isNavigation(n)&&listingArticleUrl(n.attribs.href));
  if(cards.length<1||cards.length>100)throw Error('listing_structure_changed');
  const entries=[],reasons={},seen=new Set();let validDates=0,usable=0;
  const reject=reason=>{reasons[reason]=(reasons[reason]||0)+1;};
  for(const card of cards){
   const titleNodes=tags(card,n=>/^h[2-4]$/.test(n.name)&&!hidden(n));
   const title=titleNodes.length===1?text(titleNodes[0]):'';
   if(!title||title.length>512){reject('malformed_card');continue;}
   usable++;
   const dateNodes=tags(card,n=>['date','time'].includes(n.name)&&!hidden(n));
   const dateText=dateNodes.length===1?text(dateNodes[0]):text(card);
   const match=/(?:公開\s*[：:]?\s*)?(20\d{2}\/\d{2}\/\d{2})/.exec(dateText);
   const date=match?listingDate(match[1]):null;
   if(date)validDates++;
   const badges=tags(card,n=>/\bbtn-cat-[\w-]+\b/.test(n.attribs?.class||'')&&!hidden(n));
   const article=listingArticleUrl(card.attribs.href);
   if(seen.has(article)){reject('duplicate_url');continue;}seen.add(article);
   const path=new URL(article).pathname.split('/')[2];
   const mismatch=badges.length>1||(badges.length===1&&!categoryBadge[path].test(text(badges[0])));
   const reason=listingExclusion(title);if(reason){reject(reason);continue;}
   // A single malformed/missing date or conflicting badge needs review, not source shutdown.
   const uncertainty=!date?'missing_date':mismatch?'category_mismatch':'';
   const stamp=date?Date.parse(date):null;
   // Date-only metadata overlaps one JST day; undated records stay pending for review.
   if(since&&stamp!==null&&stamp<Math.floor((since+9*3600000)/86400000)*86400000-9*3600000-86400000)continue;
   entries.push({url:article,date:date||'',title,listingSection:'product_news',listingCategory:path,listingUncertainty:uncertainty});
  }
  if(usable<1||validDates<Math.max(1,Math.ceil(cards.length/2)))throw Error('listing_structure_changed');
  return {entries,reasons,cards:cards.length};
 }finally{doc=null;}
}
