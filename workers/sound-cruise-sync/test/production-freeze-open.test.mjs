import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { generateKeyPairSync, sign, randomUUID } from "node:crypto";
import { createFreezeWorker } from "../src/production-freeze-worker.js";
import { createFreezeGateway } from "../src/production-freeze-gateway.js";
import { boundedFreezeCoordinator } from "../src/production-freeze-rpc.js";
import { freezeStub } from "../src/production-freeze-binding.js";
import { prepareFreezeOpen } from "../scripts/studio-operations/freeze-open-plan.mjs";
import { canonical, digest } from "../scripts/studio-operations/contracts.mjs";
const key = () => {
    const k = generateKeyPairSync("ed25519");
    return {
      private: k.privateKey,
      public: k.publicKey.export({ format: "jwk" }),
    };
  },
  operator = key(),
  external = key(),
  issuer = key();
const source = { d1: "isolated/d1", r2: "isolated/default/r2/created" },
  sourceDigest = digest(source);
const signed = (kind, extra = {}, k = external) => {
  const payload = {
    kind,
    id: randomUUID(),
    sourceDigest,
    issued: Date.now() - 1,
    expires: Date.now() + 10000,
    ...extra,
  };
  return {
    payload,
    signature: sign(null, Buffer.from(canonical(payload)), k.private).toString(
      "base64",
    ),
  };
};
const ctx = () => {
  const jobs = [];
  return {
    waitUntil(p) {
      jobs.push(p);
    },
    async done() {
      return Promise.all(jobs);
    },
  };
};
const noSource = {
  SYNC_DB: {
    prepare() {
      throw Error("unexpected Source call");
    },
  },
};
const control = () => ({
  admit: async (k, id) => ({ allowed: true, id, epoch: 1 }),
  effectBegin: async () => true,
  effectEnd: async () => true,
  finish: async () => true,
});
for (const method of [
  "admit",
  "effectBegin",
  "effectEnd",
  "finish",
  "current",
  "control",
])
  test("RPC deadline bounds " + method + " without retry", async () => {
    let count = 0;
    const c = boundedFreezeCoordinator(
      {
        [method]() {
          count++;
          return new Promise(() => {});
        },
      },
      { timeoutMs: 20 },
    );
    const start = Date.now();
    await assert.rejects(c[method](), /freeze-control-unknown/);
    assert.equal(count, 1);
    assert.ok(Date.now() - start < 1000);
  });
