// A source-bound review is editorial evidence, never evidence of a product launch.
import {parseDocument,DomUtils as D} from 'htmlparser2';
import {shimamuraProductSurface} from './shimamura-product-evidence.js';
import {optOut} from './policy.js';
export const SHIMAMURA_REVIEW_PARSER='shimamura-review-fields-1';
const cls=(n,c)=>(n?.attribs?.class||'').split(/\s+/).includes(c);
const hidden=n=>{for(let p=n;p;p=p.parent)if(['script','style','aside','nav','footer','template','noscript'].includes(p.name)||p.attribs?.hidden!==undefined||p.attribs?.['aria-hidden']==='true'||/display\s*:\s*none|visibility\s*:\s*hidden/i.test(p.attribs?.style||'')||/related/.test(p.attribs?.class||''))return true;return false;};
const find=(n,p)=>D.findAll(x=>x.name&&!hidden(x)&&p(x),n.children||[]);
const plain=n=>D.textContent(n).replace(/\s+/g,' ').trim();
export function shimamuraReviewSurface(row,source){const s=shimamuraProductSurface(row,source);return s&&['review','product_article'].includes(row.event_type)?{...s,method:'explicit_product_article_fields',parser:SHIMAMURA_REVIEW_PARSER}:null;}
export function validatedShimamuraReview(f){
 return !!f&&f.kind==='product_article'&&f.listingSource==='shimamura'&&/^https:\/\/www\.shimamura\.co\.jp\/update\/amp-effector\/20\d{2}\/\d{2}\/[1-9]\d*\/$/.test(f.articleUrl||'')&&f.identifierBasis==='verified_product_article_fields'&&f.articleType==='review'&&f.theme==='guitar_tone'&&f.relevance===f.theme&&f.category==='amps_effects'&&f.productType==='multi_effect_pedal'&&f.version===null&&!f.scopeUncertain&&!f.productEvent&&!f.releaseEvent&&/^[A-Za-z][A-Za-z0-9 .&'-]{1,40}$/.test(f.brand||'')&&/^[A-Z0-9][A-Za-z0-9 -]{1,50}$/.test(f.product||'')&&Array.isArray(f.models)&&f.models.length===1&&f.models[0]===f.product&&Array.isArray(f.components)&&f.components.length===1&&f.components[0].model===f.product&&f.components[0].role==='product'&&f.articleEvidence?.basis==='explicit_editorial_article_fields'&&f.articleEvidence.subject==='structured_product_sections'&&f.articleEvidence.substance===f.theme;
}
export function parseShimamuraReviewEvidence(html,source,row){
 if(!shimamuraReviewSurface(row,source))throw Error('facts_source_invalid');if(typeof html!=='string'||new TextEncoder().encode(html).length>512000)throw Error('facts_response_too_large');
 const doc=parseDocument(html),canon=find(doc,n=>n.name==='link'&&n.attribs.rel==='canonical'),heads=find(doc,n=>n.name==='h1'&&cls(n.parent,'mb-80')),roots=find(doc,n=>cls(n,'p-content')),dates=find(doc,n=>n.name==='time'&&plain(n.parent).startsWith('公開：'));
 if(find(doc,n=>n.name==='meta'&&/^(robots|SoundCruiseNewsBot)$/i.test(n.attribs.name||'')).some(n=>optOut(n.attribs.content||'')))throw Error('facts_optout');
 if(canon.length!==1||canon[0].attribs.href!==row.source_url||heads.length!==1||roots.length!==1||dates.length!==1)throw Error('facts_parser_failure');
 if(new Date(dates[0].attribs.datetime+'T00:00:00+09:00').toISOString()!==row.published_at)throw Error('facts_date_changed');
 const title=plain(heads[0]),subject=/^【実機レビュー】([^｜|]{3,100})(?:｜|\|)/.exec(title);
 if(!subject||/再入荷|中古|セール|特価|比較レビュー|PR記事|記事広告/.test(title))throw Error('facts_scope_uncertain');
 const root=roots[0],ps=root.children.filter(n=>n.name==='p'&&cls(n,'wp-block-paragraph')&&!hidden(n)).slice(0,4).map(plain),intro=ps.join(' '),hs=find(root,n=>/^h[23]$/.test(n.name)).map(plain);
 const matches=[...new Set([...intro.matchAll(/「([A-Z0-9][A-Za-z0-9 -]{1,50})(?=」|（)/g)].map(m=>m[1]))].filter(m=>subject[1].endsWith(' '+m));
 if(matches.length!==1)throw Error('facts_identity_changed');const model=matches[0],brand=subject[1].slice(0,-model.length-1);
 if(!intro.includes(brand)||!intro.includes('「'+model)||!/マルチエフェクター/.test(intro)||!/実機をお借り|実機で|実際に演奏/.test(intro)||!hs.some(h=>h===brand+' '+model+' の概要')||hs.filter(h=>/ポイント|インプレッション|試奏|音作り/.test(h)).length<2)throw Error('facts_not_recovered');
 const f={kind:'product_article',articleType:'review',brand,product:model,models:[model],components:[{model,role:'product'}],version:null,category:'amps_effects',productType:'multi_effect_pedal',identifierBasis:'verified_product_article_fields',listingSource:source.id,articleUrl:row.source_url,theme:'guitar_tone',relevance:'guitar_tone',articleEvidence:{basis:'explicit_editorial_article_fields',subject:'structured_product_sections',substance:'guitar_tone'},...(/機材提供/.test(intro)?{editorialNotice:'equipment_provided'}:{})};
 if(!validatedShimamuraReview(f))throw Error('facts_not_recovered');return {productFacts:f,eventType:'product_article',publishedAt:row.published_at};
}
