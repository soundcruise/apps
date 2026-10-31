import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { randomUUID, generateKeyPairSync, sign } from "node:crypto";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { canonical, digest } from "./studio-operations/contracts.mjs";
import { verifyFreezeState } from "../src/production-freeze-current.js";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  out = process.env.FREEZE_OPEN_OUTPUT;
if (!out || !path.isAbsolute(out) || fs.existsSync(out))
  throw Error("fresh-absolute-output-required");
fs.mkdirSync(out, { mode: 0o700 });
const req = createRequire(ROOT + "/package.json"),
  { Miniflare, convertV4MiniflareOptions } = req("miniflare"),
  { build } = req("esbuild");
process.env.MINIFLARE_WORKERD_PATH ??= req("workerd");
const bundle = async (entry) =>
  (
    await build({
      entryPoints: [ROOT + "/" + entry],
      bundle: true,
      format: "esm",
      platform: "browser",
      target: "es2022",
      write: false,
      external: ["cloudflare:workers"],
      logLevel: "silent",
    })
  ).outputFiles[0].text;
const productCode = await bundle("test/production-freeze-open-fixture.js"),
  controlCode = await bundle("src/production-freeze-control-entry.js");
const keys = () => {
    const k = generateKeyPairSync("ed25519");
    return {
      private: k.privateKey,
      public: k.publicKey.export({ format: "jwk" }),
      jwk: k.privateKey.export({ format: "jwk" }),
    };
  },
  operator = keys(),
  external = keys(),
  issuer = keys();
let mf, db, source, sourceDigest, config, bindings, stage;
const signed = (kind, data = {}, key = operator) => {
  const payload = {
    kind,
    id: randomUUID(),
    sourceDigest,
    issued: Date.now() - 1,
    expires: Date.now() + 300000,
    ...data,
  };
  return {
    payload,
    signature: sign(
      null,
      Buffer.from(canonical(payload)),
      key.private,
    ).toString("base64"),
  };
};
const results = [];
async function check(name, f) {
  await f();
  results.push({ name, status: "PASS" });
  console.log("PASS " + name);
}
async function open(name, limits) {
  stage = name;
  if (limits) {
    source = {
      d1: "fixture/" + name,
      r2: "fixture/default/" + name + "/created",
    };
    sourceDigest = digest(source);
    config = {
      source,
      scope: { owner: "fixture" },
      ownerId: "fixture",
      environment: "isolated",
      namespaceId: "e".repeat(32),
      workerArtifactHash: digest(productCode),
      operatorPublicJwk: operator.public,
      externalPublicJwk: external.public,
      limits,
    };
    const cert = signed(
      "freeze-deployment",
      {
        namespaceId: config.namespaceId,
        workerArtifactHash: config.workerArtifactHash,
        namespaceName: "source-" + sourceDigest,
        bindingNames: { d1: "SYNC_DB", r2: "SYNC_ASSETS" },
      },
      external,
    );
    bindings = {
      FREEZE_CONFIG: JSON.stringify(config),
      FREEZE_DEPLOYMENT_CERTIFICATE: JSON.stringify(cert),
      STUDIO_RELEASE_ROUTE_ENABLED: "false",
    };
  }
  mf = new Miniflare(
    convertV4MiniflareOptions({
      host: "127.0.0.1",
      port: 0,
      inspectorPort: 0,
      resourcePersistencePath: out + "/" + stage,
      outboundService: () => {
        throw Error("no-external-network");
      },
      workers: [
        {
          name: "product",
          modules: true,
          script: productCode,
          compatibilityDate: "2026-09-01",
          bindings,
          d1Databases: { SYNC_DB: "source-" + name },
          r2Buckets: { SYNC_ASSETS: "r2-" + name },
          durableObjects: {
            FREEZE_COORDINATOR: {
              className: "ProductionFreezeCoordinator",
              scriptName: "control",
              useSQLite: true,
            },
          },
          serviceBindings: {
            OPERATOR_GATEWAY: {
              name: "control",
              entrypoint: "FreezeOperatorGateway",
            },
            PUBLIC_CONTROL: "control",
          },
        },
        {
          name: "control",
          modules: true,
          script: controlCode,
          compatibilityDate: "2026-10-31",
          bindings: {
            ...bindings,
            FREEZE_RECEIPT_PRIVATE_JWK: JSON.stringify(issuer.jwk),
          },
          durableObjects: {
            FREEZE_COORDINATOR: {
              className: "ProductionFreezeCoordinator",
              useSQLite: true,
            },
          },
        },
      ],
    }),
  );
  db = await mf.getD1Database("SYNC_DB", "product");
}
async function call(method, ...args) {
  const r = await mf.dispatchFetch("http://fixture.invalid/open/rpc", {
    method: "POST",
    body: JSON.stringify({ method, args }),
  });
  const b = await r.json();
  if (!b.ok) throw Error(b.error);
  return b.value;
}
const current = () => call("current", "a".repeat(64));
const rows = () =>
  db
    .prepare("SELECT count(*) n FROM synthetic_effects")
    .first()
    .then((x) => x.n);
