import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
export const productionConfig=new URL('../wrangler.production.jsonc',import.meta.url);
export const workerDirectory=new URL('../',import.meta.url);
export function infrastructureConfig(config){
 if(config.name!=='sound-cruise-news'||config.account_id!=='a9f2a3e9fcb6d0f68fd2eaa9df909e33'||
    config.vars?.NEWS_COLLECTION_MODE!=='off'||config.vars?.NEWS_API_MODE!=='production'||
    config.vars?.NEWS_SOURCE_IDS!=='["shimamura"]'||!Array.isArray(config.triggers?.crons)||config.triggers.crons.length||
    config.d1_databases?.length!==1||config.d1_databases[0].binding!=='NEWS_DB'||config.d1_databases[0].database_name!=='sound-cruise-news')throw Error('infrastructure_must_remain_collection_off_without_cron');
 return config;
}
export async function checkedConfig(){
 const config=JSON.parse(await readFile(productionConfig,'utf8'));
 if(config.name!=='sound-cruise-news'||config.account_id!=='a9f2a3e9fcb6d0f68fd2eaa9df909e33'||config.d1_databases?.length!==1||config.d1_databases[0].binding!=='NEWS_DB'||config.d1_databases[0].database_name!=='sound-cruise-news'||!/^[a-f0-9-]{36}$/.test(config.d1_databases[0].database_id)||config.d1_databases[0].database_id==='e37759f8-df08-4d2a-92b0-ffdd50de66df')throw Error('production_news_binding_not_ready');
 return config;
}
export function parseWranglerJson(output){
 try{return JSON.parse(output);}catch{}
 // Remote --file execution may print upload progress even with --json.
 // Accept only a complete trailing JSON document, never an arbitrary partial result.
 for(const match of output.matchAll(/^[ \t]*[\[{]/gm)){
  try{return JSON.parse(output.slice(match.index));}catch{}
 }
 throw Error('wrangler_json_result_missing');
}
export function wrangler(args,{json=false}={}){
 const output=execFileSync(new URL('../node_modules/.bin/wrangler',import.meta.url).pathname,[...args,'--config',productionConfig.pathname],{cwd:workerDirectory,encoding:'utf8',maxBuffer:10*1024*1024,env:{...process.env,CI:'true',WRANGLER_SEND_METRICS:'false'}});
 return json?parseWranglerJson(output):output;
}
export const sqlLiteral=value=>value===null?'NULL':typeof value==='number'&&Number.isFinite(value)?String(value):typeof value==='string'?"'"+value.replaceAll("'","''")+"'":(()=>{throw Error('sql_value_invalid')})();
// Authenticated through Wrangler OAuth. No public admin route or browser secret.
export async function remoteSql(sql){
 await checkedConfig();
 // --file uses D1 bulk import and returns import statistics, not SELECT rows.
 // Operator SQL contains only news facts/IDs/state; secrets never enter this path.
 return wrangler(['d1','execute','NEWS_DB','--remote','--command',sql,'--json'],{json:true});
}
