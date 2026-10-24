// Isolated owner contract only. NOT registered in app.js/account-app.js.
import { parseAccountCredential } from './account-crypto.js';
import { verifyAccountCredentialSnapshot } from './account-auth.js';

export const ACCOUNT_OWNER_CONTEXT_VERSION = 1;
export const ACCOUNT_OWNER_OBSERVATION_MS = 5000;
const uuid = x => typeof x === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(x);
const positive = x => Number.isSafeInteger(x) && x > 0;
const nonempty = x => typeof x === 'string' && x.length > 0;
const refused = code => ({ok:false,code});

// First and only SELECT on a fresh first-primary session. Never inherit a caller
// bookmark, do two sequential identity queries, or fall back to an unknown replica.
export async function readAccountOwnerContext({db,authorization,pepper,requestId,challenge,now=Date.now}={}) {
  if(!uuid(requestId)||!uuid(challenge))return refused('account_owner_request_invalid');
  const credential=typeof authorization==='string'&&authorization.startsWith('Bearer ')?authorization.slice(7):null;
  const parsed=parseAccountCredential(credential);
  if(!parsed)return refused('invalid_account_credential');
  if(typeof db?.withSession!=='function'||typeof pepper!=='string'||pepper.length<32)return refused('account_owner_unavailable');
  try {
    const started=now();if(!positive(started))return refused('account_owner_clock_invalid');
    const session=db.withSession('first-primary');
    const row=await session.prepare(`
      SELECT d.id AS device_id,d.account_id,d.credential_version,d.credential_verifier,d.revoked_at,
        a.state AS account_state,a.generation,a.admission_provenance,
        m.id AS membership_id,m.state AS membership_state,m.generation AS membership_generation,m.deleted_at AS membership_deleted_at,
        EXISTS (SELECT 1 FROM sync_membership_device_links l JOIN sync_devices pd ON pd.id=l.app_device_id
          WHERE l.account_id=a.id AND l.membership_id=m.id AND l.account_device_id=d.id
            AND pd.user_id=m.sync_user_id AND pd.app_id='port' AND pd.revoked_at IS NULL) AS device_linked,
        c.rollout_mode,c.account_read_enabled,c.generation AS runtime_generation
      FROM sync_account_devices d JOIN sync_accounts a ON a.id=d.account_id
      LEFT JOIN sync_account_memberships m ON m.account_id=a.id AND m.app_id='port'
      LEFT JOIN sync_account_runtime_control c ON c.singleton_id=1
      WHERE d.id=?
    `).bind(parsed.deviceId).first();
    const verified=await verifyAccountCredentialSnapshot(row,credential,pepper);
    if(!verified)return refused('invalid_account_credential');
    if(verified.error)return refused(verified.error);
    if(row.admission_provenance!=='production')return refused('account_admission_mismatch');
    if(!['cohort','open'].includes(row.rollout_mode)||row.account_read_enabled!==1||!positive(row.runtime_generation))return refused('account_owner_read_paused');
    if(!nonempty(row.account_id)||row.device_id!==parsed.deviceId||!positive(row.generation)||!positive(row.credential_version)||
      !nonempty(row.membership_id)||row.membership_state!=='active'||row.membership_deleted_at!==null||
      !positive(row.membership_generation)||row.device_linked!==1)return refused('account_owner_identity_unresolved');
    const observedAt=now(),expiresAt=started+ACCOUNT_OWNER_OBSERVATION_MS;
    if(!positive(observedAt)||observedAt<started||observedAt>=expiresAt||!Number.isSafeInteger(expiresAt))return refused('account_owner_observation_expired');
    return {ok:true,contractVersion:1,purpose:'account-owner-observation',requestId,challenge,
      identity:{appId:'port',accountId:row.account_id,accountDeviceId:row.device_id,accountGeneration:row.generation,
        membershipId:row.membership_id,membershipGeneration:row.membership_generation,credentialVersion:row.credential_version},
      freshness:{kind:'primary-snapshot',snapshotStartedAt:started,observedAt,expiresAt,
        remainingMs:expiresAt-observedAt,runtimeGeneration:row.runtime_generation},
      credentialExpiresAt:null,operationAuthorized:false,canWrite:false};
  } catch {return refused('account_owner_unavailable');}
}

// No product route installs this handler. Production activation must reuse the
// Account router's origin/method/rate/rollout policy, separately reviewed.
export async function handleIsolatedAccountOwnerContext(request,{db,pepper,now}={}) {
  const url=new URL(request.url),params=[...url.searchParams.keys()];
  let body;
  if(request.method!=='GET'||url.pathname!=='/v2/accounts/owner-context'||params.length!==2||
      params.filter(k=>k==='requestId').length!==1||params.filter(k=>k==='challenge').length!==1)body=refused('account_owner_request_invalid');
  else body=await readAccountOwnerContext({db,pepper,now,authorization:request.headers.get('Authorization'),
    requestId:url.searchParams.get('requestId'),challenge:url.searchParams.get('challenge')});
  const status=body.ok?200:['invalid_account_credential','account_device_revoked','account_deleting','account_deleted'].includes(body.code)?401:body.code==='account_owner_request_invalid'?400:503;
  return Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