try {
  await open("capacity", {
    maxInvocations: 15,
    maxEffects: 64,
    effectsPerInvocation: 4,
    maxActive: 2,
    warnPercent: 50,
  });
  await db.prepare("CREATE TABLE synthetic_effects(value TEXT)").run();
  await check(
    "separate Control default HTTP never exposes operator API",
    async () => {
      const r = await mf.dispatchFetch("http://fixture.invalid/open/public", {
        method: "POST",
        body: JSON.stringify({
          envelope: signed("freeze-current-read", { nonce: "a".repeat(64) }),
        }),
      });
      assert.equal(r.status, 404);
    },
  );
  await check(
    "named private service binding returns signed single-authority OPEN",
    async () => {
      const r = await mf.dispatchFetch("http://fixture.invalid/open/private", {
        method: "POST",
        body: JSON.stringify({
          envelope: signed("freeze-current-read", { nonce: "a".repeat(64) }),
        }),
      });
      assert.equal(r.status, 200);
      const v = await r.json();
      assert.equal(
        (
          await verifyFreezeState({
            result: v,
            publicJwk: issuer.public,
            issuerPin: digest(issuer.public),
            source,
            nonce: "a".repeat(64),
            minimumRevision: 0,
            expectedState: "OPEN",
            ownerId: "fixture",
            synthetic: true,
          })
        ).state,
        "OPEN",
      );
      await assert.rejects(
        verifyFreezeState({
          result: v,
          publicJwk: issuer.public,
          issuerPin: digest(issuer.public),
          source,
          nonce: "b".repeat(64),
          minimumRevision: 0,
          expectedState: "OPEN",
          ownerId: "fixture",
          synthetic: true,
        }),
      );
      for (const override of [
        { ownerId: "foreign" },
        { minimumRevision: 1 },
        { synthetic: false },
        { expectedState: "SEALED" },
      ]) {
        await assert.rejects(
          verifyFreezeState({
            result: v,
            publicJwk: issuer.public,
            issuerPin: digest(issuer.public),
            source,
            nonce: "a".repeat(64),
            minimumRevision: 0,
            expectedState: "OPEN",
            ownerId: "fixture",
            synthetic: true,
            ...override,
          }),
        );
      }
      assert.equal(v.receipt.payload.capacity.invocations, 0);
    },
  );
  await check(
    "new private service reader verifies signed native OPEN without control capability",
    async () => {
      const { privateCurrentReader } = await import(
        "./studio-operations/private-current.mjs"
      );
      const reader = privateCurrentReader({
        binding: {
          fetch: async (r) =>
            mf.dispatchFetch("http://fixture.invalid/open/private", {
              method: r.method,
              headers: r.headers,
              body: await r.text(),
            }),
        },
        signRequest: async (kind, data) => signed(kind, data),
        publicJwk: issuer.public,
        issuerPin: digest(issuer.public),
        source,
        ownerId: "fixture",
        minimumRevision: 0,
        synthetic: true,
      });
      const v = await reader.observe();
      assert.equal(v.receipt.state, "OPEN");
      assert.equal(v.freezeAuthorized, false);
      assert.equal(reader.control, undefined);
      await assert.rejects(reader.observe("CLOSED"));
    },
  );
  await check("private binding still rejects an unsigned request", async () =>
    assert.equal(
      (
        await mf.dispatchFetch("http://fixture.invalid/open/private", {
          method: "POST",
          body: "{}",
        })
      ).status,
      409,
    ),
  );
  await check(
    "invalid timeout configuration is typed503 before admission",
    async () => {
      const r = await mf.dispatchFetch(
        "http://fixture.invalid/open/config-invalid",
      );
      assert.equal(r.status, 503);
      assert.equal((await r.json()).outcome, "NOT_STARTED");
      assert.equal((await current()).receipt.payload.capacity.invocations, 0);
    },
  );
  await check(
    "native no-write handler failure completes without poisoning freeze",
    async () => {
      assert.equal(
        (await mf.dispatchFetch("http://fixture.invalid/open/do/throw")).status,
        503,
      );
      assert.equal(
        (await current()).receipt.payload.capacity.reservedEffects,
        0,
      );
      assert.equal(await rows(), 0);
    },
  );
  await check(
    "native SELECT then business failure retains safe completion",
    async () => {
      const effectsBefore = (await current()).receipt.payload.capacity.effects;
      assert.equal(
        (await mf.dispatchFetch("http://fixture.invalid/open/do/select-throw"))
          .status,
        503,
      );
      assert.equal(
        (await current()).receipt.payload.capacity.effects,
        effectsBefore,
      );
      assert.equal(
        (await current()).receipt.payload.capacity.reservedEffects,
        0,
      );
    },
  );
  await check(
    "native no-write waitUntil rejection completes without mutation",
    async () => {
      assert.equal(
        (
          await mf.dispatchFetch(
            "http://fixture.invalid/open/do/background-throw",
          )
        ).status,
        200,
      );
      assert.equal(
        (await current()).receipt.payload.capacity.reservedEffects,
        0,
      );
    },
  );
  await check(
    "native OPEN write succeeds with reserved effect budget",
    async () => {
      assert.equal(
        (await mf.dispatchFetch("http://fixture.invalid/open/do/write")).status,
        200,
      );
      assert.equal(await rows(), 1);
    },
  );
  const before = (await current()).receipt.payload.capacity;
  await mf.dispose();
  const py =
    "import pathlib,sqlite3;ps=list(pathlib.Path(" +
    JSON.stringify(out + "/" + stage) +
    ").glob('**/*.sqlite'));found=[]\nfor p in ps:\n c=sqlite3.connect(str(p));names={r[0] for r in c.execute('SELECT name FROM sqlite_master WHERE type=\"table\"')};\n if 'capacity' in names:\n  found.append(str(p));c.execute('DROP TABLE capacity');c.execute('DROP TABLE reservations');c.execute('DROP TABLE invocation_outcomes');c.commit()\n c.close()\nassert len(found)==1";
  assert.equal(spawnSync("/usr/bin/python3", ["-c", py]).status, 0);
  await open(stage);
  await check(
    "PR79-layout reopen reconstructs counters from retained native ledger",
    async () => {
      const c = (await current()).receipt.payload.capacity;
      assert.equal(c.invocations, before.invocations);
      assert.equal(c.effects, before.effects);
      assert.equal(c.reservedEffects, 0);
    },
  );
  const ids = [randomUUID(), randomUUID()];
  for (const id of ids) await call("admit", "http", id);
  await check(
    "active admission capacity rejects before a Source mutation",
    async () => {
      const n = await rows();
      assert.equal(
        (await mf.dispatchFetch("http://fixture.invalid/open/do/write")).status,
        503,
      );
      assert.equal(await rows(), n);
    },
  );
  await check(
    "reserved finish capacity remains available during admission pressure",
    async () => {
      for (const id of ids) await call("finish", id, true);
      assert.equal(
        (await current()).receipt.payload.capacity.reservedEffects,
        0,
      );
    },
  );
  while ((await current()).receipt.payload.capacity.invocations < 15) {
    const id = randomUUID();
    await call("admit", "http", id);
    await call("finish", id, true);
  }
  await check(
    "history capacity is bounded and signed warning is visible",
    async () => {
      const c = (await current()).receipt.payload.capacity;
      assert.equal(c.invocations, 15);
      assert.equal(c.warning, true);
      assert.equal(c.admissionCapacity, false);
      const n = await rows();
      assert.equal(
        (await mf.dispatchFetch("http://fixture.invalid/open/do/write")).status,
        503,
      );
      assert.equal(await rows(), n);
    },
  );
  await mf.dispose();
  await open("unknown", {
    maxInvocations: 100,
    maxEffects: 1000,
    effectsPerInvocation: 4,
    maxActive: 10,
    warnPercent: 70,
  });
  await db.prepare("CREATE TABLE synthetic_effects(value TEXT)").run();
  await check(
    "late native admission ACK never executes Source write",
    async () => {
      const r = await mf.dispatchFetch(
        "http://fixture.invalid/open/do/write?fault=admit",
      );
      assert.equal(r.status, 503);
      assert.equal(await rows(), 0);
    },
  );
  await check(
    "late effectBegin ACK cannot start native Source mutation",
    async () => {
      const r = await mf.dispatchFetch(
        "http://fixture.invalid/open/do/write?fault=effectBegin",
      );
      assert.equal(r.status, 503);
      assert.equal(await rows(), 0);
    },
  );
  await check(
    "lost native effectEnd ACK preserves legacy success while tracking remains UNKNOWN",
    async () => {
      const r = await mf.dispatchFetch(
        "http://fixture.invalid/open/do/write?fault=effectEnd",
      );
      assert.equal(r.status, 200);
      assert.equal(await rows(), 1);
    },
  );
  await check(
    "per-invocation effect overflow is rejected before the next native write",
    async () => {
      const n = await rows();
      const r = await mf.dispatchFetch(
        "http://fixture.invalid/open/do/over-effect-budget",
      );
      assert.equal(r.status, 503);
      assert.equal((await rows()) - n, 4);
    },
  );
  const c1 = await current();
  await mf.dispose();
  await open(stage);
  await check(
    "crash reopen preserves UNKNOWN/ACTIVE and capacity reservations",
    async () => {
      const c = (await current()).receipt.payload.capacity;
      assert.equal(c.invocations, c1.receipt.payload.capacity.invocations);
      assert.equal(c.effects, c1.receipt.payload.capacity.effects);
      assert.ok(c.reservedEffects > 0);
    },
  );
  const operationId = randomUUID(),
    windowId = digest(randomUUID());
  const close = await call(
    "control",
    signed("freeze-control", {
      ownerId: "fixture",
      action: "close",
      expectedRevision: 0,
      operationId,
      windowId,
    }),
  );
  await check("UNKNOWN native operations prevent signed cancel", async () => {
    await assert.rejects(
      call(
        "control",
        signed("freeze-control", {
          ownerId: "fixture",
          action: "cancel",
          expectedRevision: close.revision,
          operationId,
          windowId,
        }),
        signed(
          "freeze-cancel",
          {
            operationId,
            windowId,
            controlRevision: close.revision,
            backupStopped: true,
            exclusionReceiptHash: "b".repeat(64),
          },
          external,
        ),
      ),
      /cancel-unknown-or-inflight/,
    );
  });
  fs.writeFileSync(
    out + "/RESULT.json",
    JSON.stringify(
      {
        status: "PASS_NATIVE_OPEN_DELTA",
        tests: results,
        realCloudflareCalls: 0,
        productionMutations: 0,
        limits: [
          "multi-worker private service binding is local native workerd, not actual Cloudflare deployment",
          "capacity/keys/source/deployment claims are synthetic fixture values",
        ],
      },
      null,
      2,
    ) + "\n",
  );
  console.log("OPEN_NATIVE_PASS " + results.length);
} catch (e) {
  fs.writeFileSync(
    out + "/RESULT.json",
    JSON.stringify({ status: "FAIL", results, reason: e.message }, null, 2) +
      "\n",
  );
  console.error(e.stack);
  process.exitCode = 1;
} finally {
  await mf?.dispose();
}
