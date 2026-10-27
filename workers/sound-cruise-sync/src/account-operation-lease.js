// Owner-internal SQL extension. No route/production schema, independent auth or
// authority source. Existing owner supplies authentication and final guards.
import {canonicalJson} from './records.js';
import {assertion,clearAssertions,fenceQuery} from './writer-fence.js';
import {validateOperationEnvelope,validateOperationLease} from '../../../apps/shared/sync-account/owner-operation-lease-contract.mjs';
const T="CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)",fail=()=>{throw Error('operation-lease-unproven');};
const positive=x=>Number.isSafeInteger(x)&&x>0;
export function createOperationLeaseOwner({db,checksum,guard,checkpoint,leaseTtlMs=10000}){
 if(!positive(leaseTtlMs)||leaseTtlMs>30000)fail();
 const authDigest=p=>checksum({accountVerifier:p.row.credential_verifier,appVerifier:p.admission.deviceVerifier,proId:p.admission.proCredentialId,proVerifier:p.admission.proVerifier,writeEpoch:p.q.writeEpoch});
 const token=r=>({schemaVersion:1,purpose:'owner-operation-lease-v1',accountId:r.account_id,accountDeviceId:r.device_id,operationId:r.operation_id,envelopeDigest:r.envelope_digest,authorizationDigest:r.authorization_digest,leaseRevision:r.lease_revision,fencingRevision:r.fencing_revision,issuedAt:r.issued_at,expiresAt:r.expires_at,credentialExpiresAt:r.credential_expires_at});
 const read=(session,q)=>session.prepare('SELECT * FROM sync_account_operation_leases WHERE account_id=? AND operation_id=?').bind(q.accountId,q.operation.operationId).first();
 async function observed(p){
  const q=p.q;const result=await db.withSession('first-primary').prepare(`UPDATE sync_account_operation_leases SET last_owner_now=MAX(last_owner_now,${T}),state=CASE WHEN state='issued' AND expires_at<=${T} THEN 'expired' ELSE state END WHERE account_id=? AND operation_id=? AND device_id=? AND envelope_digest=? AND typeof(last_owner_now)='integer' AND last_owner_now>0 AND last_owner_now<=9007199254740991 AND ${T}>=last_owner_now AND typeof(issued_at)='integer' AND issued_at>0 AND last_owner_now>=issued_at AND state IN ('issued','committed','expired')`).bind(q.accountId,q.operation.operationId,q.accountDeviceId,p.lease.envelopeDigest).run();
  if(result?.success!==true||result.meta?.changes!==1)fail();
 }
 async function matching(e,lease,p){
  validateOperationLease(lease,e);if(lease.envelopeDigest!==await checksum(e)||lease.authorizationDigest!==await authDigest(p))fail();
  const row=await read(db.withSession('first-primary'),p.q);if(!row||!positive(row.last_owner_now)||row.last_owner_now<row.issued_at||!['issued','committed','expired'].includes(row.state)||row.state==='committed'&&(!positive(row.committed_revision)||row.payload_hash!==p.q.operation.payloadHash)||canonicalJson(token(row))!==canonicalJson(lease)||row.envelope_json!==canonicalJson(e)||row.request_digest!==p.digest)fail();return row;
 }
 function condition(p,state='issued'){
  const q=p.q,l=p.lease;
  return {sql:`EXISTS(SELECT 1 FROM sync_account_operation_leases ol JOIN sync_account_devices od ON od.id=ol.device_id AND od.account_id=ol.account_id
   WHERE ol.account_id=? AND ol.device_id=? AND ol.operation_id=? AND ol.envelope_digest=? AND ol.authorization_digest=? AND ol.envelope_json=? AND ol.request_digest=? AND ol.lease_revision=? AND ol.fencing_revision=?
   AND od.operation_fence_revision=ol.fencing_revision AND typeof(od.operation_fence_revision)='integer' AND ol.state=? AND typeof(ol.last_owner_now)='integer' AND ol.last_owner_now>0 AND ${T}>=ol.last_owner_now AND ${T}>=ol.issued_at AND ${T}<ol.expires_at
   ${state==='committed'?'AND ol.committed_revision=? AND ol.payload_hash=?':''})`,values:[q.accountId,q.accountDeviceId,q.operation.operationId,l.envelopeDigest,l.authorizationDigest,canonicalJson(p.envelope),p.digest,l.leaseRevision,l.fencingRevision,state,...(state==='committed'?[q.operation.baseRevision+1,q.operation.payloadHash]:[])]};
 }
 return Object.freeze({
  async issue(e,p){
   validateOperationEnvelope(e);const q=p.q,session=db.withSession('first-primary'),counter=p.row.operation_fence_revision;
   if(!positive(counter)||!Number.isSafeInteger(counter+1))fail();
   const envelopeDigest=await checksum(e),authorizationDigest=await authDigest(p),g=guard(session,p),w=fenceQuery(p.admission,{payload:p.operation.payload});
   await checkpoint('before-operation-lease-issue');
   const noReplay='NOT EXISTS(SELECT 1 FROM sync_account_operation_leases WHERE account_id=? AND operation_id=?)',cas="COALESCE((SELECT revision FROM sync_records WHERE user_id=? AND app_id='port' AND record_type='metronome_settings' AND record_id='default'),0)=?";
   const results=await session.batch([
    assertion(session,g.sql+' AND '+noReplay+' AND '+cas+" AND EXISTS(SELECT 1 FROM sync_account_devices WHERE id=? AND account_id=? AND typeof(operation_fence_revision)='integer' AND operation_fence_revision=?)",[...g.values,q.accountId,q.operation.operationId,q.datasetId,q.operation.baseRevision,q.accountDeviceId,q.accountId,counter]),
    session.prepare(`UPDATE sync_account_devices SET operation_fence_revision=operation_fence_revision+1 WHERE id=? AND account_id=? AND typeof(operation_fence_revision)='integer' AND operation_fence_revision=?`).bind(q.accountDeviceId,q.accountId,counter),
    assertion(session,'changes()=1',[]),
    session.prepare(`INSERT INTO sync_account_operation_leases(account_id,device_id,operation_id,envelope_digest,envelope_json,request_digest,authorization_digest,lease_revision,fencing_revision,issued_at,expires_at,credential_expires_at,state,last_owner_now)
     SELECT ?,?,?,?,?,?,?,1,operation_fence_revision,${T},MIN(credential_expires_at,${T}+?),credential_expires_at,'issued',${T} FROM sync_account_devices WHERE id=? AND account_id=? AND operation_fence_revision=?`).bind(q.accountId,q.accountDeviceId,q.operation.operationId,envelopeDigest,canonicalJson(e),p.digest,authorizationDigest,leaseTtlMs,q.accountDeviceId,q.accountId,counter+1),
    assertion(session,g.sql+` AND EXISTS(SELECT 1 FROM (${w.sql}) f WHERE f.code='ok') AND EXISTS(SELECT 1 FROM sync_account_operation_leases l JOIN sync_account_devices d ON d.id=l.device_id WHERE l.account_id=? AND l.operation_id=? AND l.envelope_digest=? AND l.authorization_digest=? AND l.fencing_revision=? AND d.operation_fence_revision=l.fencing_revision AND l.state='issued' AND l.issued_at>0 AND ${T}>=l.issued_at AND ${T}<l.expires_at)`,[...g.values,...w.values,q.accountId,q.operation.operationId,envelopeDigest,authorizationDigest,counter+1]),clearAssertions(session)]);
   if(!Array.isArray(results)||results.some(r=>r?.success===false))fail();
   await checkpoint('after-operation-lease-issue');const row=await read(db.withSession('first-primary'),q);if(!row)fail();const lease=token(row);validateOperationLease(lease,e);return lease;
  },
  async requireIssued(e,lease,p){p.envelope=e;p.lease=lease;await matching(e,lease,p);await observed(p);const row=await matching(e,lease,p);if(row.state!=='issued'||p.row.operation_fence_revision!==lease.fencingRevision)fail();return p;},
  condition,
  consume(session,p){const q=p.q;return session.prepare(`UPDATE sync_account_operation_leases SET state='committed',committed_revision=?,payload_hash=? WHERE account_id=? AND device_id=? AND operation_id=? AND state='issued' AND envelope_digest=? AND fencing_revision=?`).bind(q.operation.baseRevision+1,q.operation.payloadHash,q.accountId,q.accountDeviceId,q.operation.operationId,p.lease.envelopeDigest,p.lease.fencingRevision);},
  async status(e,lease,p){p.envelope=e;p.lease=lease;await matching(e,lease,p);await observed(p);return matching(e,lease,p);},
  async commitReceipt(p,backend){const row=await matching(p.envelope,p.lease,p);if(row.state!=='committed'||row.committed_revision!==backend.receipt.revision||row.payload_hash!==backend.receipt.payloadHash)fail();return {purpose:'owner-operation-consumed-v1',lease:token(row),envelopeDigest:row.envelope_digest,backendReceipt:backend.receipt,historical:true};}
 });
}
