import {parseDocument,DomUtils} from 'htmlparser2';
import {hash,optOut} from './policy.js';
import {fingerprint} from './fingerprint.js';
import {morrisNoticeFacts,morrisNoticeLabel} from './morris-editorial-policy.js';
import {MORRIS_PERMISSION,morrisArticleUrl,morrisUrlDate,morrisDate} from './morris-policy.js';
export const MORRIS_PRIMARY_REVIEW='morris-primary-review-1';
export const MORRIS_PRIMARY_CHECKS=['identity','publicationDay','subject','action','explicitFields','independentLabel'];
const normalize=s=>s.normalize('NFKC').replace(/[‐‑–−]/g,'-').replace(/\s/g,'').toLowerCase();
const includes=(s,v)=>normalize(s).includes(normalize(v));
const hidden=n=>{for(let p=n;p;p=p.parent)if(['script','style','nav','footer','aside','template','noscript','iframe'].includes(p.name)||p.attribs?.hidden!==undefined||p.attribs?.['aria-hidden']==='true'||/(?:^|\s)(?:related|related-posts|recommend|sidebar)(?:\s|$)/i.test(p.attribs?.class||'')||/display\s*:\s*none|visibility\s*:\s*hidden/i.test(p.attribs?.style||''))return true;return false;};
const plain=n=>!n||hidden(n)?'':n.type==='text'?n.data:(n.children||[]).map(plain).join(' ');
const find=(root,p)=>DomUtils.findAll(n=>!!n.name&&!hidden(n)&&p(n),root.children||[]);
const cls=(n,c)=>(n.attribs?.class||'').split(/\s+/).includes(c);
const explicitDate=(text,day)=>{const [y,m,d]=day.split('-').map(Number);return new RegExp(y+'年\\s*'+m+'月\\s*'+d+'日').test(text)||text.includes(day);};
// Trusted, offline source review of an already acquired primary response. This
// does not fetch, discover, publish, or turn an AI review into a human decision.
// Inputs are explicit fact selections, never arbitrary headlines or raw text.
export async function reviewMorrisPrimary(html,entry,input,verifiedAt,pepper){
 if(typeof html!=='string'||new TextEncoder().encode(html).length>128000||!morrisArticleUrl(entry.url)||morrisUrlDate(entry.url)!==entry.publishedAt||!Number.isSafeInteger(verifiedAt))throw Error('primary_review_input_invalid');
 const doc=parseDocument(html),mains=find(doc,n=>n.name==='main');
 if(mains.length!==1||find(doc,n=>n.name==='meta'&&/^(robots|SoundCruiseNewsBot)$/i.test(n.attribs.name||'')).some(n=>optOut(n.attribs.content||'')))throw Error('primary_review_scope_invalid');
 const root=mains[0],canonical=find(doc,n=>n.name==='link'&&n.attribs.rel==='canonical'),og=find(doc,n=>n.name==='meta'&&n.attribs.property==='og:url');
 if(canonical.length>1||og.length>1||!canonical.length&&!og.length||canonical.some(n=>new URL(n.attribs.href,entry.url).href!==entry.url)||og.some(n=>n.attribs.content!==entry.url))throw Error('primary_review_identity_conflict');
 const times=find(root,n=>n.name==='time');if(times.some(n=>morrisDate(plain(n).trim())!==entry.publishedAt))throw Error('primary_review_date_conflict');
 // The first page heading, not every h2 section, identifies the reviewed article.
 // Bespoke notices may put the lead title in an emphasized paragraph instead.
 const heads=find(root,n=>n.name==='h2'&&cls(n,'h3')&&cls(n,'serif'));
 const titleNode=heads[0]||find(root,n=>n.name==='p'&&cls(n,'fz-large')&&cls(n,'fw-bold'))[0];
 const order=find(root,()=>true),start=order.indexOf(titleNode),blocks=find(root,n=>['h2','h3','h4','p','li','dt','dd','td','th'].includes(n.name)&&order.indexOf(n)>=start);
 const title=plain(titleNode).replace(/\s+/g,' ').trim(),body=blocks.map(plain).join(' ').replace(/\s+/g,' ').trim();
 if(!title||body.length>40000)throw Error('primary_review_scope_invalid');
 const facts=morrisNoticeFacts(input,entry.url,{automatic:true}),label=facts&&morrisNoticeLabel(facts,'morris_notice');
 if(!facts||!includes(body,input.subject))throw Error('primary_review_subject_unbound');
 let action=false;
 if(input.articleType==='recruitment')action=/募集|応募|エントリー/.test(title)&&/応募|申込|エントリー/.test(body)&&/締切|締め切り|締切り/.test(body);
 if(input.articleType==='event_announcement')action=/イベント|予選|大会|診断会|公演|開催/.test(title+' '+body)&&/開催日|開催日時/.test(body);
 if(input.articleType==='new_product')action=/発表|発売(?:が)?決定/.test(body)&&/モデル|ギター/.test(body);
 if(!action)throw Error('primary_review_action_unbound');
 if(/(?:募集|応募|開催|発表|発売)(?:を)?(?:中止|延期|取りやめ)|募集しません|開催しません|発表しません|発売しません/.test(title+' '+body))throw Error('primary_review_action_contradicted');
 if(['eventDate','endDate','releaseDate','deadline'].some(k=>input[k]&&!explicitDate(body,input[k]))||input.venue&&!includes(body,input.venue)||input.productType&&!includes(body,input.productType))throw Error('primary_review_field_unbound');
 if(!label||normalize(label)===normalize(title)||normalize(input.subject)===normalize(title))throw Error('primary_review_label_not_independent');
 const proof={sourceId:'morris',sourceUrl:entry.url,publishedAt:entry.publishedAt,verifiedAt,extractionMethod:'morris_system_primary_review',parserVersion:MORRIS_PRIMARY_REVIEW,responseHash:await hash(html),canonicalBasis:canonical.length?'canonical':'og:url',permissionRef:MORRIS_PERMISSION,reviewActor:'system_primary_review',primaryAuditChecks:Object.fromEntries(MORRIS_PRIMARY_CHECKS.map(k=>[k,true]))};
 return {facts,eventType:'morris_notice',proof,fingerprint:await fingerprint(title,pepper),analysis:{version:MORRIS_PRIMARY_REVIEW,articleType:input.articleType,result:'recovered',reason:'EXPLICIT_PRIMARY_FACT_REVIEW'}};
}
