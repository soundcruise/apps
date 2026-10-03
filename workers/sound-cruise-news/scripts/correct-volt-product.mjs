// Authorized one-time facts correction. No approval, classification or schema changes.
import {readFile,writeFile} from 'node:fs/promises';
import {remoteSql,sqlLiteral as q} from './remote-db.mjs';
import {legalGate} from '../src/registry.js';
import {runtimeSources} from '../src/runtime.js';
import {boundedFetch,robotsPolicy,BOT,hash,optOut} from '../src/policy.js';
import {correctedVoltFacts,VOLT_CORRECTION_URL,correctionInsertSql} from '../src/product-name-correction.js';
import {factualTopicKey} from '../src/metadata.js';
const [mode]=process.argv.slice(2),path=new URL('../.local/volt-correction.json',import.meta.url),now=Date.now();
if(!['plan','apply'].includes(mode))throw Error('plan | apply');
const config=JSON.parse(await readFile(new URL('../wrangler.production.jsonc',import.meta.url),'utf8'));
const registry=runtimeSources(config.vars,undefined,now),source=registry.find(s=>s.id==='ikebe');
const data=await remoteSql(`SELECT * FROM candidate_items WHERE source_url=${q(VOLT_CORRECTION_URL)}; SELECT * FROM source_state WHERE source_id='ikebe'; SELECT * FROM news_controls WHERE id=1;`);
if(data[0].results.length!==1)throw Error('candidate_ambiguous');
const row=data[0].results[0],state=data[1].results[0],controls=data[2].results[0];
if(!controls.collection_enabled||legalGate(source,{disabled:!!state.disabled||!!state.takedown,publicationBlocked:!!state.publication_blocked,backoffUntil:state.backoff_until,failures:state.failures,nextAt:state.next_at},now,'production',registry,{requestMode:'operator_validation'}))throw Error('source_gate');
if(mode==='plan'){
 const robot=await boundedFetch(source.robotsUrl,{maxBytes:512000}),robots=robotsPolicy(robot.text,source,robot.status),robotHash=await hash(robot.text);
 if(state.robots_hash&&state.robots_hash!==robotHash)throw Error('robots_changed');
 if(robots.isAllowed(VOLT_CORRECTION_URL,BOT)!==true)throw Error('robots_disallow');
 const delay=Math.max(1000,(robots.getCrawlDelay(BOT)||0)*1000);if(delay>10000)throw Error('crawl_delay_review');await new Promise(r=>setTimeout(r,delay));
 const response=await boundedFetch(VOLT_CORRECTION_URL,{maxBytes:512000});
 if(response.status!==200||!/text\/html/i.test(response.headers.get('content-type')||'')||optOut(response.headers.get('x-robots-tag')||''))throw Error('article_unavailable');
 const {facts,label}=correctedVoltFacts(response.text,row),responseHash=await hash(response.text);
 response.text='';
 const provenance=['product','brand','event_type'].map(factField=>({sourceId:source.id,sourceUrl:VOLT_CORRECTION_URL,verifiedAt:now,extractionMethod:'authorized_primary_product_correction',parserVersion:'quoted-generation-1',responseHash,factField}));
 const patch={product_facts:JSON.stringify(facts),category:row.category,event_type:row.event_type,label,topic_key:factualTopicKey(facts,row.event_type),event_ends_at:row.event_ends_at};
 const plan={at:now,before:row,patch,provenance,requestId:crypto.randomUUID()};
 await writeFile(path,JSON.stringify({...plan,digest:await hash(JSON.stringify(plan))}),{mode:0o600});
 console.log(JSON.stringify({mode,id:row.id,oldProduct:JSON.parse(row.product_facts).product,facts,label,provenance,rawCategoryPreserved:patch.category===row.category}));
}else{
 const {digest,...plan}=JSON.parse(await readFile(path,'utf8'));
 if(digest!==await hash(JSON.stringify(plan))||now-plan.at>3600000||plan.at>now||JSON.stringify(row)!==JSON.stringify(plan.before))throw Error('correction_plan_changed');
 if(plan.patch.category!==row.category||plan.patch.label!=='Universal Audio、Volt Gen 2を発売'||JSON.parse(plan.patch.product_facts).product!=='Volt Gen 2')throw Error('correction_plan_invalid');
 const sql=correctionInsertSql(row,plan,digest,now,q)+`SELECT product_facts,label,category,review_status,review_revision,facts_provenance FROM candidate_items WHERE id=${q(row.id)};`;
 const result=await remoteSql(sql),after=result[1].results[0];
 if(after.label!==plan.patch.label||after.category!==row.category||after.review_revision!==row.review_revision+1)throw Error('correction_not_applied');
 console.log(JSON.stringify({mode,...after}));
}
