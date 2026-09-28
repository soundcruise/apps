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
  if(!/^\/update\/(guitar-bass|amp-effector|dtm-recording)\/20\d{2}\/(0[1-9]|1[0-2])\/[a-z0-9_-]+\/$/i.test(u.pathname))return null;return u.href;
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
 for(const [reason,re] of [
  ['tutorial',/チュートリアル|使い方|入門|初心者|基礎講座|活用術|\b(?:tutorial|how[ -]to|beginner|tips)\b/i],
  ['sale_campaign',/セール|キャンペーン|クーポン|中古|特価|買取|下取り|\b(?:sale|campaign|coupon|used)\b/i],
  ['event_or_shop',/イベント|フェア|試奏会|体験会|展示会|セミナー|ワークショップ|レッスン|求人|採用|入荷|在庫|営業時間|営業案内|店舗案内|開店|閉店|休業|\b(?:event|fair|seminar|workshop|lesson|recruit|stock|store notice)\b/i],
  ['comparison_evergreen',/比較|選び方|完全ガイド|とは[?？]|おすすめ|\b(?:comparison|versus|evergreen|guide)\b/i],
  ['artist_or_lifestyle',/ライブ(?!ラリ)|コンサート|ツアー|新曲|旅行|料理|\b(?:concert|tour|lifestyle)\b/i]
 ])if(re.test(t))return reason;
 return null;
}
// This only parses the fixed official product-news listing. Never execute scripts or fetch links.
// Returned titles are transient inputs to the HMAC/label pipeline, never persistence records.
export function parseShimamuraListing(html,url=SHIMAMURA_LISTING_URL,{since=0}={}){
 if(url!==SHIMAMURA_LISTING_URL)throw Error('listing_url_blocked');
 if(typeof html!=='string'||new TextEncoder().encode(html).length>LISTING_MAX_BYTES)throw Error('listing_too_large');
 let doc=parseDocument(html);html='';
 try{
  if(tags(doc,()=>true).length>20000)throw Error('listing_structure_changed');
  if(tags(doc,n=>n.name==='meta'&&/^(robots|SoundCruiseNewsBot)$/i.test(n.attribs?.name||'')).some(n=>optOut(n.attribs?.content||'')))throw Error('listing_optout');
  const headings=tags(doc,n=>/^h[12]$/.test(n.name)&&!hidden(n)&&text(n).includes('製品ニュース'));
  if(headings.length!==1)throw Error('listing_structure_changed');
  let section=headings[0];while(section&&section.name!=='section'&&section.name!=='main')section=section.parent;
  if(!section)throw Error('listing_structure_changed');
  // The listing also has a non-card h3 section caption. Only anchored list cards count.
  const cards=tags(section,n=>{
   if(n.name!=='h3'||hidden(n))return false;
   for(let p=n.parent;p&&p!==section;p=p.parent)if(p.name==='a')return p.parent?.name==='li'&&p.parent.parent?.name==='ul';
   return false;
  });
  if(cards.length<3||cards.length>60)throw Error('listing_structure_changed');
  const entries=[],reasons={},seen=new Set();let lastDate=Infinity,valid=0;
  const reject=reason=>{reasons[reason]=(reasons[reason]||0)+1;};
  for(const heading of cards){
   let card=heading;while(card&&card!==section&&card.name!=='a')card=card.parent;
   if(!card||card===section||!card.attribs?.href)throw Error('listing_structure_changed');
   const dates=tags(card,n=>n.name==='date'&&!hidden(n));
   const badges=tags(card,n=>/\bbtn-cat-[\w-]+\b/.test(n.attribs?.class||'')&&!hidden(n));
   const title=text(heading),date=dates.length===1?listingDate(text(dates[0])):null;
   if(!date||!title||title.length>512||badges.length!==1)throw Error('listing_structure_changed');
   const stamp=Date.parse(date);if(stamp>lastDate)throw Error('listing_structure_changed');lastDate=stamp;valid++;
   // Date-only metadata: overlap one JST calendar day to avoid missing late same-day additions.
   if(since&&stamp<Math.floor((since+9*3600000)/86400000)*86400000-9*3600000-86400000)break;
   const article=listingArticleUrl(card.attribs.href);
   if(!article){reject('url_or_category');continue;}
   if(seen.has(article)){reject('duplicate_url');continue;}seen.add(article);
   const path=new URL(article).pathname.split('/')[2],badge=text(badges[0]);
   const matches={'guitar-bass':/ギター|ベース/,'amp-effector':/アンプ|エフェクター/,'dtm-recording':/DTM|レコーディング/i};
   if(!matches[path].test(badge))throw Error('listing_structure_changed');
   const reason=listingExclusion(title);if(reason){reject(reason);continue;}
   entries.push({url:article,date,title,listingSection:'product_news',listingCategory:path});
  }
  if(valid<1)throw Error('listing_structure_changed');
  return {entries,reasons,cards:cards.length};
 }finally{doc=null;}
}
