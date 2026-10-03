// One-time authorized article verification; never called by scheduled collection.
import {parseDocument,DomUtils} from 'htmlparser2';
import {explicitProductAction,validatedProductEvent} from './product-event.js';
import {validatedProductFacts,factualLabel,allowedArticlePath} from './metadata.js';
import {optOut,sourceUrl} from './policy.js';
const hidden=n=>{for(let p=n;p;p=p.parent)if(['script','style','nav','footer','header','aside','template','noscript'].includes(p.name)||p.attribs?.hidden!==undefined||p.attribs?.['aria-hidden']==='true'||/display\s*:\s*none|visibility\s*:\s*hidden/i.test(p.attribs?.style||''))return true;return false;};
const text=n=>hidden(n)?'':n.type==='text'?n.data:(n.children||[]).map(text).join('');
const plain=n=>text(n).replace(/\s+/g,' ').trim();
const find=(n,p)=>DomUtils.findAll(x=>!!x.name&&!hidden(x)&&p(x),n.children||[]);
const norm=s=>s.normalize('NFKC').replace(/[™®\s]/g,'').toLowerCase();
export function verifiedArticleEvent(html,row,source){
 if(!['shimamura','ikebe'].includes(source?.id)||row.source_id!==source.id||sourceUrl(row.source_url,source)!==row.source_url||!allowedArticlePath(row.source_url,source)||row.review_status!=='approved'||!['new_product','release'].includes(row.event_type))throw Error('event_correction_scope');
 const facts=JSON.parse(row.product_facts||'null');
 if(!validatedProductFacts(facts)||facts.productEvent)throw Error('event_correction_identity');
 if(typeof html!=='string'||new TextEncoder().encode(html).length>512000)throw Error('event_correction_size');
 const doc=parseDocument(html);
 if(find(doc,n=>n.name==='meta'&&/robots/i.test(n.attribs.name||'')&&optOut(n.attribs.content||'')).length)throw Error('event_correction_optout');
 const dates=find(doc,n=>n.name==='time'&&(source.id==='shimamura'?plain(n.parent).startsWith('公開：'):(n.attribs.class||'').split(/\s+/).includes('sub_info_date'))),day=new Date(Date.parse(row.published_at)+9*3600000).toISOString().slice(0,10);
 if(dates.length!==1||!String(dates[0].attribs.datetime||'').startsWith(day))throw Error('event_correction_date:'+row.source_url+':expected='+day+':found='+dates.map(n=>n.attribs.datetime).join(','));
 const titles=find(doc,n=>n.name==='h1'&&plain(n));
 if(!titles.length||titles.length>4)throw Error('event_correction_title');
 const bodies=find(doc,n=>source.id==='shimamura'?n.name==='article':(n.attribs.class||'').split(/\s+/).includes('main_wrap'));
 if(bodies.length!==1)throw Error('event_correction_body');
 const heads=find(bodies[0],n=>['h1','h2'].includes(n.name)).map(plain);
 const primary=plain(titles[0]),identity=norm([primary,...heads].join(' '));
 if(!facts.brand||!norm(primary).includes(norm(facts.brand)))throw Error('event_correction_brand_missing');
 if(!facts.product.split(/\s*\/\s*/).every(p=>identity.includes(norm(p))))throw Error('event_correction_product_missing');
 // Only the primary title or first article lead; related links and specs cannot
 // supply the event. The actual product headings above bind it to this article.
 const lead=plain(find(bodies[0],n=>n.name==='p')[0]||{});
 const event=explicitProductAction(primary)||explicitProductAction(lead);
 if(!event)throw Error('event_correction_no_explicit_event');
 const productEvent={...event,basis:'verified_primary_article'};
 const refined={...facts,productEvent};
 return {facts:refined,label:factualLabel(refined,row.event_type)};
}
export function eventCorrectionStatements(row,plan,q){
 if(!validatedProductEvent(plan.facts.productEvent)||factualLabel(plan.facts,row.event_type)!==plan.label||JSON.stringify({...plan.facts,productEvent:undefined})!==JSON.stringify(JSON.parse(row.product_facts)))throw Error('event_correction_patch');
 const cas=Object.keys(row).map(k=>`"${k}" IS ${q(row[k])}`).join(' AND ');
 return [
  `UPDATE candidate_items SET product_facts=${q(JSON.stringify(plan.facts))},label=${q(plan.label)},facts_provenance=${q(JSON.stringify(plan.provenance))},review_revision=review_revision+1 WHERE ${cas} AND review_status='approved' AND NOT EXISTS(SELECT 1 FROM news_takedowns WHERE item_id=${q(row.id)})`,
  `INSERT INTO news_admin_audit(id,action,target,occurred_at,reason_code) SELECT ${q(plan.requestId)},'product-event-correction',${q(row.id)},${plan.at},'verified_primary_event_only' WHERE changes()=1`
 ];
}
