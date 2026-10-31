import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign, randomUUID } from "node:crypto";
import {
  authority,
  canonical,
  digest,
} from "../scripts/studio-operations/contracts.mjs";
import {
  maintenanceCutline,
  maintenanceNormalReturn,
} from "../scripts/studio-operations/maintenance-window.mjs";
const h = (x) => digest(String(x));
function fixture() {
  const k = generateKeyPairSync("ed25519"),
    publicKey = k.publicKey.export({ type: "spki", format: "pem" }),
    scope = { source: "synthetic", owner: "B" };
  const auth = authority({
    publicKey,
    rootHash: digest(publicKey),
    synthetic: true,
  });
  const signed = (kind, data) => {
    const payload = {
      kind,
      id: randomUUID(),
      operationId: "operation",
      scope: digest(scope),
      issued: Date.now() - 1,
      expires: Date.now() + 60000,
      synthetic: true,
      ...data,
    };
    return {
      payload,
      signature: sign(
        null,
        Buffer.from(canonical(payload)),
        k.privateKey,
      ).toString("base64"),
    };
  };
  const binding = {
    id: "grant",
    operationId: "operation",
    ownerId: "B",
    epoch: "epoch",
    backendHash: h("backend"),
    sourceDigest: h("source"),
    windowHash: h("window"),
    maintenanceArtifactHash: h("artifact"),
    minimumSequence: 1,
    minimumHead: h("head1"),
  };
  const { id: _grant, ...floorBinding } = binding;
  let state = {
      ...floorBinding,
      phase: "CLOSED",
      head: binding.minimumHead,
      sequence: 1,
      recordHash: h("record1"),
      previousRecordHash: h("genesis"),
      historyIds: ["grant"],
    },
    casCalls = 0,
    cutCalls = 0;
  const env = signed("maintenance-window", binding);
  let claimed = false;
  const hooks = {};
  const readFloor = async (challenge) => {
    await hooks.beforeRead?.();
    const p = { ...state, challenge };
    hooks.floor?.(p);
    return { envelope: signed("maintenance-floor", p) };
  };
  const casFloor = async (input) => {
    casCalls++;
    await hooks.beforeCAS?.();
    if (
      input.expectedHead !== state.head ||
      input.expectedSequence !== state.sequence
    )
      throw Error("CAS conflict");
    state = {
      ...state,
      phase: "ARCHIVED",
      sequence: state.sequence + 1,
      head: h("head" + (state.sequence + 1)),
      recordHash: h("archive" + input.manifestHash),
      previousRecordHash: state.recordHash,
      historyIds: input.historyIds,
      manifestHash: input.manifestHash,
    };
    if (hooks.ackLoss) throw Error("lost");
    const p = {
      ...state,
      ...input,
      head: state.head,
      sequence: state.sequence,
      recordHash: state.recordHash,
      phase: "ARCHIVED",
      durable: true,
      externalReadback: true,
    };
    hooks.final?.(p);
    return { envelope: signed("maintenance-finalization", p) };
  };
  const readDeployment = async (challenge) => {
    const p = {
      ...binding,
      challenge,
      artifactHash: binding.maintenanceArtifactHash,
      allEntrypointsInstrumented: true,
      legacyResolved: true,
      externalExcluded: true,
      manualExcluded: true,
      evidenceHash: h("metadata"),
    };
    hooks.deployment?.(p);
    return signed("maintenance-deployment", p);
  };
  const base = {
    async assertCutline() {
      cutCalls++;
      await hooks.cutline?.();
      return { cutlineId: "cut1" };
    },
  };
  const guard = () =>
    maintenanceCutline({
      authority: auth,
      envelope: env,
      scope,
      cutline: base,
      readFloor,
      casFloor,
      readDeployment,
      claimFinalization: async () => {
        if (claimed) throw Error("durable-intent-exists");
        claimed = true;
      },
    });
  return {
    auth,
    signed,
    scope,
    binding,
    env,
    hooks,
    guard,
    state: () => state,
    set: (x) => (state = { ...state, ...x }),
    retire: () =>
      (state = {
        ...state,
        phase: "RETIRED",
        sequence: state.sequence + 1,
        head: h("retired"),
        previousRecordHash: state.recordHash,
        recordHash: h("retired-record"),
      }),
    calls: () => ({ casCalls, cutCalls }),
  };
}
test("signed CLOSED guard accepts exact source/window/deployment", async () => {
  const f = fixture();
  assert.equal((await f.guard().assertCutline()).cutlineId, "cut1");
});
test("final acceptance uses one external CAS and exact readback", async () => {
  const f = fixture();
  const g = f.guard();
  await g.assertCutline();
  assert.equal(
    (await g.finalizeBackup({ manifestHash: h("manifest") })).status,
    "ARCHIVED_EXTERNAL_CAS",
  );
  assert.equal(f.calls().casCalls, 1);
  await assert.rejects(g.assertCutline(), /retired-or-finalized/);
});
for (const [name, change] of Object.entries({
  owner: (p) => (p.ownerId = "A"),
  epoch: (p) => (p.epoch = "other"),
  source: (p) => (p.sourceDigest = h("other")),
  window: (p) => (p.windowHash = h("other")),
  backend: (p) => (p.backendHash = h("other")),
  nonce: (p) => (p.challenge = h("other")),
  stale: (p) => (p.sequence = 0),
  headFork: (p) => (p.head = h("wrong")),
  history: (p) => (p.historyIds = []),
  duplicate: (p) => (p.historyIds = ["grant", "grant"]),
  phase: (p) => (p.phase = "OPEN"),
}))
  test("floor rejects " + name, async () => {
    const f = fixture();
    f.hooks.floor = change;
    await assert.rejects(f.guard().assertCutline());
  });
