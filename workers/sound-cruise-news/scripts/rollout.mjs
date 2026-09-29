import {readFile,writeFile} from 'node:fs/promises';
import {getSource,phaseOneSourceReady} from '../src/registry.js';
import {productionConfig,checkedConfig,wrangler,remoteSql,sqlLiteral} from './remote-db.mjs';
const [action]=process.argv.slice(2),now=Date.now();
const report=JSON.parse(await readFile('.local/final-validation.json','utf8'));
if(!report.ready||report.requests.listing!==1||report.requests.article!==0||report.at<Date.parse('2026-09-30T08:16:26+09:00')||report.at>now||!phaseOneSourceReady(getSource('shimamura'),now))throw Error('live_acceptance_required');
if(action==='provision'){
 let databases=wrangler(['d1','list','--json'],{json:true});
 if(!databases.some(d=>d.name==='sound-cruise-news')){
  console.log(wrangler(['d1','create','sound-cruise-news','--location','apac','--update-config=false']));
  databases=wrangler(['d1','list','--json'],{json:true});
 }
 const matches=databases.filter(d=>d.name==='sound-cruise-news');if(matches.length!==1)throw Error('news_database_ambiguous');
 const config=JSON.parse(await readFile(productionConfig,'utf8'));
 config.d1_databases[0].database_id=matches[0].uuid;
 await writeFile(productionConfig,JSON.stringify(config,null,2)+'\n');await checkedConfig();
 console.log(wrangler(['d1','migrations','apply','NEWS_DB','--remote']));
}else if(action==='deploy'){
 await checkedConfig();const secrets=JSON.parse(await readFile('.local/production-secrets.json','utf8'));
 if(typeof secrets.NEWS_HEADLINE_PEPPER!=='string'||secrets.NEWS_HEADLINE_PEPPER.length<32)throw Error('secret_required');
 console.log(wrangler(['deploy','--secrets-file','.local/production-secrets.json']));
}else if(action==='bootstrap'){
 const snapshot=JSON.parse(await readFile('.local/production-bootstrap.json','utf8'));
 if(snapshot.at!==report.at||!snapshot.rows.length||snapshot.rows.some(r=>r.source_id!=='shimamura'))throw Error('bootstrap_mismatch');
 const columns=['id','source_id','source_name','source_url','normalized_url','published_at','category','label','topic_key','collected_at','review_status','review_reason','reviewed_at','expires_at','title_fingerprint','event_type','product_facts','feed_published_at','reviewed_by','review_checks','article_checks','date_override_reason','publication_decision','decision_reason','sale_ends_at'];
 const sql=['UPDATE news_controls SET api_enabled=0,collection_enabled=0,publication_enabled=0,revision=revision+1 WHERE id=1'];
 for(const row of snapshot.rows)sql.push(`INSERT OR IGNORE INTO candidate_items(${columns.join(',')}) SELECT ${columns.map(c=>sqlLiteral(row[c]??null)).join(',')} WHERE NOT EXISTS(SELECT 1 FROM news_takedowns WHERE item_id=${sqlLiteral(row.id)})`);
 const s=snapshot.state;
 sql.push(`INSERT INTO source_state(source_id,next_at,robots_hash,etag,last_modified,last_discovery_at) VALUES('shimamura',${s.nextAt},${sqlLiteral(s.robotsHash)},${sqlLiteral(s.etag??null)},${sqlLiteral(s.lastModified??null)},${s.lastDiscoveryAt}) ON CONFLICT(source_id) DO UPDATE SET next_at=MAX(next_at,excluded.next_at)`);
 sql.push(`INSERT INTO source_health(source_id,status,reason_code,last_successful_run_at,last_checked_at,next_eligible_run_at,failure_count) VALUES('shimamura','healthy','ok',${snapshot.at},${snapshot.at},${s.nextAt},0) ON CONFLICT(source_id) DO NOTHING`);
 sql.push(`INSERT OR IGNORE INTO collection_runs VALUES('initial-live-validation','shimamura',${snapshot.at},1,${report.candidates},${report.pending},${report.rejected},${report.duplicates},'collected',0)`);
 console.log(JSON.stringify(await remoteSql(sql.join(';\n')+';')));
}else if(action==='enable'){
 await checkedConfig();
 const result=await remoteSql("SELECT COUNT(*) AS count FROM candidate_items WHERE review_status='approved' AND publication_decision='AUTO_PUBLISHABLE';");
 if(!result[0]?.results?.[0]?.count)throw Error('no_automatic_items_for_production_smoke');
 console.log(JSON.stringify(await remoteSql('UPDATE news_controls SET collection_enabled=1,publication_enabled=1,api_enabled=1,revision=revision+1 WHERE id=1;')));
}else throw Error('Use provision | deploy | bootstrap | enable');
