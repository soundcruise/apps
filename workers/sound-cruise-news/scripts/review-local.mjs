import { readFile } from 'node:fs/promises';
import {writeReviewReport} from './report.mjs';
import { localDatabase } from './local-db.mjs';
import { reviewCandidate } from '../src/review.js';
import { administer } from '../src/admin.js';
const [action,arg]=process.argv.slice(2);
if(!['list','review','kill','purge','delete'].includes(action))throw new Error('list | review file.json | kill source-id | delete candidate-id | purge');
const {mf,store}=await localDatabase();
try {
 await store.purge(Date.now());
 if(action==='list')console.log(JSON.stringify(await store.candidates(),null,2));
 if(action==='delete')await administer(store,{action:'item-delete',target:arg,reason:'owner_request'});
 if(action==='review')await reviewCandidate(store,JSON.parse(await readFile(arg,'utf8')),Date.now(),undefined,process.env.NEWS_HEADLINE_PEPPER);
 if(action==='kill')await administer(store,{action:'source-delete',target:arg,reason:'owner_request'});
 if(action!=='list')await writeReviewReport(store);
}finally{await mf.dispose();}
