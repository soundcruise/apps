import {parseDocument,DomUtils} from 'htmlparser2';
import {hash,optOut} from './policy.js';
import {fingerprint} from './fingerprint.js';
import {extractMorrisEditorial,morrisEditorialLabel} from './morris-editorial.js';
import {morrisCardDiagnostics} from './morris-diagnostics.js';
import {MORRIS_LISTING,MORRIS_PARSER,MORRIS_PERMISSION,morrisArticleUrl,morrisDate,morrisUrlDate} from './morris-policy.js';
const hidden=n=>{for(let p=n;p;p=p.parent)if(['script','style','nav','footer','aside','template','noscript','iframe'].includes(p.name)||p.attribs?.hidden!==undefined||p.attribs?.['aria-hidden']==='true'||/(?:^|\s)(?:related|related-posts|recommend|sidebar)(?:\s|$)/i.test(p.attribs?.class||'')||/display\s*:\s*none|visibility\s*:\s*hidden/i.test(p.attribs?.style||''))return true;return false;};
const text=n=>!n||hidden(n)?'':n.type==='text'?n.data:(n.children||[]).map(text).join(' ');
const plain=n=>text(n).replace(/\s+/g,' ').trim();
const find=(n,p)=>DomUtils.findAll(x=>!!x.name&&!hidden(x)&&p(x),n.children||[]);
const cls=(n,c)=>(n.attribs?.class||'').split(/\s+/).includes(c);
const field=v=>typeof v==='string'&&v.length>=2&&v.length<=100&&!/[<>\x00-\x1f]/.test(v);
const day=v=>!!morrisDate(v);
const normal=v=>v.normalize('NFKC').replace(/\s/g,'');
function document(html){if(typeof html!=='string'||new TextEncoder().encode(html).length>128000)throw Error('listing_too_large');const doc=parseDocument(html);
 if(find(doc,n=>n.name==='meta'&&/^(robots|SoundCruiseNewsBot)$/i.test(n.attribs.name||'')).some(n=>optOut(n.attribs.content||'')))throw Error('header_optout');
 const mains=find(doc,n=>n.name==='main');if(mains.length!==1)throw Error('listing_structure_changed');return {doc,root:mains[0]};}
function identity(doc,url){const canonical=find(doc,n=>n.name==='link'&&n.attribs.rel==='canonical'),og=find(doc,n=>n.name==='meta'&&n.attribs.property==='og:url');
 if(canonical.length>1||og.length>1||canonical.some(n=>new URL(n.attribs.href,url).href!==url)||og.some(n=>n.attribs.content!==url))throw Error('facts_source_invalid');
 if(!canonical.length&&!og.length)throw Error('facts_source_invalid');return canonical.length?'canonical':'og:url';}
