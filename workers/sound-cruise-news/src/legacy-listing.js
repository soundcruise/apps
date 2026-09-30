// Fixed official surfaces only. Publisher text lives in memory until candidate projection.
import {parseDocument,DomUtils} from 'htmlparser2';
import {optOut,sourceUrl} from './policy.js';
export const IKEBE_LISTING='https://www.ikebe-gakki-pb.com/new_product/';
export const IK_LISTING='https://www.ikmultimedia.com/press/';
const find=(n,test)=>DomUtils.findAll(x=>!!x.name&&test(x),n.children||[]);
const hidden=n=>{for(let p=n;p;p=p.parent)if(['nav','footer','header','script','style','template','noscript'].includes(p.name)||p.attribs?.hidden!==undefined||p.attribs?.['aria-hidden']==='true'||/display\s*:\s*none/i.test(p.attribs?.style||''))return true;return false;};
const text=n=>hidden(n)?'':n.type==='text'?n.data:(n.children||[]).map(text).join(' ');
const compact=n=>text(n).replace(/\s+/g,' ').trim();
export function calendarDate(y,m,d){
 const day=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
 const stamp=Date.parse(day+'T00:00:00Z');
 return Number.isFinite(stamp)&&new Date(stamp).toISOString().slice(0,10)===day?day:'';
}
export function ikPressDate(value){
 const m=/^(\d{2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (20\d{2})$/.exec(value);
 return m?calendarDate(m[3],['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(m[2])+1,m[1]):'';
}
export function parseLegacyListing(html,source){
 const ikebe=source.id==='ikebe'&&source.baseUrl==='https://www.ikebe-gakki-pb.com/'&&source.discoveryUrl===IKEBE_LISTING;
 const ik=source.id==='ik'&&source.baseUrl==='https://www.ikmultimedia.com/'&&source.discoveryUrl===IK_LISTING;
 if(!ikebe&&!ik)throw Error('listing_url_blocked');
 if(typeof html!=='string'||new TextEncoder().encode(html).length>512000)throw Error('listing_too_large');
 let doc=parseDocument(html);html='';
 try{
  if(find(doc,n=>n.name==='meta'&&/^(robots|SoundCruiseNewsBot)$/i.test(n.attribs.name||'')).some(n=>optOut(n.attribs.content||'')))throw Error('listing_optout');
  let cards;
  const articleLink=n=>n.name==='a'&&(()=>{try{const u=sourceUrl(new URL(n.attribs.href||'',source.discoveryUrl).href,source);return u&&/^https:\/\/www\.ikmultimedia\.com\/news\/\?item_id=\d+$/.test(u);}catch{return false;}})();
  if(ikebe)cards=find(doc,n=>!hidden(n)&&/\bpost-\d+\b/.test(n.attribs.class||'')&&/\btype-post\b/.test(n.attribs.class||''));
  else{
   // Press cards have several links to the same item; stop before an ancestor spans another item.
   cards=[];const seen=new Set();
   for(const a of find(doc,n=>!hidden(n)&&articleLink(n))){
    const u=new URL(a.attribs.href,source.discoveryUrl).href;if(seen.has(u))continue;seen.add(u);
    let card=a;for(let p=a.parent;p?.name;p=p.parent){if(hidden(p)||find(p,articleLink).some(n=>new URL(n.attribs.href,source.discoveryUrl).href!==u))break;card=p;}cards.push(card);
   }
  }
  if(!cards.length||cards.length>50)throw Error('listing_structure_changed');
  const entries=[],seen=new Set();let dates=0;
  for(const card of cards){
   const headings=find(card,n=>ikebe?/\btopics_box--h1\b/.test(n.attribs.class||''):n.name==='h3');
   const dateNodes=find(card,n=>ikebe?n.name==='time'&&/\bsub_info_date2\b/.test(n.attribs.class||''):/\bnews_date\b/.test(n.attribs.class||''));
   if(headings.length!==1)continue;
   const a=find(headings[0],n=>n.name==='a')[0]||find(card,articleLink)[0];if(!a)continue;
   let url;try{url=sourceUrl(new URL(a.attribs.href,source.discoveryUrl).href,source);}catch{continue;}
   if(!url||seen.has(url)||!(ikebe?/^https:\/\/www\.ikebe-gakki-pb\.com\/new_product\/\d+\/$/:/^https:\/\/www\.ikmultimedia\.com\/news\/\?item_id=\d+$/).test(url))continue;
   const eventTitle=compact(headings[0]),lead=ikebe?find(card,n=>/\btopics_box--lead\b/.test(n.attribs.class||'')):[];
   const title=ikebe&&lead.length===1?eventTitle+' '+compact(lead[0]):eventTitle;if(!title||title.length>512)continue;
   let day='';if(dateNodes.length===1){
    if(ikebe){const written=/^(20\d{2})年(\d{2})月(\d{2})日$/.exec(compact(dateNodes[0]));const attr=/^(20\d{2})-(\d{2})-(\d{2})$/.exec(dateNodes[0].attribs.datetime||'');
     if(written&&attr&&written.slice(1).join('-')===attr.slice(1).join('-'))day=calendarDate(...attr.slice(1));
    }else day=ikPressDate(compact(dateNodes[0]));
   }
   const date=day?day+(ikebe?'T00:00:00+09:00':'T00:00:00Z'):'';if(date)dates++;
   const classes=card.attribs?.class||'';
   const category=ikebe?(/\bcategory-acoustic-guitar\b/.test(classes)?'acoustic_guitar':/\bcategory-(amplifier|effector)\b/.test(classes)?'amps_effects':/\bcategory-(guitar|bass)\b/.test(classes)?'electric_guitar_bass':/\bcategory-(recording-pa|digital)\b/.test(classes)?'recording_audio':/\bcategory-accessory\b/.test(classes)?'electric_guitar_bass':null):null;
   entries.push({title,eventTitle,url,date,listingSection:ikebe?'product_news':'ik_press',listingCategory:category,listingUncertainty:date?'':'missing_date'});seen.add(url);
  }
  if(!entries.length||dates<Math.ceil(entries.length/2))throw Error('listing_structure_changed');
  return {entries,cards:cards.length,reasons:{}};
 }finally{doc=null;}
}
