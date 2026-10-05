// Assessed operator recovery only. Scheduled discovery remains listing-only.
import {parseDocument,DomUtils} from 'htmlparser2';
import {optOut} from './policy.js';
import {productFacts} from './metadata.js';
import {enrichHeadlineFacts,releaseDateFields} from './headline-evidence.js';
const ASSESSED=Object.freeze({
 'https://www.shimamura.co.jp/update/dtm-recording/2026/10/91045/':{brand:'Novation',product:'FLpad',brandPattern:/\bNovation\b|ノベーション/i,models:[/\bFLpad\b(?!\s*Mini)/i,/\bFLpad Mini\b/i]},
 'https://www.shimamura.co.jp/update/guitar-bass/2026/10/89963/':{brand:'Gibson',product:'SJ-200 / Hummingbird',brandPattern:/\bGibson\b|ギブソン/i,models:[/\bSJ-200\b/i,/\bHummingbird\b|ハミングバード/i]}
});
export function shimamuraEventSurface(row,source){
 if(source?.id!=='shimamura'||row.source_id!==source.id||source.discoveryUrl!=='https://www.shimamura.co.jp/update/common/new-item/'||!ASSESSED[row.source_url])return null;
 return {url:row.source_url,method:'targeted_explicit_primary_fields',parser:'shimamura-intro-event-3'};
}
const cls=(n,c)=>(n.attribs?.class||'').split(/\s+/).includes(c);
const hidden=n=>{for(let p=n;p;p=p.parent)if(['script','style','nav','footer','header','template','noscript'].includes(p.name)||p.attribs?.hidden!==undefined||p.attribs?.['aria-hidden']==='true'||/display\s*:\s*none|visibility\s*:\s*hidden/i.test(p.attribs?.style||''))return true;return false;};
const text=n=>hidden(n)?'':n.type==='text'?n.data:(n.children||[]).map(text).join('');
const plain=n=>text(n).replace(/\s+/g,' ').trim();
const find=(doc,p)=>DomUtils.findAll(n=>!!n.name&&p(n),doc.children||[]);
// Conservative common grammar, not a keyword search through arbitrary body text.
export function explicitIntroEvent(sentence){
 if(typeof sentence!=='string'||sentence.length>400||/[。.!?！？]/.test(sentence.slice(0,-1))||/かもしれ|と思|という|とされ|噂|未発売|未発表|未定|検討|中止|延期|撤回|訂正|以前|過去|以来|ではなく|再入荷|入荷|キャンペーン|セール|予定|[12][0-9]{3}年/.test(sentence))throw Error('facts_scope_uncertain');
 if(/を(?:発売|リリース)(?:しました|します)[。.]$/.test(sentence))return 'release';
 if(/を発表(?:しました|します)[。.]$/.test(sentence)||/が(?:新たに)?登場しました[。.]$/.test(sentence))return 'new_product';
 throw Error('facts_scope_uncertain');
}
export function parseShimamuraEventEvidence(html,source,row){
 const surface=shimamuraEventSurface(row,source),scope=ASSESSED[row.source_url];
 if(!surface||!['pending','reopened'].includes(row.review_status)||row.event_type!=='other')throw Error('facts_source_invalid');
 if(typeof html!=='string'||new TextEncoder().encode(html).length>512000)throw Error('facts_response_too_large');
 const old=JSON.parse(row.product_facts||'null');if(old?.brand!==scope.brand||old.product!==scope.product||old.category!==row.category||old.scopeUncertain)throw Error('facts_identity_changed');
 let doc=parseDocument(html);html='';
 try{
  if(find(doc,n=>n.name==='meta'&&/^(robots|SoundCruiseNewsBot)$/i.test(n.attribs?.name||'')&&optOut(n.attribs?.content||'')).length)throw Error('facts_optout');
  const headings=find(doc,n=>n.name==='h1'&&cls(n.parent,'mb-80')&&!hidden(n));
  const bodies=find(doc,n=>n.name==='div'&&cls(n,'p-content')&&!hidden(n));
  const dates=find(doc,n=>n.name==='time'&&!hidden(n));
  if(headings.length!==1||bodies.length!==1)throw Error('facts_parser_failure');
  const day=dates[0]?.attribs?.datetime;if(dates.length!==1||!/^20\d{2}-\d{2}-\d{2}$/.test(day||'')||new Date(day+'T00:00:00+09:00').toISOString()!==row.published_at)throw Error('facts_date_changed');
  const identity=productFacts(plain(headings[0]));if(!identity||['brand','product','category'].some(k=>identity[k]!==old[k]))throw Error('facts_identity_changed');
  const intro=[];for(const n of bodies[0].children||[]){if(hidden(n))continue;if(n.name==='h2'){if(plain(n)==='概要'&&!intro.length)continue;break;}if(n.name==='p'&&cls(n,'wp-block-paragraph'))intro.push(n);}
  if(!intro.length)throw Error('facts_parser_failure');
  // Only the first paragraph supplies an event. Later specifications cannot fill it;
  // a second announcement or correction makes this bounded overview ambiguous.
  if(intro.slice(1).some(n=>/発売|発表|登場|リリース|延期|中止|撤回|訂正|未発売|未発表/.test(plain(n))))throw Error('facts_scope_uncertain');
  const lead=plain(intro[0]);if(!scope.brandPattern.test(lead)||scope.models.some(re=>!re.test(lead)))throw Error('facts_identity_changed');
  const eventType=explicitIntroEvent(lead);
  const facts=enrichHeadlineFacts({...old},{title:plain(headings[0]),statements:[lead],releaseDates:releaseDateFields(bodies[0]),publishedAt:row.published_at,basis:'verified_primary_article'});
  return {productFacts:facts,eventType,publishedAt:row.published_at};
 }finally{doc=null;}
}
