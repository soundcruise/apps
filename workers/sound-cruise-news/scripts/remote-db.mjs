import {execFileSync} from 'node:child_process';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
export const productionConfig=new URL('../wrangler.production.jsonc',import.meta.url);
export const workerDirectory=new URL('../',import.meta.url);
export async function checkedConfig(){
 const config=JSON.parse(await readFile(productionConfig,'utf8'));
 if(config.name!=='sound-cruise-news'||config.account_id!=='a9f2a3e9fcb6d0f68fd2eaa9df909e33'||config.d1_databases?.length!==1||config.d1_databases[0].database_name!=='sound-cruise-news'||!/^[a-f0-9-]{36}$/.test(config.d1_databases[0].database_id))throw Error('production_news_binding_not_ready');
 return config;
}
export function wrangler(args,{json=false}={}){
 const output=execFileSync(new URL('../node_modules/.bin/wrangler',import.meta.url).pathname,[...args,'--config',productionConfig.pathname],{cwd:workerDirectory,encoding:'utf8',maxBuffer:10*1024*1024,env:{...process.env,CI:'true',WRANGLER_SEND_METRICS:'false'}});
 return json?JSON.parse(output):output;
}
export const sqlLiteral=value=>value===null?'NULL':typeof value==='number'&&Number.isFinite(value)?String(value):typeof value==='string'?"'"+value.replaceAll("'","''")+"'":(()=>{throw Error('sql_value_invalid')})();
// Authenticated through Wrangler OAuth. No public admin route or browser secret.
export async function remoteSql(sql){
 await checkedConfig();const dir=await mkdtemp(join(tmpdir(),'news-sql-'));
 try{const file=join(dir,'query.sql');await writeFile(file,sql,{mode:0o600});return wrangler(['d1','execute','NEWS_DB','--remote','--file',file,'--json'],{json:true});}
 finally{await rm(dir,{recursive:true,force:true});}
}