test("late admission ACK is UNKNOWN and never runs delegate", async () => {
  let native = 0,
    calls = 0;
  const c = ctx(),
    s = control();
  s.admit = async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 45));
    return { allowed: true };
  };
  const w = createFreezeWorker({
    delegate: {
      fetch() {
        native++;
        return new Response("BAD");
      },
    },
    coordinator: s,
    timeoutMs: 20,
  });
  const r = await w.fetch(new Request("https://fixture.invalid/"), noSource, c);
  assert.equal(r.status, 503);
  assert.equal(r.headers.get("Retry-After"), null);
  assert.equal((await r.json()).outcome, "UNKNOWN");
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(native, 0);
  assert.equal(calls, 1);
});
test("Control disconnect denies delegate before any Source call", async () => {
  let called = false;
  const s = control();
  s.admit = () => {
    throw Error("secret must not be reflected");
  };
  const r = await createFreezeWorker({
    delegate: {
      fetch() {
        called = true;
      },
    },
    coordinator: s,
  }).fetch(new Request("https://fixture.invalid/"), noSource, ctx());
  assert.equal(r.status, 503);
  assert.ok(!(await r.text()).includes("secret"));
  assert.equal(called, false);
});
test("CLOSED is423 and capacity exhaustion is503", async () => {
  for (const [mode, status] of [
    ["CLOSING", 423],
    ["CAPACITY", 503],
  ]) {
    const s = control();
    s.admit = async () => ({ allowed: false, mode });
    const r = await createFreezeWorker({ delegate: {}, coordinator: s }).fetch(
      new Request("https://fixture.invalid/"),
      noSource,
      ctx(),
    );
    assert.equal(r.status, status);
  }
});
test("ordinary exception with no mutation completes as business error", async () => {
  let finish;
  const c = ctx(),
    s = control();
  s.finish = async (...x) => {
    finish = x;
  };
  const r = await createFreezeWorker({
    delegate: {
      fetch() {
        throw Error("business");
      },
    },
    coordinator: s,
  }).fetch(new Request("https://fixture.invalid/"), noSource, c);
  assert.equal((await r.json()).outcome, "FAILED_NO_MUTATION");
  await c.done();
  assert.equal(finish[1], true);
  assert.equal(finish[2], "HANDLER_ERROR");
});
test("confirmed SELECT then business exception is not unknown mutation", async () => {
  let finish;
  const c = ctx(),
    s = control();
  s.finish = async (...x) => {
    finish = x;
  };
  const env = {
    SYNC_DB: {
      prepare() {
        return { first: async () => ({ safe: 1 }) };
      },
    },
  };
  const r = await createFreezeWorker({
    delegate: {
      async fetch(_, e) {
        await e.SYNC_DB.prepare("SELECT 1").first();
        throw Error("business");
      },
    },
    coordinator: s,
  }).fetch(new Request("https://fixture.invalid/"), env, c);
  assert.equal((await r.json()).outcome, "FAILED_NO_MUTATION");
  await c.done();
  assert.equal(finish[1], true);
});
test("write followed by business exception stays UNKNOWN", async () => {
  let finish;
  const c = ctx(),
    s = control();
  s.finish = async (...x) => {
    finish = x;
  };
  const env = {
    SYNC_DB: {
      prepare() {
        return { run: async () => ({ success: true }) };
      },
    },
  };
  const r = await createFreezeWorker({
    delegate: {
      async fetch(_, e) {
        await e.SYNC_DB.prepare("INSERT INTO synthetic VALUES(1)").run();
        throw Error("after write");
      },
    },
    coordinator: s,
  }).fetch(new Request("https://fixture.invalid/"), env, c);
  assert.equal((await r.json()).outcome, "UNKNOWN");
  await c.done();
  assert.equal(finish[1], false);
});
test("effectBegin failure cannot perform native mutation", async () => {
  let native = 0;
  const c = ctx(),
    s = control();
  s.effectBegin = async () => {
    throw Error("offline");
  };
  const env = {
    SYNC_DB: {
      prepare() {
        return {
          run: async () => {
            native++;
          },
        };
      },
    },
  };
  const r = await createFreezeWorker({
    delegate: {
      async fetch(_, e) {
        try {
          await e.SYNC_DB.prepare("INSERT synthetic").run();
        } catch {}
        return new Response("swallowed");
      },
    },
    coordinator: s,
  }).fetch(new Request("https://fixture.invalid/"), env, c);
  assert.equal(r.status, 503);
  await c.done();
  assert.equal(native, 0);
});
test("finish failure is reported and never causes automatic replay", async () => {
  let tries = 0;
  const reported = [],
    c = ctx(),
    s = control();
  s.finish = async () => {
    tries++;
    throw Error("offline");
  };
  const r = await createFreezeWorker({
    delegate: {
      fetch() {
        return new Response("known read");
      },
    },
    coordinator: s,
    report: (e) => reported.push(e),
  }).fetch(new Request("https://fixture.invalid/"), noSource, c);
  assert.equal(r.status, 200);
  await c.done();
  assert.equal(tries, 1);
  assert.ok(reported.some((e) => e.event === "freeze_completion_unknown"));
});
for (const value of [undefined, null, "123", NaN])
  test(
    "deployment certificate rejects invalid time " + String(value),
    async () => {
      const cfg = {
        source,
        namespaceId: "a".repeat(32),
        workerArtifactHash: "b".repeat(64),
        externalPublicJwk: external.public,
      };
      const cert = signed("freeze-deployment", {
        issued: value,
        namespaceId: cfg.namespaceId,
        workerArtifactHash: cfg.workerArtifactHash,
        namespaceName: "source-" + sourceDigest,
        bindingNames: { d1: "SYNC_DB", r2: "SYNC_ASSETS" },
      });
      await assert.rejects(
        freezeStub({
          FREEZE_CONFIG: JSON.stringify(cfg),
          FREEZE_DEPLOYMENT_CERTIFICATE: JSON.stringify(cert),
          FREEZE_COORDINATOR: {
            getByName() {
              assert.fail("must reject before binding");
            },
          },
        }),
      );
    },
  );
