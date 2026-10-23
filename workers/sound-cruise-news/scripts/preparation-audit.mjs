// Authenticated read-only audit. Never contacts publishers or mutates D1.
import {writeFile} from 'node:fs/promises';
import {checkedConfig,remoteSql} from './remote-db.mjs';
import {runtimeSources,selectedSourceIds} from '../src/runtime.js';
import {preparationAudit} from '../src/preparation-audit.js';
const [daysText='30',output]=process.argv.slice(2),days=Number(daysText),now=Date.now();
if(!Number.isSafeInteger(days)||days<1||days>90)throw Error('days must be 1..90');
const config=await checkedConfig(),registry=runtimeSources(config.vars,undefined,now),sourceIds=selectedSourceIds(config.vars).filter(id=>registry.find(s=>s.id===id)?.productionEnabled);
const tables=['candidate_items','collection_runs','news_facts_rechecks','news_admin_audit','news_decision_ledger','source_health','source_state'];
const exists=await remoteSql("SELECT name FROM sqlite_master WHERE type='table' AND name='news_preparation_runs'");if(exists[0].results.length)tables.push('news_preparation_runs');
const r=await remoteSql(tables.map(t=>`SELECT * FROM ${t} ORDER BY rowid`).join(';')+';'),data=Object.fromEntries(tables.map((t,i)=>[t,r[i].results]));
const report={...preparationAudit(data,{now,days,sourceIds}),currentHealth:data.source_health,currentState:data.source_state.map(s=>({sourceId:s.source_id,disabled:!!s.disabled,lastDiscoveryAt:s.last_discovery_at,scheduledDay:s.scheduled_jst_day})),publisherRequests:0};
for(const s of report.sources){const state=data.source_state.find(r=>r.source_id===s.sourceId);s.enabledNow=!!registry.find(r=>r.id===s.sourceId)?.enabled&&!state?.disabled&&!state?.takedown&&!state?.publication_blocked;}
if(output){await writeFile(output,JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify({output,days,sourceCount:sourceIds.length,publisherRequests:0}));}else console.log(JSON.stringify(report,null,2));
