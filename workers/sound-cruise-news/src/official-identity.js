// Registered authorities are distinct from collection sources. No product whitelist,
// search crawler, fuzzy model matching, publisher prose or images are persisted.
import {validReleasePeriod} from './headline-evidence.js';
import {parseDocument,DomUtils} from 'htmlparser2';
import {boundedFetch,robotsPolicy,robotsEvidence,optOut,hash,BOT,DAY} from './policy.js';
export const IDENTITY_AUTHORITIES=Object.freeze([
 Object.freeze({origin:'https://h-resolution.com',path:'^/product/[a-z0-9-]+/$',brands:['MOTU'],type:'official_distributor_product',robotsHash:'robots-v1:bfc3c0887ef401dd0d637891db5e7d4406f3a43edcebb99f6f7900e2463dd7a3'})
]);
const rank={official_manufacturer_product:1,official_distributor_product:2,official_manufacturer_press:3};
const name=s=>typeof s==='string'&&s.length>=2&&s.length<=100&&/^[A-Za-z0-9][A-Za-z0-9 .&+()'/-]*$/.test(s)&&! /\b(?:ignore|instruction|prompt|script)\b/i.test(s);
const hidden=n=>{for(let p=n;p;p=p.parent)if(['script','style','nav','aside','footer','template','noscript'].includes(p.name)||p.attribs?.hidden!==undefined||p.attribs?.['aria-hidden']==='true'||/display\s*:\s*none|visibility\s*:\s*hidden/i.test(p.attribs?.style||''))return true;return false;};
const text=n=>hidden(n)?'':n.type==='text'?n.data:(n.children||[]).map(text).join(' ');
const plain=n=>text(n).replace(/[®™]/g,'').replace(/\s+/g,' ').trim();
const find=(n,p)=>DomUtils.findAll(x=>!!x.name&&!hidden(x)&&p(x),n.children||[]);
const word=(s,v)=>new RegExp('(?:^|[^A-Za-z0-9])'+v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?=$|[^A-Za-z0-9])','i').test(s);
const unsafe=/\b(?:comparison|review|restock|sale)\b|比較|レビュー|再入荷|関連商品|参考製品|付属品|対応(?:製品|機種)|旧製品|以前|かつて|セール|例えば|ではない|かもしれ/;
export function identityAuthority(url,authorities=IDENTITY_AUTHORITIES){
 try{const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash||u.href!==url)return null;
 return authorities.find(a=>a.origin===u.origin&&rank[a.type]&&new RegExp(a.path).test(u.pathname))||null;}catch{return null;}
}
export function sourceIdentityContext(html){
 const doc=parseDocument(html),roots=find(doc,n=>(n.attribs.class||'').split(/\s+/).includes('p-content'));
 if(roots.length!==1)throw Error('facts_identity_changed');
 const paragraphs=roots[0].children.filter(n=>n.name==='p'&&(n.attribs.class||'').split(/\s+/).includes('wp-block-paragraph')&&!hidden(n)).map(plain).filter(p=>p!=='目次に戻る').slice(0,4);
 const title=find(doc,n=>n.name==='h1').map(plain);if(title.length!==1||unsafe.test(title[0]))throw Error('facts_scope_uncertain');
 const launch=paragraphs[0];if(!launch||unsafe.test(launch)||!/(?:発売します|登場します|発表)/.test(launch))throw Error('facts_event_missing');
 const models=[...launch.matchAll(/「([^」]{2,100})」/g)].map(m=>m[1]).filter(name);
 const brand=/^([A-Za-z][A-Za-z0-9 .&'-]{1,60})(?:（[^）]*）)?(?:が|から|より)/.exec(launch)?.[1]?.trim();
 const links=find(roots[0],n=>n.name==='a'&&n.attribs.href).map(n=>({url:n.attribs.href,label:plain(n)}));
 return {paragraphs,title:title[0],models,brand,links};
}
export function parseOfficialIdentity(html,url,now,authorities=IDENTITY_AUTHORITIES){
 const authority=identityAuthority(url,authorities);if(!authority||typeof html!=='string'||new TextEncoder().encode(html).length>1000000)throw Error('facts_official_scope');
 const doc=parseDocument(html);if(find(doc,n=>n.name==='meta'&&/^(robots|SoundCruiseNewsBot)$/i.test(n.attribs.name||'')).some(n=>optOut(n.attribs.content||'')))throw Error('facts_official_optout');
 const canonical=find(doc,n=>n.name==='link'&&n.attribs.rel==='canonical');if(canonical.length!==1||canonical[0].attribs.href!==url)throw Error('facts_official_identity_missing');
 const products=[];const visit=v=>{if(!v||typeof v!=='object')return;if(Array.isArray(v)){v.forEach(visit);return;}if(v['@type']==='Product')products.push(v);if(v['@graph'])visit(v['@graph']);};
 for(const script of DomUtils.findAll(n=>n.name==='script'&&n.attribs?.type==='application/ld+json',doc.children))try{visit(JSON.parse(DomUtils.textContent(script)));}catch{}
 if(products.length!==1)throw Error('facts_official_identity_missing');const p=products[0],brand=typeof p.brand==='string'?p.brand:p.brand?.name,product=p.name;
 if(!name(brand)||!name(product)||!authority.brands.includes(brand)||p.url!==url)throw Error('facts_official_identity_missing');
 const heads=find(doc,n=>/^h[12]$/.test(n.name)),h1=heads.filter(n=>n.name==='h1');
 if(h1.length!==1||![product,product+' New'].includes(plain(h1[0]))||!heads.some(n=>plain(n)===product))throw Error('facts_official_identity_missing');
 // Only the product's own heading/lead, never recommendations or schema offers.
 const scope=h1[0].parent?.parent,lead=find(scope,n=>n.name==='p'||n.name==='h3').map(plain).filter(Boolean).slice(0,6);
 const productType=lead.some(s=>/オーディオ[・ ]?インターフェ[イー]ス/.test(s))?'audio_interface':null;
 const periods=[...new Set(lead.flatMap(s=>[...s.matchAll(/(20\d{2})年\s*(\d{1,2})月\s*(上旬|中旬|下旬)発売予定/g)].map(m=>JSON.stringify({year:Number(m[1]),month:Number(m[2]),part:({上旬:'early',中旬:'mid',下旬:'late'})[m[3]]}))))];
 if(periods.length>1)throw Error('facts_official_identity_conflict');
 return {brand,product,authorityType:authority.type,officialUrl:url,verifiedAt:now,...(productType?{productType}:{}),...(periods.length===1?{releasePeriod:JSON.parse(periods[0])}:{})};
}
export function resolveOfficialIdentity(context,evidence,sourceUrl){
 if(!evidence.length)throw Error('facts_official_identity_missing');
 if(new Set(evidence.map(e=>JSON.stringify([e.brand,e.product,e.productType||null,e.releasePeriod||null]))).size!==1)throw Error('facts_official_identity_conflict');
 const e=[...evidence].sort((a,b)=>rank[a.authorityType]-rank[b.authorityType])[0];
 const bound=context.paragraphs.filter(s=>!unsafe.test(s)&&word(s,e.product));
 if(bound.length<2||!bound.some(s=>word(s,e.brand))||context.models.length!==1)throw Error('facts_identity_changed');
 return {...e,resolved_by:'official_identity_recovery',sourceUrl,previousValues:{brands:context.brand&&context.brand!==e.brand?[context.brand]:[],models:context.models.filter(m=>m!==e.product)}};
}
export function validOfficialIdentity(e,sourceUrl,brand,product,authorities=IDENTITY_AUTHORITIES){
 const a=e&&identityAuthority(e.officialUrl,authorities);return !!a&&Object.keys(e).every(k=>['brand','product','authorityType','officialUrl','verifiedAt','productType','releasePeriod','responseHash','resolved_by','sourceUrl','previousValues'].includes(k))&&(!e.productType||e.productType==='audio_interface')&&(!e.releasePeriod||validReleasePeriod(e.releasePeriod))&&e.resolved_by==='official_identity_recovery'&&e.authorityType===a.type&&a.brands.includes(e.brand)&&e.brand===brand&&e.product===product&&name(product)&&e.sourceUrl===sourceUrl&&Number.isSafeInteger(e.verifiedAt)&&e.verifiedAt>0&&/^[a-f0-9]{64}$/.test(e.responseHash||'')&&e.previousValues&&Object.keys(e.previousValues).every(k=>['brands','models'].includes(k))&&['brands','models'].every(k=>Array.isArray(e.previousValues[k])&&e.previousValues[k].length<=4&&e.previousValues[k].every(name));
}
async function officialEvidence(store,url,now,{fetcher,sleep}){
 const a=identityAuthority(url);if(!a)throw Error('facts_official_scope');const key='official-identity:'+a.origin;
 const prior=await store.db.prepare('SELECT * FROM news_facts_sources WHERE source_id=?').bind(key).first();
 if(prior?.checked_at>now-DAY){if(prior.lease_until>now)throw Error('facts_official_busy');const e=JSON.parse(prior.items_json||'[]')[0];if(e?.officialUrl===url)return e;throw Error('facts_official_daily_budget');}
 const token=crypto.randomUUID(),claim=await store.db.prepare(`INSERT INTO news_facts_sources(source_id,lease_token,lease_until,checked_at,outcome) VALUES(?,?,?,?,'in_progress') ON CONFLICT(source_id) DO UPDATE SET lease_token=excluded.lease_token,lease_until=excluded.lease_until,checked_at=excluded.checked_at,outcome='in_progress',items_json=NULL WHERE lease_until<=? AND checked_at<=?`).bind(key,token,now+60000,now,now,now-DAY).run();
 if(claim.meta.changes!==1)throw Error('facts_official_busy');let e=null;
 try{
  const robot=await boundedFetch(a.origin+'/robots.txt',{fetcher,maxBytes:512000}),r=robotsPolicy(robot.text,{baseUrl:a.origin+'/',robotsUrl:a.origin+'/robots.txt'},robot.status);
  if(!(await robotsEvidence(robot.text)).matches(a.robotsHash)||r.isAllowed(url,BOT)!==true)throw Error('facts_official_robots');
  const delay=Math.max(1000,(r.getCrawlDelay(BOT)||0)*1000);if(delay>10000)throw Error('facts_official_robots');await sleep(delay);
  const response=await boundedFetch(url,{fetcher,maxBytes:1000000});
  if(response.status!==200||!/text\/html/i.test(response.headers.get('content-type')||'')||optOut(response.headers.get('x-robots-tag')||''))throw Error('facts_official_unavailable');
  e={...parseOfficialIdentity(response.text,url,now),responseHash:await hash(response.text)};response.text='';return e;
 }finally{await store.db.prepare('UPDATE news_facts_sources SET lease_until=0,outcome=?,items_json=? WHERE source_id=? AND lease_token=?').bind(e?'verified_official_identity':'facts_official_unavailable',JSON.stringify(e?[e]:[]),key,token).run();}
}
export async function recoverOfficialIdentity(store,html,row,now,{fetcher=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 const context=sourceIdentityContext(html),hint=await store.db.prepare('SELECT items_json FROM news_facts_sources WHERE source_id=?').bind('official-identity-hint:'+row.id).first();
 const h=JSON.parse(hint?.items_json||'[]').filter(h=>h.candidateId===row.id&&h.sourceUrl===row.source_url).map(h=>h.officialUrl);
 const urls=[...new Set([...h,...context.links.filter(l=>context.paragraphs.some(p=>!unsafe.test(p)&&word(p,l.label))).map(l=>l.url)])].filter(u=>identityAuthority(u));
 // More than two authorities needs manual review; never silently ignore conflicts.
 if(urls.length>2)throw Error('facts_official_scope');const evidence=[];
 for(const url of urls)evidence.push(await officialEvidence(store,url,now,{fetcher,sleep}));
 return resolveOfficialIdentity(context,evidence,row.source_url);
}