export const MORRIS_LISTING_PARSER='morris-listing-facts-1';
function descriptionStructure(card,title,paragraphs,selected,fieldNodes,root){
 let scope=card,scopeAmbiguous=false;
 // Diagnostic observation may inspect a parent with exactly one bound article.
 // Never borrow another card's prose or feed the wider scope into extraction.
 for(let parent=card.parent,depth=0;parent&&parent!==root&&depth<2;parent=parent.parent,depth++){
  const heads=find(parent,n=>n.name==='h3'&&cls(n,'h5')&&cls(n,'serif'));
  const urls=new Set(find(parent,n=>n.name==='a'&&n.attribs.href).map(n=>{try{return morrisArticleUrl(new URL(n.attribs.href,MORRIS_LISTING).href);}catch{return null;}}).filter(Boolean));
  if(heads.length!==1||heads[0]!==title||urls.size!==1){scopeAmbiguous=scope===card;break;}scope=parent;
 }
 const candidates=new Map(),types=['p','div','span','li','dt','dd','blockquote','section','article','small','strong','em'];
 const walk=n=>{if(hidden(n))return;if(n.type!=='text'){for(const child of n.children||[])walk(child);return;}const length=n.data.replace(/\s+/g,' ').trim().length;if(!length)return;
  const ancestors=[];for(let p=n.parent;p;p=p.parent){ancestors.push(p);if(p===scope)break;}
  if(ancestors.some(p=>p===title||/^h[1-6]$/.test(p.name)||['time','a','button','figcaption','svg'].includes(p.name)))return;
  const owner=ancestors.find(p=>paragraphs.includes(p))||ancestors.find(p=>fieldNodes.includes(p))||n.parent;
  candidates.set(owner,(candidates.get(owner)||0)+length);
 };walk(scope);
 const descriptionCandidateTypes={};let outsideSupportedCharacterCount=0,outsideSelectedWindowCharacterCount=0;
 for(const [node,length]of candidates){const type=types.includes(node.name)?node.name:'other';descriptionCandidateTypes[type]=(descriptionCandidateTypes[type]||0)+1;
  if(paragraphs.includes(node)){if(!selected.includes(node))outsideSelectedWindowCharacterCount+=length;}
  else if(!fieldNodes.includes(node))outsideSupportedCharacterCount+=length;
 }
 return {cardRecognized:true,articleLinkPresent:true,publishedDatePresent:true,headingPresent:true,descriptionScope:scope===card?'card':'single_article_parent',scopeAmbiguous,descriptionCandidateCount:candidates.size,descriptionCandidateTypes,
  supportedElementCount:paragraphs.length+fieldNodes.length,selectedParagraphCount:selected.length,fieldElementCount:fieldNodes.length,
  extractedCharacterCount:selected.map(plain).join(' ').trim().length+fieldNodes.map(plain).join(' ').trim().length,outsideSupportedCharacterCount,outsideSelectedWindowCharacterCount};
}
export async function parseMorrisListing(html,pepper,evidence=null){
 const {doc,root}=document(html);const canon=find(doc,n=>n.name==='link'&&n.attribs.rel==='canonical');if(canon.length!==1||canon.some(n=>new URL(n.attribs.href,MORRIS_LISTING).href!==MORRIS_LISTING))throw Error('listing_structure_changed');
 const titles=find(root,n=>n.name==='h3'&&cls(n,'h5')&&cls(n,'serif'));if(!titles.length||titles.length>100)throw Error('listing_structure_changed');
 const responseHash=evidence?await hash(html):null;
 if(evidence&&(!Number.isSafeInteger(evidence.verifiedAt)||evidence.verifiedAt<0))throw Error('listing_evidence_invalid');
 const entries=[],seen=new Set();for(const title of titles){let card=title.parent;while(card&&!cls(card,'col-9'))card=card.parent;if(!card)throw Error('listing_structure_changed');
  const links=find(card,n=>n.name==='a'&&n.attribs.href),times=find(card,n=>n.name==='time');
  const urls=[...new Set(links.map(n=>{try{return morrisArticleUrl(new URL(n.attribs.href,MORRIS_LISTING).href);}catch{return null;}}).filter(Boolean))];
  if(urls.length!==1||times.length!==1)throw Error('listing_structure_changed');const url=urls[0],publishedAt=morrisDate(plain(times[0]));
  if(!publishedAt||morrisUrlDate(url)!==publishedAt||seen.has(url))throw Error('listing_structure_changed');seen.add(url);
  const entry={url,publishedAt,fingerprint:await fingerprint(plain(title),pepper)};
  if(evidence){
   const paragraphs=find(card,n=>n.name==='p'),selected=paragraphs.slice(0,3),fieldNodes=find(card,n=>['li','dt','dd'].includes(n.name)),paras=selected.map(plain),fields=fieldNodes.map(plain),trace={};
   const recovered=extractFacts(plain(title),paras,fields,url,trace);
   // Persist only extracted facts; discard the original heading/description.
   entry.facts=recovered.facts;entry.eventType=recovered.eventType;
   entry.articleType=recovered.facts?.articleType||(recovered.facts?.kind==='product'?'product_announcement':recovered.facts?.kind==='guitar_event'?'event_announcement':'unresolved');
   entry.assessment={outcome:recovered.facts?'facts_recovered':'facts_not_recovered',reason:recovered.facts?'explicit_listing_fields':'explicit_identity_or_article_type_not_recovered'};
   entry.proof={sourceId:'morris',sourceUrl:MORRIS_LISTING,articleUrl:url,publishedAt,verifiedAt:evidence.verifiedAt,extractionMethod:'morris_explicit_listing_fields',parserVersion:MORRIS_LISTING_PARSER,responseHash,canonicalBasis:'canonical',permissionRef:MORRIS_PERMISSION};
   entry.diagnostics=morrisCardDiagnostics(descriptionStructure(card,title,paragraphs,selected,fieldNodes,root),trace,recovered);
  }
  entries.push(entry);
 }return entries;
}
function eventDates(value){const m=/(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日(?:[（(][^）)]{0,5}[）)])?\s*(?:[〜～－-]\s*(?:(20\d{2})年)?\s*(?:(\d{1,2})月)?\s*(\d{1,2})日)?/.exec(value||'');
 if(!m)return null;const build=(y,mo,d)=>`${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`,start=build(m[1],m[2],m[3]),end=build(m[4]||m[1],m[5]||m[2],m[6]||m[3]);return day(start)&&day(end)&&end>=start?{eventDate:start,endDate:end}:null;}
