import {readFile,writeFile,mkdir,stat,readdir,chmod} from 'node:fs/promises';
import {checkedConfig,remoteSql,wrangler} from './remote-db.mjs';
const [mode]=process.argv.slice(2);if(!['plan','apply'].includes(mode))throw Error('plan | apply');
const config=await checkedConfig();if(config.d1_databases[0].database_id!=='13267817-d259-4fde-80d3-37766f8f3f11')throw Error('unexpected_news_database');
const before=await remoteSql('SELECT * FROM candidate_items ORDER BY id; SELECT * FROM news_decision_ledger ORDER BY decision_id; SELECT * FROM news_controls; SELECT name FROM d1_migrations ORDER BY name;');
if(before[3].results.some(r=>r.name==='0013_shadow_evaluation.sql')){console.log('Shadow migration already applied; no replay');process.exit(0);}
if(before[3].results.length!==12||before[3].results.at(-1).name!=='0012_facts_recheck.sql')throw Error('unexpected_migration_baseline');
const pending=(await readdir(new URL('../migrations/',import.meta.url))).filter(n=>n.endsWith('.sql')&&!before[3].results.some(r=>r.name===n));if(pending.length!==1||pending[0]!=='0013_shadow_evaluation.sql')throw Error('only_shadow_migration_may_be_pending');
if(mode==='plan'){console.log(JSON.stringify({migration:'0013_shadow_evaluation.sql',candidateCount:before[0].results.length,ledgerCount:before[1].results.length,additiveOnly:true}));process.exit(0);}
const directory=new URL('../.local/operator-phase-c/',import.meta.url);await mkdir(directory,{recursive:true});const stamp=new Date().toISOString().replace(/[:.]/g,'-');
await writeFile(new URL('before-'+stamp+'.json',directory),JSON.stringify(before),{mode:0o600});
const backup=new URL('before-'+stamp+'.sql',directory);wrangler(['d1','export','NEWS_DB','--remote','--output',backup.pathname]);await chmod(backup,0o600);if((await stat(backup)).size<1000)throw Error('backup_incomplete');
console.log('Private NEWS backup created; applying only pending additive shadow migration');wrangler(['d1','migrations','apply','NEWS_DB','--remote']);
const after=await remoteSql('SELECT * FROM candidate_items ORDER BY id; SELECT * FROM news_decision_ledger ORDER BY decision_id; SELECT * FROM news_controls; SELECT COUNT(*) n FROM news_shadow_evaluations; SELECT name FROM d1_migrations ORDER BY name;');
if([0,1,2].some(i=>JSON.stringify(before[i].results)!==JSON.stringify(after[i].results))||after[3].results[0].n!==0||after[4].results.at(-1)?.name!=='0013_shadow_evaluation.sql')throw Error('shadow_additive_invariant_failed');
await writeFile(new URL('migration-result-'+stamp+'.json',directory),JSON.stringify({candidatesUnchanged:true,ledgerUnchanged:true,controlsUnchanged:true,shadowRows:0,migration:'0013_shadow_evaluation.sql'}),{mode:0o600});console.log('Shadow migration PASS: candidate/ledger/controls unchanged, zero observations, no backfill');
