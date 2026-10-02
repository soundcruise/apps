// Fixed, assessed surfaces only. Publisher wording is transient; output is bounded facts.
import {parseDocument,DomUtils} from 'htmlparser2';
import {optOut,DAY} from './policy.js';
const find=(n,p)=>DomUtils.findAll(x=>!!x.name&&p(x),n.children||[]);
const cls=(n,c)=>(n.attribs?.class||'').split(/\s+/).includes(c);
const hidden=n=>{for(let p=n;p;p=p.parent)if(['script','style','nav','footer','template','noscript'].includes(p.name)||p.attribs?.hidden!==undefined||p.attribs?.['aria-hidden']==='true'||/display\s*:\s*none/i.test(p.attribs?.style||''))return true;return false;};
const text=n=>hidden(n)?'':n.type==='text'?n.data:(n.children||[]).map(text).join('');
const plain=n=>text(n).replace(/\s+/g,' ').trim();
function date(y,m,d){const v=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;return new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v?v:null;}
export function parseHighValueListing(html,source){
 const event=source.id==='ikebe-event'&&source.discoveryUrl==='https://www.ikebe-gakki.com/blog/category/event/';
 const recording=source.id==='at-distribution'&&source.discoveryUrl==='https://atdistribution.net/information/';
 if(!event&&!recording)throw Error('listing_url_blocked');
 if(typeof html!=='string'||new TextEncoder().encode(html).length>512000)throw Error('listing_too_large');
 let doc=parseDocument(html);html='';
 try{
  if(find(doc,n=>n.name==='meta'&&/^(robots|SoundCruiseNewsBot)$/i.test(n.attribs.name||'')).some(n=>optOut(n.attribs.content||'')))throw Error('listing_optout');
  const cards=event?find(doc,n=>n.name==='div'&&cls(n,'inner-box')&&cls(n,'type-post')&&!hidden(n)):find(doc,n=>n.name==='li'&&cls(n.parent,'if-list')&&!hidden(n));
  if(!cards.length||cards.length>30)throw Error('listing_structure_changed');
  const entries=[],seen=new Set();let dated=0;
  for(const card of cards){
   const links=find(card,n=>n.name==='a'&&!!n.attribs.href).filter(n=>{try{const u=new URL(n.attribs.href);return u.origin===new URL(source.baseUrl).origin&&(event?/^\/blog\/[a-z0-9-]+\/$/:/^\/information\/\d+\/$/).test(u.pathname)&&!u.search&&!u.hash;}catch{return false;}});
   const urls=[...new Set(links.map(n=>n.attribs.href))];if(urls.length!==1||seen.has(urls[0]))continue;
   const headings=find(card,n=>/^h[1-3]$/.test(n.name));
   // Event cards use a title anchor, while the distributor uses one h2.
   const titleNode=headings.length===1?headings[0]:event?links.find(n=>cls(n,'title'))||links.find(n=>plain(n).length>15):null;
   const title=titleNode?plain(titleNode):'';if(!title||title.length>512)continue;
   let day='';
   if(event){const times=find(card,n=>n.name==='time'&&/Published/.test(plain(n)));if(times.length===1){const raw=times[0].attribs.datetime||'';const m=/^(20\d{2})-(\d{2})-(\d{2})/.exec(raw);if(m)day=date(m[1],m[2],m[3])||'';}}
   else {const m=/(20\d{2})[.](\d{2})[.](\d{2})/.exec(plain(card));if(m)day=date(m[1],m[2],m[3])||'';}
   if(day)dated++;seen.add(urls[0]);
   // Shop/category tags are discovery context, not proof of the event venue.
   const venue=event&&/(?:会場[：:]? ?イケシブ|イケシブ(?:LIVES|SHOWCASE)?で)/.test(title)?'イケシブ':event&&/(?:会場[：:]? ?リボレ秋葉原|リボレ秋葉原で)/.test(title)?'リボレ秋葉原':null;
   entries.push({title,url:urls[0],date:day?day+'T00:00:00+09:00':'',listingSection:event?'guitar_events':'recording_news',listingUncertainty:day?'':'missing_date',eventVenue:venue});
  }
  if(!entries.length||dated<Math.ceil(cards.length/2))throw Error('listing_structure_changed');
  return {entries,cards:cards.length,reasons:{}};
 }finally{doc=null;}
}
const domestic=Object.freeze(['大石昌良','竹内アンナ','山崎まさよし','森山直太朗','斉藤和義','秦基博','あいみょん','スガシカオ','矢井田瞳','竹原ピストル','森恵']);
export function highValueAssessment(entry,source,now){
 if(!['agm','ikebe-event','at-distribution'].includes(source.id))return null;
 const t=entry.title.normalize('NFKC'),stamp=Date.parse(entry.date);
 if(Number.isFinite(stamp)&&now-stamp>60*DAY)return {reject:'pilot_lookback'};
 if(/中止|延期|ゴシップ|逮捕|クーポン|ポイント|使い方|チュートリアル|レビュー|サポート|ファームウェア/i.test(t))return {reject:'high_value_scope'};
 if(source.id==='agm'){
  if(source.discoveryUrl!=='https://acousticguitarmagazine.jp/interview/feed/'||!/^https:\/\/acousticguitarmagazine\.jp\/interview\/[^/]+\/$/.test(entry.url))return {reject:'high_value_scope'};
  if(!/アコギ|アコースティック[・ ]?ギター/.test(t)||!/インタビュー|が語る|に聞く|に訊く|彼が語る/.test(t))return {reject:'interview_guitar_evidence_missing'};
  const artist=domestic.find(n=>t.startsWith(n)||t.startsWith('Interview '+n));
  return {category:'artist_guitar',eventType:'guitar_artist',facts:artist?{kind:'guitar_artist',category:'artist_guitar',artist,eventType:'interview',topic:'acoustic_expression',evidence:'assessed_domestic_acoustic_interview'}:null};
 }
 if(source.id==='ikebe-event'){
  if(entry.listingSection!=='guitar_events')return {reject:'high_value_scope'};
  const artist=/阿部\s*学/.test(t)?'阿部学':/松本孝弘|TAK MATSUMOTO/.test(t)?'松本孝弘':/Jimmy SAKURAI/.test(t)?'Jimmy SAKURAI':null;
  const eventType=/ワークショップ/.test(t)?'workshop':/展示|EXHIBITION/i.test(t)?'exhibition':null;
  if(!eventType||!(/ギター|guitar/i.test(t)||!!artist))return {reject:'guitar_event_evidence_missing'};
  // Only explicit written event dates, never a URL slug or publication timestamp.
  const match=/(20\d{2})[年/.](\d{1,2})[月/.](\d{1,2})日?/.exec(t);
  let eventDate=null;try{if(match)eventDate=date(match[1],match[2],match[3]);}catch{}
  const end=/[〜～~－–-]\s*(?:20\d{2}[年/.])?(\d{1,2})[月/.](\d{1,2})日?/.exec(t);
  let endDate=null;try{if(end&&match)endDate=date(match[1],end[1],end[2]);}catch{}
  if(eventDate&&Date.parse((endDate||eventDate)+'T23:59:59.999+09:00')<now)return {reject:'event_expired'};
  return {category:'live_guitar',eventType:'guitar_event',facts:artist&&eventDate&&entry.eventVenue?{kind:'guitar_event',category:'live_guitar',artist,eventType,eventDate,...(endDate?{endDate}:{}),venue:entry.eventVenue,evidence:'assessed_named_guitar_event'}:null};
 }
 // Assessed model and type both required. Product introduction is not proof of shipping.
 if(entry.listingSection!=='recording_news'||!/(?:Harrison|HARRISON)/.test(t)||!/FLEX ?10/.test(t)||!/オーディオ[・ ]?インターフェース/.test(t)||!/登場|発表|新製品/.test(t))return {reject:'recording_launch_scope'};
 return {category:'recording_audio',eventType:'new_product',facts:{brand:'Harrison Audio',product:'FLEX 10',version:null,category:'recording_audio',identifierBasis:'assessed_recording_listing',manufacturerSource:'at-distribution'}};
}
const dayValid=v=>typeof v==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
export function highValueLabel(f,event){
 if(event==='guitar_artist'&&f?.kind==='guitar_artist'&&f.category==='artist_guitar'&&domestic.includes(f.artist)&&f.eventType==='interview'&&f.topic==='acoustic_expression'&&f.evidence==='assessed_domestic_acoustic_interview')return f.artist+'、アコギ表現を語るインタビュー';
 if(event==='guitar_event'&&f?.kind==='guitar_event'&&f.category==='live_guitar'&&['阿部学','松本孝弘','Jimmy SAKURAI'].includes(f.artist)&&['workshop','exhibition'].includes(f.eventType)&&['イケシブ','リボレ秋葉原'].includes(f.venue)&&dayValid(f.eventDate)&&(!f.endDate||dayValid(f.endDate)&&f.endDate>=f.eventDate)&&f.evidence==='assessed_named_guitar_event')return `${f.artist}、${Number(f.eventDate.slice(5,7))}月${Number(f.eventDate.slice(8,10))}日に${f.venue}で${f.eventType==='workshop'?'ギターワークショップ':'使用ギター・機材展示'}`;
 return null;
}
export function assessedRecordingFacts(f){return f?.brand==='Harrison Audio'&&f.product==='FLEX 10'&&f.category==='recording_audio'&&f.version===null&&f.identifierBasis==='assessed_recording_listing'&&f.manufacturerSource==='at-distribution';}

