import { accountDeleteIntentVerifier, parseAccountDeleteIntent } from './account-crypto.js';

const q = (sql, ...params) => ({ sql: `SELECT CASE WHEN (${sql}) THEN 1 ELSE 0 END AS ok`, params });
const clock = "CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)";
const positive = n => Number.isSafeInteger(n) && n > 0;
const route = (method, action, appId = null) => ({ method, action, appId, owner: 'account', state: 'account-device', lane: ['rename-account', 'rename-app', 'cancel'].includes(action) ? 'writer' : 'security' });
export function accountDeviceRoute(path, method) {
  if (path === '/v2/accounts/devices/name' && method === 'POST') return route(method, 'rename-account');
  if (path === '/v2/accounts/delete-intent' && method === 'POST') return route(method, 'intent');
  if (path === '/v2/accounts' && method === 'DELETE') return route(method, 'delete');
  const match = /^\/v2\/accounts\/memberships\/(chord|pitch|fretboard|rhythm)(\/delete-intent|\/delete\/cancel|\/detach|\/devices\/name|\/devices\/revoke)?$/.exec(path);
  if (!match) return null;
  const action = { '/delete-intent': 'intent', '/delete/cancel': 'cancel', '/detach': 'detach', '/devices/name': 'rename-app', '/devices/revoke': 'revoke-app' }[match[2]];
  if (method === 'POST' && action) return route(method, action, match[1]);
  return method === 'DELETE' && !match[2] ? route(method, 'delete', match[1]) : null;
}

