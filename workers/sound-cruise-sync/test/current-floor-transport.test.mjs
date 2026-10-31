import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { generateKeyPairSync, sign, randomUUID } from "node:crypto";
import {
  authority,
  canonical,
  digest,
} from "../scripts/studio-operations/contracts.mjs";
import { connectCurrentFloor } from "../scripts/studio-operations/current-floor-transport.mjs";
import { maintenanceCutline } from "../scripts/studio-operations/maintenance-window.mjs";
import { FixtureRemote } from "./current-floor-git-fixture.mjs";
import { privateCurrentReader } from "../scripts/studio-operations/private-current.mjs";
const h = (x) => digest(String(x));
function setup() {
  const root = fs.mkdtempSync(
      path.join(fs.realpathSync(os.tmpdir()), "floor-connection-"),
    ),
    scope = { owner: "fixture" },
    k = generateKeyPairSync("ed25519"),
    fk = generateKeyPairSync("ed25519"),
    fpub = fk.publicKey.export({ type: "spki", format: "pem" }),
    pub = k.publicKey.export({ type: "spki", format: "pem" }),
    a = authority({ publicKey: pub, rootHash: digest(pub), synthetic: true });
  const seal = (kind, data, key = k) => {
    const payload = {
      kind,
      id: randomUUID(),
      scope: digest(scope),
      synthetic: true,
      issued: Date.now() - 1,
      expires: Date.now() + 60000,
      ...data,
    };
    return {
      payload,
      signature: sign(
        null,
        Buffer.from(canonical(payload)),
        key.privateKey,
      ).toString("base64"),
    };
  };
  const rec = {
    sequence: 1,
    previousRecordHash: "0".repeat(64),
    phase: "CLOSED",
    sourceDigest: h("src"),
    ownerId: "B",
    epoch: 1,
    operationId: "op",
    windowHash: h("win"),
    historyIds: ["window-grant", h("initial")],
    transitionId: h("initial"),
    manifestHash: null,
  };
  const branch = "codex/freeze-floor/" + rec.sourceDigest,
    remote = new FixtureRemote(root, rec, branch),
    backend = { repository: "soundcruise/protected-workspace-pins", branch },
    binding = {
      ...rec,
      backend,
      backendHash: digest(backend),
      genesis: remote.genesis,
      minimumCommit: remote.genesis,
      minimumSequence: 1,
      genesisRecordHash: digest(rec),
      issuerPin: digest(fk.publicKey.export({ format: "jwk" })),
      controlIssuerPin: h("control"),
      windowGrantId: "window-grant",
    };
  const open = (override = {}, transport = remote) =>
    connectCurrentFloor({
      authority: a,
      envelope: seal("current-floor-backend", { ...binding, ...override }),
      scope,
      remote: transport,
      floorPublicKey: fpub,
      signEnvelope: async (kind, data) =>
        seal(kind, { operationId: "op", ...data }, fk),
    });
  const api = open();
  return {
    root,
    rec,
    remote,
    open,
    api,
    binding,
    seal,
    a,
    fpub,
    fk,
    floorA: authority({
      publicKey: fpub,
      rootHash: digest(fpub),
      synthetic: true,
    }),
    floorSeal: (kind, data) => seal(kind, data, fk),
    scope,
    close: () => fs.rmSync(root, { recursive: true }),
  };
}
test("real bare Git chain to maintenance guard: archive CAS/readback and restart", async () => {
  const f = setup();
  try {
    const current = await f.api.inspect(),
      b = {
        ...f.binding,
        id: "window-grant",
        minimumHead: current.head,
        maintenanceArtifactHash: h("artifact"),
      };
    let claimed = false;
    const guard = maintenanceCutline({
      authority: f.floorA,
      envelope: f.floorSeal("maintenance-window", b),
      scope: f.scope,
      cutline: { assertCutline: async () => ({ cutlineId: "cut" }) },
      readFloor: f.api.readFloor,
      casFloor: f.api.casFloor,
      claimFinalization: async () => {
        assert.equal(claimed, false);
        claimed = true;
      },
      readDeployment: async (challenge) =>
        f.floorSeal("maintenance-deployment", {
          ...b,
          challenge,
          artifactHash: b.maintenanceArtifactHash,
          allEntrypointsInstrumented: true,
          legacyResolved: true,
          externalExcluded: true,
          manualExcluded: true,
          evidenceHash: h("proof"),
        }),
    });
    assert.equal(
      (await guard.finalizeBackup({ manifestHash: h("archive") })).status,
      "ARCHIVED_EXTERNAL_CAS",
    );
    assert.equal((await f.open().inspect()).record.phase, "ARCHIVED");
    const child = spawnSync(
      "git",
      [
        "--git-dir=" + f.remote.root,
        "show",
        "refs/heads/" + f.remote.branch + ":pin.json",
      ],
      { encoding: "utf8" },
    );
    assert.equal(JSON.parse(child.stdout).manifestHash, h("archive"));
    await assert.rejects(guard.assertCutline());
  } finally {
    f.close();
  }
});
for (const [name, mutation] of Object.entries({
  source: (r) => (r.sourceDigest = h("foreign")),
  owner: (r) => (r.ownerId = "A"),
  epoch: (r) => (r.epoch = 0),
  sequence: (r) => (r.sequence = 0),
  hash: (r) => (r.previousRecordHash = h("bad")),
  replay: (r) => (r.transitionId = h("initial")),
  phase: (r) => (r.phase = "CLOSED"),
  payload: (r) => (r.payload = "forbidden"),
}))
  test("immutable history rejects " + name, async () => {
    const f = setup();
    try {
      const r = {
        ...f.rec,
        sequence: 2,
        previousRecordHash: digest(f.rec),
        phase: "ARCHIVED",
        manifestHash: h("m"),
        transitionId: h("event"),
        historyIds: [...f.rec.historyIds, h("event")],
      };
      mutation(r);
      f.remote.appendCAS(
        f.binding.backend.repository,
        f.remote.branch,
        f.remote.genesis,
        r,
      );
      await assert.rejects(f.api.inspect());
    } finally {
      f.close();
    }
  });
