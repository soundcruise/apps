// Restrictive owner facts only. Caller has verified this SQL snapshot's HMAC.
// observedTime is from the owner's SELECT, NEVER a request/browser timestamp.
export const SQL_OWNER_TIME="CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)";
const positive=n=>Number.isSafeInteger(n)&&n>0;
export async function observeOwnerClock(session,row,{allowUnissued=false}={}){
 if(!row||!positive(row.owner_now)||(!positive(row.credential_clock_floor)&&!(allowUnissued&&row.credential_clock_floor===null)))throw Error('owner-clock-unknown');
 const time=`MAX(?,${SQL_OWNER_TIME})`;
 const result=await session.prepare(`UPDATE sync_account_devices SET
  credential_clock_floor=CASE WHEN credential_clock_floor IS NULL THEN ${time} ELSE MAX(credential_clock_floor,${time}) END,
  credential_lifecycle=CASE WHEN credential_lifecycle IN ('active','renewing') AND typeof(credential_expires_at)='integer' AND credential_expires_at<=${time} THEN 'expired' ELSE credential_lifecycle END
  WHERE id=? AND account_id=? AND credential_version=? AND credential_verifier=?
  AND ((typeof(credential_clock_floor)='integer' AND credential_clock_floor>0) ${allowUnissued?"OR (credential_clock_floor IS NULL AND credential_lifecycle IS NULL AND credential_issued_at IS NULL AND credential_expires_at IS NULL AND credential_lease_revision IS NULL AND credential_account_generation IS NULL AND credential_membership_id IS NULL AND credential_membership_generation IS NULL AND credential_operations_json IS NULL AND credential_transition_id IS NULL)":''})`)
  .bind(row.owner_now,row.owner_now,row.owner_now,row.device_id,row.account_id,row.credential_version,row.credential_verifier).run();
 if(result?.success!==true||Number(result.meta?.changes)!==1)throw Error('owner-clock-unproven');
}
