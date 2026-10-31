import { createPublicKey } from "node:crypto";
import {
  authority as makeAuthority,
  digest,
  same,
  fail,
} from "./contracts.mjs";
const hex = (x) => /^[a-f0-9]{64}$/.test(x || ""),
  oid = (x) => /^[a-f0-9]{40}$/.test(x || "");
const fields = [
  "sequence",
  "previousRecordHash",
  "phase",
  "sourceDigest",
  "ownerId",
  "epoch",
  "operationId",
  "windowHash",
  "historyIds",
  "transitionId",
  "manifestHash",
];
// Remote implements the existing immutable-node/head/expected-head-CAS contract.
// A real backend requires a separately approved qualification; no credential discovery or writes at construction.
export function connectCurrentFloor({
  authority,
  envelope,
  scope,
  remote,
  signEnvelope,
  floorPublicKey,
}) {
  envelope = structuredClone(envelope);
  scope = structuredClone(scope);
  const grant = authority.check(envelope, "current-floor-backend", scope),
    backend = structuredClone(grant.backend);
  if (
    !backend ||
    backend.repository !== "soundcruise/protected-workspace-pins" ||
    backend.branch !== "codex/freeze-floor/" + grant.sourceDigest ||
    digest(backend) !== grant.backendHash ||
    !oid(grant.genesis) ||
    !oid(grant.minimumCommit) ||
    !Number.isSafeInteger(grant.minimumSequence) ||
    grant.minimumSequence < 1 ||
    !hex(grant.genesisRecordHash) ||
    !hex(grant.issuerPin) ||
    grant.issuerPin === grant.controlIssuerPin ||
    !hex(grant.controlIssuerPin) ||
    typeof signEnvelope !== "function"
  )
    fail("floor-backend-pin");
  if (
    !authority.synthetic &&
    (remote.testOnly !== false || !hex(grant.qualificationHash))
  )
    fail("floor-backend-not-qualified");
  let floorKey;
  try {
    floorKey = createPublicKey(floorPublicKey);
  } catch {
    fail("floor-public-key");
  }
  if (
    floorKey.asymmetricKeyType !== "ed25519" ||
    digest(floorKey.export({ format: "jwk" })) !== grant.issuerPin
  )
    fail("floor-issuer-key-pin");
  const pem = floorKey.export({ type: "spki", format: "pem" }),
    floorAuthority = makeAuthority({
      publicKey: pem,
      rootHash: digest(pem),
      synthetic: authority.synthetic,
    });
  let attempted = false;
  const checkGrant = () =>
    authority.check(envelope, "current-floor-backend", scope);
  async function inspect() {
    checkGrant();
    const head = await remote.head(backend.repository, backend.branch);
    if (!oid(head)) fail("floor-head");
    let at = head,
      rows = [],
      seen = new Set();
    for (let i = 0; i < 1000; i++) {
      if (seen.has(at)) fail("floor-cycle");
      seen.add(at);
      const n = await remote.node(at);
      if (
        n.oid !== at ||
        !Array.isArray(n.parents) ||
        n.parents.some((x) => !oid(x))
      )
        fail("floor-node");
      rows.push(n);
      if (at === grant.genesis) break;
      if (n.parents.length !== 1) fail("floor-branch");
      at = n.parents[0];
    }
    if (rows.at(-1)?.oid !== grant.genesis || rows.at(-1).parents.length !== 0)
      fail("floor-genesis");
    rows.reverse();
    let prev,
      ids = [],
      events = new Set();
    for (const n of rows) {
      const r = n.record;
      if (
        !r ||
        Object.keys(r).length !== fields.length ||
        fields.some((k) => !Object.hasOwn(r, k)) ||
        r.sourceDigest !== grant.sourceDigest ||
        r.ownerId !== grant.ownerId ||
        !Number.isSafeInteger(r.epoch) ||
        r.epoch < 1 ||
        !Number.isSafeInteger(r.sequence) ||
        r.sequence !== (prev ? prev.sequence + 1 : 1) ||
        r.previousRecordHash !== (prev ? digest(prev) : "0".repeat(64)) ||
        !hex(r.windowHash) ||
        !r.operationId ||
        !hex(r.transitionId) ||
        events.has(r.transitionId) ||
        !["CLOSED", "ARCHIVED", "RETIRED"].includes(r.phase) ||
        !Array.isArray(r.historyIds) ||
        r.historyIds.some((x) => typeof x !== "string" || !x) ||
        new Set(r.historyIds).size !== r.historyIds.length ||
        ids.some((x) => !r.historyIds.includes(x)) ||
        !r.historyIds.includes(r.transitionId)
      )
        fail("floor-record");
      if (
        (r.phase === "ARCHIVED" && !hex(r.manifestHash)) ||
        (r.manifestHash !== null && !hex(r.manifestHash))
      )
        fail("floor-manifest");
      if (!prev) {
        if (r.phase !== "CLOSED" || r.manifestHash !== null)
          fail("floor-initial-state");
      } else if (prev.phase === "RETIRED") {
        if (
          r.phase !== "CLOSED" ||
          r.epoch !== prev.epoch + 1 ||
          r.operationId === prev.operationId ||
          r.windowHash === prev.windowHash ||
          r.manifestHash !== null
        )
          fail("floor-new-epoch");
      } else {
        for (const k of ["epoch", "operationId", "windowHash"])
          same(r[k], prev[k], "floor-context");
        if (
          !(
            (prev.phase === "CLOSED" &&
              ["ARCHIVED", "RETIRED"].includes(r.phase)) ||
            (prev.phase === "ARCHIVED" && r.phase === "RETIRED")
          ) ||
          (prev.manifestHash !== null && r.manifestHash !== prev.manifestHash)
        )
          fail("floor-state-regression");
      }
      events.add(r.transitionId);
      ids = r.historyIds;
      prev = r;
    }
    if (
      digest(rows[0].record) !== grant.genesisRecordHash ||
      !rows.some(
        (n) =>
          n.oid === grant.minimumCommit &&
          n.record.sequence === grant.minimumSequence,
      )
    )
      fail("floor-rollback");
    const r = rows.at(-1).record;
    for (const k of [
      "ownerId",
      "sourceDigest",
      "epoch",
      "operationId",
      "windowHash",
    ])
      same(r[k], grant[k], "floor-current-context");
    if (!r.historyIds.includes(grant.windowGrantId)) fail("floor-window-grant");
    if ((await remote.head(backend.repository, backend.branch)) !== head)
      fail("floor-INCONCLUSIVE");
    return {
      commit: head,
      record: r,
      recordHash: digest(r),
      head: digest({ backendHash: grant.backendHash, commit: head }),
    };
  }
  async function signed(kind, data) {
    const e = await signEnvelope(kind, structuredClone(data));
    const p = floorAuthority.check(e, kind, scope);
    same(p.synthetic, authority.synthetic, "floor-synthetic");
    for (const [k, v] of Object.entries(data))
      same(p[k], v, "floor-signer-output");
    return e;
  }
  const common = (r) => ({
    ...r.record,
    backendHash: grant.backendHash,
    head: r.head,
    recordHash: r.recordHash,
  });
  return Object.freeze({
    async readFloor(challenge) {
      if (!hex(challenge)) fail("floor-challenge");
      const r = await inspect();
      return {
        envelope: await signed("maintenance-floor", {
          ...common(r),
          challenge,
        }),
      };
    },
    async casFloor(input) {
      input = structuredClone(input);
      if (attempted) fail("floor-CAS-already-attempted");
      const old = await inspect();
      for (const k of [
        "backendHash",
        "sourceDigest",
        "ownerId",
        "epoch",
        "operationId",
        "windowHash",
      ])
        same(input[k], grant[k], "floor-CAS-context");
      if (
        input.action !== "archive" ||
        input.expectedHead !== old.head ||
        input.expectedSequence !== old.record.sequence ||
        input.previousRecordHash !== old.recordHash ||
        old.record.phase !== "CLOSED" ||
        !hex(input.manifestHash) ||
        !hex(input.transitionId) ||
        old.record.historyIds.includes(input.transitionId)
      )
        fail("floor-CAS-precondition");
      same(
        input.historyIds,
        [...old.record.historyIds, input.transitionId],
        "floor-CAS-history",
      );
      const next = {
        ...old.record,
        sequence: old.record.sequence + 1,
        previousRecordHash: old.recordHash,
        phase: "ARCHIVED",
        manifestHash: input.manifestHash,
        historyIds: input.historyIds,
        transitionId: input.transitionId,
      };
      if (attempted) fail("floor-CAS-already-attempted");
      attempted = true;
      // Maintenance runner persists the exclusive attempt before invoking this method.
      try {
        await remote.appendCAS(
          backend.repository,
          backend.branch,
          old.commit,
          next,
        );
      } catch {
        fail("floor-CAS-UNKNOWN-no-resend");
      }
      const current = await inspect();
      same(current.record, next, "floor-CAS-readback");
      return {
        envelope: await signed("maintenance-finalization", {
          ...common(current),
          expectedHead: old.head,
          previousRecordHash: old.recordHash,
          transitionId: input.transitionId,
          durable: true,
          externalReadback: true,
        }),
      };
    },
    inspect,
  });
}