for (const key of [
  "legacyResolved",
  "externalExcluded",
  "manualExcluded",
  "allEntrypointsInstrumented",
])
  test("deployment refuses missing " + key, async () => {
    const f = fixture();
    f.hooks.deployment = (p) => (p[key] = false);
    await assert.rejects(f.guard().assertCutline(), /deployment-unproved/);
  });
test("normal artifact cannot authorize maintenance cutline", async () => {
  const f = fixture();
  f.hooks.deployment = (p) =>
    (p.artifactHash =
      "de6b6fbd2f759fdc55a32662e10d224e11d876672405b604944270387cc19b15");
  await assert.rejects(f.guard().assertCutline());
});
test("retired cutline rejects before Source validation", async () => {
  const f = fixture();
  f.retire();
  await assert.rejects(f.guard().assertCutline());
  assert.equal(f.calls().cutCalls, 0);
});
test("retirement during observation refuses despite old signed Control SEALED", async () => {
  const f = fixture();
  f.hooks.cutline = () => f.retire();
  await assert.rejects(f.guard().assertCutline());
});
test("retirement versus finalization CAS has only one winner", async () => {
  const f = fixture();
  f.hooks.beforeCAS = () => f.retire();
  await assert.rejects(
    f.guard().finalizeBackup({ manifestHash: h("m") }),
    /UNKNOWN/,
  );
  assert.equal(f.calls().casCalls, 1);
  assert.equal(f.state().phase, "RETIRED");
});
test("lost ACK after committed external CAS stays UNKNOWN and no resend", async () => {
  const f = fixture();
  f.hooks.ackLoss = true;
  const g = f.guard();
  await assert.rejects(g.finalizeBackup({ manifestHash: h("m") }), /UNKNOWN/);
  assert.equal(f.state().phase, "ARCHIVED");
  assert.equal(f.calls().casCalls, 1);
  await assert.rejects(g.finalizeBackup({ manifestHash: h("m") }));
  assert.equal(f.calls().casCalls, 1);
});
test("two contenders from one floor reject stale CAS", async () => {
  const f = fixture();
  const results = await Promise.allSettled([
    f.guard().finalizeBackup({ manifestHash: h("m1") }),
    f.guard().finalizeBackup({ manifestHash: h("m2") }),
  ]);
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
});
for (const [name, change] of Object.entries({
  nondurable: (p) => (p.durable = false),
  unread: (p) => (p.externalReadback = false),
  wrongManifest: (p) => (p.manifestHash = h("wrong")),
  wrongOwner: (p) => (p.ownerId = "A"),
  wrongHead: (p) => (p.head = h("wrong")),
  wrongSequence: (p) => (p.sequence += 1),
}))
  test("finalization rejects " + name, async () => {
    const f = fixture();
    f.hooks.final = change;
    await assert.rejects(f.guard().finalizeBackup({ manifestHash: h("m") }));
  });