// Direct public event recheck is allowed only on the already assessed event host.
// Exact labeled sections, not nearby paragraphs, URL dates, related cards or tags.
export function parseEventArticle(html,source,url){
 if(source.id!=='ikebe-event'||source.discoveryUrl!=='https://www.ikebe-gakki.com/blog/category/event/'||!/^https:\/\/www\.ikebe-gakki\.com\/blog\/[a-z0-9-]+\/$/.test(url))throw Error('facts_source_invalid');
 if(typeof html!=='string'||new TextEncoder().encode(html).length>512000)throw Error('facts_response_too_large');
 let doc=parseDocument(html);html='';
 try{
  if(find(doc,n=>n.name==='meta'&&/^(robots|SoundCruiseNewsBot)$/i.test(n.attribs.name||'')).some(n=>optOut(n.attribs.content||'')))throw Error('facts_optout');
  const headings=find(doc,n=>n.name==='h1'&&!hidden(n)&&!!plain(n));if(headings.length!==1)throw Error('facts_parser_failure');
  const title=plain(headings[0]);if(!/ギター|アコギ|guitar/i.test(title)||!/ワークショップ|展示|EXHIBITION/i.test(title)||/中止|延期/.test(title))throw Error('facts_scope_uncertain');
  const sections={};
  for(const h of find(doc,n=>/^h[23]$/.test(n.name)&&!hidden(n)&&['開催日時','会場','講師'].includes(plain(n)))){
   const key=plain(h);if(sections[key]!==undefined)throw Error('facts_parser_failure');
   let value='';for(let n=h.next;n&&!/^h[1-3]$/.test(n.name||'');n=n.next){value+=' '+plain(n);if(value.length>2000)break;}
   sections[key]=value.trim();
  }
  // Instructor name must be the immediately following h2 and also in the title.
  const teachers=find(doc,n=>/^h[23]$/.test(n.name)&&!hidden(n)&&plain(n)==='講師');
  let artist=null;if(teachers.length===1){let n=teachers[0].next;while(n&&(n.type==='text'||n.name==='figure'||n.name==='p'&&!plain(n)))n=n.next;const name=n?.name==='h2'?plain(n):'';if(/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}・ 　]{2,24}$/u.test(name)&&title.includes(name))artist=name.replace(/[ 　]/g,'');}
  const match=/^(20\d{2})年(\d{1,2})月(\d{1,2})日/.exec(sections['開催日時']||'');
  let eventDate=null;try{if(match)eventDate=date(match[1],match[2],match[3]);}catch{}
  const venue=/^(?:イケシブ)(?:POPUP SPACE|LIVES|SHOWCASE)?(?:[ （(]|$)/.test(sections['会場']||'')?'イケシブ':/^リボレ秋葉原(?:[ （(]|$)/.test(sections['会場']||'')?'リボレ秋葉原':null;
  return {kind:'guitar_event',category:'live_guitar',...(artist?{artist}:{}),eventType:/ワークショップ/.test(title)?'workshop':'exhibition',...(eventDate?{eventDate}:{}),...(venue?{venue}:{}),evidence:'assessed_named_guitar_event'};
 }finally{doc=null;}
}
