import {parseHighValueListing} from './high-value.js';
import {parseLegacyListing} from './legacy-listing.js';
import {parseDocument,DomUtils} from 'htmlparser2';
import {optOut} from './policy.js';
const find=(node,test)=>DomUtils.findAll(n=>!!n.name&&test(n),node.children||[]);
const hidden=n=>{for(let p=n;p;p=p.parent)if(['nav','footer','header','script','style','noscript','template','svg'].includes(p.name)||p.attribs?.hidden!==undefined||p.attribs?.['aria-hidden']==='true'||/display\s*:\s*none|visibility\s*:\s*hidden/i.test(p.attribs?.style||''))return true;return false;};
const text=n=>hidden(n)?'':n.type==='text'?n.data:(n.children||[]).map(text).join('');
export function parseOfficialListing(html,source){
 if(['ikebe-event','at-distribution'].includes(source.id))return parseHighValueListing(html,source);
 if(['ikebe','ik'].includes(source.id))return parseLegacyListing(html,source);
 if(source.id==='zoom')return parseZoomListing(html,source);
 if(source.id!=='kikutani'||source.discoveryUrl!=='https://www.kikutani.co.jp/news/')throw Error('listing_url_blocked');
 if(new TextEncoder().encode(html).length>512000)throw Error('listing_too_large');
 let doc=parseDocument(html);html='';
 try{
  if(find(doc,n=>n.name==='meta'&&/^(robots|SoundCruiseNewsBot)$/i.test(n.attribs.name||'')).some(n=>optOut(n.attribs.content||'')))throw Error('listing_optout');
  const cards=find(doc,n=>n.name==='a'&&!hidden(n)&&/\blink-card\b/.test(n.parent?.attribs?.class||''));
  if(!cards.length||cards.length>100)throw Error('listing_structure_changed');
  const entries=[],seen=new Set();let dates=0;
  for(const card of cards){const raw=card.attribs.href;let u;try{u=new URL(raw,source.discoveryUrl);}catch{continue;}
   if(u.origin!==new URL(source.baseUrl).origin||!/^\/news\/[a-z0-9_%-]+\/$/i.test(u.pathname)||u.search||u.hash||seen.has(u.href))continue;seen.add(u.href);
   const heading=find(card,n=>n.name==='h3'&&/\blink-card__title\b/.test(n.attribs.class||''));
   const times=find(card,n=>n.name==='time');if(heading.length!==1||times.length!==1)continue;
   const title=text(heading[0]).replace(/\s+/g,' ').trim(),match=/(20\d{2})[/.](\d{2})[/.](\d{2})/.exec(text(times[0]));
   const date=match?`${match[1]}-${match[2]}-${match[3]}T00:00:00+09:00`:'';if(date&&Number.isFinite(Date.parse(date)))dates++;
   if(!title||title.length>512)continue;
   entries.push({title,url:u.href,date,listingSection:'official_news',listingUncertainty:date?'':'missing_date'});
  }
  if(!entries.length||dates<Math.ceil(entries.length/2))throw Error('listing_structure_changed');
  return {entries,cards:cards.length,reasons:{}};
 }finally{doc=null;}
}

// One fixed manufacturer listing; no pagination, scripts, assets or article fetches.
export function parseZoomListing(html,source){
 if(source.id!=='zoom'||source.baseUrl!=='https://zoomcorp.com/'||source.discoveryUrl!=='https://zoomcorp.com/ja/jp/news/')throw Error('listing_url_blocked');
 if(typeof html!=='string'||new TextEncoder().encode(html).length>512000)throw Error('listing_too_large');
 let doc=parseDocument(html);html='';
 try{
  if(find(doc,n=>n.name==='meta'&&/^(robots|SoundCruiseNewsBot)$/i.test(n.attribs.name||'')).some(n=>optOut(n.attribs.content||'')))throw Error('listing_optout');
  const cards=find(doc,n=>n.name==='article'&&!hidden(n)&&/\bcard\b/.test(n.attribs.class||''));
  if(!cards.length||cards.length>50)throw Error('listing_structure_changed');
  const entries=[],seen=new Set();let validDates=0;
  for(const card of cards){
   const headings=find(card,n=>n.name==='h2'&&/\bcard-title\b/.test(n.attribs.class||''));
   const links=headings.length===1?find(headings[0],n=>n.name==='a'):[],times=find(card,n=>n.name==='time');
   if(links.length!==1||times.length!==1)continue;
   let u;try{u=new URL(links[0].attribs.href,source.discoveryUrl);}catch{continue;}
   if(u.origin!=='https://zoomcorp.com'||!/^\/ja\/jp\/news\/[^/]+\/$/.test(u.pathname)||u.search||u.hash||seen.has(u.href))continue;
   const title=text(headings[0]).replace(/\s+/g,' ').trim(),rawDate=text(times[0]).trim();
   // Actual publisher time is a written English date, never an article update or sale deadline.
   const match=/^(January|February|March|April|May|June|July|August|September|October|November|December) (\d{2}), (20\d{2})$/.exec(rawDate);
   const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
   let stamp=match?Date.parse(rawDate+' 00:00:00 GMT+0900'):NaN;
   if(Number.isFinite(stamp)){const local=new Date(stamp+9*3600000);if(local.getUTCFullYear()!==Number(match[3])||local.getUTCMonth()!==months.indexOf(match[1])||local.getUTCDate()!==Number(match[2]))stamp=NaN;}
   if(!title||title.length>512)continue;
   const date=Number.isFinite(stamp)?new Date(stamp).toISOString():'';if(date)validDates++;
   seen.add(u.href);entries.push({title,url:u.href,date,listingSection:'official_news',listingUncertainty:date?'':'missing_date'});
  }
  if(!entries.length||validDates<Math.ceil(cards.length/2))throw Error('listing_structure_changed');
  return {entries,cards:cards.length,reasons:{}};
 }finally{doc=null;}
}
