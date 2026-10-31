import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { randomUUID, generateKeyPairSync, sign, webcrypto } from "node:crypto";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  R = process.env.FREEZE_TEST_OUTPUT;
if (!R || !path.isAbsolute(R) || fs.existsSync(R))
  throw Error("fresh-test-output-required");
fs.mkdirSync(R, { mode: 0o700 });
const req = createRequire(ROOT + "/package.json"),
  { Miniflare, convertV4MiniflareOptions } = req("miniflare"),
  { build } = req("esbuild");
const { canonical, digest, authority } = await import(
    "../scripts/studio-operations/contracts.mjs"
  ),
  { verifiedCutlineProvider } = await import(
    "../scripts/studio-operations/verified-cutline.mjs"
  ),
  { verifyFreezeCurrent, freezeReaders } = await import(
    "../src/production-freeze-current.js"
  ),
  fixtures = await import("../test/studio-schema-fixture.mjs");
const sha = digest,
  keys = () => {
    const k = generateKeyPairSync("ed25519");
    return {
      private: k.privateKey,
      privateJwk: k.privateKey.export({ format: "jwk" }),
      public: k.publicKey.export({ format: "jwk" }),
      pem: k.publicKey.export({ format: "pem", type: "spki" }),
    };
  },
  operator = keys(),
  external = keys(),
  issuer = keys(),
  source = {
    d1: "synthetic-account/native0033",
    r2: "synthetic-account/default/native-bucket/created",
  },
  sourceDigest = sha(source),
  ownerId = "fixture-owner",
  scope = { owner: ownerId, dataClass: "synthetic-only" },
  environment = "isolated";
function envelope(kind, data, key = operator) {
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
}
const config = {
  source,
  scope,
  environment,
  ownerId,
  namespaceId: "e".repeat(32),
  workerArtifactHash: sha("isolated-code-pin"),
  operatorPublicJwk: operator.public,
  externalPublicJwk: external.public,
};
let cert = envelope(
  "freeze-deployment",
  {
    namespaceId: config.namespaceId,
    workerArtifactHash: config.workerArtifactHash,
    namespaceName: "source-" + sourceDigest,
    bindingNames: { d1: "SYNC_DB", r2: "SYNC_ASSETS" },
  },
  external,
);
const code = (
  await build({
    entryPoints: [ROOT + "/test/production-freeze-fixture.js"],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    write: false,
    external: ["cloudflare:workers"],
    logLevel: "silent",
  })
).outputFiles[0].text;
config.workerArtifactHash = sha(code);
cert = envelope(
  "freeze-deployment",
  {
    namespaceId: config.namespaceId,
    workerArtifactHash: config.workerArtifactHash,
    namespaceName: "source-" + sourceDigest,
    bindingNames: { d1: "SYNC_DB", r2: "SYNC_ASSETS" },
  },
  external,
);
const bindings = {
  FREEZE_CONFIG: JSON.stringify(config),
  FREEZE_RECEIPT_PRIVATE_JWK: JSON.stringify(issuer.privateJwk),
  FREEZE_DEPLOYMENT_CERTIFICATE: JSON.stringify(cert),
  SYNC_ACCOUNT_CREDENTIAL_PEPPER: fixtures.pepper,
  SYNC_ACCOUNT_RECOVERY_PEPPER: fixtures.pepper,
  SYNC_CREDENTIAL_PEPPER: fixtures.pepper,
  PRO_CREDENTIAL_PEPPER: fixtures.proPepper,
  STUDIO_RELEASE_ROUTE_ENABLED: "false",
  SYNC_ASSET_CLEANUP_ENABLED: "true",
  ALLOWED_ORIGINS: "https://studio.fixture.invalid",
  ACCOUNT_ALLOWED_ORIGINS: "https://studio.fixture.invalid",
  SYNC_ALLOWED_APP_IDS: "port,chord,pitch,fretboard,rhythm",
};
let mf, db, bucket;
const persist = R + "/native";
const results = [];
async function open() {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: code,
      compatibilityDate: "2026-09-01",
      host: "127.0.0.1",
      port: 0,
      inspectorPort: 0,
      bindings,
      durableObjects: {
        FREEZE_COORDINATOR: {
          className: "ProductionFreezeCoordinator",
          useSQLite: true,
        },
      },
      d1Databases: { SYNC_DB: "native-d1" },
      r2Buckets: { SYNC_ASSETS: "native-r2" },
      resourcePersistencePath: persist,
      outboundService: () => {
        throw Error("external-network-forbidden");
      },
    }),
  );
  db = await mf.getD1Database("SYNC_DB");
  bucket = await mf.getR2Bucket("SYNC_ASSETS");
}
async function check(name, f) {
  await f();
  results.push({ name, status: "PASS" });
  console.log("PASS " + name);
}
async function call(method, ...args) {
  const r = await mf.dispatchFetch("http://fixture.invalid/fixture/rpc", {
    method: "POST",
    body: JSON.stringify({ method, args }),
  });
  const x = await r.json();
  if (!x.ok) throw Error(x.error);
  return x.value;
}
const control = (action, revision, extra = {}) =>
  envelope("freeze-control", {
    ownerId,
    action,
    expectedRevision: revision,
    operationId: op,
    windowId,
    ...extra,
  });