export function morrisLabel(f,eventType){
 if(f?.evidence!=='morris_explicit_article_v1'||f.listingSource!=='morris'||!morrisArticleUrl(f.articleUrl))return null;
 if(f.kind==='morris_editorial')return morrisEditorialLabel(f,eventType);
 if(f.kind==='guitar_event'&&eventType==='guitar_event'&&f.category==='live_guitar'&&[f.eventName,f.venue].every(field)&&day(f.eventDate)&&day(f.endDate)&&f.endDate>=f.eventDate){
  if(f.eventType==='exhibition'&&f.exhibitor==='Morris Guitars'&&f.action==='exhibiting')return `Morris Guitars、「${f.eventName}」への出展を告知`;
  if(f.eventType==='competition'&&f.action==='entry_open')return `Morris Guitars、「${f.eventName}」の参加募集を開始`;
  if(f.eventType==='performance'&&field(f.performer)&&f.action==='scheduled')return `${f.performer}、「${f.eventName}」への出演を告知`;
 }
 if(f.kind==='product'&&f.category==='acoustic_guitar'&&f.brand==='Morris Guitars'&&field(f.product)&&/^[A-Za-z0-9][A-Za-z0-9 .+/_-]{1,60}$/.test(f.product)&&f.productType==='acoustic_guitar'&&['new_product','release'].includes(eventType)&&f.action===eventType){
  const qualifier={limited_edition:'の限定モデル',signature:'のシグネチャーモデル',new_color:'の新色'}[f.productEvent?.action]||'';
  if(f.announcement==='release_decided')return eventType==='new_product'?`Morris Guitars、${f.product}${qualifier}の発売決定を告知`:null;
  if(f.announcement)return null;
  return `Morris Guitars、${f.product}${qualifier}${eventType==='release'?'を発売':'を発表'}`;
 }return null;
}
export async function parseMorrisArticle(html,entry,verifiedAt,pepper){
 if(!morrisArticleUrl(entry.url)||morrisUrlDate(entry.url)!==entry.publishedAt)throw Error('facts_date_changed');
 const responseHash=await hash(html),{doc,root}=document(html),canonicalBasis=identity(doc,entry.url),titles=find(root,n=>n.name==='h2'&&cls(n,'serif'));
 if(titles.length!==1)throw Error('listing_structure_changed');const title=plain(titles[0]),paras=find(root,n=>n.name==='p').slice(0,3).map(plain);
 // Publication day is the explicitly dated listing; URL day agrees. Optional article date must agree too.
 const dates=find(root,n=>n.name==='time');if(dates.some(n=>morrisDate(plain(n))!==entry.publishedAt))throw Error('facts_date_changed');
 const titleFingerprint=await fingerprint(title,pepper),proof={sourceId:'morris',sourceUrl:entry.url,publishedAt:entry.publishedAt,verifiedAt,extractionMethod:'morris_once_only_article',parserVersion:MORRIS_PARSER,responseHash,canonicalBasis,permissionRef:MORRIS_PERMISSION};
 const fields=find(root,n=>['li','dt','dd'].includes(n.name)).map(plain);
 const {facts,eventType}=extractFacts(title,paras,fields,entry.url);
 return {facts,eventType:facts?eventType:'other',proof,fingerprint:titleFingerprint};
}

