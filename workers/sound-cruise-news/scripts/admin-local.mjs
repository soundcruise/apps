import { localDatabase } from './local-db.mjs';
import { administer } from '../src/admin.js';
import { writeReviewReport } from './report.mjs';
const [action,target,reason]=process.argv.slice(2);
const runtime=await localDatabase();
try{await administer(runtime.store,{action,target,reason});await writeReviewReport(runtime.store);console.log('Local news control updated.');}
finally{await runtime.mf.dispose();}
