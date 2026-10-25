// Synthetic local owner DB only. Proposed lease columns are NOT a production
// migration. The existing Account/device/membership rows and HMAC remain owners.
import {seedAccountOwnerContext} from './account-owner-context-fixture.js';
import {createIsolatedAccountSaveAdmissionOwner} from '../src/account-save-admission.js';
import {createAccountCredential,accountCredentialVerifier} from '../src/account-crypto.js';
export async function seedSaveAdmissionOwner({clock={server:100000}}={}) {
 const x=await seedAccountOwnerContext(),{db}=x;
 db.raw.exec(`ALTER TABLE sync_account_devices ADD COLUMN credential_issued_at INTEGER;
 ALTER TABLE sync_account_devices ADD COLUMN credential_expires_at INTEGER;
 ALTER TABLE sync_account_devices ADD COLUMN credential_lease_revision INTEGER;
 ALTER TABLE sync_account_devices ADD COLUMN credential_lifecycle TEXT;
 ALTER TABLE sync_account_devices ADD COLUMN credential_clock_floor INTEGER;
 ALTER TABLE sync_account_runtime_control ADD COLUMN account_save_enabled INTEGER NOT NULL DEFAULT 0;
 UPDATE sync_account_runtime_control SET account_save_enabled=1;`);
 db.raw.prepare(`UPDATE sync_account_devices SET credential_issued_at=?,credential_expires_at=?,credential_lease_revision=1,
 credential_lifecycle='active',credential_clock_floor=? WHERE id=?`).run(clock.server-1000,clock.server+60000,clock.server,x.account.accountDeviceId);
 const sql=`SELECT d.id AS device_id,d.account_id,d.credential_version,d.credential_verifier,d.revoked_at,
 d.credential_issued_at,d.credential_expires_at,d.credential_lease_revision,d.credential_lifecycle,d.credential_clock_floor,
 a.state AS account_state,a.generation,a.admission_provenance,m.id AS membership_id,m.state AS membership_state,
 m.generation AS membership_generation,m.deleted_at AS membership_deleted_at,c.generation AS runtime_generation,
 CASE WHEN c.rollout_mode IN ('cohort','open') AND c.account_save_enabled=1 THEN 1 ELSE 0 END AS save_enabled,
 EXISTS(SELECT 1 FROM sync_membership_device_links l JOIN sync_devices pd ON pd.id=l.app_device_id
 WHERE l.account_id=a.id AND l.membership_id=m.id AND l.account_device_id=d.id AND pd.user_id=m.sync_user_id
 AND pd.app_id='port' AND pd.revoked_at IS NULL) AS device_linked
 FROM sync_account_devices d JOIN sync_accounts a ON a.id=d.account_id
 LEFT JOIN sync_account_memberships m ON m.account_id=a.id AND m.app_id='port'
 LEFT JOIN sync_account_runtime_control c ON c.singleton_id=1 WHERE d.id=?`;
 // Fixtures model the missing co-located synchronous owner boundary. Persist a
 // per-device clock floor and terminal expiry before returning, including denial.
 // A fresh factory/reopen cannot resurrect an expired credential by clock rollback.
 function probe(q){
  db.raw.exec('BEGIN IMMEDIATE');
  try{
   const r=db.raw.prepare(sql).get(q.accountDeviceId)||null;
   if(r&&Number.isSafeInteger(clock.server)&&clock.server>=r.credential_clock_floor){
    db.raw.prepare(`UPDATE sync_account_devices SET credential_clock_floor=?,credential_lifecycle=? WHERE id=?`)
     .run(clock.server,r.credential_lifecycle==='active'&&Number.isSafeInteger(r.credential_expires_at)&&r.credential_expires_at>0&&clock.server>=r.credential_expires_at?'expired':r.credential_lifecycle,q.accountDeviceId);
   }
   const result=db.raw.prepare(sql).get(q.accountDeviceId)||null;db.raw.exec('COMMIT');return result;
  }catch(e){db.raw.exec('ROLLBACK');throw e;}
 }
 const backend={fixtureOnly:true,boundary:'co-located-owner-fixture',
  async readPrimary(q){probe(q);return db.withSession('first-primary').prepare(sql).bind(q.accountDeviceId).first();},readAtCommit:probe};
 const createOwner=()=>createIsolatedAccountSaveAdmissionOwner({backend,pepper:x.pepper,now:()=>clock.server});
 return {...x,clock,backend,createOwner,owner:createOwner(),row:()=>db.raw.prepare(sql).get(x.account.accountDeviceId),
  async addAccount(id){
   const a=createAccountCredential(),account={accountId:id,accountDeviceId:a.deviceId,accountCredential:a.credential};
   db.raw.prepare(`INSERT INTO sync_accounts(id,state,recovery_version,recovery_verifier,generation,created_at,updated_at,admission_provenance)
    VALUES (?,'active',1,?,7,1,1,'production')`).run(id,'4'.repeat(64));
   db.raw.prepare(`INSERT INTO sync_account_devices(id,account_id,credential_version,credential_verifier,created_at,last_seen_at,
    credential_issued_at,credential_expires_at,credential_lease_revision,credential_lifecycle,credential_clock_floor)
    VALUES (?,?,3,?,1,1,?,?,1,'active',?)`).run(a.deviceId,id,await accountCredentialVerifier(a.credential,x.pepper),clock.server-1000,clock.server+60000,clock.server);
   db.raw.prepare(`INSERT INTO sync_users(id,state,recovery_version,recovery_verifier,created_at,updated_at) VALUES (?,'active',1,?,1,1)`).run('user-'+id,'5'.repeat(64));
   const device=crypto.randomUUID();db.raw.prepare(`INSERT INTO sync_devices(id,user_id,app_id,credential_version,credential_verifier,created_at,last_seen_at)
    VALUES (?,?,'port',1,?,1,1)`).run(device,'user-'+id,'6'.repeat(64));
   db.raw.prepare(`INSERT INTO sync_account_memberships(id,account_id,app_id,state,sync_user_id,recovery_mode,generation,created_at,activated_at,updated_at)
    VALUES (?,?,'port','active',?,'account',11,1,1,1)`).run('member-'+id,id,'user-'+id);
   db.raw.prepare(`INSERT INTO sync_membership_device_links(account_id,membership_id,account_device_id,app_device_id,linked_at)
    VALUES (?,?,?,?,1)`).run(id,'member-'+id,a.deviceId,device);return account;
  },
  lease(patch){const allowed=['credential_issued_at','credential_expires_at','credential_lease_revision','credential_lifecycle','credential_clock_floor'];
   if(Object.keys(patch).some(k=>!allowed.includes(k)))throw Error('fixture-patch-invalid');
   const entries=Object.entries(patch);db.raw.prepare('UPDATE sync_account_devices SET '+entries.map(([k])=>k+'=?').join(',')+' WHERE id=?')
    .run(...entries.map(([,v])=>v),x.account.accountDeviceId);}};
}
