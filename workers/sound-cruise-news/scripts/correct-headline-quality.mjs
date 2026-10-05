// Explicit operator-authorized, one-time headline/facts correction. No teacher signal.
import {readFile,writeFile} from 'node:fs/promises';
import {checkedConfig,remoteSql,sqlLiteral as q} from './remote-db.mjs';
import {runtimeSources} from '../src/runtime.js';
import {legalGate} from '../src/registry.js';
import {boundedFetch,robotsPolicy,BOT,hash,optOut,sourceUrl} from '../src/policy.js';
import {verifiedHeadlineCorrection,headlineCorrectionStatements} from '../src/headline-correction.js';
const [mode,...urls]=process.argv.slice(2),now=Date.now();
const path=new URL('../.local/headline-quality-correction.json',import.meta.url);
if(!['plan','apply'].includes(mode))throw Error('plan <explicit article URLs> | apply');
const config=await checkedConfig(),registry=runtimeSources(config.vars,undefined,now);
const data=await remoteSql('SELECT * FROM candidate_items ORDER BY rowid; SELECT * FROM source_state; SELECT * FROM news_controls WHERE id=1;');
const [rows,states,controls]=data.map(d=>d.results);
const gate=row=>{const source=registry.find(s=>s.id===row.source_id),s=states.find(s=>s.source_id===row.source_id)||{};
 if(!controls[0].publication_enabled||sourceUrl(row.source_url,source)!==row.source_url||legalGate(source,{disabled:!!s.disabled||!!s.takedown,publicationBlocked:!!s.publication_blocked,backoffUntil:s.backoff_until,failures:s.failures,nextAt:s.next_at},now,'production',registry,{requestMode:'operator_validation'}))throw Error('headline_source_gate');return source;};
if(mode==='plan'){
 if(!urls.length||urls.length>8||new Set(urls).size!==urls.length)throw Error('explicit_targets_required');
 const plans=[],robots=new Map();
 for(const url of urls){
  const matches=rows.filter(r=>r.source_url===url);if(matches.length!==1)throw Error('headline_target_ambiguous');
  const row=matches[0],source=gate(row);
  if(!robots.has(source.id)){
   const r=await boundedFetch(source.robotsUrl,{maxBytes:512000}),rp=robotsPolicy(r.text,source,r.status),state=states.find(s=>s.source_id===source.id);
   if(state?.robots_hash&&state.robots_hash!==await hash(r.text))throw Error('headline_robots_changed');robots.set(source.id,rp);
  }
  const rp=robots.get(source.id);if(rp.isAllowed(url,BOT)!==true)throw Error('headline_robots_disallow');
  const delay=Math.max(1200,(rp.getCrawlDelay(BOT)||0)*1000);if(delay>10000)throw Error('headline_crawl_delay_review');await new Promise(r=>setTimeout(r,delay));
  const response=await boundedFetch(url,{maxBytes:512000});
  if(response.status!==200||!/text\/html/i.test(response.headers.get('content-type')||'')||optOut(response.headers.get('x-robots-tag')||''))throw Error('headline_article_unavailable');
  const result=verifiedHeadlineCorrection(response.text,row,source),responseHash=await hash(response.text);response.text='';
  const proof={sourceId:source.id,sourceUrl:url,verifiedAt:now,extractionMethod:'authorized_primary_headline_correction',parserVersion:'headline-evidence-1',responseHash,factField:'headlineEvidence'};
  plans.push({before:row,...result,provenance:[...JSON.parse(row.facts_provenance||'[]'),proof],at:now,requestId:crypto.randomUUID()});
 }
 const body={at:now,plans};await writeFile(path,JSON.stringify({...body,digest:await hash(JSON.stringify(body))}),{mode:0o600});
 console.log(JSON.stringify(plans.map(p=>({id:p.before.id,old:p.before.label,label:p.label,type:p.facts.productType,releaseEvent:p.facts.releaseEvent}))));
}else{
 const {digest,...body}=JSON.parse(await readFile(path,'utf8'));
 if(digest!==await hash(JSON.stringify(body))||now-body.at>3600000||body.at>now||!body.plans.length||body.plans.length>8)throw Error('headline_plan_expired');
 for(const p of body.plans){const current=rows.find(r=>r.id===p.before.id);if(JSON.stringify(current)!==JSON.stringify(p.before))throw Error('headline_plan_changed');gate(current);}
 const sql=[];
 for(const p of body.plans){sql.push(...headlineCorrectionStatements(p.before,p,q));}
 // Refresh all public cache keys. No approve/reject, Ledger, Shadow, date or taxonomy writes.
 sql.push('UPDATE news_controls SET revision=revision+1 WHERE id=1');
 sql.push(`SELECT id,label,review_status,review_revision FROM candidate_items WHERE id IN (${body.plans.map(p=>q(p.before.id)).join(',')})`);
 const result=await remoteSql(sql.join(';\n')+';');
 const after=result.at(-1).results;
 if(after.length!==body.plans.length||after.some(r=>r.review_status!=='approved'||r.label!==body.plans.find(p=>p.before.id===r.id).label||r.review_revision!==body.plans.find(p=>p.before.id===r.id).before.review_revision+1))throw Error('headline_correction_not_applied');
 console.log(JSON.stringify(after));
}
