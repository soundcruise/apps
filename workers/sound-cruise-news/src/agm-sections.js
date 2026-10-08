import {agmArticleLabel} from './agm-article-label.js';
// Permission-scoped discovery. Publisher text is transient; only bounded facts survive.
import {parseDocument,DomUtils as D} from 'htmlparser2';
import {optOut,sourceUrl} from './policy.js';
export const AGM_SECTIONS=Object.freeze(['beginners','lesson','gears','interview','news','column']);
export const AGM_SURFACES=Object.freeze(AGM_SECTIONS.map(section=>Object.freeze({section,url:`https://acousticguitarmagazine.jp/${section}/${section==='news'?'':'feed/'}`,type:section==='news'?'html':'rss'})));
export const AGM_PERMISSION_REF='agm-permission-2026-10-08';
const find=(n,p)=>D.findAll(x=>!!x.name&&p(x),n.children||[]);
const cls=(n,c)=>(n.attribs?.class||'').split(/\s+/).includes(c);
const hidden=n=>{for(let p=n;p;p=p.parent)if(['nav','footer','aside','template','noscript'].includes(p.name)||p.attribs?.hidden!==undefined||p.attribs?.['aria-hidden']==='true')return true;return false;};
const plain=n=>D.textContent(n).replace(/\s+/g,' ').trim();
export function agmArticleUrl(raw,section){
 try{const u=new URL(raw);if(u.origin!=='https://acousticguitarmagazine.jp'||u.username||u.password||u.search||u.hash)return null;
 const parts=u.pathname.split('/').filter(Boolean);
 if(section==='news'?parts.length!==1:parts.length!==2||parts[0]!==section)return null;
 // A dated slug identifies an article path only; never supplies its publication date.
 return /^20\d{2}[-_][a-z0-9_-]+$/i.test(parts.at(-1))?u.href:null;
 }catch{return null;}
}
function document(html){if(typeof html!=='string'||new TextEncoder().encode(html).length>1000000)throw Error('response_too_large');const doc=parseDocument(html);if(find(doc,n=>n.name==='meta'&&/^(robots|SoundCruiseNewsBot)$/i.test(n.attribs.name||'')).some(n=>optOut(n.attribs.content||'')))throw Error('listing_optout');return doc;}
export function agmNewsListing(html){const doc=document(html),cards=find(doc,n=>n.name==='a'&&cls(n,'post-obj')&&cls(n.parent,'post-wrap')&&!hidden(n));if(!cards.length||cards.length>30)throw Error('listing_structure_changed');const seen=new Set(),entries=[];
 for(const card of cards){const url=agmArticleUrl(card.attribs.href,'news'),titles=find(card,n=>cls(n,'post-obj-title'));if(!url||seen.has(url)||titles.length!==1)continue;const title=plain(titles[0]);if(!title||title.length>512)continue;seen.add(url);entries.push({url,title,date:'',agmSection:'news'});}if(!entries.length)throw Error('listing_structure_changed');return entries.slice(0,9);}
