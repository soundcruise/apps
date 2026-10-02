import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';import {createHash} from 'node:crypto';import {checkedConfig,remoteSql,wrangler} from './remote-db.mjs';
const config=await checkedConfig();
if(config.d1_databases[0].database_id!=='13267817-d259-4fde-80d3-37766f8f3f11')throw Error('unexpected_database');
const directory=new URL('../.local/operator-phase-a/',import.meta.url);await mkdir(directory,{recursive:true});
const before=await remoteSql('SELECT * FROM candidate_items ORDER BY id; SELECT * FROM d1_migrations; SELECT * FROM news_controls;');
if(before[1].results.some(x=>x.name==='0011_operator_ledger.sql'))throw Error('already_migrated');
const snapshot=before[0].results,stamp=new Date().toISOString().replace(/[:.]/g,'-'),backup=new URL('news-before-ledger-'+stamp+'.sql',directory);
await writeFile(new URL('before.json',directory),JSON.stringify(before),{mode:0o600});
wrangler(['d1','export','NEWS_DB','--remote','--output',backup.pathname]);console.log('Private NEWS backup created');if((await stat(backup)).size<1000)throw Error('backup_incomplete');
const exportHash=createHash('sha256').update(await readFile(backup)).digest('hex');
// Only the new migration may be pending. No historical migration replay.
if(before[1].results.length!==10||before[1].results.at(-1).name!=='0010_core_quality.sql')throw Error('unexpected_migration_baseline');
console.log(wrangler(['d1','migrations','apply','NEWS_DB','--remote']));
const after=await remoteSql('SELECT * FROM candidate_items ORDER BY id; SELECT COUNT(*) n FROM news_decision_ledger; SELECT * FROM news_controls; SELECT * FROM d1_migrations;');
const oldRows=after[0].results.map(({review_revision,...row})=>row);
if(JSON.stringify(oldRows)!==JSON.stringify(snapshot)||after[0].results.some(x=>x.review_revision!==0)||after[1].results[0].n!==0||JSON.stringify(after[2].results)!==JSON.stringify(before[2].results))throw Error('additive_migration_invariant_failed');
const report={database:config.d1_databases[0].database_name,databaseId:config.d1_databases[0].database_id,backup:backup.pathname,backupSha256:exportHash,candidateCount:snapshot.length,candidatesUnchanged:true,ledgerCount:0,migrations:after[3].results.map(x=>x.name),at:new Date().toISOString()};await writeFile(new URL('migration-result.json',directory),JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));
