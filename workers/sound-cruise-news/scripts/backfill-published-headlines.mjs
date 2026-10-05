// Explicit reviewed manifest, dry plan, expiring digest, full-row CAS, and audit only.
// No fetch/discovery, decisions, teacher signals, dates, source changes or migration.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {checkedConfig,remoteSql,sqlLiteral as q} from './remote-db.mjs';
import {hash} from '../src/policy.js';
import {publishedHeadline,publishedCorrectionStatements} from '../src/published-headline.js';
const [mode,manifestPath]=process.argv.slice(2),now=Date.now();
const path=new URL('../.local/published-headline-backfill-plan.json',import.meta.url);
if(!['plan','apply'].includes(mode))throw Error('plan <reviewed manifest> | apply');
await checkedConfig();
const snapshot=async()=>remoteSql('SELECT * FROM candidate_items ORDER BY rowid; SELECT * FROM news_decision_ledger ORDER BY rowid; SELECT * FROM news_shadow_evaluations ORDER BY rowid; SELECT * FROM source_state ORDER BY source_id; SELECT * FROM news_controls WHERE id=1; SELECT * FROM news_takedowns ORDER BY item_id; SELECT * FROM news_operator_feedback ORDER BY rowid; SELECT * FROM legacy_news_grants ORDER BY item_id;');
const gate=(row,data)=>{
 const state=data[3].results.find(s=>s.source_id===row.source_id);
 if(!data[4].results[0]?.publication_enabled||row.review_status!=='approved'||state?.takedown||state?.publication_blocked||data[5].results.some(t=>t.item_id===row.id))throw Error('published_quality_blocked');
 // Collection-disabled sources deliberately retain their existing published items.
};
if(mode==='plan'){
 if(!manifestPath)throw Error('explicit_manifest_required');
 const manifest=JSON.parse(await readFile(manifestPath,'utf8')),data=await snapshot(),rows=data[0].results;
 const approved=rows.filter(r=>r.review_status==='approved');
 if(manifest.schemaVersion!==1||manifest.purpose!=='published_headline_quality_only'||manifest.expectedPublished!==approved.length||manifest.entries.length!==approved.length||approved.length>80||new Set(manifest.entries.map(e=>e.id)).size!==approved.length)throw Error('published_manifest_coverage');
 const plans=[];
 for(const e of manifest.entries){
  const row=approved.find(r=>r.id===e.id);
  if(!row||row.source_url!==e.sourceUrl||row.source_id!==e.source||row.published_at!==e.publishedAt||row.category!==e.category||row.event_type!==e.eventType||row.label!==e.before)throw Error('published_manifest_stale');
  if(!['A','B','C','D'].includes(e.classification)||e.classification==='D'&&e.headlineQuality)throw Error('published_evidence_class');
  if(!e.headlineQuality)continue;
  gate(row,data);
  const facts={...JSON.parse(row.product_facts||'null'),headlineQuality:e.headlineQuality},label=publishedHeadline(e.headlineQuality,row);
  if(!label||label!==e.after)throw Error('published_manifest_label');
  const proof={sourceId:row.source_id,sourceUrl:row.source_url,verifiedAt:now,extractionMethod:'authorized_published_primary_review',parserVersion:'published-headline-1',factField:'headlineQuality',evidence:e.headlineQuality.evidence};
  const plan={before:row,facts,label,provenance:[...JSON.parse(row.facts_provenance||'[]'),proof],at:now,requestId:crypto.randomUUID()};
  publishedCorrectionStatements(row,plan,q);plans.push(plan);
 }
 if(!plans.length)throw Error('published_quality_no_targets');
 await mkdir(new URL('../.local/',import.meta.url),{recursive:true});
 const body={at:now,manifestHash:await hash(JSON.stringify(manifest)),plans};
 await writeFile(new URL('../.local/published-headline-backfill-before.json',import.meta.url),JSON.stringify(data),{mode:0o600});
 await writeFile(path,JSON.stringify({...body,digest:await hash(JSON.stringify(body))}),{mode:0o600});
 console.log(JSON.stringify({reviewed:manifest.entries.length,targets:plans.length,labelsChanged:plans.filter(p=>p.label!==p.before.label).length,planDigest:await hash(JSON.stringify(body))}));
}else{
 const {digest,...body}=JSON.parse(await readFile(path,'utf8'));
 if(digest!==await hash(JSON.stringify(body))||now-body.at>3600000||body.at>now||!body.plans.length||body.plans.length>80)throw Error('published_plan_expired');
 // Bounded requests. Each batch rechecks all row fields; reapplication fails closed.
 for(let offset=0;offset<body.plans.length;offset+=8){
  const plans=body.plans.slice(offset,offset+8),data=await snapshot(),rows=data[0].results;
  for(const p of plans){const row=rows.find(r=>r.id===p.before.id);if(JSON.stringify(row)!==JSON.stringify(p.before))throw Error('published_plan_changed');gate(row,data);}
  const sql=plans.flatMap(p=>publishedCorrectionStatements(p.before,p,q));
  sql.push('UPDATE news_controls SET revision=revision+1 WHERE id=1');
  sql.push(`SELECT id,label,review_status,review_revision FROM candidate_items WHERE id IN (${plans.map(p=>q(p.before.id)).join(',')})`);
  const result=await remoteSql(sql.join(';\n')+';'),after=result.at(-1).results;
  if(after.length!==plans.length||after.some(r=>r.review_status!=='approved'||r.label!==plans.find(p=>p.before.id===r.id).label||r.review_revision!==plans.find(p=>p.before.id===r.id).before.review_revision+1))throw Error('published_correction_not_applied');
  console.log(JSON.stringify({applied:offset+after.length,total:body.plans.length}));
 }
 await writeFile(new URL('../.local/published-headline-backfill-after.json',import.meta.url),JSON.stringify(await snapshot()),{mode:0o600});
}
