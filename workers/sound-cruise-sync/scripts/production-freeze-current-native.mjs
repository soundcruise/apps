import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { generateKeyPairSync, sign } from "node:crypto";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { canonical, digest } from "./studio-operations/contracts.mjs";
import { verifyFreezeState } from "../src/production-freeze-current.js";
import { currentEvidenceStore } from "./studio-operations/current-evidence.mjs";
import { privateCurrentReader } from "./studio-operations/private-current.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = process.env.CURRENT_CLOCK_OUTPUT;
if (!out || !path.isAbsolute(out) || fs.existsSync(out))
  throw Error("fresh-absolute-output-required");
fs.mkdirSync(out, { mode: 0o700 });
const require = createRequire(root + "/package.json");
const { build } = require("esbuild");
const { Miniflare, convertV4MiniflareOptions } = require("miniflare");
const runtimePath = require("workerd");
process.env.MINIFLARE_WORKERD_PATH ??= typeof runtimePath === "string" ? runtimePath : runtimePath.default;
const pair = () => {
  const k = generateKeyPairSync("ed25519");
  return { private: k.privateKey, jwk: k.privateKey.export({ format: "jwk" }),
    public: k.publicKey.export({ format: "jwk" }) };
};
const issuer = pair(), operator = pair(), external = pair();
const source = { d1: "synthetic-clock/d1", r2: "synthetic-clock/default/r2/created" };
const cfg = { source, ownerId: "clock-fixture", scope: { owner: "clock-fixture" },
  environment: "isolated", namespaceId: "e".repeat(32), workerArtifactHash: digest("fixture"),
  operatorPublicJwk: operator.public, externalPublicJwk: external.public };
const filename = root + "/src/production-freeze-coordinator.js";
const fixed = fs.readFileSync(filename, "utf8");
// Restore the exact old timing expressions only in the disposable negative fixture.
const before = fixed.replace("source = await this.#source,\n      observedAt = Date.now();", "source = await this.#source;")
  .replace("issued: observedAt,\n      expires: Math.min(observedAt + 30000", "issued: Date.now(),\n      expires: Math.min(Date.now() + 30000")
  .replace("state: s.expires && s.expires <= observedAt", "state: s.expires && s.expires <= Date.now()");
assert.notEqual(before, fixed);
async function bundle(text) {
  return (await build({ stdin: {
    contents: `import { ProductionFreezeCoordinator } from './src/production-freeze-coordinator.js';
export { ProductionFreezeCoordinator };
export default { async fetch(r,env) { const nonce = new URL(r.url).searchParams.get('nonce');
return Response.json(await env.FREEZE_COORDINATOR.getByName('source-${digest(source)}').current(nonce)); } };`,
    resolveDir: root, sourcefile: "clock-fixture.js" },
    bundle: true, format: "esm", platform: "browser", write: false,
    external: ["cloudflare:workers"], logLevel: "silent",
    plugins: [{ name: "fixture-only-ticking-clock", setup(b) {
      b.onLoad({ filter: /production-freeze-coordinator\.js$/ }, () => {
        const at = text.indexOf("  async current(nonce)");
        assert.ok(at > 0);
        return { contents: text.slice(0, at) + text.slice(at).replaceAll("Date.now()", "__fixtureTick()") +
          "\nlet __fixtureTime; function __fixtureTick(){ if(__fixtureTime === undefined) __fixtureTime = Date.now() - 1000; return __fixtureTime++; }\n",
          loader: "js", resolveDir: path.dirname(filename) };
      });
    } }] })).outputFiles[0].text;
}
console.log("STAGE bundle-before");
const codeBefore = await bundle(before);
console.log("STAGE bundle-fixed");
const codeFixed = await bundle(fixed);
console.log("STAGE bundled");
let mf;
async function open(code, name) {
  console.log("STAGE open-" + name);
  mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: code,
    compatibilityDate: "2026-10-31", host: "127.0.0.1", port: 0, inspectorPort: 0,
    bindings: { FREEZE_CONFIG: JSON.stringify(cfg), FREEZE_RECEIPT_PRIVATE_JWK: JSON.stringify(issuer.jwk) },
    durableObjects: { FREEZE_COORDINATOR: { className: "ProductionFreezeCoordinator", useSQLite: true } },
    resourcePersistencePath: out + "/" + name,
    outboundService() { throw Error("external-network-forbidden"); } }));
}
const results = [];
async function check(name, f) { await f(); results.push({ name, status: "PASS" }); console.log("PASS " + name); }
async function current(nonce) {
  console.log("STAGE current");
  const r = await mf.dispatchFetch("https://fixture.invalid/?nonce=" + nonce);
  assert.equal(r.status, 200); return r.json();
}
const validate = (result, nonce) => verifyFreezeState({ result, nonce,
  publicJwk: issuer.public, issuerPin: digest(issuer.public), source, ownerId: cfg.ownerId,
  minimumRevision: 0, expectedState: "OPEN", synthetic: true });
