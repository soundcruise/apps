import { mkdir, rmdir } from 'node:fs/promises';
import { localDatabase } from './local-db.mjs';
import {writeReviewReport} from './report.mjs';
import { collectAll } from '../src/collector.js';
import { getSource } from '../src/registry.js';
import { safeFetch, dispatcher } from './safe-fetch.mjs';
const ids=process.argv.slice(2);
if(!ids.length||ids.some(id=>!getSource(id)))throw new Error('Specify registered source IDs only: chuya sleepfreaks');
await mkdir('.local',{recursive:true});
// Cross-process guard: simultaneous local runs cannot burst across the same publisher.
await mkdir('.local/collection.lock');
let runtime;
try {
 runtime=await localDatabase();
 const reports=await collectAll(ids,runtime.store,{mode:process.env.NEWS_COLLECTION_MODE||'local',fetcher:safeFetch,pepper:process.env.NEWS_HEADLINE_PEPPER});
 const report=await writeReviewReport(runtime.store,reports);
 console.log(JSON.stringify(report,null,2));
}finally{await runtime?.mf.dispose();await dispatcher.close();await rmdir('.local/collection.lock');}
