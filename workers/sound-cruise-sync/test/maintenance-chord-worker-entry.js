// Explicit synthetic workerd fixture; no product router/config reference.
import {createIsolatedChordMigration} from '../src/maintenance-chord-migration.js';
import {createIsolatedMaintenanceOwnerHttp} from '../src/maintenance-owner-http.js';
export default{async fetch(request,env){const db=env.DB,e={...env,SYNC_DB:db};
 if(new URL(request.url).pathname==='/__old-fixture')return env.OLD_CONTROL.fetch(request);
 if(new URL(request.url).pathname==='/__chord-fixture'){try{const job=await request.json();return Response.json(await createIsolatedChordMigration({db,env:e,scopeForAccount:id=>'migration-'+id}).run(request,job));}catch{return Response.json({status:'HOLD'},{status:409});}}
 const limiter={async limit(){return{success:true};}};return createIsolatedMaintenanceOwnerHttp({db,env:{...e,SYNC_RATE_LIMITER:limiter},writerScope:'account-pro-writer',securityScope:'account-pro-security'}).fetch(request);
}};
