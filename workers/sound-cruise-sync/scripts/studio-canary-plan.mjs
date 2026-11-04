// Read-only planner. Reuses the audited activation implementation; never applies SQL.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {changeStudioActivation} from '../src/studio-activation.js';
import {STUDIO_SCHEMA_SQL,STUDIO_JOURNAL_SQL} from '../src/studio-release-schema.js';
const literal=x=>x===null?'NULL':typeof x==='string'?"'"+x.replaceAll("'","''")+"'":Number.isSafeInteger(x)?String(x):(()=>{throw Error('plan-binding');})();
function render(s){let i=0;const sql=s.sql.replace(/\?/g,()=>literal(s.values[i++]));if(i!==s.values.length)throw Error('plan-binding-count');return sql;}
export async function prepareStudioCanaryPlan(db,input){
 if(!['canary','off'].includes(input.mode))throw Error('canary-or-off-only');
 const control=await db.prepare('SELECT * FROM studio_document_control WHERE id=1').first();if(control?.version!==1||!Number.isSafeInteger(control.epoch)||![0,1].includes(control.enabled))throw Error('control-state');
 const schema=(await db.prepare(STUDIO_SCHEMA_SQL).first()).encoded,journal=(await db.prepare(STUDIO_JOURNAL_SQL).first()).encoded;
 const guards=[];
 for(const t of input.targets){
  const sql="SELECT CASE WHEN EXISTS(SELECT 1 FROM sync_accounts a JOIN sync_account_devices d ON d.account_id=a.id WHERE a.id=? AND d.id=? AND a.state='active' AND a.admission_provenance='production' AND a.deleted_at IS NULL AND d.revoked_at IS NULL) THEN 1 ELSE json_extract('canary_target','$.abort') END ok";
  if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(t.datasetId))throw Error('Project UUID required');
  if((await db.prepare(sql).bind(t.accountId,t.deviceId).first()).ok!==1)throw Error('canary-target');guards.push({sql,values:[t.accountId,t.deviceId]});
 }
 let captured=null,projected=null;
 const recorder={prepare(sql){let values=[];return{sql,values,bind(...v){values=v;this.values=v;return this;},async all(){return db.prepare(sql).bind(...values).all();},async first(){if(projected&&sql==='SELECT * FROM studio_document_activation WHERE id=1')return projected;return db.prepare(sql).bind(...values).first();}};},async batch(statements){if(captured)throw Error('activation-plan-shape');captured=statements;const [revision,mode,targets_json,operation_id,record_hash]=statements.at(-1).values;projected={id:1,revision,mode,targets_json,operation_id,record_hash};return[];}};
 const result=await changeStudioActivation(recorder,input);
 const preflight={sql:`SELECT CASE WHEN (SELECT encoded FROM (${STUDIO_SCHEMA_SQL}))=? AND (SELECT encoded FROM (${STUDIO_JOURNAL_SQL}))=? AND EXISTS(SELECT 1 FROM studio_document_control WHERE id=1 AND epoch=? AND enabled=? AND version=1) THEN 1 ELSE json_extract('canary_preflight','$.abort') END`,values:[schema,journal,control.epoch,control.enabled]};
 const statements=[preflight,...guards,...captured,{sql:'UPDATE studio_document_control SET enabled=? WHERE id=1',values:[input.mode==='canary'?1:0]}];
 const sql=statements.map(s=>render(s)+';').join('\n')+'\n';
 return{sql,report:{type:'studio-canary-offline-plan-v1',mode:input.mode,revision:result.revision,targets:input.targets.length,statements:statements.length,sqlSha256:createHash('sha256').update(sql).digest('hex'),remoteWrites:0}};
}
async function main(){
 const args=Object.fromEntries(process.argv.slice(2).reduce((rows,x,i,a)=>i%2===0?[...rows,[x.replace(/^--/,''),a[i+1]]]:rows,[]));
 if(!args.input||!args.out||!args.wrangler||!args.config||args.database!=='sound-cruise-sync')throw Error('private --input --out --wrangler --config --database sound-cruise-sync required');
 const input=JSON.parse(fs.readFileSync(args.input,'utf8'));
 const db={prepare(sql){let values=[];return{bind(...v){values=v;return this;},async all(){if(!sql.trim().startsWith('SELECT'))throw Error('read-only-planner');const command=render({sql,values}),raw=execFileSync(process.execPath,[args.wrangler,'d1','execute',args.database,'--remote','--config',path.resolve(args.config),'--command',command,'--json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});const r=JSON.parse(raw);if(!Array.isArray(r)||r.some(x=>!x.success))throw Error('read-failed');return{results:r.flatMap(x=>x.results)};},async first(){return(await this.all()).results[0]??null;}};}};
 const p=await prepareStudioCanaryPlan(db,input);fs.mkdirSync(args.out,{recursive:true,mode:0o700});fs.writeFileSync(path.join(args.out,'activation.sql'),p.sql,{mode:0o600,flag:'wx'});fs.writeFileSync(path.join(args.out,'PLAN.json'),JSON.stringify(p.report,null,2)+'\n',{mode:0o600,flag:'wx'});console.log(JSON.stringify(p.report));
}

if(process.argv[1]===fileURLToPath(import.meta.url))main().catch(()=>{console.error('canary-plan-failed: no SQL applied; inspect private input and read-only preconditions');process.exitCode=1;});
