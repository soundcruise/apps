// Cloud Sync UX 2.0 Phase AI1-A: the read-only diagnostic foundation an AI assistant may call.
//
// Boundaries (see test/ai-diagnostics.test.js):
// - Authorization is the strict read-only Account path (accountContext readOnly): the same
//   verification as every Account route, and zero D1 writes.
// - The Account is fixed by that credential. Neither tool accepts an Account, membership or device
//   id; getAppSyncTargets accepts only one of four app ids.
// - Only two existing SELECT-only repository reads are used (getAccountSummary and
//   listAppEnvironments). There is no SQL, D1 access, fetch or URL here.
// - Output is a stable, minimal contract. Device ids become per-session refs (T1, T2, ...), names
//   follow the N1 order (userLabel → registered label → bounded short ID → ref), every name is untrusted
//   data, never instructions. No credential, verifier, code, full id, raw row or sync payload.
// - Status semantics mirror Cruise Port UX1 (sync-center-controller.js); a parity test runs the
//   Port module on the same fixtures. displayStatus 「✓ 同期済み」 is NOT removal safety.
// - Nothing is stored: no history, no conversation, no D1 migration.
import { createD1AccountRepository } from './account-database.js';
import { createD1AccountLifecycleRepository } from './account-lifecycle-database.js';
import { accountContext } from './account-app.js';
import { normalizeSyncTargetUserLabel } from './account-validation.js';
import { containsSecret } from './secret-detector.js';

export const DIAGNOSTIC_CONTRACT_VERSION = 1;

export const DIAGNOSTIC_APPS = Object.freeze([
  Object.freeze({ id: 'pitch', name: '音感クルーズ' }),
  Object.freeze({ id: 'fretboard', name: '指板クルーズ' }),
  Object.freeze({ id: 'rhythm', name: 'リズムクルーズ' }),
  Object.freeze({ id: 'chord', name: 'コードクルーズ' })
]);
const APP_IDS = new Set(DIAGNOSTIC_APPS.map((app) => app.id));

// The label Cruise Port shows for each displayStatus, so an assistant can quote the screen.
const DISPLAY_LABELS = Object.freeze({
  available: '✓ 同期済み',
  attention: '確認が必要',
  recheck: '再確認が必要',
  syncing: '同期中',
  connecting: '接続中',
  detached: '未接続',
  deleting: '削除中'
});
const REPORT_STATES = new Set(['clean', 'pending', 'attention', 'error']);

// Same forbidden characters as sync target names (N1), built from code points so the source holds
// no raw control characters. Registered labels predate N1, so they are re-checked here.
const FORBIDDEN_TEXT = new RegExp(`[${[[0x0, 0x1f], [0x7f, 0x9f], [0x2028, 0x2029], [0x61c, 0x61c],
  [0x200e, 0x200f], [0x202a, 0x202e], [0x2066, 0x2069]]
  .map(([from, to]) => `${String.fromCodePoint(from)}-${String.fromCodePoint(to)}`).join('')}]`, 'u');
const REGISTERED_LABEL_MAX = 80;

function safeRegisteredLabel(value) {
  if (typeof value !== 'string') return null;
  if (typeof value.isWellFormed === 'function' && !value.isWellFormed()) return null;
  if (FORBIDDEN_TEXT.test(value)) return null;
  const text = value.normalize('NFC').trim();
  return text && [...text].length <= REGISTERED_LABEL_MAX && !containsSecret(text) ? text : null;
}

// A name that looks like it holds a code (e.g. 「Proの番号 1234」) is treated as absent, so the next
// name in the N1 order is used and the turn continues. The name itself is never sent to a model.
function safeUserLabel(value) {
  const normalized = normalizeSyncTargetUserLabel(value);
  return typeof normalized === 'string' && !containsSecret(normalized) ? normalized : null;
}