export function agmArticleMetadata(html,url){const doc=document(html),canon=find(doc,n=>n.name==='link'&&n.attribs.rel==='canonical');if(canon.length!==1||canon[0].attribs.href!==url)throw Error('listing_structure_changed');const headings=find(doc,n=>n.name==='h1'&&!hidden(n));
 const dates=[],headlines=[];for(const n of find(doc,n=>n.name==='script'&&n.attribs.type==='application/ld+json')){let data;try{data=JSON.parse(D.textContent(n));}catch{throw Error('listing_structure_changed');}for(const v of data['@graph']||[data])if(['Article','NewsArticle','BlogPosting'].includes(v['@type'])&&v['@id']===url+'#article'){if(v.datePublished)dates.push(v.datePublished);if(typeof v.headline==='string')headlines.push(v.headline.trim());}}
 for(const n of find(doc,n=>n.name==='meta'&&n.attribs.property==='article:published_time'))dates.push(n.attribs.content);
 const valid=dates.filter(v=>/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(v)&&Number.isFinite(Date.parse(v))).map(v=>new Date(v).toISOString());
 const date=valid.length===dates.length&&new Set(valid).size===1?valid[0]:'';
 const unique=[...new Set(headlines)];const title=unique.length===1?unique[0]:!unique.length&&headings.length===1?plain(headings[0]):'';if(!title||title.length>512)throw Error('listing_structure_changed');return {url,title,date,agmSection:'news',listingUncertainty:date?'':'missing_date'};
}
export async function discoverAgm({request,robots,sleep,delay,parseFeed,source,onSection,onArticle}){
 for(const surface of AGM_SURFACES){if(robots.isAllowed(surface.url,'SoundCruiseNewsBot')!==true)throw Error('robots_disallow');await sleep(delay);let response=await request(surface.url,{maxBytes:1000000,headers:{Accept:surface.type==='rss'?'application/rss+xml':'text/html','Cache-Control':'no-store'}});if(response.status!==200)throw Error('discovery_unavailable');let entries;
 try{if(surface.type==='rss'){if(!/xml|rss/i.test(response.headers.get('content-type')||''))throw Error('non_metadata_response');entries=parseFeed(response.text,'rss').slice(0,10).map(e=>({...e,agmSection:surface.section}));if(!entries.length)throw Error('listing_structure_changed');}
 else{if(!/text\/html/i.test(response.headers.get('content-type')||''))throw Error('listing_structure_changed');entries=agmNewsListing(response.text);for(let i=0;i<entries.length;i++){const url=entries[i].url;if(!sourceUrl(url,source)||robots.isAllowed(url,'SoundCruiseNewsBot')!==true)throw Error('robots_disallow');await sleep(delay);let article=await request(url,{maxBytes:1000000});if(article.status!==200)throw Error('discovery_unavailable');if(!/text\/html/i.test(article.headers.get('content-type')||''))throw Error('listing_structure_changed');entries[i]=agmArticleMetadata(article.text,url);if(onArticle)await onArticle(entries[i],article.text);article.text='';}}
 }finally{response.text='';}
 try{await onSection(surface.section,entries);}finally{for(const e of entries||[]){e.title='';e.metadataCategories=[];}}
 }
}
const topics=Object.freeze([
 ['half_diminished','ハーフ・ディミニッシュ',/ハーフ[・ ]?ディミニッシュ|m7\(?(?:♭|b)5/],['sharp11_flat13','♯11th・♭13th',/(?:シャープ|♯|#).{0,8}(?:イレブンス|11th).*(?:フラット|♭|b).{0,8}(?:サーティーンス|13th)/],
 ['add9','add9コード',/add9|アド[・ ]?ナインス/i],['13th','13thコード',/13th|サーティーンス/i],['11th','11thコード',/11th|イレブンス/i],['9th','9thコード',/9th|ナインス/i],
 ['chord_progression','コード進行',/コード進行|カノン進行|丸サ進行/],['bluegrass','ブルーグラス',/ブルーグラス/],['harmonics','ハーモニックス',/ハーモニックス/],['tuning','チューニング',/チューニング/],['motif','モチーフ',/モチーフ/],['flamenco','フラメンコ・ギター',/フラメンコ/],
 ['recording','録音機材',/レコーディング|録音機材/],['headphone','ヘッドホン',/ヘッドホン|ヘッドフォン/],['guitar_history','ギターの歴史',/ギター.*歴史/],['reverb','リバーブ',/リバーブ/],['nails','ギター演奏の爪の手入れ',/爪.{0,5}(?:お手入れ|手入れ)/],['pickup','アコギのピックアップ',/ピックアップ.*アコギ|ピックアップ付き/],['solo','ソロ・ギター',/ソロ[・ ]?ギター|ソロギター/],['songwriting','作曲とアコースティック・ギター',/作曲法.*アコースティック/],['singing','ギター弾き語り',/弾き語り/],['acoustic','アコースティック・ギター',/アコギ|アコースティック[・ ]?ギター/]
]);
function person(entry,t){
 const tags=(entry.metadataCategories||[]).filter(v=>typeof v==='string'&&v.length>=2&&v.length<=35&&!/[<>\n\r]/.test(v)&&!topics.some(([, ,re])=>re.test(v)));
 // A matching tag alone may be a subject, award or product brand. Require a
 // name-bearing context, rather than treating every title-prefix tag as a person.
 return tags.find(v=>t.startsWith(v)&&/^(?:が|、|（|「|｜|の(?:愛用|使用))/.test(t.slice(v.length))||t.endsWith('by '+v)||t.includes('の'+v+'（'))||null;
}
export function agmEditorialAssessment(entry){
 const section=entry.agmSection;if(!AGM_SECTIONS.includes(section)||!agmArticleUrl(entry.url,section))return {reject:'agm_section_scope'};
 const t=entry.title.normalize('NFKC');if(/クーポン|ポイント|送料無料|グッズ|トートバッグ|生徒募集|求人|中止|延期/.test(t))return {reject:'agm_editorial_scope'};
 const topic=topics.find(([, ,re])=>re.test(t));const artist=person(entry,entry.title);
 const kind=section==='interview'?'interview':section==='beginners'?'beginner':section==='lesson'?'lesson':section==='column'?'column':section==='gears'&&/愛用|使用|セレクション/.test(t)?'equipment':section==='gears'&&/SOUND CHECK|試奏|レビュー|体験/.test(t)?'review':null;
 const category=['interview','equipment'].includes(kind)?'artist_guitar':'media_other';
 return {kind,category,facts:kind?{kind:'agm_editorial',section,articleType:kind,...(topic?{topic:topic[0]}:{}),...(artist?{person:artist}:{}),category,articleUrl:entry.url,evidence:'agm_permission_metadata_v1'}:null};
}
export function agmEditorialLabel(f,event){if(f?.evidence==='agm_explicit_article_v1')return agmArticleUrl(f.articleUrl,f.section)?agmArticleLabel(f,event):null;if(event!=='agm_editorial'||f?.kind!=='agm_editorial'||f.evidence!=='agm_permission_metadata_v1'||!agmArticleUrl(f.articleUrl,f.section))return null;
 const topic=topics.find(([key])=>key===f.topic);if(!topic||!['beginner','lesson','column','interview','equipment','review'].includes(f.articleType)||f.category!==(['interview','equipment'].includes(f.articleType)?'artist_guitar':'media_other'))return null;
 const person=f.person;if(person!==undefined&&(typeof person!=='string'||person.length<2||person.length>35||/[<>\x00-\x1f]/.test(person)))return null;
 if(['interview','equipment'].includes(f.articleType)&&!person)return null;
 const suffix={beginner:'の初心者向け解説記事を公開',lesson:'の演奏解説記事を公開',column:'をテーマにした読みものを公開',interview:'について語るインタビュー',equipment:'の使用機材を紹介',review:'の試奏・レビュー記事を公開'}[f.articleType];
 return `${person?person+'、':''}${topic[1]}${suffix}`;
}
