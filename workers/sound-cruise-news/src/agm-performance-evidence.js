// Structured public performance information; no artist whitelist or URL/date inference.
export const validEventDay=v=>typeof v==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const bounded=v=>typeof v==='string'&&v.trim()===v&&v.length>=2&&v.length<=100&&!/[<>\x00-\x1f]/.test(v);
export function validAgmPerformance(f){return f?.kind==='agm_editorial'&&f.articleType==='performance_event'&&f.section==='news'&&f.category==='live_guitar'&&f.evidence==='agm_explicit_article_v1'&&bounded(f.eventName)&&validEventDay(f.eventDate)&&bounded(f.performer)&&Array.isArray(f.venues)&&f.venues.length>=1&&f.venues.length<=10&&f.venues.every(bounded)&&f.performanceEvidence?.basis==='explicit_labeled_event_fields'&&f.performanceEvidence.role==='guitar'&&/^https:\/\/acousticguitarmagazine\.jp\//.test(f.articleUrl||'');}
export function agmPerformanceLabel(f){return validAgmPerformance(f)?`「${f.eventName}」、${Number(f.eventDate.slice(5,7))}月${Number(f.eventDate.slice(8,10))}日にギター演奏を含む公演を開催`:null;}
export function performanceFields({title,intro,article,find,text}){
 if(/中止|延期|昨年|過去|開催済み|開催しない|予定はない/.test(title+' '+intro)||!/開催/.test(title)||!/開催される/.test(intro))return null;
 const names=[...title.matchAll(/[“「]([^”」]{2,80})[”」]/g)].map(m=>m[1]).filter(n=>intro.includes(n));if(names.length!==1)return null;
 const heads=find(article,n=>/^h[23]$/.test(n.name)&&text(n)==='公演情報');if(heads.length!==1)return null;
 const h=heads[0],siblings=h.parent.children.slice(h.parent.children.indexOf(h)+1),fields={};let key=null;
 for(const n of siblings){if(/^h[123]$/.test(n.name||''))break;const value=text(n);if(!value)continue;
  if(n.name==='p'&&/^◎/.test(value)){key=value.replace(/^◎/,'');if(fields[key])return null;fields[key]=[];}
  else if(key&&n.name==='ul')fields[key].push(...find(n,x=>x.name==='li').map(text));
 }
 const dates=[...new Set((fields['スケジュール']||[]).flatMap(v=>[...v.matchAll(/(20\d{2})年(\d{1,2})月(\d{1,2})日/g)].map(m=>`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`)))];
 if(dates.length!==1||!validEventDay(dates[0]))return null;
 const [year,month,day]=dates[0].split('-').map(Number);if(!intro.includes(`${year}年${month}月${day}日`)||!title.includes(`${month}月${day}日`))return null;
 const guitar=(fields['出演者']||[]).map(v=>v.match(/^([^（）()]{2,35})[（(]g[）)]$/)?.[1]?.trim()).filter(Boolean);
 const venues=[...new Set((fields['会場']||[]).map(v=>v.replace(/[（(][^）)]*[）)]$/,'').trim()))].sort();
 if(guitar.length!==1||!venues.length||venues.length>10||!venues.every(bounded))return null;
 return {eventName:names[0],eventDate:dates[0],performer:guitar[0],venues,performanceEvidence:{basis:'explicit_labeled_event_fields',role:'guitar'}};
}
