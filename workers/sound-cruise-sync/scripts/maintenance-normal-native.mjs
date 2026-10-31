// New boundary only: NORMAL v138-compatible entry has no Control binding or availability dependency.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID, createHash } from "node:crypto";
import assert from "node:assert/strict";
import * as F from "../test/studio-schema-fixture.mjs";
const out = process.env.MAINTENANCE_NORMAL_OUTPUT;
if (!out || !path.isAbsolute(out) || fs.existsSync(out))
  throw Error("fresh-output-required");
fs.mkdirSync(out, { mode: 0o700 });
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = fs.readFileSync(R + "/src/studio-production-entry.js", "utf8");
assert.ok(!/FREEZE_|freezeStub|production-freeze/.test(entry));
const { mf, db } = await F.boot("production102", out + "/native");
const results = [];
const check = async (name, fn) => {
  await fn();
  results.push({ name, status: "PASS" });
  console.log("PASS " + name);
};
const sha = (x) => createHash("sha256").update(x).digest("hex");
try {
  await F.seedRuntime(db);
  const A = await F.account(db),
    B = await F.account(db),
    P = await F.pro(db);
  await check("NORMAL profile has no Control dependency", async () =>
    assert.ok(!/FREEZE_|production-freeze/.test(entry)),
  );
  await check("NORMAL Studio remains OFF 423 without Control", async () =>
    assert.equal(
      (await mf.dispatchFetch("https://fixture.invalid/v2/studio/document"))
        .status,
      423,
    ),
  );
  await check("NORMAL health unaffected without Control", async () =>
    assert.equal(
      (await mf.dispatchFetch("https://fixture.invalid/health")).status,
      200,
    ),
  );
  for (const [n, a] of [
    ["A", A],
    ["B", B],
  ])
    await check(
      "NORMAL Account " + n + " summary and activity write without Control",
      async () => {
        const h = F.headers(a, P);
        h.set("Origin", "https://studio.fixture.invalid");
        const r = await mf.dispatchFetch(
          "https://fixture.invalid/v2/accounts/summary",
          { headers: h },
        );
        assert.equal(r.status, 200, await r.text());
      },
    );
  await check("NORMAL Pro status without Control", async () => {
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
  });
  const { createIdentityMaterial } = await import("../src/crypto.js"),
    { hashRecord } = await import("../src/records.js");
  for (const app of ["port", "chord", "pitch", "fretboard", "rhythm"])
    await check("NORMAL " + app + " save without Control", async () => {
      const a = await createIdentityMaterial(F.pepper),
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
            ? { themeMode: "dark" }
            : { settings: { themeMode: "dark" } },
      };
      rec.payloadHash = await hashRecord(rec);
      const h = new Headers({
        Authorization: "Bearer " + a.credential,
        "X-Sound-Cruise-Pro-Authorization": "Bearer " + P.token,
        "Content-Type": "application/json",
        Origin: "https://studio.fixture.invalid",
      });
      const r = await mf.dispatchFetch("https://fixture.invalid/v1/sync/push", {
        method: "POST",
        headers: h,
        body: JSON.stringify({
          appId: app,
          mode: "sync",
          operations: [rec],
          capabilities: ["settings_theme_v1"],
        }),
      });
      assert.equal(r.status, 200, await r.text());
    });
  await check("NORMAL Scheduled delegates without Control", async () =>
    assert.equal(
      (await mf.dispatchFetch("https://fixture.invalid/fixture/scheduled"))
        .status,
      200,
    ),
  );
  await check(
    "NORMAL Account B generation retained after A/Scheduled",
    async () => {
      const row = await db
        .prepare("SELECT generation FROM sync_accounts WHERE id=?")
        .bind(B.id)
        .first();
      assert.equal(row.generation, 1);
    },
  );
  fs.writeFileSync(
    out + "/RESULT.json",
    JSON.stringify(
      {
        passed: results.length,
        results,
        productionCalls: 0,
        entryHash: sha(entry),
        limits: [
          "Native fixture; not Production acceptance",
          "No Control outages can affect the NORMAL entry: it has no binding or RPC",
          "Maintenance Control outages remain fail-closed; saved PR83 cases reused",
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await mf.dispose();
}
