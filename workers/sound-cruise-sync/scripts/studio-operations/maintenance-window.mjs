import { randomBytes } from "node:crypto";
import { digest, same, fail } from "./contracts.mjs";
const hex = (x) => /^[a-f0-9]{64}$/.test(x || "");
const phases = ["CLOSED", "ARCHIVED", "RETIRED"];
// Independent floor is an explicit authority and transport, never a fallback to Control.
// This adapter does not create/adopt its backend, attest observed writers, or deploy Workers.
export function maintenanceCutline({
  authority,
  envelope,
  scope,
  cutline,
  readFloor,
  casFloor,
  readDeployment,
  claimFinalization,
}) {
  envelope = structuredClone(envelope);
  scope = structuredClone(scope);
  const binding = authority.check(envelope, "maintenance-window", scope);
  if (
    !["readFloor", "casFloor", "readDeployment", "claimFinalization"].every(
      (k) =>
        typeof { readFloor, casFloor, readDeployment, claimFinalization }[k] ===
        "function",
    ) ||
    !hex(binding.backendHash) ||
    !hex(binding.sourceDigest) ||
    !hex(binding.windowHash) ||
    !hex(binding.maintenanceArtifactHash) ||
    !hex(binding.minimumHead) ||
    !Number.isSafeInteger(binding.minimumSequence) ||
    binding.minimumSequence < 1 ||
    !binding.ownerId ||
    !binding.epoch
  )
    fail("maintenance-binding");
  const used = new Set();
  let prior,
    cutlineId,
    attempted = false;
  function checkFloor(result, challenge) {
    const p = authority.check(result.envelope, "maintenance-floor", scope);
    if (
      p.challenge !== challenge ||
      p.operationId !== binding.operationId ||
      p.backendHash !== binding.backendHash ||
      p.sourceDigest !== binding.sourceDigest ||
      p.windowHash !== binding.windowHash ||
      p.ownerId !== binding.ownerId ||
      p.epoch !== binding.epoch ||
      !phases.includes(p.phase) ||
      !hex(p.head) ||
      !hex(p.recordHash) ||
      !hex(p.previousRecordHash) ||
      !Number.isSafeInteger(p.sequence) ||
      p.sequence < binding.minimumSequence ||
      !Array.isArray(p.historyIds) ||
      new Set(p.historyIds).size !== p.historyIds.length ||
      p.historyIds.some((x) => typeof x !== "string" || !x) ||
      used.has(p.id)
    )
      fail("maintenance-floor-untrusted");
    if (
      p.sequence === binding.minimumSequence &&
      p.head !== binding.minimumHead
    )
      fail("maintenance-floor-fork");
    if (!p.historyIds.includes(binding.id))
      fail("maintenance-floor-grant-history");
    if (prior) {
      if (
        p.sequence < prior.sequence ||
        (p.sequence === prior.sequence &&
          (p.head !== prior.head ||
            p.recordHash !== prior.recordHash ||
            p.phase !== prior.phase))
      )
        fail("maintenance-floor-rollback");
      if (
        p.sequence > prior.sequence &&
        (p.sequence !== prior.sequence + 1 ||
          p.previousRecordHash !== prior.recordHash ||
          prior.historyIds.some((id) => !p.historyIds.includes(id)))
      )
        fail("maintenance-floor-gap");
    }
    used.add(p.id);
    prior = structuredClone(p);
    return p;
  }
  async function floor() {
    authority.check(envelope, "maintenance-window", scope); // expiry is checked on every operation
    const nonce = randomBytes(32).toString("hex");
    return checkFloor(await readFloor(nonce), nonce);
  }
  async function deployment() {
    const nonce = randomBytes(32).toString("hex");
    const p = authority.check(
      await readDeployment(nonce),
      "maintenance-deployment",
      scope,
    );
    if (
      p.challenge !== nonce ||
      p.operationId !== binding.operationId ||
      p.sourceDigest !== binding.sourceDigest ||
      p.ownerId !== binding.ownerId ||
      p.epoch !== binding.epoch ||
      p.artifactHash !== binding.maintenanceArtifactHash ||
      p.allEntrypointsInstrumented !== true ||
      p.legacyResolved !== true ||
      p.externalExcluded !== true ||
      p.manualExcluded !== true ||
      !hex(p.evidenceHash)
    )
      fail("maintenance-deployment-unproved");
  }
  return Object.freeze({
    bindingHash: digest(envelope),
    async assertCutline() {
      const before = await floor();
      if (before.phase !== "CLOSED")
        fail("maintenance-cutline-retired-or-finalized");
      await deployment();
      const pin = await cutline.assertCutline();
      if (!pin?.cutlineId) fail("maintenance-cutline-id");
      if (cutlineId && pin.cutlineId !== cutlineId)
        fail("maintenance-cutline-changed");
      cutlineId = pin.cutlineId;
      const after = await floor();
      if (after.phase !== "CLOSED" || after.head !== before.head)
        fail("maintenance-observation-race");
      return pin;
    },
    async finalizeBackup(receipt) {
      if (attempted)
        fail("maintenance-finalize-already-attempted-reconcile-only");
      if (!hex(receipt?.manifestHash)) fail("maintenance-manifest");
      await this.assertCutline();
      const old = structuredClone(prior);
      const transitionId = randomBytes(32).toString("hex");
      // A single external CAS must serialize final acceptance versus retirement.
      // Any failure/ACK loss is UNKNOWN. There is no resend or automatic reconcile.
      let result;
      const intent = {
        expectedHead: old.head,
        expectedSequence: old.sequence,
        previousRecordHash: old.recordHash,
        transitionId,
        action: "archive",
        manifestHash: receipt.manifestHash,
        backendHash: binding.backendHash,
        sourceDigest: binding.sourceDigest,
        windowHash: binding.windowHash,
        ownerId: binding.ownerId,
        epoch: binding.epoch,
        operationId: binding.operationId,
        historyIds: [...old.historyIds, transitionId],
      };
      attempted = true;
      await claimFinalization(structuredClone(intent)); // exclusive durable intent; survives crash before/after CAS
      try {
        result = await casFloor(intent);
      } catch {
        fail("maintenance-finalize-UNKNOWN-no-resend");
      }
      try {
        const p = authority.check(
          result?.envelope,
          "maintenance-finalization",
          scope,
        );
        if (
          p.operationId !== binding.operationId ||
          p.transitionId !== transitionId ||
          p.expectedHead !== old.head ||
          p.previousRecordHash !== old.recordHash ||
          p.sequence !== old.sequence + 1 ||
          p.phase !== "ARCHIVED" ||
          p.manifestHash !== receipt.manifestHash ||
          p.backendHash !== binding.backendHash ||
          p.sourceDigest !== binding.sourceDigest ||
          p.windowHash !== binding.windowHash ||
          p.ownerId !== binding.ownerId ||
          p.epoch !== binding.epoch ||
          !hex(p.head) ||
          p.head === old.head ||
          !hex(p.recordHash) ||
          p.durable !== true ||
          p.externalReadback !== true
        )
          fail("maintenance-finalize-UNKNOWN-unverified");
        // Readback must prove the exact CAS result; merely another signed callback is not a durability proof.
        const current = await floor();
        if (
          current.phase !== "ARCHIVED" ||
          current.head !== p.head ||
          current.recordHash !== p.recordHash ||
          current.sequence !== p.sequence ||
          current.manifestHash !== p.manifestHash ||
          !current.historyIds.includes(transitionId)
        )
          fail("maintenance-finalize-UNKNOWN-readback");
        return {
          status: "ARCHIVED_EXTERNAL_CAS",
          manifestHash: p.manifestHash,
          floorHead: p.head,
          recordHash: p.recordHash,
          sequence: p.sequence,
          transitionId,
        };
      } catch {
        fail("maintenance-finalize-UNKNOWN-unverified-or-readback");
      }
    },
  });
}
// Return-to-normal is a separate explicitly approved deployment. No timeout-based restoration.
export function maintenanceNormalReturn({
  authority,
  envelope,
  scope,
  floorEnvelope,
  controlEnvelope,
}) {
  const b = authority.check(envelope, "maintenance-return", scope),
    f = authority.check(floorEnvelope, "maintenance-floor", scope),
    c = authority.check(controlEnvelope, "maintenance-open", scope);
  if (
    !b.challenge ||
    f.challenge !== b.challenge ||
    c.challenge !== b.challenge ||
    f.phase !== "RETIRED" ||
    c.state !== "OPEN" ||
    c.inflight !== 0 ||
    c.unknown !== 0 ||
    c.backupReadersStopped !== true ||
    !hex(f.head) ||
    !hex(f.recordHash) ||
    !hex(b.normalArtifactHash) ||
    b.normalArtifactHash !==
      "de6b6fbd2f759fdc55a32662e10d224e11d876672405b604944270387cc19b15" ||
    c.retirementRecordHash !== f.recordHash ||
    c.retirementHead !== f.head ||
    b.retirementHead !== f.head ||
    b.retirementRecordHash !== f.recordHash ||
    b.operatorAck !== true ||
    !hex(b.deploymentEvidenceHash) ||
    !hex(b.retirementRecordHash)
  )
    fail("maintenance-normal-return-unproved");
  for (const k of [
    "operationId",
    "sourceDigest",
    "ownerId",
    "epoch",
    "windowHash",
    "backendHash",
  ]) {
    if (b[k] == null) fail("maintenance-return-binding");
    same(f[k], b[k], "maintenance-return-floor");
    same(c[k], b[k], "maintenance-return-control");
  }
  return {
    candidateOnly: true,
    deploymentAuthorized: false,
    normalArtifactHash: b.normalArtifactHash,
    retirementHead: f.head,
  };
}
