import {seedSaveAdmissionOwner} from './account-save-admission-fixture.js';
import {seedTestPro,TEST_PRO_TOKEN,TEST_PRO_PEPPER} from './pro-entitlement-fixture.js';
import {createIdentityMaterial} from '../src/crypto.js';
import {createIsolatedWriterPolicy} from '../src/writer-fence.js';
import {createIsolatedAccountSaveTransaction} from '../src/account-save-transaction.js';
import {hashRecord} from '../src/records.js';
export const DEVICE_PEPPER='isolated-backend-transaction-device-pepper';
export async function backendFixture({checkpoint,clock={server:100000},existing,synchronousBatch=false}={}){
 const s=existing||await seedSaveAdmissionOwner({clock}),{db}=s;
 // D1 serializes transactions. The await-based Node facade needs this fixture
 // mutex to avoid nesting two BEGINs on its one SQLite connection.
 const batch=synchronousBatch?async statements=>{db.raw.exec('BEGIN IMMEDIATE');try{const result=statements.map(s=>{
  const read=/^\s*(SELECT|PRAGMA|WITH)\b/i.test(s.sql),p=db.raw.prepare(s.sql);return read?{success:true,results:p.all(...s.values)}:{success:true,meta:{changes:Number(p.run(...s.values).changes)}};});db.raw.exec('COMMIT');return result;
 }catch(e){db.raw.exec('ROLLBACK');throw e;}}:db.batch.bind(db);
 let tail=Promise.resolve();db.batch=statements=>{const next=tail.then(()=>batch(statements));tail=next.catch(()=>{});return next;};
 db.raw.function('julianday',_input=>2440587.5+(clock.server+0.5)/86400000);
 db.raw.exec(`ALTER TABLE sync_changes ADD COLUMN isolated_request_digest TEXT;
 ALTER TABLE sync_changes ADD COLUMN isolated_account_binding TEXT;`);
 await seedTestPro(db);
 db.raw.prepare(`INSERT INTO sync_account_managed_users(sync_user_id,account_id,membership_id,app_id,created_at)
 VALUES ('user-A','A','member-A','port',1)`).run();
 db.raw.prepare(`INSERT INTO sync_datasets(user_id,app_id,state,schema_version,record_count,min_change_seq,last_change_seq,updated_at)
 VALUES ('user-A','port','ready',1,0,0,0,1)`).run();
 const app=await createIdentityMaterial(DEVICE_PEPPER,{randomUUID:()=>s.portDevice,getRandomValues:crypto.getRandomValues.bind(crypto),subtle:crypto.subtle});
 db.raw.prepare('UPDATE sync_devices SET credential_verifier=? WHERE id=?').run(app.credentialVerifier,s.portDevice);
 const credentials={accountAuthorization:'Bearer '+s.account.accountCredential,appAuthorization:'Bearer '+app.credential,proAuthorization:'Bearer '+TEST_PRO_TOKEN};
 const policy=createIsolatedWriterPolicy('A');
 const service=(extra={})=>createIsolatedAccountSaveTransaction({db,policy,accountPepper:s.pepper,devicePepper:DEVICE_PEPPER,proPepper:TEST_PRO_PEPPER,fixtureOnly:true,checkpoint,...extra});
 const owner=service();
 async function request({bpm=145,revision=0,id=crypto.randomUUID()}={}){
  const operation={operationId:id,recordType:'metronome_settings',recordId:'default',schemaVersion:1,baseRevision:revision,deleted:false,
   payload:{id:'default',value:{version:3,bpm,meter:'4/4',rhythm:'quarter',sound:'electronic',volume:70,accents:[true,false,false,false]}}};
  operation.payloadHash=await hashRecord(operation,crypto,'port');
  return {contractVersion:1,purpose:'backend-port-save',accountId:'A',accountDeviceId:s.account.accountDeviceId,accountGeneration:7,
   membershipId:'member-A',membershipGeneration:11,credentialVersion:3,credentialLeaseRevision:1,runtimeGeneration:1,
   datasetId:'user-A',appDeviceId:s.portDevice,writeEpoch:1,localGeneration:'g1',localRevision:'local-base',operation};
 }
 const state=()=>JSON.stringify(['sync_records','sync_changes','sync_datasets'].map(t=>db.raw.prepare('SELECT * FROM '+t).all()));
 async function otherAccount(id){const a=await s.addAccount(id),linked=db.raw.prepare('SELECT app_device_id FROM sync_membership_device_links WHERE account_id=?').get(id).app_device_id;
  const app=await createIdentityMaterial(DEVICE_PEPPER,{randomUUID:()=>linked,getRandomValues:crypto.getRandomValues.bind(crypto),subtle:crypto.subtle});db.raw.prepare('UPDATE sync_devices SET credential_verifier=? WHERE id=?').run(app.credentialVerifier,linked);
  db.raw.prepare("INSERT INTO sync_account_managed_users(sync_user_id,account_id,membership_id,app_id,created_at) VALUES (?,?,?,'port',1)").run('user-'+id,id,'member-'+id);
  db.raw.prepare("INSERT INTO sync_datasets(user_id,app_id,state,schema_version,record_count,min_change_seq,last_change_seq,updated_at) VALUES (?,'port','ready',1,0,0,0,1)").run('user-'+id);
  const o=service({policy:createIsolatedWriterPolicy(id),checkpoint:async()=>{}}),c={...credentials,accountAuthorization:'Bearer '+a.accountCredential,appAuthorization:'Bearer '+app.credential};
  return {owner:o,credentials:c,request:async opts=>({...await request(opts),accountId:id,accountDeviceId:a.accountDeviceId,membershipId:'member-'+id,datasetId:'user-'+id,appDeviceId:linked})};}
 return {...s,owner,service,credentials,request,state,otherAccount,dispose(){owner.dispose();if(!existing){s.owner.dispose();db.close();}}};
}
