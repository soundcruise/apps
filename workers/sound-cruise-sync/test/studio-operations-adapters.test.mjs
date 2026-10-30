import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import {
  randomUUID,
  randomBytes,
  generateKeyPairSync,
  sign,
} from "node:crypto";
import { spawn } from "node:child_process";
import {
  authority,
  canonical,
  digest,
} from "../scripts/studio-operations/contracts.mjs";
import {
  preStudioValidator,
  inspectPreStudio,
} from "../scripts/studio-operations/prestudio-validator.mjs";
import { openHost } from "../scripts/studio-operations/host.mjs";
import { connectResources } from "../scripts/studio-operations/transport.mjs";
import {
  cutlineProvider,
  scheduledObserver,
} from "../scripts/studio-operations/cutline.mjs";
import {
  runBackup,
  runRestore,
  executeDDL,
  reconcileDDL,
} from "../scripts/studio-operations/operations.mjs";
import { fixedBatch } from "../scripts/studio-operations/ddl-plan.mjs";
import { verify } from "../scripts/studio-operations/core/adapter.mjs";
import { gateway } from "./studio-operations-fixture.mjs";
import {
  boot,
  seedRuntime,
  account,
  pro,
  headers,
  pepper,
  src,
  journal,
} from "./studio-schema-fixture.mjs";
if (!process.env.STUDIO_OPS_OUTPUT || !process.env.STUDIO_TEST_RUNTIME_102) {
  const { test } = await import("node:test");
  test(
    "operational native acceptance",
    { skip: "explicit isolated output/runtime required" },
    () => {},
  );
} else {
  const R = path.resolve(process.env.STUDIO_OPS_OUTPUT);
  fs.mkdirSync(R, { recursive: false });
  const result = {
    scope:
      "synthetic native D1/R2 through actual REST/S3 clients, external witness/key fixtures; no Production credentials or calls",
    tests: [],
  };
  const check = async (n, f) => {
    await f();
    result.tests.push({ name: n, status: "PASS" });
    console.log("PASS " + n);
  };
  const op = randomUUID(),
    scope = {
      owner: "fixture-operator",
      epoch: "fixture-epoch",
      operationId: op,
    };
  const { publicKey, privateKey } = generateKeyPairSync("ed25519"),
    pub = publicKey.export({ format: "pem", type: "spki" }),
    rootHash = digest(pub),
    A = authority({ publicKey: pub, rootHash, synthetic: true });
  function envelope(kind, extra = {}) {
    const payload = {
      kind,
      scope: digest(scope),
      synthetic: true,
      id: randomUUID(),
      operationId: op,
      issued: Date.now() - 1000,
      expires: Date.now() + 3600000,
      ...extra,
    };
    return {
      payload,
      signature: sign(
        null,
        Buffer.from(canonical(payload)),
        privateKey,
      ).toString("base64"),
    };
  }
  const key = randomBytes(32),
    hostRoot = R + "/host";
  fs.mkdirSync(hostRoot, { mode: 0o700 });
  for (const n of ["claims", "journals"])
    fs.mkdirSync(hostRoot + "/" + n, { mode: 0o700 });
  const anchors = {};
  for (const n of ["root", "claims", "journals"]) {
    const s = fs.lstatSync(n === "root" ? hostRoot : hostRoot + "/" + n);
    anchors[n] = [s.dev, s.ino, s.mode];
  }
  const hostEnvelope = envelope("host", {
    root: hostRoot,
    anchors,
    volumeUUID: "fixture-volume",
    keyId: "fixture-key",
    custodian: "fixture-custodian",
    independentRecoveryPin: digest("off-host-fixture-copy"),
    minFreeBytes: 1,
    maxStagingBytes: 8 * 1024 * 1024,
  });
  const host = await openHost({
    authority: A,
    envelope: hostEnvelope,
    scope,
    root: hostRoot,
    keyHandle: async () => Buffer.from(key),
    observeFixture: async () => ({
      volumeUUID: "fixture-volume",
      encrypted: true,
    }),
  });
  const native = [],
    caps = [];
  let net,
    source,
    target,
    sourceCap,
    targetCap,
    archive,
    validator,
    normalB,
    P,
    ddlEnvelope;
  const sourceSpec = {
      account: "a".repeat(32),
      d1: randomUUID(),
      r2: {
        name: "fixture-source",
        created: "2026-01-01T00:00:00Z",
        jurisdiction: "",
      },
    },
    targetSpec = {
      account: "a".repeat(32),
      d1: randomUUID(),
      r2: {
        name: "fixture-target",
        created: "2026-01-02T00:00:00Z",
        jurisdiction: "",
      },
    };
  const inventory = [
    "http",
    "workers-dev",
    "version-override",
    "service",
    "scheduled",
    "external-d1",
    "external-r2",
    "manual",
  ].map((kind) => ({ id: kind, kind }));
  let frozen = envelope("freeze", {
    inventoryDigest: digest(inventory),
    coverage: "complete",
    registryCoverage: "from-admission",
    legacyInflight: "independently-resolved",
    cutlineId: "fixture-cutline",
    sequence: 1,
    writers: inventory.map((x) => ({
      id: x.id,
      admission: "STOPPED",
      inflight: 0,
      effectReceiptHash: digest(x),
      partial: false,
      unknown: false,
    })),
  });
  let cutline = cutlineProvider({
    authority: A,
    scope,
    inventory,
    operationId: op,
    readWitness: async () => frozen,
  });
  function resource(role, spec, extra = {}) {
    return envelope("resources", {
      role,
      resources: spec,
      source: sourceSpec,
      productionDenylist: [sourceSpec],
      ...extra,
    });
  }
  async function connect(role, spec, extra = {}) {
    const e = resource(role, spec, extra),
      r = await connectResources({
        authority: A,
        envelope: e,
        scope,
        role,
        tokenHandle: async () => "fixture-read",
        s3Credentials: {
          accessKeyId: "fixture-access",
          secretAccessKey: "fixture-secret",
        },
        fixture: net,
      });
    caps.push(r);
    return { r, e };
  }
  async function child(reconcile = false) {
    const output = R + "/child-" + (reconcile ? "reopen" : "restore") + ".json",
      data = {
        mode: "synthetic-fixture",
        publicKey: pub,
        rootHash,
        host: hostEnvelope,
        scope,
        root: hostRoot,
        key: key.toString("base64"),
        resources: targetCap.e,
        fixture: { api: net.api, s3: net.s3 },
        archive,
        journalHash: digest(canonical(journal)),
        op,
        result: output,
        reconcile,
      };
    const code = await new Promise((resolve, reject) => {
      const p = spawn(
        process.execPath,
        [path.resolve("scripts/studio-operations/restore-child.mjs")],
        {
          env: { ...process.env, STUDIO_OPS_SYNTHETIC_CHILD: "1" },
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
      let err = "";
      p.stderr.on("data", (x) => (err += x));
      p.stdout.resume();
      p.on("error", reject);
      p.on("exit", (n) => resolve({ n, err }));
      p.stdin.end(JSON.stringify(data));
    });
    return { ...code, result: JSON.parse(fs.readFileSync(output)) };
  }
  async function saveLegacy(app) {
    const { createIdentityMaterial } = await import(src + "/crypto.js"),
      { hashRecord } = await import(src + "/records.js"),
      a = await createIdentityMaterial(pepper),
      now = Date.now();
    await source.db
      .prepare(
        "INSERT INTO sync_users(id,state,recovery_version,recovery_verifier,created_at,updated_at) VALUES(?,'active',1,?,?,?)",
      )
      .bind(a.userId, digest(a.userId), now, now)
      .run();
    await source.db
      .prepare(
        "INSERT INTO sync_devices(id,user_id,app_id,credential_verifier,created_at,last_seen_at,paired_at) VALUES(?,?,?,?,?,?,?)",
      )
      .bind(a.deviceId, a.userId, app, a.credentialVerifier, now, now, now)
      .run();
    await source.db
      .prepare(
        "INSERT INTO sync_datasets(user_id,app_id,state,schema_version,updated_at) VALUES(?,?,'ready',1,?)",
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
    rec.payloadHash = await hashRecord(rec, crypto, app);
    const h = headers(a, P);
    h.set("Origin", "https://studio.fixture.invalid");
    h.set("Content-Type", "application/json");
    const r = await source.mf.dispatchFetch(
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
  }
  try {
    source = await boot("production102", R + "/source");
    native.push(source);
    target = await boot("production102", R + "/target", { initialize: false });
    native.push(target);
    await seedRuntime(source.db);
    for (let i = 0; i < 35; i++)
      await source.db
        .prepare(
          "INSERT INTO sync_users(id,state,recovery_version,recovery_verifier,created_at,updated_at) VALUES(?,'active',1,?,?,?)",
        )
        .bind(randomUUID(), digest("fixture-" + i), Date.now(), Date.now())
        .run();
    normalB = await account(source.db);
    P = await pro(source.db);
    for (const app of ["port", "chord", "pitch", "fretboard", "rhythm"])
      await saveLegacy(app);
    await source.bucket.put("small", "preserve", {
      httpMetadata: { contentType: "text/plain" },
      customMetadata: { fixture: "yes" },
    });
    await source.bucket.put("large", Buffer.alloc(6 * 1024 * 1024, 97), {
      httpMetadata: { contentType: "application/octet-stream" },
      customMetadata: { fixture: "yes" },
    });
    for (let i = 0; i < 34; i++)
      await source.bucket.put("page-" + String(i).padStart(2, "0"), "x", {
        httpMetadata: { contentType: "text/plain" },
      });
    net = await gateway(
      new Map([
        [
          sourceSpec.r2.name,
          {
            id: sourceSpec.d1,
            created: sourceSpec.r2.created,
            db: source.db,
            bucket: source.bucket,
          },
        ],
        [
          targetSpec.r2.name,
          {
            id: targetSpec.d1,
            created: targetSpec.r2.created,
            db: target.db,
            bucket: target.bucket,
          },
        ],
      ]),
    );
    sourceCap = await connect("source", sourceSpec, {
      worker: {
        name: "fixture-worker",
        deployment: "fixture-deployment",
        version: "fixture-version",
      },
    });
    targetCap = await connect("restore", targetSpec);
    validator = preStudioValidator({
      bucket: sourceCap.r.bucket,
      expectedJournalHash: digest(canonical(journal)),
      hash: digest,
    });
    await check(
      "real REST/S3 clients identify native resources and strict prestudio0033",
      async () => {
        await validator(sourceCap.r.db);
        assert.equal(
          (await inspectPreStudio(sourceCap.r.db)).profile,
          "production102",
        );
        assert(net.state.requests > 0);
      },
    );
    await check(
      "Worker deployment/version/OFF metadata drift rejects before backup",
      async () => {
        net.state.workerDrift = true;
        await assert.rejects(() => sourceCap.r.verifyIdentity());
        net.state.workerDrift = false;
        net.state.workerFlag = true;
        await assert.rejects(() => sourceCap.r.verifyIdentity());
        net.state.workerFlag = false;
        await sourceCap.r.verifyIdentity();
      },
    );
    await check(
      "missing S3 credential and denied API permission fail before data I/O",
      async () => {
        await assert.rejects(
          () =>
            connectResources({
              authority: A,
              envelope: sourceCap.e,
              scope,
              role: "source",
              tokenHandle: async () => "bad",
              fixture: net,
            }),
          /credentials/,
        );
        await assert.rejects(
          () =>
            connectResources({
              authority: A,
              envelope: sourceCap.e,
              scope,
              role: "source",
              tokenHandle: async () => "bad",
              s3Credentials: {
                accessKeyId: "fixture",
                secretAccessKey: "fixture",
              },
              fixture: net,
            }),
          /http-403/,
        );
      },
    );
    await check(
      "source write and mutating PRAGMA rejected before HTTP",
      async () => {
        const n = net.state.requests;
        assert.throws(() =>
          sourceCap.r.db.prepare("SELECT 1; DELETE FROM sync_accounts"),
        );
        assert.throws(() =>
          sourceCap.r.db.prepare("PRAGMA writable_schema=ON"),
        );
        assert.equal(net.state.requests, n);
      },
    );
    await check(
      "wrong management physical ID and source-target aliases reject",
      async () => {
        net.state.wrongIdentity = true;
        await assert.rejects(() => connect("source", sourceSpec), /physical/);
        net.state.wrongIdentity = false;
        await assert.rejects(
          () => connect("restore", sourceSpec),
          /production-target|source-target/,
        );
        await assert.rejects(
          () => connect("restore", { ...targetSpec, r2: sourceSpec.r2 }),
          /production-target|source-target/,
        );
      },
    );
    await check(
      "untrusted signature, wrong owner, expiry and replay scope reject",
      async () => {
        const e = envelope("freeze", { ...frozen.payload, expires: 1 });
        await assert.rejects(() =>
          cutlineProvider({
            authority: A,
            scope,
            inventory,
            operationId: op,
            readWitness: async () => e,
          }).assertCutline(),
        );
        assert.throws(() => A.check(frozen, "freeze", { owner: "other" }));
        const wrong = structuredClone(frozen);
        wrong.payload.coverage = "complete-forged";
        assert.throws(() => A.check(wrong, "freeze", scope));
      },
    );
    await check(
      "incomplete inventory/inflight and UNKNOWN PARTIAL refuse cutline",
      async () => {
        for (const change of [
          { coverage: "known-only" },
          { legacyInflight: "unknown" },
          {
            writers: frozen.payload.writers.map((x, i) =>
              i === 0 ? { ...x, inflight: 1 } : x,
            ),
          },
          {
            writers: frozen.payload.writers.map((x, i) =>
              i === 0 ? { ...x, partial: true } : x,
            ),
          },
        ]) {
          const e = envelope("freeze", { ...frozen.payload, ...change });
          await assert.rejects(() =>
            cutlineProvider({
              authority: A,
              scope,
              inventory,
              operationId: op,
              readWitness: async () => e,
            }).assertCutline(),
          );
        }
      },
    );
    await check(
      "freeze witness sequence drift rejects without inferring delayed drain",
      async () => {
        await cutline.assertCutline();
        const original = frozen;
        frozen = envelope("freeze", { ...frozen.payload, sequence: 2 });
        await assert.rejects(() => cutline.assertCutline(), /cutline-changed/);
        frozen = original;
        await cutline.assertCutline();
      },
    );
    await check(
      "prestudio rejects unknown/shared schema, invalid generations and Studio partial",
      async () => {
        await source.db.prepare("CREATE TABLE unknown_object(id TEXT)").run();
        await assert.rejects(() => validator(sourceCap.r.db));
        await source.db.prepare("DROP TABLE unknown_object").run();
        await source.db
          .prepare("CREATE TABLE studio_document_partial(id TEXT)")
          .run();
        await assert.rejects(() => validator(sourceCap.r.db));
        await source.db.prepare("DROP TABLE studio_document_partial").run();
      },
    );
    let sealed;
    await check(
      "real legacy Scheduled delayed native R2 completion blocks cutline then drains",
      async () => {
        const h = headers(normalB, P);
        h.set("Origin", "https://studio.fixture.invalid");
        const rr = await source.mf.dispatchFetch(
          "https://fixture.invalid/v2/accounts/summary",
          { headers: h },
        );
        assert.equal(rr.status, 200);
        await rr.arrayBuffer();
        const assetId = randomUUID(),
          assetKey = "delayed-cleanup";
        await source.bucket.put(assetKey, "x");
        await source.db
          .prepare(
            "INSERT INTO sync_assets(asset_id,account_id,membership_id,sync_user_id,kind,state,content_hash,mime_type,byte_size,width,height,object_key,created_by_device_id,created_at,updated_at) VALUES(?,?,?,?,'gear_photo_final','prepared',?,'image/png',1,1,1,?,?,1,1)",
          )
          .bind(
            assetId,
            normalB.id,
            randomUUID(),
            randomUUID(),
            "a".repeat(64),
            assetKey,
            normalB.deviceId,
          )
          .run();
        const { default: legacy } = await import(
          src + "/studio-legacy-v137.mjs"
        );
        let release, signal;
        const started = new Promise((r) => (signal = r)),
          held = new Promise((r) => (release = r)),
          events = [];
        const obs = scheduledObserver({ emit: (e) => events.push(e) });
        const b = {
          get: source.bucket.get.bind(source.bucket),
          head: source.bucket.head.bind(source.bucket),
          list: source.bucket.list.bind(source.bucket),
          async delete(k) {
            signal();
            await held;
            await source.bucket.delete(k);
          },
        };
        const pending = obs.run("old-native", async () => {
          const jobs = [];
          legacy.scheduled(
            {},
            {
              SYNC_DB: obs.db(source.db),
              SYNC_ASSETS: obs.bucket(b),
              SYNC_ASSET_CLEANUP_ENABLED: "true",
            },
            { waitUntil: (p) => jobs.push(p) },
          );
          await Promise.all(jobs);
        });
        await started;
        const payload = {
          ...frozen.payload,
          writers: frozen.payload.writers.map((w) =>
            w.id === "scheduled" ? { ...w, inflight: 1 } : w,
          ),
        };
        let witness = envelope("freeze", payload);
        const c = cutlineProvider({
          authority: A,
          scope,
          inventory,
          operationId: op,
          readWitness: async () => witness,
        });
        await assert.rejects(() => c.assertCutline(), /drained/);
        assert(await source.bucket.get(assetKey));
        release();
        const end = await pending;
        assert.equal(end.status, "COMPLETED");
        assert.equal(await source.bucket.get(assetKey), null);
        assert.equal(
          (
            await source.db
              .prepare("SELECT state FROM sync_assets WHERE asset_id=?")
              .bind(assetId)
              .first()
          ).state,
          "deleted",
        );
        assert.equal(
          (
            await source.db
              .prepare("SELECT state FROM sync_accounts WHERE id=?")
              .bind(normalB.id)
              .first()
          ).state,
          "active",
        );
        witness = envelope("freeze", {
          ...payload,
          writers: frozen.payload.writers,
        });
        await c.assertCutline();
        cutline = c;
        frozen = witness;
      },
    );
    await check(
      "preDDL full encrypted backup streams native D1+R2 through actual HTTP clients",
      async () => {
        net.state.failR2Read = true;
        await assert.rejects(() =>
          runBackup({
            host,
            resources: sourceCap.r,
            cutline,
            validator,
            operationId: op,
          }),
        );
        const cp = JSON.parse(
          fs.readFileSync(hostRoot + "/backup-" + op + "/CHECKPOINT.json"),
        );
        assert.equal(cp.state, "OPEN");
        assert(cp.pages.length > 50);
        sealed = await runBackup({
          host,
          resources: sourceCap.r,
          cutline,
          validator,
          operationId: op,
          resume: true,
        });
        assert(sealed.pages > 100);
        const m = await verify({
          directory: sealed.directory,
          scope: sealed.scope,
          keyHandle: host.getKey,
          manifestHash: sealed.manifestHash,
        });
        assert(m.inventory.tables.length > 30);
        assert.equal(m.inventory.r2.count, 36);
      },
    );
    archive = envelope("archive", { receipt: sealed });
    await check(
      "second process Fresh native restore full schema journal/6MiB R2 readback",
      async () => {
        const x = await child();
        assert.equal(x.n, 0, x.err + JSON.stringify(x.result));
        assert.equal(x.result.status, "RESTORED");
        assert.equal(
          Buffer.from(await (await target.bucket.get("large")).arrayBuffer())
            .length,
          6 * 1024 * 1024,
        );
        assert.equal(
          (await inspectPreStudio(target.db)).profile,
          "production102",
        );
      },
    );
    await check(
      "process reopen ACK-loss style readonly reconciliation no target writes",
      async () => {
        const n = net.state.d1Writes + net.state.s3Writes,
          x = await child(true);
        assert.equal(x.n, 0, x.err + JSON.stringify(x.result));
        assert.equal(x.result.status, "RESTORED_READONLY_RECONCILED");
        assert.equal(net.state.d1Writes + net.state.s3Writes, n);
      },
    );
    await check(
      "restore target one-shot claim denies duplicate writes",
      async () => {
        const x = await child();
        assert.notEqual(x.n, 0);
        assert.equal(x.result.status, "HOLD");
      },
    );
    await check(
      "AEAD bad key missing page and tamper refuse before restore mutation",
      async () => {
        await assert.rejects(() =>
          verify({
            directory: sealed.directory,
            scope: sealed.scope,
            keyHandle: async () => randomBytes(32),
            manifestHash: sealed.manifestHash,
          }),
        );
        const m = JSON.parse(
            fs.readFileSync(sealed.directory + "/MANIFEST.json"),
          ),
          file = sealed.directory + "/" + m.pages[0].name,
          b = fs.readFileSync(file);
        fs.renameSync(file, file + ".held");
        await assert.rejects(() =>
          verify({
            directory: sealed.directory,
            scope: sealed.scope,
            keyHandle: host.getKey,
            manifestHash: sealed.manifestHash,
          }),
        );
        fs.renameSync(file + ".held", file);
        const bad = Buffer.from(b);
        bad[20] ^= 1;
        fs.writeFileSync(file, bad);
        await assert.rejects(() =>
          verify({
            directory: sealed.directory,
            scope: sealed.scope,
            keyHandle: host.getKey,
            manifestHash: sealed.manifestHash,
          }),
        );
        fs.writeFileSync(file, b);
      },
    );
    await check(
      "native D1-success R2-complete ACK loss preserves PARTIAL_UNKNOWN and forbids retry",
      async () => {
        const fresh = await boot("production102", R + "/partial-target", {
          initialize: false,
        });
        native.push(fresh);
        const spec = {
          account: sourceSpec.account,
          d1: randomUUID(),
          r2: {
            name: "fixture-partial",
            created: "2026-01-03T00:00:00Z",
            jurisdiction: "",
          },
        };
        net.resources.set(spec.r2.name, {
          id: spec.d1,
          created: spec.r2.created,
          db: fresh.db,
          bucket: fresh.bucket,
        });
        const op2 = randomUUID(),
          scope2 = { ...scope, operationId: op2 },
          e = (kind, x) =>
            envelope(kind, { ...x, scope: digest(scope2), operationId: op2 });
        const h = await openHost({
          authority: A,
          envelope: e("host", hostEnvelope.payload),
          scope: scope2,
          root: hostRoot,
          keyHandle: async () => Buffer.from(key),
          observeFixture: async () => ({
            volumeUUID: "fixture-volume",
            encrypted: true,
          }),
        });
        const c = await connectResources({
          authority: A,
          envelope: e("resources", {
            role: "restore",
            resources: spec,
            source: sourceSpec,
            productionDenylist: [sourceSpec],
          }),
          scope: scope2,
          role: "restore",
          tokenHandle: async () => "fixture-read",
          s3Credentials: {
            accessKeyId: "fixture-access",
            secretAccessKey: "fixture-secret",
          },
          fixture: net,
        });
        caps.push(c);
        const a = e("archive", { receipt: sealed }),
          v = preStudioValidator({
            bucket: c.bucket,
            expectedJournalHash: digest(canonical(journal)),
            hash: digest,
          });
        net.state.dropR2Complete = true;
        await assert.rejects(
          () =>
            runRestore({
              authority: A,
              archiveEnvelope: a,
              scope: scope2,
              host: h,
              resources: c,
              validator: v,
              operationId: op2,
            }),
          /partial-unknown/,
        );
        const log = JSON.parse(
          fs.readFileSync(
            hostRoot + "/journals/restore-" + op2 + "/RESTORE.json",
          ),
        );
        assert.equal(log.state, "PARTIAL_UNKNOWN");
        assert.equal(
          (
            await fresh.db
              .prepare("SELECT count(*) n FROM sync_accounts")
              .first()
          ).n,
          1,
        );
        assert(await fresh.bucket.get("large"));
        const writes = net.state.d1Writes + net.state.s3Writes;
        await assert.rejects(() =>
          runRestore({
            authority: A,
            archiveEnvelope: a,
            scope: scope2,
            host: h,
            resources: c,
            validator: v,
            operationId: op2,
          }),
        );
        assert.equal(net.state.d1Writes + net.state.s3Writes, writes);
      },
    );
    await check(
      "claim root replacement and path traversal rejected",
      async () => {
        await assert.rejects(() => host.path("../escape"));
        fs.renameSync(host.claims, host.claims + ".held");
        fs.mkdirSync(host.claims, { mode: 0o700 });
        await assert.rejects(() => host.check());
        fs.rmdirSync(host.claims);
        fs.renameSync(host.claims + ".held", host.claims);
        await host.check();
      },
    );
    await check(
      "invalid generation observation is rejected after real schema reads",
      async () => {
        const db = {
          prepare(sql) {
            if (sql.includes("WHERE generation IS NULL"))
              return { first: async () => ({ n: 1 }) };
            return sourceCap.r.db.prepare(sql);
          },
        };
        await assert.rejects(() => validator(db), /generation/);
      },
    );
    await check(
      "R2 delete lost ACK swallowed by handler remains UNKNOWN",
      async () => {
        const o = scheduledObserver({ emit: () => {} }),
          b = o.bucket({
            delete: async () => {
              throw Error("lost-ack");
            },
          });
        const x = await o.run("s-lost", async () => {
          try {
            await b.delete("synthetic");
          } catch {}
        });
        assert.equal(x.status, "UNKNOWN");
        assert.equal(x.r2Failures, 1);
      },
    );
    await check(
      "key provider failure and staging overrun fail closed",
      async () => {
        const badHost = await openHost({
          authority: A,
          envelope: hostEnvelope,
          scope,
          root: hostRoot,
          keyHandle: async () => {
            throw Error("unavailable");
          },
          observeFixture: async () => ({
            volumeUUID: "fixture-volume",
            encrypted: true,
          }),
        });
        await assert.rejects(() => badHost.getKey());
        await assert.rejects(() =>
          host
            .guardTarget({ apply: async () => assert.fail("must not apply") })
            .apply([{ kind: "r2-start", size: 9 * 1024 * 1024 }]),
        );
      },
    );
    await check(
      "signed grant envelope replacement cannot change bound host scope",
      async () => {
        const changed = structuredClone(hostEnvelope);
        const h = await openHost({
          authority: A,
          envelope: changed,
          scope,
          root: hostRoot,
          keyHandle: async () => Buffer.from(key),
          observeFixture: async () => ({
            volumeUUID: "fixture-volume",
            encrypted: true,
          }),
        });
        Object.assign(
          changed,
          envelope("host", { ...hostEnvelope.payload, root: "/wrong" }),
        );
        await h.check();
      },
    );
    await check(
      "typed Scheduled HOLD and swallowed R2/D1 failure observed without payload",
      async () => {
        const events = [],
          o = scheduledObserver({ emit: (x) => events.push(x) }),
          b = o.bucket(source.bucket),
          d = o.db(source.db);
        await source.bucket.put("partial", "x");
        const e = await o.run("scheduled-1", async () => {
          await b.delete("partial");
          try {
            await d.prepare("SELECT json_extract('bad','$.abort')").run();
          } catch {}
        });
        assert.equal(e.status, "PARTIAL_UNKNOWN");
        assert(!JSON.stringify(events).includes('partial"'));
        const hold = await scheduledObserver({ emit: () => {} }).run(
          "s2",
          async () => ({ status: "HOLD_PARTIAL_OR_UNKNOWN_STUDIO_SCHEMA" }),
        );
        assert.equal(hold.status, "HOLD");
      },
    );
    const accepted = envelope("restore-accepted", {
      sourceIdentity: sourceCap.r.identity,
      fullCoverage: true,
      preProfile: "production102-noStudio",
      manifestHash: sealed.manifestHash,
      independentTarget: targetCap.r.identity,
    });
    const ddl = await connect("ddl", sourceSpec, {
      sqlHash:
        "8503af5b2475063e76b1c5f73f2816d95e6f35085a001f61a4ad127c08190ebc",
      restoreEvidenceHash: digest(accepted),
    });
    await check(
      "fixed88 DDL failure rolls back all83 native objects and remains UNKNOWN",
      async () => {
        net.state.failDDL = true;
        await assert.rejects(() => ddl.r.ddlBatch(fixedBatch(), accepted));
        assert.equal(
          (await inspectPreStudio(source.db)).profile,
          "production102",
        );
        net.state.failDDL = false;
      },
    );
    await check(
      "DDL requires exact payload and external independent restore evidence",
      async () => {
        await assert.rejects(() =>
          ddl.r.ddlBatch(fixedBatch().slice(1), accepted),
        );
        await assert.rejects(() =>
          ddl.r.ddlBatch(
            fixedBatch(),
            envelope("restore-accepted", { fullCoverage: false }),
          ),
        );
      },
    );
    await check(
      "native rc5 commit ACK loss reconciles APPLIED without retry",
      async () => {
        net.state.dropDDL = true;
        const x = await executeDDL({
          host,
          resources: ddl.r,
          operationId: op,
          restoreEvidence: accepted,
        });
        assert.equal(x.status, "APPLIED");
        assert.equal(
          (
            await source.db
              .prepare(
                "SELECT count(*) n FROM sqlite_master WHERE sql IS NOT NULL AND name GLOB 'studio_document_*'",
              )
              .first()
          ).n,
          83,
        );
        assert.equal(
          (
            await source.db
              .prepare("SELECT enabled FROM studio_document_control")
              .first()
          ).enabled,
          0,
        );
      },
    );
    await check(
      "DDL durable intent refuses resend and read-only marker reconciles",
      async () => {
        await assert.rejects(
          () =>
            executeDDL({
              host,
              resources: ddl.r,
              operationId: op,
              restoreEvidence: accepted,
            }),
          /already-attempted/,
        );
        assert.equal(
          (await reconcileDDL({ resources: ddl.r })).status,
          "APPLIED",
        );
      },
    );
    for (const app of ["port", "chord", "pitch", "fretboard", "rhythm"])
      await check("afterDDL " + app + " normal save continuation", () =>
        saveLegacy(app),
      );
    await check("normal B and Activation OFF preserved after DDL", async () => {
      assert.equal(
        (
          await source.db
            .prepare("SELECT state FROM sync_accounts WHERE id=?")
            .bind(normalB.id)
            .first()
        ).state,
        "active",
      );
      const r = await source.mf.dispatchFetch(
        "https://fixture.invalid/v2/studio/document",
      );
      assert.equal(r.status, 423);
      await r.arrayBuffer();
    });
    result.status = "PASS";
  } catch (e) {
    result.status = "FAIL";
    result.error = String(e.stack);
    console.error(result.error);
    process.exitCode = 1;
  } finally {
    for (const r of caps) r.close();
    if (net) await net.close();
    for (const n of native) await n.mf.dispose();
    key.fill(0);
    result.pass = result.tests.length;
    fs.writeFileSync(R + "/RESULT.json", JSON.stringify(result, null, 2));
  }
}
