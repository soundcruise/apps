// Disposable test entrypoint only. Production src/index.js has no capability.
import {handleRequest} from '../src/app.js';
import {createDisposableOwnerRouteCapability} from '../src/account-owner-route-candidate.js';
import {createIsolatedWriterPolicy} from '../src/writer-fence.js';
export default {fetch(req,env,ctx){
 const ownerRouteCandidate=createDisposableOwnerRouteCapability({fixtureOnly:true,db:env.SYNC_DB,accountId:'A',policy:createIsolatedWriterPolicy('A'),credentialTtlMs:60000,recoveryTtlMs:30000,operationLeaseTtlMs:10000,enableSuccessorTwoCycle:env.TEST_OWNER_TWO_CYCLE==='true'});
 return handleRequest(req,{...env,SYNC_RATE_LIMITER:{async limit(){return {success:true};}}},ctx,{ownerRouteCandidate});
}};