test("signed CURRENT with missing expiry is rejected before RPC", async () => {
  let called = 0;
  const e = signed(
    "freeze-current-read",
    { expires: undefined, nonce: "a".repeat(64) },
    operator,
  );
  const g = createFreezeGateway({
    coordinator: {
      current() {
        called++;
      },
    },
    operatorPublicJwk: operator.public,
    source,
  });
  const r = await g.fetch(
    new Request("https://fixture.invalid/current", {
      method: "POST",
      body: JSON.stringify({ envelope: e }),
    }),
  );
  assert.equal(r.status, 409);
  assert.equal(called, 0);
});
test("gateway lost control ACK is503 UNKNOWN not a definite rejection", async () => {
  const e = signed("freeze-control", {}, operator);
  const g = createFreezeGateway({
    coordinator: {
      control() {
        return new Promise(() => {});
      },
    },
    operatorPublicJwk: operator.public,
    source,
    timeoutMs: 20,
  });
  const r = await g.fetch(
    new Request("https://fixture.invalid/control", {
      method: "POST",
      body: JSON.stringify({ envelope: e }),
    }),
  );
  assert.equal(r.status, 503);
  assert.equal((await r.json()).outcome, "UNKNOWN");
});
const base = JSON.parse(
  fs.readFileSync(
    new URL("../wrangler.studio-candidate.jsonc", import.meta.url),
  ),
);
function plan() {
  const accountId = "a".repeat(32),
    r2Metadata = {
      accountId,
      name: "sound-cruise-sync-assets",
      jurisdiction: "default",
      creationDate: "2026-09-18T00:00:00.000Z",
    },
    src = {
      d1: accountId + "/" + base.d1_databases[0].database_id,
      r2:
        accountId +
        "/default/sound-cruise-sync-assets/" +
        r2Metadata.creationDate,
    },
    namespaceId = "c".repeat(32),
    workerArtifactHash = "d".repeat(64);
  return {
    baseProfile: base,
    accountId,
    r2Metadata,
    namespaceId,
    workerArtifactHash,
    ownerId: "fixture",
    limits: {
      maxInvocations: 1000,
      maxEffects: 10000,
      effectsPerInvocation: 100,
      maxActive: 10,
      warnPercent: 70,
    },
    rpcTimeoutMs: 2000,
    externalPublicJwk: external.public,
    operatorPublicJwk: operator.public,
    receiptPublicJwk: issuer.public,
    capacityApproval: {
      evidenceHash: "e".repeat(64),
      maxRetentionDays: 7,
      custodian: "fixture",
    },
    observedSecrets: ["SYNTHETIC_EXISTING_SECRET_NAME"],
    privateGateway: {
      accessEvidenceHash: "f".repeat(64),
      callerScript: "fixture-private-relay",
      httpsOrigin: "https://fixture.invalid",
    },
    currentFloor: {
      ownerId: "fixture",
      minimumRevision: 0,
      evidenceHash: "b".repeat(64),
      independentStore: "synthetic-only",
    },
    synthetic: true,
    certificate: signed("freeze-deployment", {
      sourceDigest: digest(src),
      namespaceId,
      workerArtifactHash,
      namespaceName: "source-" + digest(src),
      bindingNames: { d1: "SYNC_DB", r2: "SYNC_ASSETS" },
    }),
  };
}
test("compiler preserves full Product profile and emits private Control only", () => {
  const p = prepareFreezeOpen(plan());
  assert.ok(p.profilesReady);
  assert.equal(p.productionEligible, false);
  assert.equal(p.control.workers_dev, false);
  assert.equal(p.control.preview_urls, false);
  assert.deepEqual(p.control.routes, []);
  assert.equal(p.control.d1_databases, undefined);
  assert.equal(p.control.r2_buckets, undefined);
  assert.deepEqual(p.product.triggers, base.triggers);
  assert.deepEqual(p.product.d1_databases, base.d1_databases);
  assert.deepEqual(p.product.ratelimits, base.ratelimits);
  assert.equal(p.product.vars.STUDIO_RELEASE_ROUTE_ENABLED, "false");
  assert.equal(p.product.vars.FREEZE_RECEIPT_PRIVATE_JWK, undefined);
  assert.equal(p.operatorServiceBinding.entrypoint, "FreezeOperatorGateway");
});
for (const field of [
  "namespaceId",
  "certificate",
  "r2Metadata",
  "capacityApproval",
  "privateGateway",
  "observedSecrets",
  "currentFloor",
])
  test("compiler holds missing " + field, () => {
    const p = plan();
    delete p[field];
    const q = prepareFreezeOpen(p);
    assert.equal(q.profilesReady, false);
    assert.equal(q.productionEligible, false);
  });
test("compiler rejects tampered Product profile", () => {
  const p = plan();
  p.baseProfile = structuredClone(base);
  p.baseProfile.vars.STUDIO_RELEASE_ROUTE_ENABLED = "true";
  assert.throws(() => prepareFreezeOpen(p));
});
test("compiler rejects same-key authority reuse", () => {
  const p = plan();
  p.receiptPublicJwk = p.operatorPublicJwk;
  assert.throws(() => prepareFreezeOpen(p));
});

