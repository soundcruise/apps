// Principal headline/lead evidence only. No slug, profile or related-card inference.
export const AGM_SPECIFIC_LABEL='agm-specific-1';
export const normalizePerson=value=>{if(typeof value!=='string')return '';const n=value.normalize('NFKC').trim().replace(/\s+/g,' ');return /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}々ー・ ]+$/u.test(n)?n.replaceAll(' ',''):n;};
const name=v=>typeof v==='string'&&v.length>=2&&v.length<=35&&!/[<>\x00-\x1f、。！？「」『』]/.test(v)&&!/(?:ギター|アコギ|歌い方|製品|について|入門|メーカー|会社)/.test(v);
const compact=s=>s.normalize('NFKC').replace(/[\s“”「」]/g,'');
export function principalPeople(title,intro,{tags=[]}={}){
 const t=title.normalize('NFKC'),lead=compact(intro),prefix=t.match(/^(.{2,75}?)(?=に聞く|が語る|が選ぶ|の(?:愛用|使用|作曲))/)?.[1];
 if(!prefix)return [];
 const raw=prefix.replace(/^(?:ギタリスト|シンガー[・]?ソングライター|アーティスト)(?:の)?/,'').trim(),tagNames=[...new Set(tags.map(normalizePerson).filter(name))];
 let people=raw.split(/\s*[×&＆]\s*|\s+と\s+/).map(normalizePerson);
 if(people.length===1&&raw.includes('と')&&!tagNames.includes(normalizePerson(raw))){const pairs=tagNames.flatMap(a=>tagNames.filter(b=>b!==a&&compact(raw)===a+'と'+b).map(b=>[a,b]));if(pairs.length!==1)return [];people=pairs[0];}
 if(people.length>3||!people.every(name)||new Set(people).size!==people.length||people.some(p=>!lead.includes(compact(p))))return [];
 return people;
}
export function editorialForm(title,intro,headings){
 const questions=headings.filter(h=>/^Q\s*[0-9０-９]+[.．:：]/i.test(h)),answers=headings.filter(h=>/^A\s*[0-9０-９]+[.．:：]/i.test(h));
 if((/Q\s*[&＆]\s*A|一問一答/i.test(title+' '+intro)&&questions.length>=1)||questions.length>=2&&answers.length>=2)return 'qa';
 if(/インタビュー|話を聞|語ってもら/.test(title+' '+intro))return 'interview';
 if(/解説|練習方法|配置|選び方/.test(title+' '+intro))return 'explanation';
 return null;
}
export function singingFocus(title,intro,headings){
 // A principal topic must be corroborated in the lead and actual questions.
 // A later biography or an isolated incidental body mention is insufficient.
 const lead=title+' '+intro,first=headings.slice(0,10).join(' ');
 if(/弾き語り/.test(lead)&&/歌い方/.test(title)&&/歌い方/.test(intro)&&/歌い方|歌う/.test(first))return 'singing_technique';
 return null;
}
