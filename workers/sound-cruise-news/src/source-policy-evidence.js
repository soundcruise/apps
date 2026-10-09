import {parseDocument,DomUtils as D} from 'htmlparser2';
import {optOut} from './policy.js';
export const SOURCE_POLICY_PARSER='kikutani-promotion-policy-1';
const urlOK=u=>/^https:\/\/www\.kikutani\.co\.jp\/news\/[a-z0-9-]+\/$/.test(u||'');
export function sourcePolicySurface(row,source){return source?.id==='kikutani'&&row.source_id==='kikutani'&&row.event_type==='sale'&&urlOK(row.source_url)?{url:row.source_url,method:'explicit_source_policy_fields',parser:SOURCE_POLICY_PARSER}:null;}
export function sourcePolicyReason(row,now){
 let f,p;try{f=JSON.parse(row.product_facts);p=JSON.parse(row.facts_provenance);}catch{return null;}
 return row.source_id==='kikutani'&&row.event_type==='sale'&&urlOK(row.source_url)&&f?.category===row.category&&Array.isArray(p)&&f?.kind==='source_policy_evidence'&&f.articleUrl===row.source_url&&f.listingSource===row.source_id&&f.identifierBasis==='verified_source_policy_article_fields'&&f.subjectType==='woodwind_instrument'&&f.promotionType==='purchase_gift'&&['subjectType','promotionType','event_type'].every(field=>p?.some(e=>e.factField===field&&e.sourceId===row.source_id&&e.sourceUrl===row.source_url&&e.parserVersion===SOURCE_POLICY_PARSER&&e.extractionMethod==='explicit_source_policy_fields'&&Number.isSafeInteger(e.verifiedAt)&&e.verifiedAt<=now&&/^[a-f0-9]{64}$/.test(e.responseHash||'')))?'not_relevant':null;
}
export function parseSourcePolicyEvidence(html,source,row){
 if(!sourcePolicySurface(row,source))throw Error('facts_source_invalid');if(typeof html!=='string'||new TextEncoder().encode(html).length>512000)throw Error('facts_response_too_large');
 const d=parseDocument(html),find=p=>D.findAll(n=>n.name&&p(n),d.children),cls=(n,c)=>(n.attribs?.class||'').split(/\s+/).includes(c);
 if(find(n=>n.name==='meta'&&/^(robots|SoundCruiseNewsBot)$/i.test(n.attribs.name||'')).some(n=>optOut(n.attribs.content||'')))throw Error('facts_optout');
 const canon=find(n=>n.name==='link'&&n.attribs.rel==='canonical'),roots=find(n=>n.name==='article'&&cls(n,'news')&&cls(n,'inner'));
 if(canon.length!==1||canon[0].attribs.href!==row.source_url||roots.length!==1)throw Error('facts_parser_failure');
 const hidden=n=>{for(let p=n;p;p=p.parent)if(['script','style','aside','nav','footer','template','noscript'].includes(p.name)||p.attribs?.hidden!==undefined||p.attribs?.['aria-hidden']==='true'||/display\s*:\s*none|visibility\s*:\s*hidden/i.test(p.attribs?.style||''))return true;return false;};
 const root=roots[0];if(hidden(root))throw Error('facts_not_recovered');const times=D.findAll(n=>n.name==='time'&&cls(n,'news__time-time'),root.children),p=root.children.find(n=>n.name==='p'&&cls(n,'wp-block-paragraph'));
 if(times.length!==1||new Date(times[0].attribs.datetime+'T00:00:00+09:00').toISOString()!==row.published_at)throw Error('facts_date_changed');
 if(!p||hidden(p)||D.findAll(n=>n.name&&hidden(n),p.children).length)throw Error('facts_not_recovered');
 const lead=D.textContent(p).replace(/\s+/g,' ').trim();
 if(!/(?:サックス|サクソフォン|トランペット|クラリネット)(?:本体)?をご購入の方に/.test(lead)||!/プレゼントいたします/.test(lead)||/ギター|弾き語り|録音|マイク|ピックアップ/.test(lead))throw Error('facts_scope_uncertain');
 return {productFacts:{kind:'source_policy_evidence',category:row.category,subjectType:'woodwind_instrument',promotionType:'purchase_gift',identifierBasis:'verified_source_policy_article_fields',listingSource:source.id,articleUrl:row.source_url},eventType:row.event_type,publishedAt:row.published_at};
}