// Source-owned, bounded relationship projections, not a second Account store.
// Activity timestamps are excluded; lifecycle state, ownership and revocation are pinned.
function graphSpecs(accountId) {
  const members = 'SELECT id FROM sync_account_memberships WHERE account_id=?';
  const users = 'SELECT sync_user_id FROM sync_account_memberships WHERE account_id=?';
  const defs = [
    ['sync_accounts', 'id,state,generation,recovery_version,deleted_at,delete_requested_at,purge_after', 'id=?', 'id'],
    ['sync_account_memberships', 'id,account_id,app_id,state,generation,sync_user_id,recovery_mode,deleted_at,delete_requested_at,purge_after', 'account_id=?', 'id'],
    ['sync_users', 'id,state,deleted_at,delete_requested_at,purge_after', `id IN (${users})`, 'id'],
    ['sync_account_devices', 'id,account_id,credential_version,revoked_at,user_label', 'account_id=?', 'id'],
    ['sync_devices', 'id,user_id,app_id,credential_version,revoked_at,user_label', `user_id IN (${users})`, 'id'],
    ['sync_membership_device_links', 'account_id,membership_id,app_device_id,account_device_id', `membership_id IN (${members})`, 'app_device_id'],
    ['sync_account_managed_users', 'account_id,membership_id,sync_user_id,app_id', `sync_user_id IN (${users})`, 'sync_user_id'],
    ['sync_datasets', 'user_id,app_id,state', `user_id IN (${users})`, 'user_id,app_id'],
    ['sync_app_join_invitations', 'invitation_id,account_id,membership_id,target_app_id,consumed_at,cancelled_at,cancelled_by_account_device_id', 'account_id=?', 'invitation_id'],
    ['sync_membership_handoffs', 'handoff_id,account_id,membership_id,consumed_at,cancelled_at', 'account_id=?', 'handoff_id'],
    ['sync_port_join_invitations', 'invitation_id,account_id,consumed_at,cancelled_at,cancelled_by_account_device_id', 'account_id=?', 'invitation_id'],
    ['sync_account_recovery_claims', 'claim_id,account_id,committed_at,cancelled_at', 'account_id=?', 'claim_id'],
    ['pairing_codes', 'code_verifier,user_id,consumed_at,cancelled_at', `user_id IN (${users})`, 'code_verifier'],
    ['recovery_claims', 'claim_id,user_id,committed_at,cancelled_at', `user_id IN (${users})`, 'claim_id'],
    ['sync_account_qa_sessions', 'id,account_id,scope,app_id,app_device_id,revoked_at', 'account_id=?', 'id']
  ];
  return defs.map(([table, columns, where, order]) => ({ table, params: [accountId], sql: `SELECT COALESCE(json_group_array(json_object(${columns.split(',').flatMap(k => ["'" + k + "'", k]).join(',')})),'[]') AS snapshot FROM (SELECT ${columns} FROM ${table} WHERE ${where} ORDER BY ${order})` }));
}
function graphCheck(spec, rows = spec.rows) { return q(`(SELECT snapshot FROM (${spec.sql}))=?`, ...spec.params, JSON.stringify(rows)); }
function combined(checks) { return { sql: 'SELECT CASE WHEN ' + checks.map(c => `(${c.sql})=1`).join(' AND ') + ' THEN 1 ELSE 0 END AS ok', params: checks.flatMap(c => c.params) }; }
export async function readAccountDeviceContext(ctx) {
  if (!ctx.route.action || !ctx.account) return;
  const s = ctx.accountDeviceProfile = { action: ctx.route.action, appId: ctx.route.appId, graph: [] };
  let size = 0;
  for (const spec of graphSpecs(ctx.account.accountId)) {
    const row = await ctx.db.prepare(spec.sql).bind(...spec.params).first();
    if (typeof row?.snapshot !== 'string' || row.snapshot.length > 65536 || (size += row.snapshot.length) > 262144) throw Error('lifecycle_graph_bound_hold');
    spec.rows = JSON.parse(row.snapshot); s.graph.push(spec);
  }
  s.rows = Object.fromEntries(s.graph.map(x => [x.table, x.rows]));
  s.member = s.rows.sync_account_memberships.find(m => m.app_id === s.appId);
  if (['intent', 'delete'].includes(s.action)) {
    try {
      s.intentId = parseAccountDeleteIntent(ctx.body?.intentToken)?.intentId;
      s.intentVerifier = await accountDeleteIntentVerifier(ctx.body?.intentToken, ctx.env.SYNC_ACCOUNT_CREDENTIAL_PEPPER);
      s.intent = await ctx.db.prepare('SELECT * FROM sync_account_delete_intents WHERE intent_id=? AND intent_verifier=?').bind(s.intentId || '', s.intentVerifier).first();
    } catch { /* Native validation rejects malformed proof; no identity is synthesized. */ }
  }
}
function ownership(ctx, s) {
  const a = ctx.account.accountId;
  // Include reverse references: a foreign link/grant must not be hidden by Account filtering.
  return q(`NOT EXISTS(SELECT 1 FROM sync_membership_device_links l
    LEFT JOIN sync_account_memberships m ON m.id=l.membership_id LEFT JOIN sync_devices ad ON ad.id=l.app_device_id
    LEFT JOIN sync_account_devices cd ON cd.id=l.account_device_id
    WHERE (l.account_id=? OR m.account_id=? OR cd.account_id=? OR ad.user_id IN (SELECT sync_user_id FROM sync_account_memberships WHERE account_id=?))
    AND (m.id IS NULL OR m.account_id IS NOT l.account_id OR ad.id IS NULL OR ad.user_id IS NOT m.sync_user_id OR ad.app_id IS NOT m.app_id OR cd.id IS NULL OR cd.account_id IS NOT l.account_id))
    AND NOT EXISTS(SELECT 1 FROM sync_account_memberships m WHERE m.account_id=? AND
      (m.recovery_mode<>'account' OR m.generation<1 OR
       (m.sync_user_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sync_account_managed_users am JOIN sync_users u ON u.id=am.sync_user_id WHERE am.sync_user_id=m.sync_user_id AND am.account_id=m.account_id AND am.membership_id=m.id AND am.app_id=m.app_id)) OR
       (m.state IN ('active','deleting') AND NOT EXISTS(SELECT 1 FROM sync_users u WHERE u.id=m.sync_user_id AND u.state=m.state))))
    AND NOT EXISTS(SELECT 1 FROM sync_devices ad JOIN sync_account_memberships m ON m.sync_user_id=ad.user_id WHERE m.account_id=? AND NOT EXISTS(SELECT 1 FROM sync_membership_device_links l WHERE l.app_device_id=ad.id AND l.account_id=m.account_id AND l.membership_id=m.id))
    AND NOT EXISTS(SELECT 1 FROM sync_app_join_invitations g JOIN sync_account_memberships m ON m.id=g.membership_id WHERE (g.account_id=? OR m.account_id=?) AND (g.account_id IS NOT m.account_id OR g.target_app_id IS NOT m.app_id))
    AND NOT EXISTS(SELECT 1 FROM sync_membership_handoffs g JOIN sync_account_memberships m ON m.id=g.membership_id WHERE (g.account_id=? OR m.account_id=?) AND g.account_id IS NOT m.account_id)`, ...Array(10).fill(a));
}
function planTables(items) { return items.map(x => /^\s*(UPDATE|INSERT INTO)\s+(\w+)/.exec(x.sql)?.slice(1).join(' ')); }
function expectPlan(items, tables) { if (JSON.stringify(planTables(items)) !== JSON.stringify(tables)) throw Error('lifecycle_statement_plan_hold'); }
function intentLive(ctx, s) {
  return q(`EXISTS(SELECT 1 FROM sync_account_delete_intents WHERE intent_id=? AND intent_verifier=? AND account_id=? AND scope=? AND target_membership_id IS ? AND requested_by_account_device_id=? AND expected_account_generation=? AND consumed_at IS NULL AND cancelled_at IS NULL AND expires_at>${clock})`, s.intentId, s.intentVerifier, ctx.account.accountId, s.appId ? 'app' : 'account', s.member?.id || null, ctx.account.accountDeviceId, ctx.account.generation);
}
export function accountDeviceTransactionProfile(ctx, items, base, accountAssertion) {
  const s = ctx.accountDeviceProfile; if (!s) return null;
  const text = items[0].sql.replace(/\s+/g, ' ').trim();
  if (/^(UPDATE sync_account_devices SET last_seen_at|INSERT OR IGNORE INTO sync_account_activity|UPDATE sync_account_activity)/.test(text)) return null;
  const a = ctx.account.accountId, action = s.action, m = s.member;
  base.label = 'account-lifecycle-' + action; base.lane = ctx.route.lane;
  base.assertions.push(accountAssertion(ctx), ownership(ctx, s), ...s.graph.map(x => graphCheck(x)));
  if (s.appId && (!m || m.app_id !== ctx.body.appId || !positive(m.generation))) throw Error('lifecycle_member_unknown');
  if (!s.rows.sync_account_memberships.every(r => positive(r.generation)) || ![...s.rows.sync_account_devices,...s.rows.sync_devices].every(r => positive(r.credential_version))) throw Error('lifecycle_counter_unknown');
  if (['detach','cancel'].includes(action)) base.assertions.push(q("EXISTS(SELECT 1 FROM sync_datasets WHERE user_id=? AND app_id=? AND state='ready')",m.sync_user_id,m.app_id));
  const checks = [], expected = structuredClone(s.rows), p = items[0].values, now = p[0];
  if (action === 'intent') {
    expectPlan(items, ['INSERT INTO sync_account_delete_intents']);
    if (!s.intentId || !s.intentVerifier || s.intent || (m && m.state !== 'active')) throw Error('delete_intent_unknown');
    checks.push(q(`EXISTS(SELECT 1 FROM sync_account_delete_intents WHERE intent_id=? AND intent_verifier=? AND account_id=? AND scope=? AND target_membership_id IS ? AND requested_by_account_device_id=? AND expected_account_generation=? AND issue_operation_id=? AND issue_fingerprint=? AND consumed_at IS NULL AND cancelled_at IS NULL AND expires_at>${clock})`, s.intentId, s.intentVerifier, a, s.appId ? 'app' : 'account', m?.id || null, ctx.account.accountDeviceId, ctx.account.generation, ctx.operationId, p[8]));
  } else if (action.startsWith('rename-')) {
    const account = action === 'rename-account', table = account ? 'sync_account_devices' : 'sync_devices';
    expectPlan(items, ['UPDATE ' + table]);
    const id = ctx.body[account ? 'accountDeviceId' : 'appDeviceId'], target = expected[table].find(r => r.id === id);
    if (!target || target.revoked_at !== null || (!account && (m.state !== 'active' || target.user_id !== m.sync_user_id || target.app_id !== m.app_id))) throw Error('rename_target_unknown');
    target.user_label = p[0];
  } else {
    if (!Number.isSafeInteger(now) || now <= 0) throw Error('lifecycle_time_unknown');
    if (!positive(ctx.account.generation+1)) throw Error('lifecycle_generation_overflow');
    expected.sync_accounts[0].generation++;
    const member = expected.sync_account_memberships.find(r => r.id === m?.id);
    const linked = s.rows.sync_membership_device_links.filter(l => !s.appId || l.membership_id === m.id).map(l => l.app_device_id);
    const targeted = action === 'revoke-app' ? [ctx.body.appDeviceId] : linked;
    if (action === 'detach' || action === 'revoke-app') {
      expectPlan(items, action === 'detach' ? ['UPDATE sync_accounts','UPDATE sync_accounts','UPDATE sync_account_memberships','UPDATE sync_account_memberships','UPDATE sync_devices','UPDATE sync_account_qa_sessions','UPDATE sync_app_join_invitations','UPDATE sync_membership_handoffs','INSERT INTO sync_account_lifecycle_operations'] : ['UPDATE sync_accounts','UPDATE sync_accounts','UPDATE sync_devices','UPDATE sync_accounts','UPDATE sync_account_qa_sessions','INSERT INTO sync_account_lifecycle_operations']);
      if (m.state !== 'active' || !targeted.length || (action === 'revoke-app' && (!linked.includes(targeted[0]) || !expected.sync_devices.some(d => d.id === targeted[0] && d.revoked_at === null)))) throw Error('revocation_target_unknown');
      if (action === 'detach') member.generation++;
      for (const d of expected.sync_devices) if (targeted.includes(d.id)) d.revoked_at ??= now;
      for (const r of expected.sync_account_qa_sessions) if (r.scope === 'app' && r.app_id === m.app_id && targeted.includes(r.app_device_id)) r.revoked_at ??= now;
      if (action === 'detach') for (const table of ['sync_app_join_invitations','sync_membership_handoffs']) for (const r of expected[table]) if (r.membership_id === m.id && r.consumed_at === null && r.cancelled_at === null) { r.cancelled_at = now; if (table === 'sync_app_join_invitations') r.cancelled_by_account_device_id ??= ctx.account.accountDeviceId; }
    } else if (action === 'cancel') {
      expectPlan(items, ['UPDATE sync_accounts','UPDATE sync_accounts','UPDATE sync_account_memberships','UPDATE sync_accounts','UPDATE sync_users','UPDATE sync_accounts','INSERT INTO sync_account_lifecycle_operations']);
      const user = expected.sync_users.find(u => u.id === m.sync_user_id);
      if (m.state !== 'deleting' || user?.state !== 'deleting' || !positive(m.purge_after) || !positive(user.purge_after)) throw Error('cancellation_not_recoverable');
      const deadline = q(`${clock}<? AND ${clock}<?`, m.purge_after, user.purge_after);
      base.assertions.push(deadline); checks.push(deadline);
      member.generation++;
      for (const r of [member,user]) Object.assign(r, { state:'active', deleted_at:null, delete_requested_at:null, purge_after:null });
      // No credential revocation is cleared. Cancellation is restoration, hence writer lane.
    } else if (action === 'delete') {
      expectPlan(items, s.appId ? ['UPDATE sync_account_memberships','UPDATE sync_users','UPDATE sync_devices','UPDATE pairing_codes','UPDATE recovery_claims','UPDATE sync_membership_handoffs','UPDATE sync_app_join_invitations','UPDATE sync_accounts','UPDATE sync_accounts','UPDATE sync_account_delete_intents','INSERT INTO sync_account_lifecycle_operations'] : ['UPDATE sync_accounts','UPDATE sync_accounts','UPDATE sync_account_memberships','UPDATE sync_account_memberships','UPDATE sync_users','UPDATE sync_account_devices','UPDATE sync_devices','UPDATE sync_membership_handoffs','UPDATE sync_app_join_invitations','UPDATE sync_port_join_invitations','UPDATE sync_account_recovery_claims','UPDATE pairing_codes','UPDATE recovery_claims','UPDATE sync_account_delete_intents','INSERT INTO sync_account_lifecycle_operations']);
      if (!s.intent || s.intent.account_id !== a || (m && m.state !== 'active') || !positive(p[1]) || p[1] <= now) throw Error('delete_proof_unknown');
      base.assertions.push(intentLive(ctx, s));
      const purge = p[1];
      if (!s.appId) Object.assign(expected.sync_accounts[0], { state:'deleting', delete_requested_at:now, purge_after:purge });
      const selected = expected.sync_account_memberships.filter(r => !s.appId || r.id === m.id);
      for (const r of selected) if (r.state === 'active' || (!s.appId && r.state === 'pending')) { const pending = r.state === 'pending'; Object.assign(r, { state:pending?'deleted':'deleting', generation:r.generation+1, delete_requested_at:now, purge_after:purge, ...(pending?{deleted_at:now}:{}) }); }
      const users = selected.map(r => r.sync_user_id);
      for (const u of expected.sync_users) if (users.includes(u.id) && (s.appId || u.state === 'active')) Object.assign(u, { state:'deleting', deleted_at:now, delete_requested_at:now, purge_after:purge });
      for (const d of expected.sync_devices) if (targeted.includes(d.id)) d.revoked_at ??= now;
      if (!s.appId) for (const d of expected.sync_account_devices) d.revoked_at ??= now;
      for (const table of ['sync_membership_handoffs','sync_app_join_invitations','sync_port_join_invitations','sync_account_recovery_claims','pairing_codes','recovery_claims']) for (const r of expected[table]) {
        const belongs = ['pairing_codes','recovery_claims'].includes(table) ? users.includes(r.user_id) : s.appId ? r.membership_id === m.id : true;
        if (belongs && (r.consumed_at ?? r.committed_at ?? null) === null && r.cancelled_at === null) { r.cancelled_at = now; if (table === 'sync_port_join_invitations') r.cancelled_by_account_device_id ??= ctx.account.accountDeviceId; }
      }
      const consume = items.at(-2).values;
      checks.push(q(`EXISTS(SELECT 1 FROM sync_account_delete_intents WHERE intent_id=? AND intent_verifier=? AND account_id=? AND expected_account_generation=? AND consumed_at=? AND consume_operation_id=? AND consume_fingerprint=? AND cancelled_at IS NULL AND expires_at>${clock})`, s.intentId, s.intentVerifier, a, ctx.account.generation, now, ctx.operationId, consume[2]));
    } else throw Error('lifecycle_action_hold');
    const record = items.at(-1).values;
    const isDelete = action === 'delete', fp = record[1];
    const kind = isDelete ? (s.appId?'app_delete':'account_delete') : action === 'cancel'?'app_delete':'device_revoke';
    const target = isDelete ? m?.id || null : action === 'revoke-app'?ctx.body.appDeviceId:m.id;
    const result = isDelete ? record[5] : record[4];
    checks.push(q(`EXISTS(SELECT 1 FROM sync_account_lifecycle_operations WHERE operation_id=? AND request_fingerprint=? AND account_id=? AND kind=? AND target_id IS ? AND result_json=? AND EXISTS(SELECT 1 FROM sync_accounts a WHERE a.id=sync_account_lifecycle_operations.account_id AND a.admission_provenance='production'))`, ctx.operationId, fp, a, kind, target, result));
  }
  if (!expected.sync_account_memberships.every(r => positive(r.generation))) throw Error('lifecycle_generation_overflow');
  checks.push(...s.graph.map(spec => graphCheck(spec, expected[spec.table])));
  base.outcome = combined(checks);
  base.summary = { type:'account-lifecycle-'+action, accountId:a, membershipId:m?.id||null, appId:s.appId, phase:action==='intent'?'intent-only':action==='delete'?'logical-deletion-purge-held':action, physicalPurge:false };
  return base;
}
