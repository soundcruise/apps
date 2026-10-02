// One source/one existing candidate only. Wrangler OAuth authenticates D1; no
// Access bypass route, no browser token, no human decision or policy override.
import {readFile} from 'node:fs/promises';
import {checkedConfig,remoteSql} from './remote-db.mjs';
import {remoteFactsDatabase} from './facts-remote-adapter.mjs';
import {NewsStore} from '../src/store.js';import {runtimeSources} from '../src/runtime.js';
import {reviewDetail} from '../src/operator-review.js';import {recheckFacts} from '../src/facts-recheck.js';
import {TARGET_URLS} from '../src/target-evidence.js';import {hash} from '../src/policy.js';
if(process.argv.length!==2)throw Error('no_arguments_allowed');
const config=await checkedConfig(),now=Date.now(),registry=runtimeSources(config.vars,undefined,now),store=new NewsStore(remoteFactsDatabase(remoteSql)),id=await hash(TARGET_URLS['ikebe-event']);
const {NEWS_HEADLINE_PEPPER:pepper}=JSON.parse(await readFile(new URL('../.local/production-secrets.json',import.meta.url),'utf8'));
const d=await reviewDetail(store,id,now,registry,pepper);if(d.status!=='pending')throw Error('pending_event_required');
console.log('Rechecking the exact existing event through the same source gates, leases and full-row CAS.');
const result=await recheckFacts(store,{id,snapshot:d.snapshot,revision:d.revision,requestId:crypto.randomUUID()},now,registry,pepper,{type:'system_repair',id:'news-a6-server-event'},{serverRepair:true});
console.log(JSON.stringify(result));
