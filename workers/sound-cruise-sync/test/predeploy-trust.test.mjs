import test from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { authority, canonical, digest } from "../scripts/studio-operations/contracts.mjs";
import { connectCurrentFloor } from "../scripts/studio-operations/current-floor-transport.mjs";
import { githubFloorRemote, floorQueries } from "../scripts/studio-operations/github-floor-remote.mjs";
import { predeployAuthorityRouter, externallyPinnedFloor, evaluatePredeployTrust,
  windowHostCandidate, sourceIdentityDigest } from "../scripts/studio-operations/predeploy-trust.mjs";
import { boundedArchivePages, ARCHIVE_METADATA_RESERVE } from "../scripts/studio-operations/archive-budget.mjs";
const key = () => { const k = generateKeyPairSync("ed25519"); const pem = k.publicKey.export({ format: "pem", type: "spki" });
  return { private: k.privateKey, pem, jwk: k.publicKey.export({ format: "jwk" }), pin: digest(k.publicKey.export({ format: "jwk" })) }; };
const gkey = key(), fkey = key(), ckey = key();
const scope = { owner: "fixture" }, operationId = randomUUID(), sourceDigest = "a".repeat(64), windowHash = "b".repeat(64);
const envelope = (kind, data = {}, k = gkey) => {
  const payload = { kind, synthetic: true, scope: digest(scope), id: randomUUID(), operationId,
    issued: Date.now() - 1, expires: Date.now() + 300000, ...data };
  return { payload, signature: sign(null, Buffer.from(canonical(payload)), k.private).toString("base64") };
};
const router = () => predeployAuthorityRouter({ roots: { grant: { publicKey: gkey.pem, issuerPin: gkey.pin },
  floor: { publicKey: fkey.pem, issuerPin: fkey.pin }, minimum: { publicKey: gkey.pem, issuerPin: gkey.pin } },
  controlIssuerPin: ckey.pin, synthetic: true });
