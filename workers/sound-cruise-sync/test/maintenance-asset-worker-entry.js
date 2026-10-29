// Explicit synthetic Miniflare entry only; not reachable from production config.
import {createIsolatedMaintenanceOwnerHttp} from '../src/maintenance-owner-http.js';
export default {fetch(request,env){
 const limiter={async limit(){return{success:true};}};
 const isolated={...env,SYNC_DB:env.DB,SYNC_RATE_LIMITER:limiter,PRO_VERIFY_RATE_LIMITER:limiter};
 return createIsolatedMaintenanceOwnerHttp({db:env.DB,env:isolated,writerScope:'account-pro-writer',securityScope:'account-pro-security',assetExternalScopeForAccount:id=>'asset-'+id}).fetch(request);
}};