try {
  await open(codeBefore, "before");
  await check("old separate clock reads produce a 30001ms receipt rejected by the unchanged verifier", async () => {
    const x = await current("1".repeat(64));
    assert.equal(x.receipt.payload.expires - x.receipt.payload.issued, 30001);
    await assert.rejects(() => validate(x, "1".repeat(64)), /freeze-state-untrusted/);
  });
  await mf.dispose(); await open(codeFixed, "fixed");
  let first;
  await check("one observation instant produces a valid 30000ms signed OPEN receipt", async () => {
    first = await current("2".repeat(64));
    assert.equal(first.receipt.payload.expires - first.receipt.payload.issued, 30000);
    assert.equal((await validate(first, "2".repeat(64))).state, "OPEN");
  });
  await check("fresh nonce reads keep the same durable epoch and revision", async () => {
    const x = await current("3".repeat(64)); await validate(x, "3".repeat(64));
    assert.equal(x.receipt.payload.epoch, first.receipt.payload.epoch);
    assert.equal(x.receipt.payload.revision, first.receipt.payload.revision);
  });
  await mf.dispose(); await open(codeFixed, "fixed");
  await check("local workerd reopen returns a valid OPEN receipt (not a persistence proof)", async () => {
    const x = await current("4".repeat(64)); await validate(x, "4".repeat(64));
    assert.equal(x.receipt.payload.epoch, first.receipt.payload.epoch);
    assert.equal(x.receipt.payload.revision, first.receipt.payload.revision);
  });
  await check("nonce replay and signature tamper remain rejected", async () => {
    const x = await current("5".repeat(64));
    await assert.rejects(() => validate(x, "6".repeat(64)), /freeze-state-untrusted/);
    x.receipt.signature = sign(null, Buffer.from("tampered"), operator.private).toString("base64");
    await assert.rejects(() => validate(x, "5".repeat(64)), /freeze-state-signature/);
  });
  await check("native signed CURRENT envelopes survive protected capture and separate-process verification", async () => {
    const context = { sessionId: randomUUID(), source, ownerId: cfg.ownerId, minimumRevision: 0,
      expectedEpoch: 1, synthetic: true, control: { account: "a".repeat(32), worker: "native-control",
        namespaceId: cfg.namespaceId, versionId: randomUUID(), deploymentId: randomUUID(), artifactSHA256: digest(codeFixed) },
      operatorPublicJwk: operator.public, operatorIssuerPin: digest(operator.public),
      receiptPublicJwk: issuer.public, receiptIssuerPin: digest(issuer.public) };
    const evidenceRoot = out + "/signed-evidence";
    const store = currentEvidenceStore({ root: evidenceRoot, context });
    const reader = privateCurrentReader({ source, ownerId: cfg.ownerId, minimumRevision: 0, synthetic: true,
      publicJwk: issuer.public, issuerPin: digest(issuer.public), evidence: store,
      async signRequest(kind, { nonce }) {
        const issued = Date.now(), payload = { kind, nonce, sourceDigest: digest(source), issued, expires: issued + 120000 };
        return { payload, signature: sign(null, Buffer.from(canonical(payload)), operator.private).toString("base64") };
      },
      binding: { async fetch(request) {
        const body = await request.json(); return Response.json(await current(body.envelope.payload.nonce));
      } },
    });
    const a = await reader.observe(), b = await reader.observe();
    assert.notEqual(a.receipt.nonce, b.receipt.nonce);
    assert.equal(a.receipt.revision, b.receipt.revision); assert.equal(a.receipt.epoch, b.receipt.epoch);
    const independent = [];
    for (const x of [a, b]) {
      const p = spawnSync(process.execPath, [root + "/scripts/studio-operations/verify-current-evidence.mjs"], {
        input: JSON.stringify({ root: evidenceRoot, nonce: x.savedEvidence.nonce,
          expectedRecordHash: x.savedEvidence.recordFileHash, trustedContext: context }), encoding: "utf8" });
      assert.equal(p.status, 0, p.stdout); independent.push(JSON.parse(p.stdout));
    }
    fs.writeFileSync(out + "/INDEPENDENT-VERIFICATION.json", JSON.stringify({ context, results: independent }, null, 2));
  });
  fs.writeFileSync(out + "/RESULT.json", JSON.stringify({ status: "PASS_NATIVE_CLOCK_BOUNDARY", tests: results,
    productionCalls: 0, realControlRestart: false,
    limit: "This reproduces a real code defect, but does not establish the cause of the uncaptured second live verification error." }, null, 2));
} finally { await mf?.dispose(); }
