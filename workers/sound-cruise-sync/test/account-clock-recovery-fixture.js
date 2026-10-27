import {ownerRouteFixture} from './account-save-routes-fixture.js';
import {createIsolatedAccountSaveRoutes} from '../src/account-save-routes-isolated.js';
import {createRenewalRecoverySecret,renewalRecoveryCommitment,renewalDigest} from '../src/account-renewal-recovery.js';
export async function clockRecoveryFixture(options={}){
 const s=await ownerRouteFixture(options);s.db.raw.exec('ALTER TABLE sync_account_devices ADD COLUMN credential_recovery_json TEXT; ALTER TABLE sync_account_devices ADD COLUMN credential_recovery_until INTEGER;');
 const routeOptions={...s.routeOptions,enableRenewalRecovery:true},routes=createIsolatedAccountSaveRoutes(routeOptions),send=(path,q,o={})=>s.send(path,q,{owner:routes,...o});
 async function prepare(){const start=await send('credential/renew/begin',s.lifecycle());if(start.status!==200)throw Error('begin-failed');
  const request=s.lifecycle({transitionId:start.body.transitionId}),secret=createRenewalRecoverySecret(),identity={accountId:'A',accountDeviceId:s.account.accountDeviceId,membershipId:'member-A'},requestDigest=await renewalDigest(request,identity,await renewalRecoveryCommitment(secret));
  return {request,secret,requestDigest,identity,authorization:s.credentials.accountAuthorization};}
 const proof=t=>({'Authorization':t.authorization,'X-Sound-Cruise-Renewal-Recovery':t.secret,'X-Sound-Cruise-Renewal-Digest':t.requestDigest});
 return {...s,routeOptions,routes,send,prepare,finish:t=>send('credential/renew/finish',t.request,{headers:proof(t)}),recover:(t,extra={})=>send('credential/renew/reconcile',{operationId:t.request.operationId,requestDigest:t.requestDigest},{headers:proof(t),...extra}),dispose(){routes.dispose();s.dispose();}};
}