function githubFixture() {
  const repository = "soundcruise/protected-workspace-pins", branch = "codex/freeze-floor/" + sourceDigest;
  const commits = new Map(), blobs = new Map(); let current, mutations = 0, reads = 0, loseACK = false;
  function put(record, parents = []) {
    const text = canonical(record) + "\n", blob = createHash("sha1").update("blob " + Buffer.byteLength(text) + "\0" + text).digest("hex");
    blobs.set(blob, { oid: blob, byteSize: Buffer.byteLength(text), text, isTruncated: false });
    const oid = createHash("sha1").update(canonical({ record, parents })).digest("hex");
    commits.set(oid, { oid, parents: { nodes: parents.map((oid) => ({ oid })), pageInfo: { hasNextPage: false } },
      tree: { entries: [{ name: "current-floor.json", type: "blob", oid: blob }] } });
    current = oid; return oid;
  }
  const first = { sequence: 1, previousRecordHash: "0".repeat(64), phase: "CLOSED", sourceDigest, ownerId: "fixture",
    epoch: 1, operationId, windowHash, historyIds: ["window-grant", "c".repeat(64)], transitionId: "c".repeat(64), manifestHash: null };
  const genesis = put(first), claims = new Set();
  async function request({ query, variables }) {
    reads++;
    const repo = (object) => ({ data: { repository: { nameWithOwner: repository, isPrivate: true, ...object } } });
    if (query === floorQueries.head) { assert.equal(variables.ref, "refs/heads/" + branch); return repo({ ref: { target: { oid: current } } }); }
    if (query === floorQueries.node) return repo({ object: commits.get(variables.oid) });
    if (query === floorQueries.blob) return repo({ object: blobs.get(variables.oid) });
    assert.equal(query, floorQueries.append); mutations++;
    const x = variables.input; assert.deepEqual(x.branch, { repositoryNameWithOwner: repository, branchName: branch });
    assert.equal(x.fileChanges.additions.length, 1); assert.equal(x.fileChanges.additions[0].path, "current-floor.json");
    if (current !== x.expectedHeadOid) return { errors: [{ type: "STALE_DATA" }] };
    const next = JSON.parse(Buffer.from(x.fileChanges.additions[0].contents, "base64")); const oid = put(next, [current]);
    if (loseACK) throw Error("simulated ACK loss: secret text must never be copied");
    return { data: { createCommitOnBranch: { commit: { oid }, clientMutationId: x.clientMutationId } } };
  }
  const a = authority({ publicKey: gkey.pem, rootHash: digest(gkey.pem), synthetic: true });
  const writeEnvelope = envelope("github-floor-write", { repository, branch, path: "current-floor.json", sourceDigest,
    appId: 5518573, qualificationHash: digest("fixture-qualified"), ownerId: "fixture", operationId, epoch: 1,
    windowHash, expectedHeadCAS: true, durableClaimQualified: true });
  const claimAttempt = async (x) => { if (claims.has(x.transitionId)) throw Error("exclusive-claim-replay"); claims.add(x.transitionId); };
  const remote = () => githubFloorRemote({ sourceDigest, request, authority: a, writeEnvelope, scope, claimAttempt });
  const next = () => ({ ...first, sequence: 2, previousRecordHash: digest(first), phase: "ARCHIVED", manifestHash: digest("archive"),
    transitionId: "d".repeat(64), historyIds: [...first.historyIds, "d".repeat(64)] });
  const backend = { repository, branch }, backendHash = digest(backend);
  const grant = envelope("current-floor-backend", { backend, backendHash, genesis, minimumCommit: genesis,
    minimumSequence: 1, genesisRecordHash: digest(first), issuerPin: fkey.pin, controlIssuerPin: ckey.pin,
    ownerId: "fixture", sourceDigest, epoch: 1, operationId, windowHash, windowGrantId: "window-grant" });
  const inner = (r) => connectCurrentFloor({ authority: a, envelope: grant, scope, remote: r,
    floorPublicKey: fkey.pem, signEnvelope: async (kind, body) => envelope(kind, body, fkey) });
  return { repository, branch, first, genesis, commits, blobs, request, remote, next, inner, backendHash,
    get mutations() { return mutations; }, get reads() { return reads; }, get head() { return current; },
    move(x) { current = x; }, lose() { loseACK = true; } };
}
test("GraphQL backend verifies immutable blob identity and connects existing floor archive CAS", async () => {
  const f = githubFixture(), r = f.remote(), floor = f.inner(r); assert.equal(f.reads, 0);
  const old = await floor.inspect(), transitionId = "e".repeat(64);
  const result = await floor.casFloor({ backendHash: f.backendHash, sourceDigest, ownerId: "fixture", epoch: 1,
    operationId, windowHash, action: "archive", expectedHead: old.head, expectedSequence: 1,
    previousRecordHash: old.recordHash, manifestHash: digest("archive"), transitionId,
    historyIds: [...old.record.historyIds, transitionId] });
  assert.equal(result.envelope.payload.phase, "ARCHIVED"); assert.equal(f.mutations, 1);
  assert.equal((await floor.inspect()).record.sequence, 2);
});
test("read-only backend never promotes or mutates without signed write grant", async () => {
  const f = githubFixture(), r = githubFloorRemote({ sourceDigest, request: f.request });
  assert.equal(r.testOnly, true); await r.head(f.repository, f.branch);
  await assert.rejects(() => r.appendCAS(f.repository, f.branch, f.genesis, f.next()), /readonly/); assert.equal(f.mutations, 0);
});
test("wrong repository/ref and content/hash tamper fail before mutation", async () => {
  const f = githubFixture(), r = f.remote(); await assert.rejects(() => r.head("soundcruise/apps", f.branch));
  const blob = f.commits.get(f.genesis).tree.entries[0].oid; f.blobs.get(blob).text += " ";
  await assert.rejects(() => r.node(f.genesis)); assert.equal(f.mutations, 0);
});
test("stale expectedHeadOid is rejected by server CAS and never resent", async () => {
  const f = githubFixture(), r = f.remote(); f.move("f".repeat(40));
  await assert.rejects(() => r.appendCAS(f.repository, f.branch, f.genesis, f.next()), /UNKNOWN/);
  await assert.rejects(() => r.appendCAS(f.repository, f.branch, f.genesis, f.next()), /reconcile-only/); assert.equal(f.mutations, 1);
});
test("ACK loss remains UNKNOWN and durable claim rejects new-instance replay", async () => {
  const f = githubFixture(), r = f.remote(); f.lose();
  await assert.rejects(() => r.appendCAS(f.repository, f.branch, f.genesis, f.next()), /UNKNOWN/);
  await assert.rejects(() => f.remote().appendCAS(f.repository, f.branch, f.genesis, f.next()), /UNKNOWN/); assert.equal(f.mutations, 1);
  assert.equal((await r.node(f.head)).record.sequence, 2);
});
function minimumWrapper(f, r, minimum, options = {}) {
  const b = { backendHash: f.backendHash, sourceDigest, ownerId: "fixture", epoch: 1, operationId, windowHash,
    adoptionHash: digest("externally-approved-anchor"), minimumStoreQualificationHash: digest("independent-store"), minimumAnchorRevision: 1 };
  return externallyPinnedFloor({ inner: f.inner(r), remote: r, authority: router(), scope,
    bindingEnvelope: envelope("floor-minimum-binding", b),
    readMinimum: async (challenge) => envelope("floor-minimum", { ...b, challenge, qualificationHash: b.minimumStoreQualificationHash,
      independentOfRepository: true, durableReadback: true, unresolvedAdvances: 0, commit: f.genesis, sequence: 1,
      recordHash: digest(f.first), anchorRevision: 1, ...minimum() }), ...options });
}
test("external minimum accepts real chain then rejects repo rollback despite replayed old grant", async () => {
  const f = githubFixture(), r = f.remote(); const old = await f.inner(r).inspect();
  await r.appendCAS(f.repository, f.branch, f.genesis, f.next()); const head = f.head;
  const wrapper = minimumWrapper(f, r, () => ({ commit: head, sequence: 2, recordHash: digest(f.next()), anchorRevision: 2 }));
  assert.equal((await wrapper.inspect()).record.sequence, 2); f.move(f.genesis);
  await assert.rejects(() => wrapper.inspect(), /below-external-minimum/);
});
test("external minimum rejects replay/ABA and different epoch", async () => {
  const f = githubFixture(), r = f.remote(); let anchorRevision = 2;
  const wrapper = minimumWrapper(f, r, () => ({ anchorRevision })); await wrapper.inspect(); anchorRevision = 1;
  await assert.rejects(() => wrapper.inspect(), /rollback/);
  await assert.rejects(() => minimumWrapper(f, r, () => ({ epoch: 2 })).inspect(), /context/);
});
test("rollback between minimum guard and returned floor is rejected", async () => {
  const f = githubFixture(), r = f.remote(); await r.appendCAS(f.repository, f.branch, f.genesis, f.next());
  const head = f.head, inner = f.inner(r);
  const wrapped = minimumWrapper(f, r, () => ({ commit: head, sequence: 2, recordHash: digest(f.next()), anchorRevision: 2 }), {
    inner: { ...inner, async readFloor(challenge) { f.move(f.genesis); return inner.readFloor(challenge); } },
  });
  await assert.rejects(() => wrapped.readFloor(digest("challenge")), /minimum/);
});
for (const lost of [false, true]) test("Git/minimum two-resource completion, lost ACK=" + lost, async () => {
  const f = githubFixture(), r = f.remote(); let minimum = {}, claimed = false;
  const wrapped = minimumWrapper(f, r, () => minimum, {
    claimAdvance: async () => { assert.equal(f.mutations, 0); assert.equal(claimed, false); claimed = true; },
    advanceMinimum: async (x) => { assert.equal(x.expectedAnchorRevision, 1); minimum = {
      commit: x.commit, sequence: x.sequence, recordHash: x.recordHash, anchorRevision: 2 };
      if (lost) throw Error("minimum ACK lost"); },
  });
  const old = await wrapped.inspect(), transitionId = digest("transition"), input = { backendHash: f.backendHash,
    sourceDigest, ownerId: "fixture", epoch: 1, operationId, windowHash, action: "archive", expectedHead: old.head,
    expectedSequence: 1, previousRecordHash: old.recordHash, manifestHash: digest("archive"), transitionId,
    historyIds: [...old.record.historyIds, transitionId] };
  if (lost) await assert.rejects(() => wrapped.casFloor(input), /UNKNOWN/);
  else assert.equal((await wrapped.casFloor(input)).envelope.payload.phase, "ARCHIVED");
  assert.equal(f.mutations, 1); assert.equal((await wrapped.inspect()).minimum.sequence, 2);
  await assert.rejects(() => wrapped.casFloor(input), /reconcile-only/);
});
test("crash between Git and minimum persistence blocks reopen until read-only reconciliation", async () => {
  const f = githubFixture(), r = f.remote(); let pending = 0;
  const make = () => minimumWrapper(f, r, () => ({ unresolvedAdvances: pending }), {
    claimAdvance: async () => { pending = 1; }, advanceMinimum: async () => { throw Error("crash-before-minimum-write"); },
  });
  const wrapped = make(), old = await wrapped.inspect(), transitionId = digest("crash-transition");
  await assert.rejects(() => wrapped.casFloor({ backendHash: f.backendHash, sourceDigest, ownerId: "fixture", epoch: 1,
    operationId, windowHash, action: "archive", expectedHead: old.head, expectedSequence: 1, previousRecordHash: old.recordHash,
    manifestHash: digest("archive"), transitionId, historyIds: [...old.record.historyIds, transitionId] }), /UNKNOWN/);
  assert.equal(f.mutations, 1); await assert.rejects(() => make().inspect(), /untrusted/);
});
test("issuer routing rejects Control aliases and a floor signing its own minimum", () => {
  const roots = { grant: { publicKey: gkey.pem, issuerPin: gkey.pin }, floor: { publicKey: fkey.pem, issuerPin: fkey.pin },
    minimum: { publicKey: fkey.pem, issuerPin: fkey.pin } };
  assert.throws(() => predeployAuthorityRouter({ roots, controlIssuerPin: ckey.pin, synthetic: true }));
  roots.minimum = { publicKey: gkey.pem, issuerPin: gkey.pin }; assert.throws(() => predeployAuthorityRouter({ roots, controlIssuerPin: fkey.pin, synthetic: true }));
  assert.throws(() => router().check(envelope("maintenance-floor"), "maintenance-floor", scope));
});
function readiness() {
  const observedHost = { root: "/fixture", volumeUUID: "fixture-volume", anchors: { root: [42, 100, 16832],
    claims: [42, 101, 16832], journals: [42, 102, 16832] }, filesystem: { fsid: "42:26", mount: "/", type: "apfs" } };
  const profile = { operationId, windowId: windowHash, window: { starts: Date.now() - 1000, ends: Date.now() + 60 * 60000 },
    operator: "fixture", grantRevision: 1, source: { account: "source", d1: "source-d1", r2: "source-r2", jurisdiction: "default", r2Created: "created" },
    target: { account: "lab", d1: "fresh-d1", r2: "fresh-r2" }, controlAcceptanceHash: digest("accepted-control"),
    hostIdentityHash: digest(observedHost), copyIdentityHash: digest("copy"), helperSHA256: digest("helper"),
    archiveKeyId: "existing-archive", archiveKeyMaterialSHA256: digest("key-material"), independentRecoveryPin: digest("recovery"),
    keyHandleDigest: digest("handle"), backupRoot: "/fixture", policy: { acceptAccountScopedD1: true, maxArchiveBytes: 1024 ** 3,
      minHostFreeBytes: 100 * 1024 ** 3, minCopyFreeBytes: 8 * 1024 ** 3, maxObjectStagingBytes: 32 * 1024 ** 2,
      freezeReviewAfterMs: 5 * 60000, freezeEscalateAfterMs: 10 * 60000, archiveRetentionDays: 30, copyRetentionDays: 90,
      restoreRetentionHours: 72, unresolvedAutoDelete: false, floorWarnSequence: 750, floorStopSequence: 900,
      unknownAction: "HOLD_NO_RESEND", normalReturn: "EXPLICIT_VALIDATED_APPROVAL" } };
  profile.sourceDigest = sourceIdentityDigest(profile.source);
  const common = () => ({ profileHash: digest(profile), operationId, windowId: windowHash, sourceHash: digest(profile.source),
    targetHash: digest(profile.target), grantRevision: profile.grantRevision, expires: profile.window.ends });
  const bodies = { floor: { repository: "soundcruise/protected-workspace-pins", branch: "codex/freeze-floor/" + profile.sourceDigest,
    forceAndDeleteDenied: true, writerAppId: 5518573, expectedHeadCAS: true, rulesetReadback: true, ackLossReadback: true,
    privateRepository: true, minimumStoreIndependent: true, minimumStoreQualificationHash: digest("qualified-minimum"), evidenceHash: digest("floor-evidence"),
    floorIssuerPin: fkey.pin, minimumIssuerPin: gkey.pin, historySequence: 1 }, host: { hostIdentityHash: profile.hostIdentityHash, helperSHA256: profile.helperSHA256,
    copyIdentityHash: profile.copyIdentityHash, hostPayloadHash: digest("host-payload"), keyHandleDigest: profile.keyHandleDigest,
    bootFDQualified: true, keyRecoveryVerified: true }, privacy: { credentialInventoryComplete: true, accountMembersReviewed: true,
    unrelatedBroadCredentials: 0, unreviewedAdminAccess: 0, privateOnly: true, noPublicWorkerBinding: true, usedTarget: false,
    freshnessEvidenceHash: digest("fresh-evidence"), fullReadbackPlanHash: digest("readback"), sourceReadOnly: true,
    targetS3BucketScoped: true, custodian: "fixture", deleteOwner: "fixture", d1CredentialScope: "account", accountCustodiansOnly: true },
    policy: { policyHash: digest(profile.policy), operator: "fixture", monitor: "operator", reopenOwner: "operator", operatorAckRequired: true } };
  const kinds = { floor: "floor-qualification", host: "host-window", privacy: "restore-privacy", policy: "operating-policy" };
  let hostEnvelope;
  const grants = () => {
    hostEnvelope = envelope("host", { storageKind: "boot-fd-v1", root: profile.backupRoot, volumeUUID: observedHost.volumeUUID,
      anchors: observedHost.anchors, filesystem: observedHost.filesystem, addonSHA256: profile.helperSHA256,
      windowId: profile.windowId, grantRevision: profile.grantRevision, keyId: profile.archiveKeyId,
      keyMaterialSHA256: profile.archiveKeyMaterialSHA256, independentRecoveryPin: profile.independentRecoveryPin,
      custodian: profile.operator, minFreeBytes: profile.policy.minHostFreeBytes,
      maxStagingBytes: profile.policy.maxObjectStagingBytes, maxArchiveBytes: profile.policy.maxArchiveBytes, expires: profile.window?.ends });
    return Object.fromEntries(Object.entries(bodies).map(([n, p]) => [n, envelope(kinds[n], { ...common(), ...p,
      ...(n === "host" ? { hostPayloadHash: digest(hostEnvelope.payload), hostEnvelopeHash: digest(hostEnvelope) } : {}) })]));
  };
  return { profile, observedHost, bodies, grants, get hostEnvelope() { return hostEnvelope; },
    evaluate() { const signed = grants(); return evaluatePredeployTrust({ authority: router(), scope, profile,
      grants: signed, observedHost, hostEnvelope, controlAcceptanceHash: profile.controlAcceptanceHash }); } };
}
test("all signed window trust inputs permit readiness only, never deploy/freeze/Backup", () => {
  const f = readiness(), x = f.evaluate(); assert.equal(x.status, "TRUST_READY_FOR_SEPARATE_DEPLOY_APPROVAL");
  assert.equal(x.productDeploymentAuthorized, false); assert.equal(x.stages.C, "NOT_DEPLOYED"); assert.equal(x.backupAuthorized, false);
});
for (const [name, change, blocker] of [
  ["active Lab broad credential", (f) => f.bodies.privacy.unrelatedBroadCredentials = 1, "RESTORE_CONFIDENTIALITY"],
  ["incomplete member inventory", (f) => f.bodies.privacy.accountMembersReviewed = false, "RESTORE_CONFIDENTIALITY"],
  ["used Restore target", (f) => f.bodies.privacy.usedTarget = true, "RESTORE_CONFIDENTIALITY"],
  ["Account-wide D1 unapproved", (f) => f.profile.policy.acceptAccountScopedD1 = false, "RESTORE_CONFIDENTIALITY"],
  ["Host identity drift", (f) => f.observedHost.anchors.root[0]++, "HOST_WINDOW_GRANT"],
  ["wrong helper", (f) => f.bodies.host.helperSHA256 = digest("wrong"), "HOST_WINDOW_GRANT"],
  ["unprotected floor", (f) => f.bodies.floor.forceAndDeleteDenied = false, "FLOOR_QUALIFICATION"],
  ["automatic UNKNOWN deletion", (f) => { f.profile.policy.unresolvedAutoDelete = true; f.bodies.policy.policyHash = digest(f.profile.policy); }, "OPERATING_POLICY"],
  ["negative retention", (f) => { f.profile.policy.archiveRetentionDays = -1; f.bodies.policy.policyHash = digest(f.profile.policy); }, "OPERATING_POLICY"],
  ["Source identity mismatch", (f) => f.profile.source.r2 = "other-bucket", "WINDOW_SOURCE_TARGET"],
  ["Production Restore account", (f) => f.profile.target.account = "a9f2a3e9fcb6d0f68fd2eaa9df909e33", "WINDOW_SOURCE_TARGET"],
]) test("readiness rejects " + name, () => { const f = readiness(); change(f); const x = f.evaluate(); assert.equal(x.status, "HOLD"); assert.ok(x.blockers.includes(blocker)); });
test("stale window and grant replay are rejected", () => {
  const f = readiness(), grants = f.grants(); f.profile.grantRevision++;
  const x = evaluatePredeployTrust({ authority: router(), scope, profile: f.profile, grants, hostEnvelope: f.hostEnvelope, observedHost: f.observedHost,
    controlAcceptanceHash: f.profile.controlAcceptanceHash }); assert.equal(x.status, "HOLD"); assert.ok(x.blockers.includes("HOST_WINDOW_GRANT"));
});
test("a signed but unrelated Host envelope cannot be adopted by a matching arbitrary hash", () => {
  const f = readiness(), grants = f.grants(), wrong = envelope("host", { ...f.hostEnvelope.payload, root: "/other" });
  grants.host = envelope("host-window", { ...grants.host.payload, hostPayloadHash: digest(wrong.payload), hostEnvelopeHash: digest(wrong) });
  const x = evaluatePredeployTrust({ authority: router(), scope, profile: f.profile, grants, hostEnvelope: wrong,
    observedHost: f.observedHost, controlAcceptanceHash: f.profile.controlAcceptanceHash }); assert.ok(x.blockers.includes("HOST_WINDOW_GRANT"));
});
test("unsigned Host candidate preserves missing window and never reuses old grant ID", () => {
  const f = readiness(), hostPayload = { storageKind: "boot-fd-v1", root: f.profile.backupRoot, addonSHA256: f.profile.helperSHA256,
    keyMaterialSHA256: digest("existing-key"), independentRecoveryPin: digest("recovery"), anchors: {}, filesystem: {}, id: "old-id" };
  f.profile.window = null; const x = windowHostCandidate({ profile: f.profile, hostPayload, observedHost: f.observedHost });
  assert.equal(x.signable, false); assert.equal(x.adopted, false); assert.equal(x.payload.id, null); assert.equal(x.signature, null);
  assert.ok(x.missing.includes("approved-window-start-end"));
});
test("archive byte budget rejects before yielding the over-budget page and retains prior bounds", async () => {
  const page = [{ value: "synthetic" }], bytes = Buffer.byteLength(JSON.stringify(page)) + 28;
  const seen = [];
  await assert.rejects(async () => {
    for await (const p of boundedArchivePages([page, page], ARCHIVE_METADATA_RESERVE + bytes)) seen.push(p);
  }, /archive-total-budget/);
  assert.equal(seen.length, 1);
  const legacy = []; for await (const p of boundedArchivePages([page, page], undefined)) legacy.push(p);
  assert.equal(legacy.length, 2);
});
