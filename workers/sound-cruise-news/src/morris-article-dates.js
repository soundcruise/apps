import {DomUtils} from 'htmlparser2';
import {factFailure} from './facts-failure.js';
// Only normalized calendar days and closed roles survive parsing; never raw text.
function day(value,attribute=false){
 const v=String(value||'').trim().replace(/[(（][日月火水木金土](?:曜日)?[)）]$/,'').trim();let m=/^(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/.exec(v);
 if(m){const d=`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;return Number.isFinite(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d?d:null;}
 if(attribute&&/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(v)&&day(v.slice(0,10))&&Number.isFinite(Date.parse(v)))return new Date(Date.parse(v)+9*3600000).toISOString().slice(0,10);
 return null;
}
function role(n){
 const props=(n.attribs?.itemprop||'').split(/\s+/),classes=(n.attribs?.class||'').split(/\s+/);
 const label=DomUtils.textContent(n.parent).replace(/\s+/g,' ').trim();
 const found=[];
 if(props.includes('datePublished')||classes.some(x=>['published','published-date','entry-date'].includes(x))||label.length<100&&/^(公開日?|掲載日?)\s*[:：]/.test(label))found.push('publication');
 if(props.includes('dateModified')||classes.some(x=>['updated','modified','updated-date'].includes(x))||label.length<100&&/^(更新日?|最終更新日)\s*[:：]/.test(label))found.push('updated');
 if(props.some(x=>['startDate','endDate'].includes(x))||classes.some(x=>['event-date','event-start','event-end'].includes(x))||label.length<100&&/^(開催日|公演日|開催期間)\s*[:：]/.test(label))found.push('event');
 if(props.includes('releaseDate')||classes.includes('release-date')||label.length<100&&/^発売日\s*[:：]/.test(label))found.push('release');
 return found.length===1?found[0]:'unknown';
}
export function validateMorrisArticleDates(times,publishedAt){
 const expected=new Date(Date.parse(publishedAt)+9*3600000).toISOString().slice(0,10),dates=[];let unknown=false,conflict=false;
 if(times.length>12)throw factFailure('facts_date_unconfirmed',{stage:'article_dates',missingFields:['bounded_date_scope']});
 for(const n of times){
  const kind=role(n),rawText=DomUtils.textContent(n).replace(/\s+/g,' ').trim(),text=day(rawText),attr=day(n.attribs.datetime,true);
  const mismatch=!!attr&&!!text&&attr!==text,basis=mismatch?'conflict':attr&&text?'both':attr?'datetime':'text',normalized=mismatch?null:attr||text;
  dates.push({role:kind,normalized,expected,basis});
  if(kind==='publication'){
   if(mismatch)conflict=true;
   else if(!normalized||n.attribs.datetime&&!attr||rawText&&!text)unknown=true;
   else if(normalized!==expected)conflict=true;
  }else if(kind==='unknown'&&(mismatch||!normalized||normalized!==expected||n.attribs.datetime&&!attr||rawText&&!text))unknown=true;
  // Explicit updated/event/release dates cannot redefine the publication day.
 }
 if(conflict)throw factFailure('facts_date_changed',{stage:'article_dates',conflictingFields:['publishedAt'],dates});
 if(unknown)throw factFailure('facts_date_unconfirmed',{stage:'article_dates',missingFields:['publication_date_role_or_format'],dates});
 return {version:'morris-date-roles-1',dates};
}