test("minimum externally pinned commit rejects rollback", async () => {
  const f = setup();
  try {
    const r = {
      ...f.rec,
      sequence: 2,
      previousRecordHash: digest(f.rec),
      phase: "RETIRED",
      transitionId: h("retire"),
      historyIds: [...f.rec.historyIds, h("retire")],
    };
    const commit = f.remote.appendCAS(
      f.binding.backend.repository,
      f.remote.branch,
      f.remote.genesis,
      r,
    );
    const api = f.open({ minimumCommit: commit, minimumSequence: 2 });
    f.remote.git([
      "update-ref",
      "refs/heads/" + f.remote.branch,
      f.remote.genesis,
      commit,
    ]);
    await assert.rejects(api.inspect(), /rollback/);
  } finally {
    f.close();
  }
});
test("independent issuer cannot equal Control issuer", () => {
  const f = setup();
  try {
    assert.throws(() => f.open({ issuerPin: f.binding.controlIssuerPin }));
  } finally {
    f.close();
  }
});
test("ACK loss after Git CAS stays UNKNOWN and same transport does not resend", async () => {
  const f = setup();
  try {
    const old = await f.api.inspect(),
      id = h("event"),
      input = {
        ...f.binding,
        expectedHead: old.head,
        expectedSequence: 1,
        previousRecordHash: old.recordHash,
        action: "archive",
        transitionId: id,
        manifestHash: h("m"),
        historyIds: [...f.rec.historyIds, id],
      };
    f.remote.dropAck = true;
    await assert.rejects(f.api.casFloor(input), /UNKNOWN/);
    await assert.rejects(f.api.casFloor(input), /already-attempted/);
    assert.equal(f.remote.calls, 1);
    assert.equal((await f.open().inspect()).record.phase, "ARCHIVED");
  } finally {
    f.close();
  }
});
test("floor missing fails closed", async () => {
  const f = setup();
  try {
    f.remote.git(["update-ref", "-d", "refs/heads/" + f.remote.branch]);
    await assert.rejects(f.api.readFloor(h("nonce")));
  } finally {
    f.close();
  }
});
test("fixture cannot be promoted to Production", () => {
  const f = setup();
  try {
    assert.throws(
      () =>
        connectCurrentFloor({
          authority: {
            synthetic: false,
            check: () => ({ ...f.binding, qualificationHash: h("x") }),
          },
          envelope: {},
          scope: {},
          floorPublicKey: f.fpub,
          remote: f.remote,
          signEnvelope: () => {},
        }),
      /not-qualified/,
    );
  } finally {
    f.close();
  }
});
test("private CURRENT reader requires explicit binding and no control method", () => {
  assert.throws(() => privateCurrentReader({}), /binding/);
  const r = privateCurrentReader({
    binding: { fetch: async () => new Response(null, { status: 503 }) },
    signRequest: async () => ({}),
  });
  assert.equal(r.control, undefined);
  return assert.rejects(r.observe("CLOSED"), /OPEN-only/);
});

test("floor issuer alias cannot replace the pinned public key", () => {
  const f = setup();
  try {
    assert.throws(() => f.open({ issuerPin: h("fake") }), /issuer-key-pin/);
  } finally {
    f.close();
  }
});
test("retirement winning external CAS prevents archive", async () => {
  const f = setup();
  try {
    const old = await f.api.inspect(),
      append = f.remote.appendCAS.bind(f.remote);
    f.remote.appendCAS = (repo, branch, head, next) => {
      const retire = {
        ...f.rec,
        sequence: 2,
        previousRecordHash: digest(f.rec),
        phase: "RETIRED",
        transitionId: h("retire"),
        historyIds: [...f.rec.historyIds, h("retire")],
      };
      append(repo, branch, head, retire);
      return append(repo, branch, head, next);
    };
    const id = h("archive-event");
    await assert.rejects(
      f.api.casFloor({
        ...f.binding,
        expectedHead: old.head,
        expectedSequence: 1,
        previousRecordHash: old.recordHash,
        action: "archive",
        manifestHash: h("m"),
        transitionId: id,
        historyIds: [...f.rec.historyIds, id],
      }),
      /UNKNOWN/,
    );
    assert.equal((await f.open().inspect()).record.phase, "RETIRED");
  } finally {
    f.close();
  }
});
