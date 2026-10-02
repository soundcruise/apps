import {readFile} from 'node:fs/promises';
import {NewsStore} from '../src/store.js';import {reviewQueue} from '../src/operator-review.js';import {backfillLegacy} from '../src/legacy.js';import {remoteDatabase} from './remote-store.mjs';import {checkedConfig} from './remote-db.mjs';import {operatorClient} from './operator-client.mjs';
const [action,inputPath]=process.argv.slice(2);await checkedConfig();
if(action==='list')console.log(JSON.stringify(await reviewQueue(new NewsStore(remoteDatabase())),null,2));
else if(action==='backfill-legacy')console.log(JSON.stringify(await backfillLegacy(new NewsStore(remoteDatabase()),Date.now())));
else if(action==='detail'){
 if(!/^[a-zA-Z0-9_-]{1,128}$/.test(inputPath||''))throw Error('candidate_id_required');console.log(JSON.stringify(await operatorClient(process.env.NEWS_OPERATOR_ORIGIN,process.env.NEWS_OPERATOR_ACCESS_JWT,'/api/candidates/'+inputPath),null,2));
}else if(['approve','reject'].includes(action)){
 if(!inputPath)throw Error('decision_json_file_required');const input=JSON.parse(await readFile(inputPath,'utf8'));if(input.action!==action)throw Error('decision_action_mismatch');
 console.log(JSON.stringify(await operatorClient(process.env.NEWS_OPERATOR_ORIGIN,process.env.NEWS_OPERATOR_ACCESS_JWT,'/api/decision',input)));
}else throw Error('list | detail candidate_id | approve decision.json | reject decision.json | backfill-legacy');
