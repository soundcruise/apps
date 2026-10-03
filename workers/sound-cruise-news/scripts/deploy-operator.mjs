import {readFile,mkdir} from 'node:fs/promises';import {execFileSync} from 'node:child_process';import {operatorConfig} from '../src/operator-auth.js';import {checkedConfig,remoteSql} from './remote-db.mjs';
const directory=new URL('../',import.meta.url),configPath=new URL('../wrangler.operator.jsonc',import.meta.url),config=JSON.parse(await readFile(configPath,'utf8')),publicConfig=await checkedConfig();
const secrets=JSON.parse(await readFile(new URL('../.local/operator-secrets.json',import.meta.url),'utf8')),runtimeConfig={...config.vars,...secrets};operatorConfig(runtimeConfig);
if(Object.hasOwn(config.vars,'NEWS_ACCESS_AUD'))throw Error('operator_audience_must_be_secret');
if(config.name!=='sound-cruise-news-operator'||config.account_id!==publicConfig.account_id||config.d1_databases?.length!==1||config.d1_databases[0].binding!=='NEWS_DB'||config.d1_databases[0].database_id!==publicConfig.d1_databases[0].database_id||config.triggers?.crons?.length||config.services?.length||config.assets?.run_worker_first!==true||config.preview_urls!==false)throw Error('operator_isolation_required');
const [mode]=process.argv.slice(2);if(!['dry-run','deploy'].includes(mode))throw Error('dry-run | deploy');
if(mode==='deploy'){
 const ack=JSON.parse(await readFile(new URL('../.local/operator-access-ready.json',import.meta.url),'utf8'));
 if(ack.origin!==runtimeConfig.NEWS_OPERATOR_ORIGIN||ack.issuer!==runtimeConfig.NEWS_ACCESS_ISSUER||ack.audience!==runtimeConfig.NEWS_ACCESS_AUD||ack.humanPolicyApproved!==true||ack.noBypassOrServiceAuth!==true||!Number.isSafeInteger(ack.checkedAt)||Date.now()-ack.checkedAt>3600000||ack.checkedAt>Date.now())throw Error('access_configuration_acceptance_required');
 const result=await remoteSql("SELECT COUNT(*) n FROM d1_migrations WHERE name='0011_operator_ledger.sql'; SELECT COUNT(*) n FROM d1_migrations WHERE name='0012_facts_recheck.sql'; SELECT COUNT(*) n FROM d1_migrations WHERE name='0013_shadow_evaluation.sql'; SELECT COUNT(*) n FROM d1_migrations WHERE name='0014_pending_lifecycle.sql'; SELECT COUNT(*) n FROM d1_migrations WHERE name='0015_human_takedown.sql';");if(result.some(x=>x.results[0].n!==1))throw Error('operator_migration_required');
}
await mkdir(new URL('../.local/operator-build/',import.meta.url),{recursive:true});
const args=['deploy','--config',configPath.pathname,'--secrets-file',new URL('../.local/operator-secrets.json',import.meta.url).pathname,...(mode==='dry-run'?['--dry-run','--outdir',new URL('../.local/operator-build/',import.meta.url).pathname]:[])];
const output=execFileSync(new URL('../node_modules/.bin/wrangler',import.meta.url).pathname,args,{cwd:directory,encoding:'utf8',env:{...process.env,CI:'true',WRANGLER_SEND_METRICS:'false'}});console.log(output);
