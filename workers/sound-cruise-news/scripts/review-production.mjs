import {readFile} from 'node:fs/promises';
import {NewsStore} from '../src/store.js';import {runtimeSources} from '../src/runtime.js';import {reviewQueue,operatorDecision} from '../src/operator-review.js';import {backfillLegacy} from '../src/legacy.js';import {remoteDatabase} from './remote-store.mjs';import {checkedConfig} from './remote-db.mjs';
const [action,inputPath]=process.argv.slice(2),config=await checkedConfig(),store=new NewsStore(remoteDatabase()),now=Date.now();
if(action==='list')console.log(JSON.stringify(await reviewQueue(store),null,2));
else if(action==='backfill-legacy')console.log(JSON.stringify(await backfillLegacy(store,now)));
else if(['approve','reject'].includes(action)){
 if(!inputPath)throw Error('decision_json_file_required');const input=JSON.parse(await readFile(inputPath,'utf8'));if(input.action!==action)throw Error('decision_action_mismatch');
 const {NEWS_HEADLINE_PEPPER:pepper}=JSON.parse(await readFile('.local/production-secrets.json','utf8'));
 console.log(JSON.stringify(await operatorDecision(store,input,now,runtimeSources(config.vars),pepper)));
}else throw Error('list | approve decision.json | reject decision.json | backfill-legacy');