let op = randomUUID(),
  windowId = sha(randomUUID()),
  rev = 0,
  sealResult;
const externalProof = (revision) =>
  envelope(
    "freeze-external",
    {
      environment,
      namespaceId: config.namespaceId,
      workerArtifactHash: config.workerArtifactHash,
      controlRevision: revision,
      operationId: op,
      windowId,
      legacyResolved: true,
      partialResolved: true,
      externalStopped: true,
      manualStopped: true,
      allEntrypointsInstrumented: true,
      legacyEvidenceHash: sha("fixture legacy observed"),
      partialEvidenceHash: sha("fixture partial observation"),
      externalEvidenceHash: sha("fixture external stop"),
      manualEvidenceHash: sha("fixture manual stop"),
      deploymentEvidenceHash: sha("fixture fixed binding attestation"),
      lanes: Object.fromEntries(
        ["external-d1", "external-r2", "manual"].map((k) => [
          k,
          {
            startedOperationIds: [],
            completedOperationIds: [],
            d1: "NONE",
            r2: "NONE",
            receiptHash: sha("fixture " + k),
          },
        ]),
      ),
    },
    external,
  );
try {
  await open();
  for (const x of fixtures.base.filter((x) => x[0] === "table"))
    await db.prepare(x[2]).run();
  for (const x of fixtures.base.filter((x) => x[0] !== "table"))
    await db.prepare(x[2]).run();
  for (const [id, name] of fixtures.journal)
    await db
      .prepare("INSERT INTO d1_migrations(id,name)VALUES(?,?)")
      .bind(id, name)
      .run();
  await db.prepare("CREATE TABLE synthetic_effects(value TEXT)").run();
  await mf.dispose();
  const py =
    "import pathlib,sqlite3;ps=[p for p in(pathlib.Path(" +
    JSON.stringify(persist) +
    ")/'d1/miniflare-D1DatabaseObject').glob('*.sqlite')if p.name!='metadata.sqlite'];assert len(ps)==1;c=sqlite3.connect(str(ps[0]));c.execute('CREATE TABLE _cf_KV (\\n        key TEXT PRIMARY KEY,\\n        value BLOB\\n      ) WITHOUT ROWID');c.commit();c.close()";
  assert.equal(spawnSync("/usr/bin/python3", ["-c", py]).status, 0);
  await open();
  await db.prepare("DROP TABLE synthetic_effects").run();
  await fixtures.seedRuntime(db);
  const A = await fixtures.account(db),
    B = await fixtures.account(db),
    P = await fixtures.pro(db),
    bBefore = await db
      .prepare(
        "SELECT id,generation,recovery_version FROM sync_accounts WHERE id=?",
      )
      .bind(B.id)
      .first();
  await check("fixed v138 Studio OFF 423", async () => {
    assert.equal(
      (await mf.dispatchFetch("https://fixture.invalid/v2/studio/document"))
        .status,
      423,
    );
  });
  await check(
    "Account B summary passes native HTTP including GET activity write",
    async () => {
      const h = fixtures.headers(B, P);
      h.set("Origin", "https://studio.fixture.invalid");
      const r = await mf.dispatchFetch(
        "https://fixture.invalid/v2/accounts/summary",
        { headers: h },
      );
      assert.equal(r.status, 200, await r.text());
    },
  );
  await check(
    "native Pro status and legacy health preserve HTTP paths",
    async () => {
      assert.equal(
        (await mf.dispatchFetch("https://fixture.invalid/health")).status,
        200,
      );
      assert.equal(
        (await mf.dispatchFetch("https://fixture.invalid/fixture/old")).status,
        200,
      );
      const r = await mf.dispatchFetch(
        "https://fixture.invalid/v2/pro-auth/session",
        {
          headers: {
            Authorization: "Bearer " + P.token,
            Origin: "https://studio.fixture.invalid",
          },
        },
      );
      assert.equal(r.status, 200, await r.text());
    },
  );
  await check("different coordinator name rejected", async () =>
    assert.equal(
      (await mf.dispatchFetch("https://fixture.invalid/fixture/forged-name"))
        .status,
      409,
    ),
  );
  await check(
    "Account A establishes recent activity before Scheduled",
    async () => {
      const h = fixtures.headers(A, P);
      h.set("Origin", "https://studio.fixture.invalid");
      const r = await mf.dispatchFetch(
        "https://fixture.invalid/v2/accounts/summary",
        { headers: h },
      );
      assert.equal(r.status, 200, await r.text());
    },
  );
  await check("native Scheduled delegates while OPEN", async () => {
    assert.equal(
      (await mf.dispatchFetch("https://fixture.invalid/fixture/scheduled"))
        .status,
      200,
    );
  });
  const { createIdentityMaterial } = await import("../src/crypto.js"),
    { hashRecord } = await import("../src/records.js");
  for (const app of ["port", "chord", "pitch", "fretboard", "rhythm"])
    await check(
      "normal native " + app + " save through freeze wrapper",
      async () => {
        const a = await createIdentityMaterial(fixtures.pepper),
          now = Date.now();
        await db
          .prepare(
            "INSERT INTO sync_users(id,state,recovery_version,recovery_verifier,created_at,updated_at)VALUES(?,'active',1,?,?,?)",
          )
          .bind(a.userId, sha(a.userId), now, now)
          .run();
        await db
          .prepare(
            "INSERT INTO sync_devices(id,user_id,app_id,credential_verifier,created_at,last_seen_at,paired_at)VALUES(?,?,?,?,?,?,?)",
          )
          .bind(a.deviceId, a.userId, app, a.credentialVerifier, now, now, now)
          .run();
        await db
          .prepare(
            "INSERT INTO sync_datasets(user_id,app_id,state,schema_version,updated_at)VALUES(?,?,'ready',1,?)",
          )
          .bind(a.userId, app, now)
          .run();
        const rec = {
          operationId: randomUUID(),
          recordType: "settings",
          recordId: ["pitch", "rhythm", "fretboard"].includes(app)
            ? "settings"
            : "global",
          schemaVersion: 1,
          baseRevision: 0,
          payload:
            app === "port"
              ? { id: "global", value: { language: "ja" } }
              : app === "chord"
                ? {}
                : { id: "settings", values: { theme: "dark" } },
          deleted: false,
        };
        rec.payloadHash = await hashRecord(rec, webcrypto, app);
        const h = fixtures.headers(a, P);
        h.set("Origin", "https://studio.fixture.invalid");
        h.set("Content-Type", "application/json");
        const r = await mf.dispatchFetch(
          "https://fixture.invalid/v1/sync/push",
          {
            method: "POST",
            headers: h,
            body: JSON.stringify({
              appId: app,
              mode: "sync",
              operations: [rec],
              capabilities: ["settings_theme_v1"],
            }),
          },
        );
        assert.equal(r.status, 200, await r.text());
      },
    );
  await check("Account A normal v138 summary remains authorized", async () => {
    const h = fixtures.headers(A, P);
    h.set("Origin", "https://studio.fixture.invalid");
    const r = await mf.dispatchFetch(
      "https://fixture.invalid/v2/accounts/summary",
      { headers: h },
    );
    assert.equal(r.status, 200, await r.text());
  });
  const h = fixtures.headers(A, P);
  h.set("Origin", "https://studio.fixture.invalid");
  const delayed = randomUUID();
  const pending = mf.dispatchFetch(
    "https://fixture.invalid/fixture/delayed?id=" + delayed,
    { headers: h },
  );
  let ready = false;
  const until = Date.now() + 10000;
  while (Date.now() < until) {
    if (
      (
        await (
          await mf.dispatchFetch(
            "https://fixture.invalid/fixture/ready?id=" + delayed,
          )
        ).json()
      ).ready
    ) {
      ready = true;
      break;
    }
  }
  assert(ready, "explicit delayed admission acknowledgement");
  const scheduledId = randomUUID(),
    effectId = randomUUID();
  await call("admit", "scheduled", scheduledId);
  await call("effectBegin", scheduledId, effectId, "R2");
  await bucket.put("synthetic-scheduled", new Uint8Array([1, 2, 3]));
  await check("operator signature/foreign Source rejected", async () => {
    await assert.rejects(() =>
      call(
        "control",
        envelope("freeze-control", {
          action: "close",
          ownerId,
          expectedRevision: 0,
          operationId: op,
          windowId,
          sourceDigest: sha("foreign"),
        }),
      ),
    );
  });
  await check("forged operator control signature rejected", async () => {
    await assert.rejects(() =>
      call(
        "control",
        envelope(
          "freeze-control",
          {
            action: "close",
            ownerId,
            expectedRevision: rev,
            operationId: op,
            windowId,
          },
          external,
        ),
      ),
    );
  });
  const close = control("close", rev);
  await check("close linearizes admission before drain", async () => {
    const c = await call("control", close);
    rev = c.revision;
    assert.equal(c.state, "CLOSING");
  });
  await check(
    "ACK-lost close reconciles same command without another change",
    async () => assert.equal((await call("control", close)).revision, rev),
  );
  await check(
    "HTTP Account/Pro/Port admission blocked while closing",
    async () => {
      for (const p of [
        "/v2/accounts/summary",
        "/v2/pro-auth/verify",
        "/v1/sync/push",
      ])
        assert.equal(
          (
            await mf.dispatchFetch("https://fixture.invalid" + p, {
              method: "POST",
              body: "{}",
            })
          ).status,
          423,
        );
    },
  );
  await check("Scheduled admission blocked while closing", async () =>
    assert.equal(
      (await call("admit", "scheduled", randomUUID())).allowed,
      false,
    ),
  );
  await check("empty registry/legacy proof missing cannot seal", async () => {
    await assert.rejects(() => call("control", control("seal", rev), null));
  });
  await check("inflight HTTP and Scheduled reject drain", async () => {
    await assert.rejects(
      () => call("control", control("seal", rev), externalProof(rev)),
      /drain-incomplete/,
    );
  });
  await mf.dispatchFetch(
    "https://fixture.invalid/fixture/release?id=" + delayed,
  );
  const delayedReply = await pending;
  assert.equal(delayedReply.status, 200, await delayedReply.text());
  await call("effectEnd", scheduledId, effectId, true);
  await call("finish", scheduledId, true);
  await check("external lane missing rejects seal", async () => {
    const e = externalProof(rev);
    delete e.payload.lanes["external-r2"];
    const bad = envelope("freeze-external", e.payload, external);
    await assert.rejects(() => call("control", control("seal", rev), bad));
  });
  await check(
    "external numeric operation IDs are rejected before seal",
    async () => {
      const e = externalProof(rev);
      e.payload.lanes.manual.startedOperationIds = [1];
      e.payload.lanes.manual.completedOperationIds = [1];
      await assert.rejects(() =>
        call(
          "control",
          control("seal", rev),
          envelope("freeze-external", e.payload, external),
        ),
      );
    },
  );
  await check("complete native effect/closure chain seals", async () => {
    sealResult = await call(
      "control",
      control("seal", rev),
      externalProof(rev),
    );
    assert.equal(sealResult.state, "SEALED");
    rev = sealResult.revision;
  });
  const coordinator = { current: (n) => call("current", n) },
    readers = freezeReaders({
      coordinator,
      publicJwk: issuer.public,
      issuerPin: sha(issuer.public),
      source,
      minimumRevision: rev,
    });
  let window = await readers.readWindow();
  const { authenticatedFreezeReaders } = await import(
    "../scripts/studio-operations/freeze-client.mjs"
  );
  const httpReaders = authenticatedFreezeReaders({
    endpoint: "https://private.fixture.invalid/",
    signRequest: async (kind, p) => envelope(kind, p),
    publicJwk: issuer.public,
    issuerPin: sha(issuer.public),
    source,
    minimumRevision: rev,
    fetchImpl: (u, o) =>
      mf.dispatchFetch(
        "https://fixture.invalid/fixture/gateway" + new URL(u).pathname,
        o,
      ),
  });
  await check(
    "signed private HTTP CURRENT transport reaches native DO",
    async () =>
      assert.equal((await httpReaders.readWindow()).payload.sequence, rev),
  );
  await check("unauthenticated private gateway rejected", async () =>
    assert.equal(
      (
        await mf.dispatchFetch(
          "https://fixture.invalid/fixture/gateway/current",
          { method: "POST", body: "{}" },
        )
      ).status,
      409,
    ),
  );
  const first = await call("current", sha("fresh-challenge"));
  await check(
    "CURRENT signature/nonce/source/minimum revision reject forgery",
    async () => {
      for (const extra of [
        { nonce: sha("wrong") },
        { source: { d1: "foreign", r2: "foreign" } },
        { minimumRevision: rev + 1 },
        { issuerPin: sha("wrong-pin") },
      ])
        await assert.rejects(() =>
          verifyFreezeCurrent({
            result: first,
            publicJwk: issuer.public,
            issuerPin: sha(issuer.public),
            source,
            nonce: sha("fresh-challenge"),
            minimumRevision: rev,
            ...extra,
          }),
        );
    },
  );
  const auth = authority({
      publicKey: issuer.pem,
      rootHash: sha(issuer.pem),
      synthetic: true,
    }),
    b = first.bundle,
    cutline = verifiedCutlineProvider({
      authority: auth,
      scope: b.scope,
      operationId: op,
      inventory: b.inventory,
      source,
      expectedWindowHash: b.windowHash,
      ...readers,
    });
  await check(
    "native issuer bundle passes existing PR77 strict verifier",
    async () => assert.equal((await cutline.assertCutline()).sequence, rev),
  );
  await check(
    "process reopen retains SEALED ledger and current pin",
    async () => {
      await mf.dispose();
      await open();
      assert.equal(
        (await call("current", sha(randomUUID()))).bundle.windowHash,
        b.windowHash,
      );
    },
  );
  const { backup } = await import(
      "../scripts/studio-operations/core/adapter.mjs"
    ),
    { createBindingSource } = await import(
      "../scripts/studio-operations/core/binding-provider.mjs"
    );
  const key = crypto.getRandomValues(new Uint8Array(32));
  let sealed;
  await check(
    "verified D1/R2 cutline permits bounded encrypted Backup",
    async () => {
      const sourceProvider = createBindingSource({
        db,
        bucket,
        scope: source,
        assertCutline: () => cutline.assertCutline(),
        semanticValidator: async () => {
          assert.equal(
            (await db.prepare("PRAGMA foreign_key_check").all()).results.length,
            0,
          );
        },
      });
      sealed = await backup({
        directory: R + "/encrypted-synthetic",
        scope: { ...source, cutline: windowId },
        keyHandle: async () => Buffer.from(key),
        source: sourceProvider,
      });
    },
  );
  await check("reopen without sealed Archive proof rejected", async () => {
    await assert.rejects(() => call("control", control("reopen", rev), null));
  });
  const reopenProof = envelope(
    "freeze-reopen",
    {
      controlRevision: rev,
      operationId: op,
      windowId,
      windowHash: b.windowHash,
      manifestHash: sealed.manifestHash,
      encryptedCopyHash: sha("synthetic-local-copy-receipt"),
      archiveVerified: true,
    },
    external,
  );
  await check("explicit verified reopen permits normal B writes", async () => {
    const x = await call("control", control("reopen", rev), reopenProof);
    rev = x.revision;
    const r = await mf.dispatchFetch(
      "https://fixture.invalid/v2/accounts/summary",
      {
        headers: Object.assign(Object.fromEntries(fixtures.headers(B, P)), {
          Origin: "https://studio.fixture.invalid",
        }),
      },
    );
    assert.equal(r.status, 200, await r.text());
    assert.deepEqual(
      await db
        .prepare(
          "SELECT id,generation,recovery_version FROM sync_accounts WHERE id=?",
        )
        .bind(B.id)
        .first(),
      bBefore,
    );
  });
  await check("old pinned CURRENT cannot pass after reopen", async () => {
    await assert.rejects(() => readers.readWindow());
  });
  await check(
    "successful OPEN traffic does not stop at lifetime count 2048",
    async () => {
      for (let n = 0; n < 2050; n++) {
        const id = randomUUID();
        assert.equal((await call("admit", "http", id)).allowed, true);
        await call("finish", id, true);
      }
    },
  );
  op = randomUUID();
  windowId = sha(randomUUID());
  const cancelled = await call("control", control("close", rev));
  rev = cancelled.revision;
  await check(
    "signed cancel after complete drain resumes without inventing Backup",
    async () => {
      const proof = envelope(
        "freeze-cancel",
        {
          operationId: op,
          windowId,
          controlRevision: rev,
          backupStopped: true,
          exclusionReceiptHash: sha("fixture read consumers stopped"),
        },
        external,
      );
      const r = await call("control", control("cancel", rev), proof);
      assert.equal(r.state, "OPEN");
      rev = r.revision;
    },
  );
  await db.prepare("CREATE TABLE synthetic_effects(value TEXT)").run();
  await check(
    "waitUntil background D1 effect is tracked to completion",
    async () => {
      assert.equal(
        (
          await mf.dispatchFetch(
            "https://fixture.invalid/fixture/effect/background",
          )
        ).status,
        200,
      );
    },
  );
  await bucket.put("synthetic-victim", new Uint8Array([8]));
  await check(
    "R2 deletion followed by D1 failure stays UNKNOWN despite swallowed error",
    async () => {
      assert.equal(
        (
          await mf.dispatchFetch(
            "https://fixture.invalid/fixture/effect/partial",
          )
        ).status,
        200,
      );
      assert.equal(await bucket.head("synthetic-victim"), null);
    },
  );
  await bucket.put("synthetic-scheduled-victim", new Uint8Array([9]));
  await check(
    "Scheduled waitUntil partial effects persist UNKNOWN",
    async () => {
      assert.equal(
        (
          await mf.dispatchFetch(
            "https://fixture.invalid/fixture/scheduled-partial",
          )
        ).status,
        200,
      );
    },
  );
  const crashId = randomUUID();
  await call("admit", "http", crashId);
  await call("effectBegin", crashId, randomUUID(), "D1");
  await mf.dispose();
  await open();
  op = randomUUID();
  windowId = sha(randomUUID());
  const c = await call("control", control("close", rev));
  rev = c.revision;
  await check("partial/UNKNOWN cannot become a sealed freeze", async () => {
    await assert.rejects(
      () => call("control", control("seal", rev), externalProof(rev)),
      /drain-incomplete/,
    );
  });
  await check("UNKNOWN refuses signed cancel too", async () => {
    const proof = envelope(
      "freeze-cancel",
      {
        operationId: op,
        windowId,
        controlRevision: rev,
        backupStopped: true,
        exclusionReceiptHash: sha("fixture"),
      },
      external,
    );
    await assert.rejects(() => call("control", control("cancel", rev), proof));
  });
  await check("UNKNOWN cannot be cleared by automatic reopen", async () => {
    await assert.rejects(() =>
      call("control", control("reopen", rev), reopenProof),
    );
  });
  key.fill(0);
  fs.writeFileSync(
    R + "/RESULT.json",
    JSON.stringify(
      {
        status: "PASS_NATIVE_ISOLATED_SCOPE",
        tests: results,
        productionCalls: 0,
        realCloudflareCalls: 0,
        originalV137SourceUnchanged: true,
        backupPages: sealed.pages,
        limits: [
          "External and predeployment legacy proofs are synthetic fixture attestations, not Production drain proof",
          "CURRENT is authenticated live DO view, not immunity to Account admin/PITR compromise",
          "Deployment binding attestation must verify physical resource IDs before any Production adoption",
        ],
      },
      null,
      2,
    ),
  );
  console.log("NATIVE_SCOPE_PASS " + results.length);
} catch (e) {
  fs.writeFileSync(
    R + "/RESULT.json",
    JSON.stringify({ status: "FAIL", results, reason: e.message }, null, 2),
  );
  console.error(e.stack);
  process.exitCode = 1;
} finally {
  await mf?.dispose();
}
