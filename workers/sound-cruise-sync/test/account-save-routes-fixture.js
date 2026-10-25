import {backendFixture,DEVICE_PEPPER} from './account-save-transaction-fixture.js';
import {TEST_PRO_PEPPER} from './pro-entitlement-fixture.js';
import {createIsolatedWriterPolicy} from '../src/writer-fence.js';
import {createIsolatedAccountSaveRoutes} from '../src/account-save-routes-isolated.js';
import {exactRequestDigest} from '../src/account-credential-lifecycle.js';
export function installLifecycleFixtureColumns(db){
 db.raw.exec(`ALTER TABLE sync_account_devices ADD COLUMN credential_account_generation INTEGER;
 ALTER TABLE sync_account_devices ADD COLUMN credential_membership_id TEXT;
 ALTER TABLE sync_account_devices ADD COLUMN credential_membership_generation INTEGER;
 ALTER TABLE sync_account_devices ADD COLUMN credential_transition_id TEXT;
 ALTER TABLE sync_account_devices ADD COLUMN credential_operations_json TEXT;
 ALTER TABLE sync_account_runtime_control ADD COLUMN credential_lifecycle_enabled INTEGER NOT NULL DEFAULT 0;
 ALTER TABLE sync_account_runtime_control ADD COLUMN account_history_enabled INTEGER NOT NULL DEFAULT 0;
 UPDATE sync_account_runtime_control SET credential_lifecycle_enabled=1,account_history_enabled=1;
 UPDATE sync_account_devices SET credential_account_generation=7,credential_membership_id='member-'||account_id,credential_membership_generation=11,credential_operations_json='{}';`);
}
export async function ownerRouteFixture({checkpoint,existing,clock}={}){
 const s=existing||await backendFixture({clock:clock||{server:100000},synchronousBatch:true});installLifecycleFixtureColumns(s.db);
 const options={db:s.db,policy:createIsolatedWriterPolicy('A'),accountPepper:s.pepper,devicePepper:DEVICE_PEPPER,proPepper:TEST_PRO_PEPPER,fixtureOnly:true,checkpoint};
 const routes=createIsolatedAccountSaveRoutes(options),credentials={...s.credentials};
 const row=()=>s.db.raw.prepare('SELECT * FROM sync_account_devices WHERE id=?').get(s.account.accountDeviceId);
 const lifecycle=(extra={})=>{const d=row();return {contractVersion:1,operationId:crypto.randomUUID(),expectedCredentialVersion:d.credential_version,expectedLeaseRevision:d.credential_lease_revision||0,expectedAccountGeneration:7,expectedMembershipGeneration:11,expectedRuntimeGeneration:1,...extra};};
 async function send(path,input,{headers={},owner=routes,auth=credentials}={}){
  const r=await owner.handle(new Request('https://owner-route.invalid/__isolated/account/v1/'+path,{method:'POST',headers:{'Content-Type':'application/json','Authorization':auth.accountAuthorization,'X-Sound-Cruise-App-Authorization':auth.appAuthorization,'X-Sound-Cruise-Pro-Authorization':auth.proAuthorization,...headers},body:JSON.stringify(input)}));
  return {status:r.status,body:await r.json()};
 }
 async function saveRequest(opts){const q=await s.request(opts),d=row();q.credentialVersion=d.credential_version;q.credentialLeaseRevision=d.credential_lease_revision;return {request:q,requestDigest:await exactRequestDigest(q)};}
 const binding=p=>({contractVersion:1,purpose:'backend-save-receipt-binding',request:p.request,requestDigest:p.requestDigest});
 return {...s,routes,routeOptions:options,credentials,row,lifecycle,send,saveRequest,binding,
  unissue(){s.db.raw.prepare(`UPDATE sync_account_devices SET credential_issued_at=NULL,credential_expires_at=NULL,credential_lease_revision=NULL,credential_lifecycle=NULL,credential_account_generation=NULL,credential_membership_id=NULL,credential_membership_generation=NULL,credential_transition_id=NULL,credential_operations_json=NULL WHERE id=?`).run(s.account.accountDeviceId);},
  adopt(result){if(!result.body.credential)throw Error('missing-new-secret');credentials.accountAuthorization='Bearer '+result.body.credential;},
  dispose(){routes.dispose();if(!existing)s.dispose();}};
}
