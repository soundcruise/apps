import {parseDocument,DomUtils as D} from 'htmlparser2';
import {agmArticleUrl,agmArticleMetadata,AGM_SECTIONS,AGM_PERMISSION_REF} from './agm-sections.js';
import {agmArticleLabel,factName} from './agm-article-label.js';
import {validLabel} from './metadata.js';
import {optOut} from './policy.js';
const find=(n,p)=>D.findAll(x=>!!x.name&&p(x),n.children||[]);
const text=n=>D.textContent(n).replace(/\s+/g,' ').trim();
const classes=n=>(n.attribs?.class||'').split(/\s+/);
const skip=n=>['script','style','nav','footer','aside','figure','iframe','template','noscript','rt'].includes(n.name)||n.attribs?.hidden!==undefined||n.attribs?.['aria-hidden']==='true'||/(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(n.attribs?.style||'')||classes(n).some(c=>/^(?:related|sns-|page-nav|product-block|wp-block-latest|profile)/.test(c));
function clean(n){for(const child of [...n.children||[]]){if(skip(child))D.removeElement(child);else clean(child);}}
export function agmRecoverySurface(row,source){
 if(source?.id!=='agm'||!source.agmSections||source.permissionRef!==AGM_PERMISSION_REF||!source.explicitAutomationPermission)return null;
 const section=AGM_SECTIONS.find(s=>agmArticleUrl(row.source_url,s));return section?{url:row.source_url,method:'explicit_agm_article_fields',parser:'agm-article-2'}:null;
}
function articleMetadata(html,url,section){
 if(section==='news')return agmArticleMetadata(html,url);
 const d=parseDocument(html),canon=find(d,n=>n.name==='link'&&n.attribs.rel==='canonical'),titles=find(d,n=>n.name==='h2'&&classes(n.parent).includes('post-title'));
 const og=find(d,n=>n.name==='meta'&&n.attribs.property==='og:title');
 if(canon.length!==1||canon[0].attribs.href!==url||titles.length!==1||og.length!==1)throw Error('facts_article_structure');
 const title=text(titles[0]),ogTitle=og[0].attribs.content||'';
 if(!title||title.length>512||!(ogTitle===title||ogTitle.startsWith(title+' | ')))throw Error('facts_article_structure');
 const dates=find(d,n=>n.name==='meta'&&n.attribs.property==='article:published_time').map(n=>n.attribs.content);
 if(dates.length>1||dates.some(v=>!/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(v)||!Number.isFinite(Date.parse(v))))throw Error('facts_date_changed');
 return {title,date:dates.length?new Date(dates[0]).toISOString():null};
}
function nameFrom(title,intro,tags,old){
 const candidates=[old,...tags];
 for(const v of candidates)if(factName(v)&&v.length<=35&&title.includes(v)&&intro.includes(v)&&!/(ギター|アコギ|グラミー|コンクール|ピックアップ|インタビュー)/.test(v))return v;
 // Only subject-bearing headline positions corroborated by the article introduction.
 for(const re of [/^([^、。！？!?「『“（]{2,35}?)(?=が|、|の(?:最新|愛用|使用|作曲)|[“「])/,/、([^、。！？!?]{2,35}?)の作曲法/]){const v=title.match(re)?.[1]?.trim();if(factName(v)&&intro.includes(v))return v;}
 return null;
}
export function parseAgmArticleEvidence(html,source,row){
 if(typeof html!=='string'||new TextEncoder().encode(html).length>1000000)throw Error('facts_response_too_large');

 const surface=agmRecoverySurface(row,source);if(!surface)throw Error('facts_source_invalid');
 const section=AGM_SECTIONS.find(s=>agmArticleUrl(row.source_url,s));
 const meta=articleMetadata(html,row.source_url,section);
 // RSS supplies the saved publication timestamp for non-News sections. An article
 // with no date cannot invent/replace it; any explicit contradictory date fails closed.
 if(!row.published_at||meta.date&&meta.date!==row.published_at)throw Error('facts_date_changed');
 const doc=parseDocument(html);if(find(doc,n=>n.name==='meta'&&/^(robots|SoundCruiseNewsBot)$/i.test(n.attribs.name||'')).some(n=>optOut(n.attribs.content||'')))throw Error('facts_optout');
 const articles=find(doc,n=>n.name==='article'&&n.parent?.name==='main'&&classes(n.parent).includes('post-item'));if(articles.length!==1)throw Error('facts_article_structure');
 const article=articles[0];clean(article);
 const ps=find(article,n=>n.name==='p'),hs=find(article,n=>/^h[2-4]$/.test(n.name));
 const intro=ps.slice(0,4).map(text).join(' ').slice(0,2200),headings=hs.map(text),title=meta.title;
 const tags=find(doc,n=>n.name==='a'&&/^https:\/\/acousticguitarmagazine\.jp\/tag\//.test(n.attribs.href||'')).map(text);
 let old={};try{old=JSON.parse(row.product_facts)||{};}catch{}
 let person=nameFrom(title,intro,tags,old.person),type=old.articleType||({beginners:'beginner',lesson:'lesson',column:'column',interview:'interview'}[section]);
 const f={kind:'agm_editorial',section,articleType:type,category:['interview','equipment'].includes(type)?'artist_guitar':'media_other',articleUrl:row.source_url,evidence:'agm_explicit_article_v1'};
 if(person)f.person=person;
 if(/【PR】|\bPR\b|タイアップ|広告企画/.test(intro))f.editorialNotice='advertorial';
 // Explicit model-bearing subsection headings, not related cards or price lists.
 const models=[...new Set(headings.filter(h=>/^[A-Za-z][A-Za-z .&-]{1,35}／[^／]{2,70}$/.test(h)&&/(?:[0-9]|[A-Z]+-[A-Z]+)/.test(h)).map(h=>h.replace('／',' ')))].slice(0,5);
 if(section==='gears'&&models.length&&models.length<=4){f.models=models;f.articleType=/SOUND CHECK|試奏|レビュー|体験/.test(title)?'review':/セレクション|愛用|使用/.test(title)?'equipment':type;f.category=f.articleType==='equipment'?'artist_guitar':'media_other';}

 const themes=[['headphone',/ヘッドホン|ヘッドフォン/],['chord_progression',/コード進行|カノン進行/],['guitar_roots',/ギタリスト.{0,12}ルーツ|ギターを始めた経緯/],['songwriting',/作曲法|作曲方法/],['fingerstyle',/フィンガー[・ ]?(?:ピッキング|スタイル)/],['singing',/弾き語り/],['solo',/ソロ[・ ]?ギター/],['guitar_career',/軌跡|ギタリスト.{0,10}歩み/],['home_recording',/音楽制作|宅録|DTM/],['rhythm',/リズム/],['acoustic',/アコギ|アコースティック[・ ]?ギター/]];
 const topic=[title,...headings.slice(0,10),intro].map(segment=>themes.find(([,re])=>re.test(segment))).find(Boolean);if(topic)f.topic=topic[0];
 if(section==='lesson'){const song=headings.map(h=>h.match(/^「([^」]{2,60})」について$/)?.[1]).find(Boolean);if(song&&title.includes(song))f.song=song;}
 if(section==='news'){
  f.articleType='artist_news';f.category='artist_guitar';
  if(/受賞/.test(title)&&/受賞した/.test(intro)){
   f.person=intro.match(/ギタリストの([^が、。]{2,35})が/)?.[1]||f.person;
   const award=intro.match(/[“「]([^”」]{2,65}コンクール)[”」]/)?.[1],work=intro.match(/作曲した「([^」]{2,75})」/)?.[1];if(award&&work){f.action='award';f.award=award;f.work=work;}
  }else if(/リリース/.test(title)&&/リリースする/.test(intro)){
   f.person=intro.match(/シンガー[・]?ソングライターの([^が、。]{2,35})が/)?.[1]||f.person;
   const first=ps.map(text).find(t=>/リリースする/.test(t));const works=first?[...first.matchAll(/『([^』]{2,60})』/g)].map(m=>m[1]):[];
   if(works.length>=1&&works.length<=2&&/EP|アルバム/.test(first)){f.action='music_release';f.works=works;f.releaseType=/EP/.test(first)?'EP':'アルバム';}
  }else if(/ツアー|コンサート/.test(title)&&/開催されることが決定|ツアー.{0,20}開催/.test(intro)){
   const subject=title.match(/(?:シンガー[・]?ソングライター|アーティスト)[、の]([^、。の]{2,35})の/)?.[1];
   const names=[...title.matchAll(/[“「]([^”」]{2,70})[”」]/g)].map(m=>m[1]);
   const concert=names.find(n=>/コンサート|ツアー/.test(n)),family=concert?.replace(/20\d{2}$/,'');
   if(subject&&intro.includes(subject)&&concert&&intro.includes(family)&&/アコースティック[・ ]?ギター|弾き語り/.test(intro)){f.person=subject;f.action='tour';f.eventName=concert;}
  }else if(/アコギ・マガジン|アコースティック・ギター・マガジン/.test(title)&&/パーラー/.test(title)&&/発売/.test(title)){
   const issue=intro.match(/アコースティック・ギター・マガジン[^』。]{0,50}(Vol\.\d{1,3})/)?.[1];if(issue){f.articleType='publication';f.category='media_other';f.topic='parlor_guitar';f.issue=issue;delete f.person;}
  }
 }
 const label=agmArticleLabel(f,'agm_editorial');if(!label||!validLabel(label,title))throw Error('facts_not_recovered');
 return {publishedAt:row.published_at,eventType:'agm_editorial',category:f.category,productFacts:f};
}
