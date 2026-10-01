import {MANUAL_SOURCES} from '../src/manual-sources.js';
import {operatorPlan} from '../src/admin.js';
import {runtimeSources} from '../src/runtime.js';
import {checkedConfig,remoteSql,sqlLiteral} from './remote-db.mjs';
const [command='status',action,target='global',reason='operator_stop']=process.argv.slice(2);
let sql;
if(command==='status')sql='SELECT * FROM news_controls; SELECT source_id,disabled AS collection_stopped,MAX(publication_blocked,takedown) AS publication_blocked FROM source_state ORDER BY source_id; SELECT * FROM source_health ORDER BY source_id; SELECT * FROM source_health_alerts ORDER BY occurred_at DESC LIMIT 30;';
else if(command==='candidates')sql="SELECT id,source_name,source_url,published_at,category,label,publication_decision,decision_reason,review_status FROM candidate_items ORDER BY published_at DESC LIMIT 100;";
else if(command==='runs')sql='SELECT * FROM collection_runs ORDER BY collected_at DESC LIMIT 20;';
else if(command==='control'){
 const config=await checkedConfig();
 const statements=operatorPlan({action,target,reason},Date.now(),[...runtimeSources(config.vars),...MANUAL_SOURCES]);
 // Fail closed across interrupted CLI statements. Re-enable API explicitly after a takedown.
 sql=statements.map(s=>{let i=0;return s.sql.replace(/\?/g,()=>sqlLiteral(s.args[i++]));}).join(';\n')+';';
}else throw Error('Use status | candidates | runs | control ACTION TARGET REASON');
console.log(JSON.stringify(await remoteSql(sql),null,2));
