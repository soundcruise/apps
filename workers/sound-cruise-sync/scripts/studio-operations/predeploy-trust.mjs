import { createPublicKey, randomBytes } from "node:crypto";
import { authority as makeAuthority, digest, same, fail } from "./contracts.mjs";
const hex = (x) => /^[a-f0-9]{64}$/.test(x || ""), oid = (x) => /^[a-f0-9]{40}$/.test(x || "");
const roleFor = { "maintenance-floor": "floor", "maintenance-finalization": "floor", "floor-minimum": "minimum" };
const grantKinds = new Set(["current-floor-backend", "github-floor-write", "floor-minimum-binding", "floor-qualification",
  "maintenance-window", "maintenance-deployment", "maintenance-return", "host-window", "host", "resources",
  "key-handles", "archive", "inventory", "execution", "restore-privacy", "operating-policy", "maintenance-open-deploy"]);
export const sourceIdentityDigest = (s) => digest({ d1: s.account + "/" + s.d1,
  r2: s.account + "/" + s.jurisdiction + "/" + s.r2 + "/" + s.r2Created });
// Normalize actual Ed25519 key material; different labels cannot disguise the Control issuer.
export function predeployAuthorityRouter({ roots, controlIssuerPin, synthetic = false }) {
  if (!hex(controlIssuerPin)) fail("predeploy-control-issuer-pin");
  const validators = {}, pins = {};
  for (const role of ["grant", "floor", "minimum"]) {
    const spec = roots?.[role];
    let key;
    try { key = createPublicKey(spec.publicKey); } catch { fail("predeploy-issuer-key"); }
    if (key.asymmetricKeyType !== "ed25519") fail("predeploy-issuer-key");
    pins[role] = digest(key.export({ format: "jwk" }));
    if (pins[role] !== spec.issuerPin || pins[role] === controlIssuerPin) fail("predeploy-issuer-pin");
    const pem = key.export({ format: "pem", type: "spki" });
    validators[role] = makeAuthority({ publicKey: pem, rootHash: digest(pem), synthetic });
  }
  // Grant and minimum may share the explicitly approved external operator authority.
  if (pins.floor === pins.minimum || pins.floor === pins.grant) fail("predeploy-authority-reuse");
  return Object.freeze({ synthetic, pins: Object.freeze(pins), check(envelope, kind, scope) {
    const role = roleFor[kind] ?? (grantKinds.has(kind) ? "grant" : null);
    if (!role) fail("predeploy-issuer-kind");
    return validators[role].check(envelope, kind, scope);
  } });
}
// Wrap the existing floor transport, without replacing its state machine or CAS.
// readMinimum must be an independently qualified durable authority, never a Control echo
// or a value read from the same repository. Its public adoption pin is external input.
export function externallyPinnedFloor({ inner, remote, authority, bindingEnvelope, scope, readMinimum,
  claimAdvance, advanceMinimum }) {
  const b = authority.check(bindingEnvelope, "floor-minimum-binding", scope);
  if (typeof readMinimum !== "function" || !hex(b.adoptionHash) || !hex(b.minimumStoreQualificationHash) ||
    !Number.isSafeInteger(b.minimumAnchorRevision) || b.minimumAnchorRevision < 1) fail("floor-minimum-binding");
  let prior, attempted = false;
  async function guard() {
    authority.check(bindingEnvelope, "floor-minimum-binding", scope);
    const challenge = randomBytes(32).toString("hex");
    const p = authority.check(await readMinimum(challenge), "floor-minimum", scope);
    for (const k of ["backendHash", "sourceDigest", "ownerId", "epoch", "operationId", "windowHash", "adoptionHash"])
      same(p[k], b[k], "floor-minimum-context");
    if (p.challenge !== challenge || p.qualificationHash !== b.minimumStoreQualificationHash ||
      p.independentOfRepository !== true || p.durableReadback !== true || p.unresolvedAdvances !== 0 || !oid(p.commit) || !hex(p.recordHash) ||
      !Number.isSafeInteger(p.sequence) || p.sequence < 1 || !Number.isSafeInteger(p.anchorRevision) ||
      p.anchorRevision < b.minimumAnchorRevision) fail("floor-minimum-untrusted");
    if (prior && (p.anchorRevision < prior.anchorRevision || p.sequence < prior.sequence ||
      (p.anchorRevision === prior.anchorRevision &&
        (p.sequence !== prior.sequence || p.commit !== prior.commit || p.recordHash !== prior.recordHash))))
      fail("floor-minimum-rollback");
    const current = await inner.inspect();
    if (current.record.sequence < p.sequence) fail("floor-below-external-minimum");
    let at = current.commit, found = false;
    for (let i = 0; i < 1000; i++) {
      const n = await remote.node(at);
      if (n.oid === p.commit) {
        if (n.record.sequence !== p.sequence || digest(n.record) !== p.recordHash) fail("floor-minimum-fork");
        found = true; break;
      }
      if (n.parents.length !== 1 || n.record.sequence <= p.sequence) break;
      at = n.parents[0];
    }
    if (!found) fail("floor-minimum-not-ancestor");
    prior = structuredClone(p);
    return { ...current, minimum: structuredClone(p) };
  }
  return Object.freeze({ inspect: guard,
    async readFloor(challenge) {
      const before = await guard(), result = await inner.readFloor(challenge);
      const p = authority.check(result.envelope, "maintenance-floor", scope), after = await guard();
      for (const k of ["backendHash", "sourceDigest", "ownerId", "epoch", "operationId", "windowHash"])
        same(p[k], b[k], "floor-minimum-return-context");
      if (p.challenge !== challenge || p.head !== before.head || p.head !== after.head ||
        p.recordHash !== before.recordHash || p.recordHash !== after.recordHash ||
        p.sequence !== before.record.sequence || p.sequence !== after.record.sequence ||
        p.phase !== after.record.phase) fail("floor-minimum-observation-race");
      return result;
    },
    async casFloor(input) {
      if (attempted) fail("floor-minimum-attempted-reconcile-only");
      if (typeof claimAdvance !== "function" || typeof advanceMinimum !== "function") fail("floor-minimum-readonly");
      const before = await guard();
      if (before.record.sequence >= 899) fail("floor-history-rotation-approval-required");
      if (input.expectedHead !== before.head || input.expectedSequence !== before.record.sequence ||
        input.previousRecordHash !== before.recordHash) fail("floor-minimum-CAS-precondition");
      const plan = { backendHash: b.backendHash, sourceDigest: b.sourceDigest, ownerId: b.ownerId,
        epoch: b.epoch, operationId: b.operationId, windowHash: b.windowHash, transitionId: input.transitionId,
        expectedAnchorRevision: before.minimum.anchorRevision, expectedMinimumCommit: before.minimum.commit };
      attempted = true;
      // Persist the two-resource plan before either Git or minimum-store mutation.
      // This connects to the existing exclusive durable attempt provider; never infer durability from memory.
      try { await claimAdvance(structuredClone(plan)); } catch { fail("floor-minimum-claim-UNKNOWN-no-resend"); }
      const result = await inner.casFloor(input);
      try {
        const current = await inner.inspect();
        if (current.recordHash !== result.envelope.payload.recordHash || current.head !== result.envelope.payload.head)
          fail("floor-minimum-concurrent-transition");
        await advanceMinimum({ ...plan, commit: current.commit, sequence: current.record.sequence, recordHash: current.recordHash });
        const after = await guard();
        if (after.minimum.anchorRevision !== before.minimum.anchorRevision + 1 || after.minimum.commit !== current.commit ||
          after.minimum.sequence !== current.record.sequence || after.minimum.recordHash !== current.recordHash || after.commit !== current.commit)
          fail("floor-minimum-advance-readback");
        return result;
      } catch { fail("floor-minimum-CAS-UNKNOWN-no-resend"); }
    },
  });
}
export function windowHostCandidate({ profile, hostPayload, observedHost }) {
  const payload = structuredClone(hostPayload), missing = [];
  for (const k of ["operationId", "windowId", "source", "target", "operator", "grantRevision", "window"])
    if (profile[k] == null) missing.push(k);
  if (!profile.window || !Number.isSafeInteger(profile.window.starts) || !Number.isSafeInteger(profile.window.ends) ||
    profile.window.ends <= profile.window.starts || profile.window.ends - profile.window.starts > 90 * 60000)
    missing.push("approved-window-start-end");
  if (!hex(payload.keyMaterialSHA256)) missing.push("existing-archive-key-material-pin");
  if (!hex(payload.independentRecoveryPin)) missing.push("independent-recovery-pin");
  if (!payload.filesystem || !payload.anchors || !hex(payload.addonSHA256)) missing.push("complete-boot-fd-host-grant");
  if (digest(observedHost) !== profile.hostIdentityHash) fail("window-host-identity-drift");
  if (payload.root !== profile.backupRoot || payload.storageKind !== "boot-fd-v1" ||
    payload.addonSHA256 !== profile.helperSHA256) fail("window-host-payload");
  // This is unsigned signing material; no dates, keys, IDs or adoption anchors are invented.
  return { kind: "window-host-signing-candidate", signature: null, adopted: false, signable: false,
    inputsCompleteForApproval: missing.length === 0,
    missing, binding: { profileHash: digest(profile), hostIdentityHash: profile.hostIdentityHash,
      sourceHash: digest(profile.source), targetHash: digest(profile.target), copyIdentityHash: profile.copyIdentityHash,
      operationId: profile.operationId, windowId: profile.windowId, grantRevision: profile.grantRevision },
    payload: { ...payload, id: null, operationId: profile.operationId, scope: digest(profile), issued: null, expires: null } };
}
// Pure readiness validation: never deploys, freezes, opens a Host, signs or changes credentials.
// D/E remain the responsibility of the existing live maintenance/Backup/Restore runners.
export function evaluatePredeployTrust({ authority, scope, profile, grants = {}, observedHost, hostEnvelope, controlAcceptanceHash }) {
  const blockers = [], accepted = [];
  const check = (name, fn) => { try { fn(); accepted.push(name); } catch { blockers.push(name); } };
  check("CONTROL_ACCEPTANCE", () => {
    if (!hex(profile.controlAcceptanceHash) || profile.controlAcceptanceHash !== controlAcceptanceHash) fail("control-acceptance");
  });
  check("WINDOW_SOURCE_TARGET", () => {
    const w = profile.window, t = profile.target, s = profile.source;
    if (!w || !Number.isSafeInteger(w.starts) || !Number.isSafeInteger(w.ends) || w.ends <= w.starts ||
      w.ends - w.starts > 90 * 60000 || !profile.operationId || !hex(profile.windowId) ||
      !Number.isSafeInteger(profile.grantRevision) || profile.grantRevision < 1 || !profile.operator ||
      !s?.account || !s.d1 || !s.r2 || !s.jurisdiction || !s.r2Created || profile.sourceDigest !== sourceIdentityDigest(s) ||
      !t?.account || !t.d1 || !t.r2 || s.account === t.account || s.d1 === t.d1 ||
      t.account === "a9f2a3e9fcb6d0f68fd2eaa9df909e33" ||
      ["e37759f8-df08-4d2a-92b0-ffdd50de66df", "b04bc953-6e0b-45d6-9e18-ce23befa3290"].includes(t.d1)) fail("window-target");
  });
  function grant(name, kind) {
    const p = authority.check(grants[name], kind, scope);
    if (p.profileHash !== digest(profile) || p.operationId !== profile.operationId || p.windowId !== profile.windowId ||
      p.sourceHash !== digest(profile.source) || p.targetHash !== digest(profile.target) ||
      p.grantRevision !== profile.grantRevision || !profile.window || p.expires > profile.window.ends ||
      p.issued < profile.window.starts - 5 * 60000 || p.expires - p.issued > 90 * 60000) fail("predeploy-window-grant");
    return p;
  }
  check("FLOOR_QUALIFICATION", () => {
    const p = grant("floor", "floor-qualification");
    if (p.repository !== "soundcruise/protected-workspace-pins" ||
      p.branch !== "codex/freeze-floor/" + profile.sourceDigest ||
      p.forceAndDeleteDenied !== true || p.writerAppId !== 5518573 || p.expectedHeadCAS !== true ||
      p.rulesetReadback !== true || p.ackLossReadback !== true || p.privateRepository !== true ||
      p.minimumStoreIndependent !== true || !hex(p.minimumStoreQualificationHash) || !hex(p.evidenceHash) ||
      !Number.isSafeInteger(p.historySequence) || p.historySequence < 0 || p.historySequence > 897 ||
      p.floorIssuerPin !== authority.pins.floor || p.minimumIssuerPin !== authority.pins.minimum) fail("floor-qualification");
  });
  check("HOST_WINDOW_GRANT", () => {
    const p = grant("host", "host-window");
    const host = authority.check(hostEnvelope, "host", scope);
    if (digest(observedHost) !== profile.hostIdentityHash || p.hostIdentityHash !== profile.hostIdentityHash ||
      p.helperSHA256 !== profile.helperSHA256 || p.copyIdentityHash !== profile.copyIdentityHash ||
      p.hostPayloadHash !== digest(host) || p.hostEnvelopeHash !== digest(hostEnvelope) ||
      p.keyHandleDigest !== profile.keyHandleDigest || host.storageKind !== "boot-fd-v1" ||
      host.root !== profile.backupRoot || host.root !== observedHost.root || host.volumeUUID !== observedHost.volumeUUID ||
      host.addonSHA256 !== profile.helperSHA256 || digest(host.anchors) !== digest(observedHost.anchors) ||
      digest(host.filesystem) !== digest(observedHost.filesystem) || host.operationId !== profile.operationId ||
      host.windowId !== profile.windowId || host.grantRevision !== profile.grantRevision ||
      host.keyId !== profile.archiveKeyId || host.keyMaterialSHA256 !== profile.archiveKeyMaterialSHA256 ||
      !hex(host.keyMaterialSHA256) || host.independentRecoveryPin !== profile.independentRecoveryPin ||
      !hex(host.independentRecoveryPin) || host.custodian !== profile.operator ||
      host.minFreeBytes !== profile.policy?.minHostFreeBytes || host.maxStagingBytes !== profile.policy?.maxObjectStagingBytes ||
      host.maxArchiveBytes !== profile.policy?.maxArchiveBytes ||
      host.expires > profile.window.ends || host.issued < profile.window.starts - 5 * 60000 ||
      host.expires - host.issued > 90 * 60000 ||
      p.bootFDQualified !== true || p.keyRecoveryVerified !== true) fail("host-window");
  });
  check("RESTORE_CONFIDENTIALITY", () => {
    const p = grant("privacy", "restore-privacy");
    if (p.credentialInventoryComplete !== true || p.accountMembersReviewed !== true ||
      p.unrelatedBroadCredentials !== 0 || p.unreviewedAdminAccess !== 0 || p.privateOnly !== true ||
      p.noPublicWorkerBinding !== true || p.usedTarget !== false || !hex(p.freshnessEvidenceHash) ||
      !hex(p.fullReadbackPlanHash) || p.sourceReadOnly !== true || p.targetS3BucketScoped !== true ||
      p.custodian !== profile.operator || p.deleteOwner !== profile.operator ||
      !["database", "account"].includes(p.d1CredentialScope) ||
      (p.d1CredentialScope === "account" && !(profile.policy?.acceptAccountScopedD1 === true && p.accountCustodiansOnly === true)))
      fail("restore-privacy");
  });
  check("OPERATING_POLICY", () => {
    const p = grant("policy", "operating-policy"), q = profile.policy;
    if (p.policyHash !== digest(q) || p.operator !== profile.operator || !p.monitor || !p.reopenOwner ||
      p.operatorAckRequired !== true || !q || q.unknownAction !== "HOLD_NO_RESEND" ||
      q.normalReturn !== "EXPLICIT_VALIDATED_APPROVAL" || !Number.isSafeInteger(q.maxArchiveBytes) || q.maxArchiveBytes <= 0 ||
      q.maxArchiveBytes <= 96 * 1024 ** 2 || !Number.isSafeInteger(q.minHostFreeBytes) || q.minHostFreeBytes < 4 * q.maxArchiveBytes ||
      !Number.isSafeInteger(q.minCopyFreeBytes) || q.minCopyFreeBytes < q.maxArchiveBytes ||
      !Number.isSafeInteger(q.maxObjectStagingBytes) || q.maxObjectStagingBytes <= 0 ||
      q.freezeReviewAfterMs !== 5 * 60000 || q.freezeEscalateAfterMs !== 10 * 60000 ||
      !Number.isSafeInteger(q.archiveRetentionDays) || q.archiveRetentionDays < 1 || q.archiveRetentionDays > 365 ||
      !Number.isSafeInteger(q.copyRetentionDays) || q.copyRetentionDays < q.archiveRetentionDays || q.copyRetentionDays > 365 ||
      !Number.isSafeInteger(q.restoreRetentionHours) || q.restoreRetentionHours < 1 || q.restoreRetentionHours > 168 ||
      q.maxObjectStagingBytes > q.maxArchiveBytes || q.maxObjectStagingBytes > 40 * 1024 ** 2 ||
      q.unresolvedAutoDelete !== false || q.floorStopSequence !== 900 || q.floorWarnSequence !== 750)
      fail("operating-policy");
  });
  const ready = blockers.length === 0;
  return { status: ready ? "TRUST_READY_FOR_SEPARATE_DEPLOY_APPROVAL" : "HOLD", accepted, blockers,
    stages: { A: accepted.includes("CONTROL_ACCEPTANCE") ? "PASS_PRIOR_OBSERVATION" : "HOLD",
      B: ready ? "READINESS_ACCEPTED" : "HOLD", C: "NOT_DEPLOYED", D: "REQUIRES_EXISTING_LIVE_FREEZE_ACCEPTANCE",
      E: "REQUIRES_EXISTING_BACKUP_AND_FULL_RESTORE_ACCEPTANCE" },
    productDeploymentAuthorized: false, freezeAuthorized: false, backupAuthorized: false };
}
