// Offline structural preflight/artifact generator. Never connects to D1 or deploys.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {studioReleasePlan,STUDIO_SCHEMA_SQL,STUDIO_JOURNAL_SQL,STUDIO_RELEASE_ID} from '../src/studio-release-schema.js';

const hash=x=>createHash('sha256').update(x).digest('hex');
const literal=x=>typeof x==='string'?"'"+x.replaceAll("'","''")+"'":Number.isSafeInteger(x)?String(x):(()=>{throw Error('unsupported-plan-binding');})();
export async function prepareStudioRelease(metadata){
 if(!Array.isArray(metadata?.schema)||!Array.isArray(metadata?.journal))throw Error('structural-metadata-required');
 const schema=metadata.schema.map(r=>{
  if(Object.keys(r).sort().join('|')!=='name|sql|type'||!['table','view','index','trigger'].includes(r.type)||typeof r.name!=='string'||typeof r.sql!=='string')throw Error('schema-metadata-invalid');
  return r;
 }).filter(r=>!r.name.startsWith('sqlite_')&&r.name!=='_cf_KV').sort((a,b)=>a.type<b.type?-1:a.type>b.type?1:a.name<b.name?-1:a.name>b.name?1:0);
 const journal=metadata.journal.map(r=>{if(Object.keys(r).sort().join('|')!=='id|name'||!Number.isSafeInteger(r.id)||typeof r.name!=='string')throw Error('journal-metadata-invalid');return r;}).sort((a,b)=>a.id-b.id);
 const schemaEncoded=JSON.stringify(schema.map(r=>[r.type,r.name,r.sql])),journalEncoded=JSON.stringify(journal.map(r=>[r.id,r.name]));
 // Reuse exactly the trusted D1 plan, capturing its prepared statements only.
 const db={prepare(sql){return{sql,values:[],bind(...values){return{...this,values};},async first(){if(sql===STUDIO_SCHEMA_SQL)return{encoded:schemaEncoded};if(sql===STUDIO_JOURNAL_SQL)return{encoded:journalEncoded};throw Error('unexpected-preflight-read');}};}};
 const p=await studioReleasePlan(db);
 const statements=p.statements.map(({sql,values})=>{let n=0;const rendered=sql.replace(/\?/g,()=>literal(values[n++]));if(n!==values.length)throw Error('plan-binding-count');return rendered;});
 const sql=statements.map(s=>s+';').join('\n')+'\n';
 return{sql,report:{type:'studio-release-offline-plan-v1',migrationId:STUDIO_RELEASE_ID,ddlHash:p.hash,baseFingerprint:p.fingerprint,sqlSha256:hash(sql),statements:statements.length,initialEnabled:0,sharedJournalChanged:false,remoteOperations:0}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('usage: node studio-release-plan.mjs structural-metadata.json output-directory');
 const p=await prepareStudioRelease(JSON.parse(fs.readFileSync(input,'utf8')));fs.mkdirSync(output,{recursive:true,mode:0o700});
 fs.writeFileSync(path.join(output,STUDIO_RELEASE_ID+'.sql'),p.sql,{mode:0o600});fs.writeFileSync(path.join(output,'PLAN.json'),JSON.stringify(p.report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(p.report));
}