test("same key material with different JWK metadata is rejected", () => {
  const p = plan();
  p.receiptPublicJwk = {
    ...p.operatorPublicJwk,
    kid: "different-label",
    use: "sig",
  };
  assert.throws(() => prepareFreezeOpen(p));
});
test("day-only R2 UI creation date cannot become exact Source pin", () => {
  const p = plan();
  p.r2Metadata.creationDate = "2026-09-18";
  assert.equal(prepareFreezeOpen(p).profilesReady, false);
});
for (const timeoutMs of [NaN, 0, 10001, "2000"])
  test(
    "invalid RPC timeout fails at factory before admission " +
      String(timeoutMs),
    () => {
      assert.throws(
        () =>
          createFreezeWorker({
            delegate: {},
            coordinator: control(),
            timeoutMs,
          }),
        /timeout-config/,
      );
    },
  );

test("native success survives only end-ACK failure and tracking stays UNKNOWN", async () => {
  let native = 0,
    finish;
  const c = ctx(),
    s = control();
  s.effectEnd = async () => {
    throw Error("lost ACK");
  };
  s.finish = async (...x) => {
    finish = x;
  };
  const env = {
    SYNC_DB: {
      prepare() {
        return {
          run: async () => {
            native++;
            return { success: true };
          },
        };
      },
    },
  };
  const r = await createFreezeWorker({
    delegate: {
      async fetch(_, e) {
        await e.SYNC_DB.prepare("INSERT synthetic").run();
        return new Response("original known success");
      },
    },
    coordinator: s,
  }).fetch(new Request("https://fixture.invalid/"), env, c);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), "original known success");
  await c.done();
  assert.equal(native, 1);
  assert.equal(finish[1], false);
});

test("later begin failure is not hidden by earlier end-ACK loss", async () => {
  let native = 0,
    begins = 0,
    finish;
  const c = ctx(),
    s = control();
  s.effectBegin = async () => {
    if (++begins === 2) throw Error("later outage");
  };
  s.effectEnd = async () => {
    throw Error("earlier ACK loss");
  };
  s.finish = async (...x) => {
    finish = x;
  };
  const env = {
    SYNC_DB: {
      prepare() {
        return {
          run: async () => {
            native++;
            return { success: true };
          },
        };
      },
    },
  };
  const r = await createFreezeWorker({
    delegate: {
      async fetch(_, e) {
        try {
          await e.SYNC_DB.prepare("INSERT first").run();
          await e.SYNC_DB.prepare("INSERT second").run();
        } catch {}
        return new Response("swallowed");
      },
    },
    coordinator: s,
  }).fetch(new Request("https://fixture.invalid/"), env, c);
  assert.equal(r.status, 503);
  await c.done();
  assert.equal(native, 1);
  assert.equal(finish[1], false);
});

test("uncreated authority keys remain an explicit preparation blocker", () => {
  const p = plan();
  delete p.operatorPublicJwk;
  assert.equal(prepareFreezeOpen(p).profilesReady, false);
});

test("noncanonical base64url spelling cannot disguise the same Ed25519 key", () => {
  const p = plan();
  const alphabet =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_",
    x = p.operatorPublicJwk.x;
  const altered = x.slice(0, -1) + alphabet[alphabet.indexOf(x.at(-1)) + 1];
  assert.deepEqual(
    Buffer.from(altered, "base64url"),
    Buffer.from(x, "base64url"),
  );
  p.receiptPublicJwk = { ...p.operatorPublicJwk, x: altered, kid: "disguised" };
  assert.throws(() => prepareFreezeOpen(p));
});

test("single SELECT stays under admission without mutation RPC overhead", async () => {
  let mutationRPC = 0,
    finish = false;
  const c = ctx(),
    s = control();
  s.effectBegin = async () => {
    mutationRPC++;
  };
  s.effectEnd = async () => {
    mutationRPC++;
  };
  s.finish = async () => {
    finish = true;
  };
  const env = {
    SYNC_DB: {
      prepare() {
        return { first: async () => ({ read: true }) };
      },
    },
  };
  const r = await createFreezeWorker({
    delegate: {
      async fetch(_, e) {
        await e.SYNC_DB.prepare(" SELECT 1").first();
        return new Response("read");
      },
    },
    coordinator: s,
  }).fetch(new Request("https://fixture.invalid/"), env, c);
  assert.equal(r.status, 200);
  await c.done();
  assert.equal(mutationRPC, 0);
  assert.equal(finish, true);
});

test("configuration owner must be an explicit identity string", () => {
  const p = plan();
  p.ownerId = true;
  assert.throws(() => prepareFreezeOpen(p));
});