function extractFacts(title,paras,fields,url,trace=null){
 let facts=null,eventType='other';const lead=paras.join(' ');
 const excluded=/中止|延期|昨年|過去|開催しました|開催いたしました|レビュー|比較|再入荷|セール/.test(title+' '+lead);
 if(trace){trace.excludedWording=excluded;trace.branch='event';}
 if(!excluded){
  const named=[...lead.matchAll(/「([^」]{2,90})」/g)].map(m=>m[1]).find(n=>normal(title).includes(normal(n))),venueFields=fields.filter(v=>/^会場[:：]/.test(v)),dateFields=fields.filter(v=>/^開催(?:日|日時|日程)[:：]/.test(v));
  if(trace){trace.eventCandidate=!!named&&(/出展|コンテスト|コンペティション/.test(title)||venueFields.length>0||dateFields.length>0);trace.eventName=!!named;trace.venue=venueFields.length===1;trace.eventDate=dateFields.length===1&&!!eventDates(dateFields[0]);trace.eventContext=/ギター|Morris|モーリス/i.test(lead);trace.relevance=/アコースティックギター|アコギ|フィンガーピッキング/.test(title+' '+lead);}
  if(named&&venueFields.length===1&&dateFields.length===1&&/ギター|Morris|モーリス/i.test(lead)){
   const date=eventDates(dateFields[0]),venue=venueFields[0].replace(/^会場[:：]\s*/,'').split(/[〒（(]/)[0].trim();
   const exhibition=/出展(?:いたします|します|予定)/.test(lead)&&/出展/.test(title)&&/Morris|モーリス/i.test(lead);
   const contest=/コンテスト|コンペティション/.test(title)&&/参加(?:者)?募集|エントリー受付/.test(lead);
   const performerField=fields.filter(v=>/^出演[:：]/.test(v)),performance=/出演(?:します|予定)|開催(?:します|予定)/.test(lead)&&/フィンガーピッキング|アコースティック|弾き語り/.test(lead)&&performerField.length===1;
   if(trace){trace.eventAction=exhibition||contest||performance;trace.performerRequired=!exhibition&&!contest;trace.performer=performerField.length===1;trace.articleType=exhibition||contest||performance;}
   if(date&&(exhibition||contest||performance)){
    eventType='guitar_event';facts={kind:'guitar_event',category:'live_guitar',evidence:'morris_explicit_article_v1',listingSource:'morris',articleUrl:url,eventName:named,event:named,venue,...date,eventType:exhibition?'exhibition':contest?'competition':'performance',action:exhibition?'exhibiting':contest?'entry_open':'scheduled',...(exhibition?{exhibitor:'Morris Guitars'}:performance?{performer:performerField[0].replace(/^出演[:：]\s*/,'')}:{})};
   }
  }
  // Require a primary, explicitly typed model in heading + opening paragraph.
  // Related catalogues, supported equipment and incidental model lists cannot supply identity.
  const models=[...title.matchAll(/「([A-Za-z0-9][A-Za-z0-9 .+/_-]{1,60})」/g)].map(m=>m[1]);
  const model=models.length===1?models[0]:null,primary=paras.find(p=>model&&(p.includes('ギター「'+model+'」')||p.includes('ギター 「'+model+'」')||p.includes('「'+model+'」はアコースティックギター')))||'';
  if(trace){trace.productAttempted=true;trace.modelCandidate=!!model;trace.typedModelBinding=!!primary&&/アコースティックギター|エレクトリックアコースティックギター|エレアコ/.test(primary);trace.manufacturer=/Morris|モーリス/i.test(lead);if(model)trace.branch='product';}
  if(!facts&&model&&primary&&/アコースティックギター|エレクトリックアコースティックギター|エレアコ/.test(primary)&&/Morris|モーリス/i.test(lead)&&!/(?:対応|接続|保護|比較)(?:機器|対象|製品)?|アクセサリー|カタログ/.test(title)){
   // A future launch is never described as already released. Explicit announcement remains valid.
   const future=/発売予定|発売いたします|発売します|近日発売/.test(title+' '+primary),released=!future&&/発売(?:しました|いたしました|開始)|販売を開始/.test(primary),announced=/発表(?:しました|いたしました)|新(?:製品|モデル).{0,20}登場/.test(primary);
   const releaseDecided=/発売(?:が)?決定/.test(title)&&/発売(?:が)?決定/.test(primary);
   if(trace)trace.articleType=released||announced||releaseDecided||trace.articleType;
   if(released||announced||releaseDecided){eventType=released?'release':'new_product';facts={kind:'product',category:'acoustic_guitar',brand:'Morris Guitars',product:model,models:[model],productType:'acoustic_guitar',action:eventType,...(releaseDecided?{announcement:'release_decided'}:{}),evidence:'morris_explicit_article_v1',listingSource:'morris',articleUrl:url,...(/限定モデル/.test(title)?{productEvent:{action:'limited_edition'}}:/シグネチャー/.test(title)?{productEvent:{action:'signature'}}:/新色/.test(title)?{productEvent:{action:'new_color'}}:{})};}
  }
 }
 if(!facts){const editorial=extractMorrisEditorial(title,paras,trace);if(editorial){eventType='morris_editorial';facts={...editorial,evidence:'morris_explicit_article_v1',listingSource:'morris',articleUrl:url};}}
 if(trace&&facts){trace.branch=facts.kind==='product'?'product':facts.kind==='guitar_event'?'event':facts.articleType;trace.articleType=true;trace.labelUnsupported=!morrisLabel(facts,eventType);trace.originalHeadlineCollision=morrisLabel(facts,eventType)===title;}
 if(facts&&(!morrisLabel(facts,eventType)||morrisLabel(facts,eventType)===title))facts=null;
 return {facts,eventType:facts?eventType:'other'};

}