function count(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

// Bounded short IDs for the model. A device ID is 32 hex characters; the model never needs it, so
// only 4, 6 or at most 8 leading characters are ever shown, and never the whole normalized ID.
// If 8 characters still do not tell a target apart, shortId is null and the session-local ref
// (T1, T2, ...) is the identifier instead. There is no longer-prefix or full-ID fallback.
export const SHORT_ID_LENGTHS = Object.freeze([4, 6, 8]);
export const SHORT_ID_MAX = SHORT_ID_LENGTHS.at(-1);

function boundedShortIds(ids) {
  const normalized = ids.map((id) => (typeof id === 'string' ? id.replace(/[^0-9a-z]/gi, '').toUpperCase() : ''));
  return normalized.map((value, index) => {
    for (const length of SHORT_ID_LENGTHS) {
      // Strictly shorter than the ID itself, so even a short or malformed ID is never shown whole.
      if (value.length <= length) return null;
      const prefix = value.slice(0, length);
      if (!normalized.some((other, otherIndex) => otherIndex !== index && other.startsWith(prefix))) return prefix;
    }
    return null;
  });
}

// --- Status semantics (mirror of Cruise Port sync-center-controller.js) ----------------------

function isAppDeleteGrace(membership, accountDeleting, now) {
  return membership?.state === 'deleting' && !accountDeleting && membership.deletedAt == null &&
    Number.isSafeInteger(membership.deleteRequestedAt) && Number.isSafeInteger(membership.purgeAfter) &&
    membership.purgeAfter > now;
}

// cloudState: where the app's membership and cloud dataset are.
function cloudStateOf(membership, accountDeleting, now) {
  if (!membership) return 'unset';
  if (isAppDeleteGrace(membership, accountDeleting, now)) return 'detached';
  if (membership.deletedAt != null || ['deleting', 'deleted'].includes(membership.state)) return 'deleting';
  const active = Number.isSafeInteger(membership.activeAppDeviceCount) ? membership.activeAppDeviceCount : null;
  if (['pending', 'prepared'].includes(membership.state)) {
    return active === 0 ? 'detached' : active > 0 ? 'connecting' : 'prepared';
  }
  if (membership.state !== 'active') return 'attention';
  const dataset = membership.dataset?.state;
  if (dataset === 'ready' && active === 0) return 'detached';
  if (dataset === 'ready') return 'synced';
  const initializing = !membership.dataset || ['initializing', 'migrating', 'empty'].includes(dataset);
  if (active > 0 && initializing) return 'connecting';
  if (initializing) return 'initial';
  return 'attention';
}

function removalSafetyOf(membership, cloudState) {
  return cloudState === 'synced' && membership?.removalSafety === 'safe' ? 'safe'
    : membership?.removalSafety === 'attention' ? 'attention' : 'unknown';
}

function reportStateOf(target) {
  if (!('lastReport' in target)) return 'unknown';
  if (target.lastReport === null) return 'none';
  return REPORT_STATES.has(target.lastReport?.state) ? target.lastReport.state : 'unknown';
}

// The summary and the devices list are separate reads, not one snapshot. 'mismatch' means they
// disagree; no single target is ever named as the cause.
function snapshotStateOf(cloudState, membership, removalSafety, targets) {
  if (cloudState !== 'synced') return 'unverified';
  if (count(membership?.activeAppDeviceCount) !== targets.length) return 'mismatch';
  const states = targets.map(reportStateOf);
  if (!targets.length || states.includes('unknown')) return 'unverified';
  const derived = states.some((state) => state === 'attention' || state === 'error') ? 'attention'
    : states.every((state) => state === 'clean') ? 'safe' : 'unknown';
  if (derived !== removalSafety) return 'mismatch';
  const reported = targets.reduce((sum, target) => sum +
    (target.lastReport?.state === 'attention' ? count(target.lastReport.attentionCount) : 0), 0);
  return reported === count(membership?.attentionConflictCount) ? 'aligned' : 'mismatch';
}

// displayStatus: the main status Cruise Port shows for the app row.
function displayStatusOf(cloudState, removalSafety, attentionCount, snapshotState) {
  if (cloudState === 'deleting') return 'deleting';
  if (cloudState === 'connecting') return 'connecting';
  if (cloudState === 'initial') return 'syncing';
  if (['unset', 'prepared', 'detached'].includes(cloudState)) return 'detached';
  if (cloudState === 'synced') {
    if (snapshotState === 'mismatch') return 'recheck';
    return removalSafety === 'attention' || attentionCount > 0 ? 'attention' : 'available';
  }
  return 'attention';
}

// --- Projection ------------------------------------------------------------------------------

function projectApp(app, membership, appTargets, accountDeleting, now) {
  const cloudState = cloudStateOf(membership, accountDeleting, now);
  const removalSafety = removalSafetyOf(membership, cloudState);
  const attentionCount = count(membership?.attentionConflictCount);
  const snapshotState = snapshotStateOf(cloudState, membership, removalSafety, appTargets);
  const displayStatus = displayStatusOf(cloudState, removalSafety, attentionCount, snapshotState);
  const reports = { clean: 0, pending: 0, none: 0, attention: 0, error: 0, unknown: 0 };
  for (const target of appTargets) reports[reportStateOf(target)] += 1;
  return {
    appId: app.id,
    appName: app.name,
    cloudState,
    datasetState: membership?.dataset?.state ?? null,
    displayStatus,
    displayLabel: DISPLAY_LABELS[displayStatus],
    snapshotState,
    // What the reports allow about removing an app from a device. Separate from displayStatus:
    // 「✓ 同期済み」 (available) never means removal is safe; only removalSafety 'safe' does.
    removalSafety,
    attentionCount,
    activeTargetCount: count(membership?.activeAppDeviceCount),
    reportCounts: reports
  };
}

function freezeDeep(value) {
  if (value && typeof value === 'object') {
    for (const inner of Object.values(value)) freezeDeep(inner);
    Object.freeze(value);
  }
  return value;
}

// identity must come from read-only authorization. The returned tools are the only way in.
export function createSyncDiagnostics({
  session,
  identity,
  now = () => Date.now(),
  createAccountRepository = createD1AccountRepository,
  createLifecycleRepository = createD1AccountLifecycleRepository
}) {
  if (!identity?.accountId) throw new Error('sync_diagnostics_identity_required');
  const accountRepository = createAccountRepository(session);
  const lifecycleRepository = createLifecycleRepository(session);
  // Session-local refs: the same device keeps its ref for this diagnostics session; refs are
  // never translated back into device ids by anything the model can reach.
  const refs = new Map();
  const refFor = (deviceId) => {
    if (!refs.has(deviceId)) refs.set(deviceId, `T${refs.size + 1}`);
    return refs.get(deviceId);
  };

  async function load() {
    let summary;
    let appDevices;
    try {
      [summary, appDevices] = await Promise.all([
        accountRepository.getAccountSummary(identity.accountId),
        lifecycleRepository.listAppEnvironments(identity)
      ]);
    } catch {
      // A storage error is replaced by a fixed code, so no id, SQL or driver text can reach a model.
      throw new Error('sync_diagnostics_unavailable');
    }
    if (!summary) throw new Error('sync_diagnostics_account_unavailable');
    const account = summary.account;
    const accountDeleting = account.deletedAt != null || account.deleteRequestedAt != null ||
      ['deleting', 'deleted'].includes(account.state);
    const memberships = new Map((summary.memberships || [])
      .filter((membership) => APP_IDS.has(membership.appId)).map((membership) => [membership.appId, membership]));
    // Active targets only: revoked history is not part of routine diagnosis.
    const active = (appDevices || []).filter((device) => device.revokedAt == null && APP_IDS.has(device.appId));
    return {
      observedAt: now(),
      accountState: accountDeleting ? 'deleting' : account.state === 'active' ? 'active' : 'attention',
      accountDeleting,
      memberships,
      targetsByApp: (appId) => active.filter((device) => device.appId === appId)
    };
  }

  function projectTargets(appTargets) {
    const ids = boundedShortIds(appTargets.map((target) => target.id));
    const named = appTargets.map((target, index) => {
      const userLabel = safeUserLabel(target.userLabel);
      const registeredLabel = safeRegisteredLabel(target.label);
      const ref = refFor(target.id);
      const fallback = `同期先 ${ids[index] || ref}`;
      return {
        ref,
        userLabel,
        registeredLabel,
        displayName: userLabel || registeredLabel || fallback,
        fallback,
        nameSource: userLabel ? 'user' : registeredLabel ? 'registered' : ids[index] ? 'shortId' : 'ref'
      };
    });
    return appTargets.map((target, index) => {
      const name = named[index];
      const reportState = reportStateOf(target);
      const nameIsUnique = named.filter((other) => other.displayName === name.displayName).length === 1;
      // How guidance should refer to this target: a unique user name, a unique registered name, the
      // bounded short ID, or the session ref, in that order. Never a longer piece of the device ID.
      const reference = nameIsUnique && name.nameSource === 'user' ? name.userLabel
        : nameIsUnique && name.nameSource === 'registered' ? `登録名「${name.registeredLabel}」`
          : name.fallback;
      return {
        ref: name.ref,
        displayName: name.displayName,
        nameSource: name.nameSource,
        nameIsUnique,
        reference,
        shortId: ids[index],
        connectedFromThisPort: target.isCurrent === true,
        reportState,
        reportedAt: Number.isSafeInteger(target.lastReport?.reportedAt) ? target.lastReport.reportedAt : null,
        attentionCount: reportState === 'attention' ? count(target.lastReport?.attentionCount) : 0
      };
    });
  }

  return Object.freeze({
    // The whole authenticated Account: one entry per app, no per-target detail.
    async getSyncOverview() {
      const state = await load();
      return freezeDeep({
        contractVersion: DIAGNOSTIC_CONTRACT_VERSION,
        observedAt: state.observedAt,
        accountState: state.accountState,
        apps: DIAGNOSTIC_APPS.map((app) => projectApp(app, state.memberships.get(app.id),
          state.targetsByApp(app.id), state.accountDeleting, state.observedAt))
      });
    },
    // One app's active sync targets. appId is an enum; anything else is rejected before any read.
    async getAppSyncTargets(appId) {
      if (typeof appId !== 'string' || !APP_IDS.has(appId)) throw new Error('sync_diagnostics_invalid_app');
      const state = await load();
      const app = DIAGNOSTIC_APPS.find((item) => item.id === appId);
      const appTargets = state.targetsByApp(appId);
      const summary = projectApp(app, state.memberships.get(appId), appTargets, state.accountDeleting, state.observedAt);
      return freezeDeep({
        contractVersion: DIAGNOSTIC_CONTRACT_VERSION,
        observedAt: state.observedAt,
        accountState: state.accountState,
        app: summary,
        // A mismatch is reported without targets so no device is singled out as the cause.
        targets: summary.snapshotState === 'mismatch' ? [] : projectTargets(appTargets)
      });
    }
  });
}

// Opens diagnostics for the Account that owns the request's Account credential, through the
// strict read-only path. Returns { diagnostics } or { error, status }; never an Account choice.
export async function openSyncDiagnostics(request, env, dependencies = {}) {
  const context = await accountContext(request, env, dependencies, { readOnly: true });
  if (context.error) return { error: context.error, status: context.status };
  // scopeKey is Worker-internal (rate-limit key); it never enters diagnostics or model input.
  return { diagnostics: createSyncDiagnostics({ session: context.session, identity: context.identity }),
    scopeKey: context.identity.accountId };
}

export const TOOL_RESULT_KIND = 'sound_cruise_sync_diagnostic_tool_result';
const TOOLS = new Set(['getSyncOverview', 'getAppSyncTargets']);

// JSON Pointers (RFC 6901, relative to the envelope) of every value that came from a user: a name
// the user typed or a label registered by an app. Only names can carry user text; every other
// field is an enum, number, boolean or fixed Japanese label produced here.
export function userControlledPaths(result) {
  const paths = [];
  (result?.targets || []).forEach((target, index) => {
    if (target.nameSource === 'user' || target.nameSource === 'registered') {
      paths.push(`/data/targets/${index}/displayName`, `/data/targets/${index}/reference`);
    }
  });
  return paths;
}

// The only shape a diagnostic ever takes toward a model (AI1-B). Trusted text (instructions, the
// tool schema) is never built here, and user text is never concatenated into it: diagnostic data
// is one JSON value under "data", produced by JSON.stringify so quotes, backslashes and newlines
// are escaped, and "trust.userControlledPaths" lists exactly which values are user-written.
// This marks the boundary; it does not by itself prevent prompt injection. AI1-B must still send
// this only as a tool/function result (never inside the system prompt), keep a strict tool schema,
// instruct the model to treat those paths as data, and evaluate the model against hostile names.
export function toModelToolResult(tool, result) {
  if (!TOOLS.has(tool)) throw new Error('sync_diagnostics_unknown_tool');
  return JSON.stringify({
    kind: TOOL_RESULT_KIND,
    contractVersion: DIAGNOSTIC_CONTRACT_VERSION,
    tool,
    trust: {
      dataRole: 'tool_data',
      userControlledPaths: userControlledPaths(result)
    },
    data: result
  });
}
