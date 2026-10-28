import { accountHandoffVerifier, appJoinCodeVerifier, portJoinCodeVerifier, parseAccountCredential, accountCredentialVerifier, parseAccountAppCredential, accountAppCredentialVerifier } from './account-crypto.js';

const q=(sql,...params)=>({sql:`SELECT CASE WHEN (${sql}) THEN 1 ELSE 0 END AS ok`,params});
const clock="CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)";
const positive=n=>Number.isSafeInteger(n)&&n>0;
const definitions={
 app:{path:'/v2/accounts/app-join-invitations',table:'sync_app_join_invitations',id:'invitation_id',verifier:'code_verifier',verify:appJoinCodeVerifier},
 port:{path:'/v2/accounts/port-join-invitations',table:'sync_port_join_invitations',id:'invitation_id',verifier:'code_verifier',verify:portJoinCodeVerifier},
 handoff:{path:'/v2/accounts/handoffs',table:'sync_membership_handoffs',id:'handoff_id',verifier:'handoff_verifier',verify:accountHandoffVerifier}
};
export const MEMBERSHIP_OWNER_ROUTES=Object.freeze(Object.fromEntries([
 ['GET /v2/accounts/memberships',{method:'GET',owner:'account',state:'account-device',lane:'security'}],
 ['POST /v2/accounts/memberships',{method:'POST',owner:'account',state:'account-device',lane:'writer'}],
 ...Object.entries(definitions).flatMap(([family,d])=>[
  ...(family==='handoff'?[]:[['GET '+d.path,{method:'GET',owner:'account',state:'account-device',lane:'security',family}]]),
  ['POST '+d.path,{method:'POST',owner:'account',state:'account-device',lane:'writer',family}],
  ['POST '+d.path+'/cancel',{method:'POST',owner:'account',state:'account-device',lane:'security',family}],
  ['POST '+d.path+'/consume',{method:'POST',owner:'account',state:'account-grant',lane:'writer',family}]
 ])
]));
function snapshot(table,row,columns){
 if(!row)throw Error('membership_snapshot_unknown');
 return q(`EXISTS(SELECT 1 FROM ${table} WHERE ${columns.map(k=>k+' IS ?').join(' AND ')})`,...columns.map(k=>row[k]));
}
const memberColumns=['id','account_id','app_id','state','generation','sync_user_id','recovery_mode'];
const grantColumns=d=>[d.id,d.verifier,'account_id','admission_provenance','created_by_account_device_id','expires_at','consumed_at','cancelled_at','issue_operation_id','issue_fingerprint','qa_issuer_session_id',...(d===definitions.port?['expected_recovery_version','expected_account_generation']:['membership_id',...(d===definitions.app?['target_app_id']:['handoff_kind','expected_sync_user_id'])])];
export async function readMembershipContext(ctx){
 const d=definitions[ctx.route.family];
 if(!d&&ctx.path!=='/v2/accounts/memberships')return;
 const body=ctx.body||{};
 // These modes have different owners/transactions. Refuse before native legacy auth activity.
 if(Object.hasOwn(body,'qaCredential')||body.consumeMode==='existing_chord')throw Error('membership_mode_hold');
 ctx.membershipProfile={definition:d};const s=ctx.membershipProfile;
 if(ctx.account&&body.appId){s.member=await ctx.db.prepare('SELECT * FROM sync_account_memberships WHERE account_id=? AND app_id=?').bind(ctx.account.accountId,body.appId).first();}
 if(ctx.path==='/v2/accounts/memberships'&&s.member&&!['pending','active'].includes(s.member.state))throw Error('membership_purge_provenance_hold');
 if(d&&ctx.path.endsWith('/consume')){
  try{
   const token=d===definitions.handoff?body.handoffToken:body.joinCode;
   const pepper=d===definitions.handoff?ctx.env.SYNC_ACCOUNT_HANDOFF_PEPPER:ctx.env.SYNC_ACCOUNT_APP_JOIN_PEPPER;
   s.verifier=await d.verify(token,pepper);
   s.grant=await ctx.db.prepare(`SELECT * FROM ${d.table} WHERE ${d.verifier}=?`).bind(s.verifier).first();
   s.nextAccountId=parseAccountCredential(body.accountCredential)?.deviceId;
   s.nextAccountVerifier=await accountCredentialVerifier(body.accountCredential,ctx.env.SYNC_ACCOUNT_CREDENTIAL_PEPPER);
   if(d!==definitions.port){s.nextAppId=parseAccountAppCredential(body.appDeviceCredential)?.deviceId;s.nextAppVerifier=await accountAppCredentialVerifier(body.appDeviceCredential,ctx.env.SYNC_CREDENTIAL_PEPPER);}
  }catch{ /* Native input validation remains authoritative; no mutation profile can admit unknown proof. */ }
  if(s.grant){
   const g=s.grant;
   s.issuer=await ctx.db.prepare(`SELECT a.id,a.state,a.deleted_at,a.admission_provenance,a.generation,a.recovery_version,d.id AS device_id,d.credential_version,d.credential_verifier,d.revoked_at FROM sync_accounts a JOIN sync_account_devices d ON d.account_id=a.id WHERE a.id=? AND d.id=?`).bind(g.account_id,g.created_by_account_device_id).first();
   if(d!==definitions.port)s.member=await ctx.db.prepare('SELECT * FROM sync_account_memberships WHERE id=? AND account_id=?').bind(g.membership_id,g.account_id).first();
   if(g.admission_provenance!=='production'||s.issuer?.admission_provenance!=='production'||g.qa_issuer_session_id)throw Error('qa_owner_profile_hold');
   if(d===definitions.handoff&&g.handoff_kind!=='rejoin')throw Error('initial_handoff_hold');
   if(s.issuer&&[s.issuer.generation,s.issuer.recovery_version,s.issuer.credential_version].every(positive)&&(!s.member||positive(s.member.generation))){
    ctx.membershipSubject={kind:'owner-grant-new-device-target',accountId:g.account_id,issuerDeviceId:g.created_by_account_device_id,grantId:g[d.id],generation:s.issuer.generation,recoveryVersion:s.issuer.recovery_version,issuerCredentialVersion:s.issuer.credential_version,membershipId:s.member?.id||null,membershipGeneration:s.member?.generation||null,targetAccountDeviceId:s.nextAccountId||null,targetAppDeviceId:s.nextAppId||null};
   }
  }
 }else if(d&&ctx.path.endsWith('/cancel')){
  s.grant=await ctx.db.prepare(`SELECT * FROM ${d.table} WHERE ${d.id}=?`).bind(body[d.id==='handoff_id'?'handoffId':'invitationId']||'').first();
 }
}
function memberFence(s){if(!positive(s.member?.generation))throw Error('membership_generation_unknown');return snapshot('sync_account_memberships',s.member,memberColumns);}
function liveIssuer(s){
 const a=s.issuer;if(!a||![a.generation,a.recovery_version,a.credential_version].every(positive))throw Error('grant_owner_unknown');
 return q(`EXISTS(SELECT 1 FROM sync_accounts a JOIN sync_account_devices d ON d.account_id=a.id WHERE a.id=? AND a.state='active' AND a.deleted_at IS NULL AND a.admission_provenance='production' AND a.generation=? AND a.recovery_version=? AND d.id=? AND d.credential_version=? AND d.credential_verifier=? AND d.revoked_at IS NULL)`,a.id,a.generation,a.recovery_version,a.device_id,a.credential_version,a.credential_verifier);
}
function readyMember(s){const m=s.member;return q(`EXISTS(SELECT 1 FROM sync_users u JOIN sync_datasets d ON d.user_id=u.id AND d.app_id=? JOIN sync_account_managed_users am ON am.sync_user_id=u.id WHERE u.id=? AND u.state='active' AND u.deleted_at IS NULL AND d.state='ready' AND am.account_id=? AND am.membership_id=? AND am.app_id=?)`,m.app_id,m.sync_user_id,m.account_id,m.id,m.app_id);}
function consumeProfile(ctx,items,base,s){
 const d=s.definition,g=s.grant,m=s.member;
 if(!g||!ctx.membershipSubject||!s.nextAccountId||!s.nextAccountVerifier)throw Error('grant_proof_unknown');
 if(d!==definitions.port&&(!m||m.app_id!==ctx.body.appId||!['pending','active'].includes(m.state)))throw Error('grant_member_mismatch');
 const port=d===definitions.port,initial=!port&&m.state==='pending';
 const expected=port?['sync_account_devices',d.table]:initial?['sync_users','sync_devices','sync_account_devices','sync_membership_device_links','sync_account_managed_users','sync_account_memberships',d.table,'sync_account_memberships']:['sync_devices','sync_account_devices','sync_membership_device_links',d.table,'sync_account_memberships'];
 if(items.length!==expected.length||items.some((x,i)=>!new RegExp('^\\s*(?:INSERT INTO|UPDATE) '+expected[i]+'\\b').test(x.sql)))throw Error('grant_plan_unknown');
 base.label=ctx.route.family+'-grant-consume';base.lane='writer';base.assertions.push(liveIssuer(s),snapshot(d.table,g,grantColumns(d)),q(`EXISTS(SELECT 1 FROM ${d.table} WHERE ${d.id}=? AND consumed_at IS NULL AND cancelled_at IS NULL AND expires_at>${clock})`,g[d.id]),q('NOT EXISTS(SELECT 1 FROM sync_account_devices WHERE id=?)',s.nextAccountId));
 if(port){
  if(g.expected_recovery_version!==s.issuer.recovery_version||g.expected_account_generation!==s.issuer.generation)throw Error('grant_generation_mismatch');
 }else{
  if(!s.nextAppId||!s.nextAppVerifier)throw Error('grant_app_proof_unknown');
  base.assertions.push(memberFence(s),q('NOT EXISTS(SELECT 1 FROM sync_devices WHERE id=?)',s.nextAppId));
  if(initial){if(m.sync_user_id!==null||d===definitions.handoff)throw Error('grant_initial_hold');}
  else{base.assertions.push(readyMember(s));if(d===definitions.handoff&&g.expected_sync_user_id!==m.sync_user_id)throw Error('handoff_user_mismatch');}
 }
 const claim=items.find(x=>new RegExp('^\\s*UPDATE '+d.table+'\\b').test(x.sql));
 const fp=claim.values[port?3:4];
 let sql=`EXISTS(SELECT 1 FROM ${d.table} h JOIN sync_account_devices cd ON cd.id=h.claimed_by_account_device_id AND cd.account_id=h.account_id WHERE h.${d.id}=? AND h.${d.verifier}=? AND h.account_id=? AND h.consume_operation_id=? AND h.consume_fingerprint=? AND h.consumed_at IS NOT NULL AND h.cancelled_at IS NULL AND h.expires_at>${clock} AND cd.id=? AND cd.credential_verifier=? AND cd.credential_version=1 AND cd.revoked_at IS NULL AND h.${port?'qa_port_session_id':'qa_app_session_id'} IS NULL`;
 const params=[g[d.id],s.verifier,g.account_id,ctx.operationId,fp,s.nextAccountId,s.nextAccountVerifier];
 if(!port){
  sql+=` AND h.claimed_by_app_device_id=? AND h.consume_mode='new_app' AND EXISTS(SELECT 1 FROM sync_account_memberships m JOIN sync_users u ON u.id=m.sync_user_id JOIN sync_devices ad ON ad.user_id=u.id AND ad.app_id=m.app_id JOIN sync_membership_device_links l ON l.app_device_id=ad.id AND l.membership_id=m.id AND l.account_id=m.account_id JOIN sync_account_managed_users am ON am.sync_user_id=u.id AND am.account_id=m.account_id AND am.membership_id=m.id AND am.app_id=m.app_id WHERE m.id=? AND m.account_id=h.account_id AND m.app_id=? AND m.state='active' AND m.recovery_mode='account' AND m.generation=? AND u.state='active' AND u.deleted_at IS NULL AND ad.id=? AND ad.credential_verifier=? AND ad.credential_version=1 AND ad.revoked_at IS NULL AND l.account_device_id=cd.id)`;
  params.push(s.nextAppId,m.id,m.app_id,m.generation+(initial?1:0),s.nextAppId,s.nextAppVerifier);
  if(!initial){sql+=` AND EXISTS(SELECT 1 FROM sync_account_memberships WHERE id=? AND sync_user_id=?)`;params.push(m.id,m.sync_user_id);}
 }
 sql+=')';base.outcome=q(sql,...params);
 base.summary={type:port?'port-account-device-joined':initial?'membership-activated':'membership-environment-joined',accountId:g.account_id,membershipId:m?.id||null,membershipGeneration:m?m.generation+(initial?1:0):null,grantId:g[d.id],accountDeviceId:s.nextAccountId,appDeviceId:s.nextAppId||null};return base;
}
export function membershipTransactionProfile(ctx,items,base,accountAssertion){
 const s=ctx.membershipProfile;if(!s)return null;
 const text=items.map(x=>x.sql.replace(/\s+/g,' ').trim()).join('\n'),p=items[0].values,d=s.definition;
 // Existing Account activity remains security-only in the original profile.
 if(/^(UPDATE sync_account_devices SET last_seen_at|INSERT OR IGNORE INTO sync_account_activity|UPDATE sync_account_activity)/.test(text))return null;
 if(ctx.path.endsWith('/consume'))return consumeProfile(ctx,items,base,s);
 base.assertions.push(accountAssertion(ctx));
 if(ctx.path==='/v2/accounts/memberships'&&items.length===1&&/^INSERT INTO sync_account_memberships\b/.test(text)){
  if(s.member)throw Error('membership_reprepare_hold');base.label='membership-prepare';
  base.assertions.push(q('NOT EXISTS(SELECT 1 FROM sync_account_memberships WHERE account_id=? AND app_id=?)',ctx.account.accountId,ctx.body.appId));
  base.outcome=q(`EXISTS(SELECT 1 FROM sync_account_memberships WHERE id=? AND account_id=? AND app_id=? AND state='pending' AND sync_user_id IS NULL AND generation=1 AND recovery_mode='account' AND prepared_operation_id=? AND prepared_by_account_device_id=?)`,p[0],ctx.account.accountId,ctx.body.appId,ctx.operationId,ctx.account.accountDeviceId);
  base.summary={type:'membership-prepared',accountId:ctx.account.accountId,membershipId:p[0],appId:ctx.body.appId};return base;
 }
 if(!d||items.length!==1)throw Error('membership_plan_hold');
 const a=ctx.account.accountId,issuer=ctx.account.accountDeviceId;
 if(ctx.path.endsWith('/cancel')&&text.startsWith('UPDATE '+d.table+' SET cancelled_at')){
  const g=s.grant;if(!g||g.account_id!==a||g.created_by_account_device_id!==issuer)throw Error('grant_cancel_owner_unknown');
  base.lane='security';base.label=ctx.route.family+'-cancel';base.assertions.push(snapshot(d.table,g,grantColumns(d)));
  base.outcome=q(`EXISTS(SELECT 1 FROM ${d.table} WHERE ${d.id}=? AND account_id=? AND created_by_account_device_id=? AND consumed_at IS NULL AND cancelled_at=? AND cancelled_by_account_device_id=?)`,g[d.id],a,issuer,p[0],issuer);base.summary={type:'owner-grant-cancelled',grantId:g[d.id]};return base;
 }
 if(ctx.path!==d.path||ctx.request.method!=='POST')throw Error('grant_plan_hold');
 if(d!==definitions.port){base.assertions.push(memberFence(s));if(!['pending','active'].includes(s.member.state))throw Error('membership_not_joinable');if(d===definitions.handoff&&(s.member.state!=='active'||!s.member.sync_user_id))throw Error('initial_handoff_hold');
  if(s.member.state==='active')base.assertions.push(q("EXISTS(SELECT 1 FROM sync_datasets WHERE user_id=? AND app_id=? AND state='ready')",s.member.sync_user_id,s.member.app_id));}
 if(text.startsWith('UPDATE '+d.table+' SET cancelled_at')){
  base.label=ctx.route.family+'-retire-previous';
  // This may validly update zero expired rows. It is not proof of issuing a grant.
  const scope=d===definitions.port?'created_by_account_device_id':'membership_id',value=d===definitions.port?issuer:s.member.id;
  base.outcome=q(`NOT EXISTS(SELECT 1 FROM ${d.table} WHERE account_id=? AND ${scope}=? AND consumed_at IS NULL AND cancelled_at IS NULL AND (expires_at<=?${d===definitions.handoff?" OR handoff_kind='rejoin'":''}))`,a,value,p[0]);base.summary={type:'obsolete-grants-retired-no-new-grant'};return base;
 }
 if(text.startsWith('INSERT INTO '+d.table)){
  base.label=ctx.route.family+'-issue';
  let sql=`EXISTS(SELECT 1 FROM ${d.table} WHERE ${d.id}=? AND ${d.verifier}=? AND account_id=? AND created_by_account_device_id=? AND admission_provenance='production' AND issue_operation_id=? AND consumed_at IS NULL AND cancelled_at IS NULL AND qa_issuer_session_id IS NULL AND expires_at>${clock}`;
  const params=[p[0],p[1],a,issuer,ctx.operationId];
  if(d===definitions.port){sql+=' AND expected_recovery_version=? AND expected_account_generation=?';params.push(ctx.account.recoveryVersion,ctx.account.generation);}
  else{sql+=' AND membership_id=?';params.push(s.member.id);if(d===definitions.app){sql+=' AND target_app_id=?';params.push(s.member.app_id);}else{sql+=" AND handoff_kind='rejoin' AND expected_sync_user_id=?";params.push(s.member.sync_user_id);}}
  base.outcome=q(sql+')',...params);base.summary={type:'owner-grant-issued',grantId:p[0],accountId:a,membershipId:s.member?.id||null};return base;
 }
 throw Error('membership_mutation_hold');
}
