import {parseDocument,DomUtils} from 'htmlparser2';
import {optOut} from './policy.js';
const find=(node,test)=>DomUtils.findAll(n=>!!n.name&&test(n),node.children||[]);
const hidden=n=>{for(let p=n;p;p=p.parent)if(['nav','footer','header','script','style','noscript','template','svg'].includes(p.name)||p.attribs?.hidden!==undefined||p.attribs?.['aria-hidden']==='true'||/display\s*:\s*none|visibility\s*:\s*hidden/i.test(p.attribs?.style||''))return true;return false;};
const text=n=>hidden(n)?'':n.type==='text'?n.data:(n.children||[]).map(text).join('');
export function parseOfficialListing(html,source){
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
