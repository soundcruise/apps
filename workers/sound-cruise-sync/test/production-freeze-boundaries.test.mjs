import { test } from "node:test";
import assert from "node:assert/strict";
import { connectResources } from "../scripts/studio-operations/transport.mjs";
const base = {
  role: "restore",
  resources: {
    account: "a".repeat(32),
    d1: "11111111-1111-4111-8111-111111111111",
    r2: {
      name: "isolated-restore-bucket",
      created: "fixture-created",
      jurisdiction: "default",
    },
  },
  source: {
    account: "b".repeat(32),
    d1: "22222222-2222-4222-8222-222222222222",
    r2: {
      name: "source-fixture-bucket",
      created: "fixture-source",
      jurisdiction: "default",
    },
  },
  productionDenylist: [
    {
      account: "c".repeat(32),
      d1: "33333333-3333-4333-8333-333333333333",
      r2: "production-bucket",
    },
  ],
};
for (const [name, change] of [
  ["D1 source alias", (p) => (p.source.d1 = p.resources.d1)],
  [
    "R2 source alias",
    (p) => {
      p.source.account = p.resources.account;
      p.source.r2.name = p.resources.r2.name;
    },
  ],
  ["Production D1", (p) => (p.resources.d1 = p.productionDenylist[0].d1)],
  [
    "Production bucket",
    (p) => {
      p.resources.account = p.productionDenylist[0].account;
      p.resources.r2.name = p.productionDenylist[0].r2;
    },
  ],
  ["missing denylist", (p) => (p.productionDenylist = [])],
  ["role mismatch", (p) => (p.role = "source")],
])
  test("reject unapproved " + name + " before any network", async () => {
    const p = structuredClone(base);
    change(p);
    let called = false;
    await assert.rejects(() =>
      connectResources({
        authority: { synthetic: true, check: () => p },
        envelope: {},
        scope: {},
        role: "restore",
        s3Credentials: {
          accessKeyId: "synthetic",
          secretAccessKey: "synthetic",
        },
        tokenHandle: async () => {
          called = true;
          throw Error("must-not-read-key");
        },
        fixture: { api: "http://127.0.0.1:1", s3: "http://127.0.0.1:1" },
        fetchImpl: async () => {
          called = true;
          throw Error("must-not-connect");
        },
      }),
    );
    assert.equal(called, false);
  });
