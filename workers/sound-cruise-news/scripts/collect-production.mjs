// Development/operator collection is separate from scheduled daily leases. Wrangler OAuth only.
import {readFile} from 'node:fs/promises';import {NewsStore} from '../src/store.js';import {runtimeSources} from '../src/runtime.js';import {collectSource} from '../src/collector.js';import {publishAutomatic} from '../src/automatic.js';import {checkedConfig} from './remote-db.mjs';import {remoteDatabase} from './remote-store.mjs';import {safeFetch} from './safe-fetch.mjs';
const [id]=process.argv.slice(2),config=await checkedConfig(),now=Date.now(),registry=runtimeSources(config.vars,undefined,now);
if(!registry.some(s=>s.id===id&&s.productionEnabled))throw Error('approved_enabled_source_required');
const {NEWS_HEADLINE_PEPPER:pepper}=JSON.parse(await readFile('.local/production-secrets.json','utf8'));
const store=new NewsStore(remoteDatabase());let cachedRobots=null;
if(process.env.NEWS_ROBOTS_PROOF_FILE){const proof=JSON.parse(await readFile(process.env.NEWS_ROBOTS_PROOF_FILE,'utf8'));if(proof.id!==id)throw Error('robot_proof_source_mismatch');cachedRobots=proof;}
let wireRequests=0;const fetcher=(url,options)=>{wireRequests++;return safeFetch(url,options);};
const report=await collectSource(id,store,{mode:'production',now,registry,pepper,fetcher,requestMode:'operator_validation',auditReason:'coverage_validation',cachedRobots});
// Operator may inspect pending candidates before publication. No unauthenticated entry point.
if(process.env.NEWS_PUBLISH_AFTER_COLLECTION==='yes'&&['collected','not_modified'].includes(report.outcome))report.published=await publishAutomatic(store,registry.find(s=>s.id===id),registry,now,pepper);
console.log(JSON.stringify({...report,wireRequests}));
if(!['collected','not_modified'].includes(report.outcome))process.exitCode=1;
