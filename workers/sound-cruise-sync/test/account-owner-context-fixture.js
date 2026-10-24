import {createSqliteD1} from './sqlite-d1.js';
import {createAccountCredential,accountCredentialVerifier} from '../src/account-crypto.js';
export const TEST_OWNER_PEPPER='isolated-account-owner-contract-fixture-pepper';
export async function seedAccountOwnerContext() {
 const db=createSqliteD1(),material=createAccountCredential(),account={accountId:'A',accountDeviceId:material.deviceId,accountCredential:material.credential};
 db.raw.prepare(`INSERT INTO sync_accounts(id,state,recovery_version,recovery_verifier,generation,created_at,updated_at,admission_provenance)
  VALUES ('A','active',1,?,7,1,1,'production')`).run('1'.repeat(64));
 db.raw.prepare(`INSERT INTO sync_account_devices(id,account_id,credential_version,credential_verifier,created_at,last_seen_at)
  VALUES (?,'A',3,?,1,1)`).run(material.deviceId,await accountCredentialVerifier(material.credential,TEST_OWNER_PEPPER));
 db.raw.prepare(`INSERT INTO sync_users(id,state,recovery_version,recovery_verifier,created_at,updated_at) VALUES ('user-A','active',1,?,1,1)`).run('2'.repeat(64));
 const portDevice=crypto.randomUUID();db.raw.prepare(`INSERT INTO sync_devices(id,user_id,app_id,credential_version,credential_verifier,created_at,last_seen_at)
  VALUES (?,'user-A','port',1,?,1,1)`).run(portDevice,'3'.repeat(64));
 db.raw.prepare(`INSERT INTO sync_account_memberships(id,account_id,app_id,state,sync_user_id,recovery_mode,generation,created_at,activated_at,updated_at)
  VALUES ('member-A','A','port','active','user-A','account',11,1,1,1)`).run();
 db.raw.prepare(`INSERT INTO sync_membership_device_links(account_id,membership_id,account_device_id,app_device_id,linked_at)
  VALUES ('A','member-A',?,?,1)`).run(material.deviceId,portDevice);
 db.raw.exec("UPDATE sync_account_runtime_control SET rollout_mode='open',account_read_enabled=1");
 return {db,account,portDevice,pepper:TEST_OWNER_PEPPER};
}
