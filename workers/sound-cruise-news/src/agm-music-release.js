import {validEventDay} from './agm-performance-evidence.js';
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
// Bind the artist, named work, record format and release action in the same
// introductory paragraph. A film title, past album or related card is not a work.
export function musicReleaseFields({title,paragraphs,person,publishedAt}){
 if(!person||!title.includes(person)||!/リリース/.test(title)||!Number.isFinite(Date.parse(publishedAt)))return null;
 const claims=[];
 for(const p of paragraphs.slice(0,4)){
  const subject=new RegExp(escape(person)+'(?:が|は)[^。]{0,160}?(EP|アルバム|新譜)『([^』]{2,60})』(?:と『([^』]{2,60})』)?([^。]{0,100}リリースする)');
  const m=p.match(subject);if(!m)continue;if(/中止|延期|リリースしない|かもしれ|過去|前作|旧作/.test(m[0]))return null;
  const works=[m[2],m[3]].filter(Boolean);
  const printed=/EP/.test(title)?'EP':/アルバム/.test(title)?'アルバム':null;
  // 新譜 alone does not establish whether the work is an album or a single.
  const releaseType=m[1]==='新譜'?printed:m[1];
  if(!releaseType||printed&&printed!==releaseType||(/『[^』]+』/.test(title)||m[1]==='新譜')&&!works.every(w=>title.includes('『'+w+'』')))return null;
  const days=[...m[4].matchAll(/(20\d{2})年(\d{1,2})月(\d{1,2})日/g)].map(d=>`${d[1]}-${d[2].padStart(2,'0')}-${d[3].padStart(2,'0')}`);
  if(days.some(d=>!validEventDay(d))||new Set(days).size>1)return null;
  const releaseDate=days[0];
  const headlineDays=[...title.matchAll(/(?:(20\d{2})年)?(\d{1,2})月(\d{1,2})日/g)];
  if(releaseDate&&(releaseDate<new Date(publishedAt).toISOString().slice(0,10)||headlineDays.some(d=>d[1]&&d[1]!==releaseDate.slice(0,4)||Number(d[2])!==Number(releaseDate.slice(5,7))||Number(d[3])!==Number(releaseDate.slice(8,10)))))return null;
  const selfPlayed=works.length===1&&paragraphs.slice(0,4).some(v=>!/(?:前作|旧作|別作品|演奏しない)/.test(v)&&new RegExp('ドラム(?:を除く|以外の)全楽器を'+escape(person)+'本人が演奏(?:する|した)').test(v));
  claims.push({action:'music_release',works,releaseType,...(selfPlayed?{performanceScope:'all_instruments_except_drums'}:{}),...(releaseDate?{releaseDate,releaseEvidence:{basis:'explicit_primary_music_release',subject:'named_artist_work'}}:{})});
 }
 const unique=[...new Map(claims.map(c=>[JSON.stringify(c),c])).values()];return unique.length===1?unique[0]:null;
}
