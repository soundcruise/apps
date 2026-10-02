// Phase A.6: explicitly requested candidates only. This is an operator
// evidence surface; it does not expand scheduled discovery or publication policy.
import {parseDocument,DomUtils} from 'htmlparser2';
import {optOut} from './policy.js';
import {parseEventArticle} from './high-value.js';
export const TARGET_URLS=Object.freeze({
 'ikebe-event':'https://www.ikebe-gakki.com/blog/20261021-aco-workshop/',
 shimamura:'https://www.shimamura.co.jp/update/dtm-recording/2026/10/90252/',
 ikebe:'https://www.ikebe-gakki-pb.com/new_product/172475/',
 ik:'https://www.ikmultimedia.com/news/?item_id=19790'
});
export function targetSurface(row,source){
 if(source?.id==='ik')return null; // Current target is absent; never borrow localized item 19792.
 if(!source||row.source_id!==source.id||row.source_url!==TARGET_URLS[source.id])return null;
 return {url:row.source_url,method:'targeted_explicit_primary_fields',parser:'target-evidence-2'};
}
const find=(n,p)=>DomUtils.findAll(x=>!!x.name&&p(x),n.children||[]);
const hidden=n=>{for(let p=n;p;p=p.parent)if(['script','style','nav','footer','header','template','noscript'].includes(p.name)||p.attribs?.hidden!==undefined||p.attribs?.['aria-hidden']==='true'||/display\s*:\s*none|visibility\s*:\s*hidden/i.test(p.attribs?.style||''))return true;return false;};
const text=n=>hidden(n)?'':n.type==='text'?n.data:(n.children||[]).map(text).join('');
const plain=n=>text(n).replace(/\s+/g,' ').trim();
const cls=(n,c)=>(n.attribs?.class||'').split(/\s+/).includes(c);
const dayMatch=(day,row,utc=false)=>/^20\d{2}-\d{2}-\d{2}$/.test(day)&&new Date(day+'T00:00:00'+(utc?'Z':'+09:00')).toISOString()===row.published_at;
export function parseTargetEvidence(html,source,row){
 if(!targetSurface(row,source))throw Error('facts_source_invalid');
 if(typeof html!=='string'||new TextEncoder().encode(html).length>512000)throw Error('facts_response_too_large');
 const old=JSON.parse(row.product_facts||'null');
 if(source.id==='ikebe-event'){
  const facts=parseEventArticle(html,source,row.source_url);
  let doc=parseDocument(html);try{const published=find(doc,n=>n.name==='time'&&cls(n,'sub_info_date')&&!hidden(n)&&plain(n).startsWith('Published:'));if(published.length!==1||!dayMatch(published[0].attribs.datetime,row))throw Error('facts_date_changed');}finally{doc=null;}
  return {productFacts:facts,eventType:'guitar_event',publishedAt:row.published_at};
 }
 let doc=parseDocument(html);html='';
 try{
  if(find(doc,n=>n.name==='meta'&&/^(robots|SoundCruiseNewsBot)$/i.test(n.attribs.name||'')).some(n=>optOut(n.attribs.content||'')))throw Error('facts_optout');
  const titles=find(doc,n=>n.name==='h1'&&!hidden(n)&&plain(n));if(titles.length!==1)throw Error('facts_parser_failure');
  if(/中止|延期|訂正|撤回/.test(plain(titles[0])))throw Error('facts_scope_uncertain');
  const dates=find(doc,n=>n.name==='time'&&!hidden(n)&&(source.id==='shimamura'||cls(n,'sub_info_date')));
  if(dates.length!==1||!dayMatch(dates[0].attribs.datetime,row))throw Error('facts_date_changed');
  if(source.id==='shimamura'){
   const articles=find(doc,n=>n.name==='article'&&!hidden(n));if(articles.length!==1)throw Error('facts_parser_failure');
   const body=articles[0],models=find(body,n=>n.name==='h2'&&!hidden(n)&&plain(n)==='MV6 Gen 2');
   const leads=find(body,n=>n.name==='p'&&!hidden(n)&&/^Shure（シュア）が、[^。]{0,120}『MV6 Gen 2』を発売します。/.test(plain(n)));
   if(!/^(?:SHURE|Shure) MV6 Gen 2(?:\s|\|)/.test(plain(titles[0]))||models.length!==1||leads.length!==1||old?.brand!=='SHURE'||!['MV6','MV6 Gen 2'].includes(old.product)||old.identifierBasis!=='explicit_model_code'||old.category!=='recording_audio')throw Error('facts_identity_changed');
   return {productFacts:{...old,product:'MV6 Gen 2'},eventType:'release',publishedAt:row.published_at};
  }
  const bodies=find(doc,n=>cls(n,'main_wrap')&&!hidden(n));if(bodies.length!==1)throw Error('facts_parser_failure');
  const body=bodies[0],heads=find(body,n=>n.name==='h2'&&!hidden(n)),normalized=plain(heads[0]||{}).replace(/\s/g,'');
  if(heads.length!==1||normalized!=='KORGNu:TektNuTubeOD-KITCUSTOMCRAFTBD-S'||old?.brand!=='KORG'||old.product!=='Nu:Tekt NuTube OD-KIT CUSTOM CRAFT BD-S'||old.listingSource!=='ikebe'||old.category!=='amps_effects')throw Error('facts_identity_changed');
  // The explicit introduction belongs to the sole model's own article body.
  // Product existence, the URL /new_product/, specs and prices alone are insufficient.
  const leads=find(body,n=>n.name==='p'&&cls(n,'wp-block-paragraph')&&!hidden(n)&&/OD-KIT CUSTOM CRAFTが登場しました。/.test(plain(n))&&!/登場していません|登場しない|他社|過去|以前/.test(plain(n)));
  if(leads.length!==1)throw Error('facts_scope_uncertain');
  return {productFacts:{...old},eventType:'new_product',publishedAt:row.published_at};
 }finally{doc=null;}
}
export function targetIdentityRefinement(row,old,facts,proof){
 // Correct only the explicitly verified full generation name on this one article.
 // No general product-identity overwrite, and no change to eligibility rules.
 return row.source_id==='shimamura'&&row.source_url===TARGET_URLS.shimamura&&proof?.parserVersion==='target-evidence-2'&&proof.sourceUrl===row.source_url&&old?.brand==='SHURE'&&old.product==='MV6'&&facts.brand===old.brand&&facts.product==='MV6 Gen 2'&&facts.category===old.category&&facts.identifierBasis===old.identifierBasis&&['artist','performer'].every(k=>facts[k]===old[k]);
}
