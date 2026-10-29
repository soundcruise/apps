// Synthetic workerd test entry. Not a product HTTP route or deployment config.
import {createIsolatedMaintenanceRetentionOwner} from '../src/maintenance-retention-owner.js';
import {createIsolatedMaintenanceOwnerHttp} from '../src/maintenance-owner-http.js';
export default{async fetch(request,env){
 const db=env.DB,e={...env,SYNC_DB:db},limiter={async limit(){return{success:true};}};
 if(new URL(request.url).pathname==='/__retention-fixture'){
  try{const job=await request.json();const result=await createIsolatedMaintenanceRetentionOwner({db,env:e,scopeForAccount:id=>'retention-'+id}).run(request,job);return Response.json(result);}catch{return Response.json({status:'HOLD'},{status:409});}
 }
 return createIsolatedMaintenanceOwnerHttp({db,env:{...e,SYNC_RATE_LIMITER:limiter},writerScope:'account-pro-writer',securityScope:'account-pro-security'}).fetch(request);
}};
