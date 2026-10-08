// Explicit, source-bound exhibition fields; no named-person substitution or inferred launch.
import {parseDocument,DomUtils} from 'htmlparser2';
import {optOut} from './policy.js';
const cls=(n,c)=>(n.attribs?.class||'').split(/\s+/).includes(c);
const hidden=n=>{for(let p=n;p;p=p.parent)if(['script','style','nav','footer','aside','template','noscript'].includes(p.name)||p.attribs?.hidden!==undefined||p.attribs?.['aria-hidden']==='true'||/display\s*:\s*none|visibility\s*:\s*hidden/i.test(p.attribs?.style||''))return true;return false;};
const text=n=>!n||hidden(n)?'':n.type==='text'?n.data:(n.children||[]).map(text).join(' ');
const plain=n=>text(n).replace(/\s+/g,' ').trim();
const find=(n,p)=>DomUtils.findAll(x=>!!x.name&&!hidden(x)&&p(x),n.children||[]);
const urlOK=u=>typeof u==='string'&&/^https:\/\/www\.kikutani\.co\.jp\/news\/[a-z0-9-]+\/$/.test(u);
export function guitarExhibitionSurface(row,source){return source?.id==='kikutani'&&source.baseUrl==='https://www.kikutani.co.jp/'&&row.source_id===source.id&&urlOK(row.source_url)&&['pending','reopened'].includes(row.review_status)?{url:row.source_url,method:'explicit_guitar_exhibition_fields',parser:'guitar-exhibition-fields-1'}:null;}

const field=s=>typeof s==='string'&&s.length>=2&&s.length<=100&&!/[<>\x00-\x1f]/.test(s);
const day=(year,month,date)=>{const s=`${year}-${String(month).padStart(2,'0')}-${String(date).padStart(2,'0')}`;return Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s?s:null;};
export function guitarExhibitionLabel(f){
 if(f?.kind!=='guitar_event'||f.evidence!=='guitar_exhibition_article_v1'||f.eventType!=='exhibition'||f.category!=='live_guitar'||!urlOK(f.articleUrl)||f.listingSource!=='kikutani'||![f.eventName,f.venue,f.exhibitor].every(field)||!day(...String(f.eventDate).split('-'))||!day(...String(f.endDate).split('-'))||f.endDate<f.eventDate||Date.parse(f.endDate)-Date.parse(f.eventDate)>7*86400000||!Array.isArray(f.brands)||f.brands.length<1||f.brands.length>10||!f.brands.every(field))return null;
 return `${f.exhibitor}、ギター・エフェクター展示会「${f.eventName}」に出展`;
}
export function parseGuitarExhibition(html,source,row){
 if(!guitarExhibitionSurface(row,source))throw Error('facts_source_invalid');
 if(typeof html!=='string'||new TextEncoder().encode(html).length>512000)throw Error('facts_response_too_large');
 let doc=parseDocument(html);html='';
 try{
  if(find(doc,n=>n.name==='meta'&&/^(robots|SoundCruiseNewsBot)$/i.test(n.attribs.name||'')).some(n=>optOut(n.attribs.content||'')))throw Error('facts_optout');
  const canon=find(doc,n=>n.name==='link'&&n.attribs.rel==='canonical');if(canon.length!==1||canon[0].attribs.href!==row.source_url)throw Error('facts_source_invalid');
  const roots=find(doc,n=>n.name==='article'&&cls(n,'news')&&cls(n,'inner'));if(roots.length!==1)throw Error('facts_parser_failure');
  const root=roots[0],titles=root.children.filter(n=>n.name==='h1'&&!hidden(n)),times=find(root,n=>n.name==='time'&&cls(n,'news__time-time'));
  if(titles.length!==1||times.length!==1||day(...String(times[0].attribs.datetime).split('-'))!==times[0].attribs.datetime||new Date(times[0].attribs.datetime+'T00:00:00+09:00').toISOString()!==row.published_at)throw Error('facts_date_changed');
  const title=plain(titles[0]),paras=root.children.filter(n=>n.name==='p'&&cls(n,'wp-block-paragraph')&&!hidden(n)).slice(0,2),lead=plain(paras[0]),brandsParagraph=paras[1];
  if(/中止|延期|過去|昨年|レビュー|比較|再入荷/.test(title+' '+lead)||!/(?:出展|展示)/.test(title)||!/エフェクター|ギター|ペダル/.test(title+' '+lead+' '+plain(brandsParagraph)))throw Error('facts_scope_uncertain');
  const eventName=title.replace(/\s*(?:へ)?出展.*$/,'').trim();
  const venue=/「([^」]{2,100})」にて開催/.exec(lead)?.[1],eventBound=lead.includes('「'+eventName+'」')&&/」に(?:弊社が)?出展(?:します|いたします)/.test(lead);
  const dates=/(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日(?:[（(][^）)]{0,4}[）)])?\s*[、,〜～－-]\s*(?:(\d{1,2})月)?\s*(\d{1,2})日/.exec(lead);
  if(!venue||!eventBound||!dates||!/(展示|出展|弊社取り扱い製品)/.test(plain(brandsParagraph)))throw Error('facts_scope_uncertain');
  const brands=find(brandsParagraph,n=>n.name==='a'&&/^\/brands\/[a-z0-9-]+\/$/.test(n.attribs.href||'')).map(plain);
  const facts={kind:'guitar_event',category:'live_guitar',evidence:'guitar_exhibition_article_v1',eventType:'exhibition',eventName,event:eventName,eventDate:day(dates[1],dates[2],dates[3]),endDate:day(dates[1],dates[4]||dates[2],dates[5]),venue,exhibitor:source.name,brands,listingSource:source.id,articleUrl:row.source_url};
  if(!guitarExhibitionLabel(facts))throw Error('facts_scope_uncertain');
  return {productFacts:facts,eventType:'guitar_event',publishedAt:row.published_at};
 }finally{doc=null;}
}
