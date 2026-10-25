import {clockRecoveryFixture} from './account-clock-recovery-fixture.js';
import {createIsolatedAccountSaveRoutes} from '../src/account-save-routes-isolated.js';
import {createIsolatedAccountSaveTransaction} from '../src/account-save-transaction.js';
import {exactRequestDigest} from '../src/account-credential-lifecycle.js';
export function installOperationLeaseFixture(db){
 db.raw.exec(`ALTER TABLE sync_account_devices ADD COLUMN operation_fence_revision INTEGER;
 UPDATE sync_account_devices SET operation_fence_revision=1;
 CREATE TABLE sync_account_operation_leases(account_id TEXT NOT NULL,device_id TEXT NOT NULL,operation_id TEXT NOT NULL,envelope_digest TEXT NOT NULL,envelope_json TEXT NOT NULL,request_digest TEXT NOT NULL,authorization_digest TEXT NOT NULL,lease_revision INTEGER NOT NULL,fencing_revision INTEGER NOT NULL,issued_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,credential_expires_at INTEGER NOT NULL,state TEXT NOT NULL,last_owner_now INTEGER NOT NULL,committed_revision INTEGER,payload_hash TEXT,PRIMARY KEY(account_id,operation_id));`);
}
export async function operationLeaseFixture(t,{checkpoint,ttl=10000}={}){
 const s=await clockRecoveryFixture();t.after(()=>s.dispose());installOperationLeaseFixture(s.db);
 const routeOptions={...s.routeOptions,enableOperationLease:true,operationLeaseTtlMs:ttl,checkpoint},routes=createIsolatedAccountSaveRoutes(routeOptions),owner=createIsolatedAccountSaveTransaction({...routeOptions,requireLifecycleBinding:true});t.after(()=>{routes.dispose();owner.dispose();});
 async function envelope(options){const p=await s.saveRequest(options),q=p.request;q.localGeneration='reauth-fixture';q.localRevision='a'.repeat(64);
  return {schemaVersion:1,purpose:'owner-operation-lease-envelope-v1',request:q,authority:{generation:q.localGeneration,controlEpoch:1,fenceEpoch:2,pointer:{activeGeneration:q.localGeneration,pointerEpoch:2,publication:{kind:'isolated-reauthorization'}},headRevision:'fixture-head',baseDigest:q.localRevision,keyRevision:1},accountDigest:'b'.repeat(64),accountManifestDigest:'c'.repeat(64),reauthorizationReceiptDigest:'d'.repeat(64)};}
 const send=async(path,e,lease)=>s.send('operation/'+path,{envelope:e,envelopeDigest:await exactRequestDigest(e),...(lease?{lease}:{})},{owner:routes});
 return {...s,routeOptions,routes,leaseOwner:owner,envelope,sendOperation:send};
}