test("ABA and record mutation at same head refuse", async () => {
  const f = fixture();
  const g = f.guard();
  await g.assertCutline();
  f.set({ recordHash: h("different") });
  await assert.rejects(g.assertCutline(), /rollback/);
});
test("normal return needs independent RETIRED and challenge-bound OPEN", () => {
  const f = fixture();
  f.retire();
  const s = f.state(),
    b = {
      ...f.binding,
      challenge: "challenge",
      retirementHead: s.head,
      retirementRecordHash: s.recordHash,
      normalArtifactHash:
        "de6b6fbd2f759fdc55a32662e10d224e11d876672405b604944270387cc19b15",
      operatorAck: true,
      deploymentEvidenceHash: h("deployment"),
    };
  const options = {
    authority: f.auth,
    scope: f.scope,
    envelope: f.signed("maintenance-return", b),
    floorEnvelope: f.signed("maintenance-floor", {
      ...s,
      challenge: b.challenge,
    }),
    controlEnvelope: f.signed("maintenance-open", {
      ...b,
      state: "OPEN",
      inflight: 0,
      unknown: 0,
      backupReadersStopped: true,
    }),
  };
  assert.equal(maintenanceNormalReturn(options).deploymentAuthorized, false);
  options.floorEnvelope = f.signed("maintenance-floor", {
    ...s,
    phase: "CLOSED",
    challenge: b.challenge,
  });
  assert.throws(() => maintenanceNormalReturn(options));
});
test("invalid Archive manifest refuses before any CAS", async () => {
  const f = fixture();
  await assert.rejects(f.guard().finalizeBackup({ manifestHash: "bad" }));
  assert.equal(f.calls().casCalls, 0);
});
test("replayed signed floor witness cannot satisfy fresh nonce", async () => {
  const f = fixture();
  let saved;
  f.hooks.floor = (p) => {
    if (saved) {
      Object.assign(p, saved);
    } else saved = structuredClone(p);
  };
  await assert.rejects(f.guard().assertCutline());
});

test("ACK loss before CAS is never resent by same or reconstructed guard", async () => {
  const f = fixture();
  f.hooks.beforeCAS = () => {
    throw Error("network-before-commit");
  };
  const g = f.guard();
  await assert.rejects(g.finalizeBackup({ manifestHash: h("m") }), /UNKNOWN/);
  assert.equal(f.state().phase, "CLOSED");
  await assert.rejects(
    g.finalizeBackup({ manifestHash: h("m") }),
    /already-attempted/,
  );
  await assert.rejects(
    f.guard().finalizeBackup({ manifestHash: h("m") }),
    /durable-intent-exists/,
  );
  assert.equal(f.calls().casCalls, 1);
});

test("durable finalization intent survives process reopen and forbids CAS resend", () => {
  const root = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "sc-maintenance-intent-"),
  );
  try {
    const journal = path.join(root, "attempt.json"),
      module = new URL(
        "../scripts/studio-operations/contracts.mjs",
        import.meta.url,
      ).href;
    const code = `import {durable} from ${JSON.stringify(module)};try{await durable(${JSON.stringify(journal)},{operationId:'op',state:'ATTEMPTED',transitionId:'fixed'});console.log('CLAIMED')}catch(e){if(e.code==='EEXIST')console.log('RECONCILE_ONLY');else throw e}`;
    const run = () =>
      spawnSync(process.execPath, ["--input-type=module", "-e", code], {
        encoding: "utf8",
      });
    assert.equal(run().stdout.trim(), "CLAIMED");
    assert.equal(run().stdout.trim(), "RECONCILE_ONLY");
    assert.equal(JSON.parse(fs.readFileSync(journal)).transitionId, "fixed");
  } finally {
    fs.rmSync(root, { recursive: true });
  }
});

test("post-CAS readback failure remains UNKNOWN", async () => {
  const f = fixture();
  f.hooks.final = () => {
    f.hooks.beforeRead = () => {
      throw Error("backend-down");
    };
  };
  await assert.rejects(
    f.guard().finalizeBackup({ manifestHash: h("m") }),
    /UNKNOWN/,
  );
  assert.equal(f.calls().casCalls, 1);
});
