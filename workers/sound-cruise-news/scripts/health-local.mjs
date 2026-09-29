// Local operator view only. No HTTP admin endpoint or browser credential is created.
import { localDatabase } from './local-db.mjs';
const runtime=await localDatabase();
try{
 const sources=await runtime.store.sourceHealth();
 const alerts=await runtime.store.sourceAlerts();
 console.log(JSON.stringify({sources,alerts},null,2));
}finally{await runtime.mf.dispose();}
