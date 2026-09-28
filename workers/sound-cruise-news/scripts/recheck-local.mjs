// Recheck existing metadata only; never fetches or creates policy evidence.
import { localDatabase } from './local-db.mjs';
import { getSource } from '../src/registry.js';
import { allowedArticlePath } from '../src/metadata.js';
import { reviewCandidate } from '../src/review.js';
import { writeReviewReport } from './report.mjs';
const runtime=await localDatabase();
try{
 let rejected=0;
 for(const item of await runtime.store.candidates()){
  const source=getSource(item.source_id);
  if(source&&!allowedArticlePath(item.source_url,source)&&item.review_status!=='rejected'){
   await reviewCandidate(runtime.store,{action:'reject',id:item.id,reviewedBy:'operator'});rejected++;
  }
 }
 await writeReviewReport(runtime.store);console.log(JSON.stringify({event:'local_path_recheck',rejected,requests:0}));
}finally{await runtime.mf.dispose();}
