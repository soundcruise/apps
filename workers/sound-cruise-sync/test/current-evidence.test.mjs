import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { generateKeyPairSync, randomUUID, sign, createHash } from "node:crypto";
import { canonical, digest } from "../scripts/studio-operations/contracts.mjs";
import { privateCurrentReader } from "../scripts/studio-operations/private-current.mjs";
import { currentEvidenceStore, verifyCurrentEvidence } from "../scripts/studio-operations/current-evidence.mjs";
import { metadataOpenProbe } from "../scripts/studio-operations/metadata-open-probe.mjs";
const hash = (x) => createHash("sha256").update(x).digest("hex");
const key = () => { const k = generateKeyPairSync("ed25519"); return { private: k.privateKey, public: k.publicKey.export({ format: "jwk" }) }; };
function fixture({ mutate = (x) => x, response, lost = false } = {}) {
  const operator = key(), issuer = key(), wrong = key(), source = { d1: "fixture/d1", r2: "fixture/default/r2/created" };
  const context = { sessionId: randomUUID(), source, ownerId: "fixture-owner", minimumRevision: 0, expectedEpoch: 1,
    synthetic: true, control: { account: "a".repeat(32), worker: "fixture-control", namespaceId: "b".repeat(32),
      versionId: randomUUID(), deploymentId: randomUUID(), artifactSHA256: "c".repeat(64) },
    operatorPublicJwk: operator.public, operatorIssuerPin: digest(operator.public),
    receiptPublicJwk: issuer.public, receiptIssuerPin: digest(issuer.public) };
  const parent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "sc-current-evidence-")), root = parent + "/evidence";
  const store = currentEvidenceStore({ root, context });
  let calls = 0;
  const envelope = (payload, k = issuer) => ({ payload, signature: sign(null, Buffer.from(canonical(payload)), k.private).toString("base64") });
  const readerOptions = { source, ownerId: context.ownerId, minimumRevision: 0, synthetic: true,
    publicJwk: issuer.public, issuerPin: context.receiptIssuerPin, evidence: store,
    signRequest: async (kind, { nonce }) => { const issued = Date.now(); return envelope({ kind, sourceDigest: digest(source), nonce,
      issued, expires: issued + 120000 }, operator); },
    binding: { async fetch(request) {
      calls++;
      if (lost) throw Error("simulated-ACK-loss-private-text-must-not-be-persisted");
      if (response) return response();
      const q = (await request.json()).envelope.payload, issued = Date.now() - 1;
      const payload = { kind: "freeze-current", synthetic: true, operationId: null, scope: null,
        sourceDigest: digest(source), inventoryDigest: null, windowId: null, cutlineId: null, sequence: 0,
        id: randomUUID(), issued, expires: issued + 30000, nonce: q.nonce, revision: 0, state: "OPEN", windowHash: null,
        capacity: { invocations: 0, effects: 0, reservedEffects: 0,
          limits: { effectsPerInvocation: 512, maxActive: 128, maxEffects: 1000000, maxInvocations: 100000, warnPercent: 70 },
          warning: false, admissionCapacity: true }, ownerId: context.ownerId, epoch: 1 };
      return Response.json({ receipt: envelope(mutate(payload), wrong.used ? wrong : issuer), bundle: null });
    } } };
  const reader = privateCurrentReader(readerOptions);
  const records = () => fs.readdirSync(root).filter((n) => n.endsWith(".record.json")).map((n) => {
    const raw = fs.readFileSync(root + "/" + n); return { nonce: n.slice(0, 64), recordFileHash: hash(raw), record: JSON.parse(raw) };
  });
  return { context, root, parent, store, reader, readerOptions, wrong, records, operator, issuer, envelope, get calls() { return calls; },
    verify(x) { return verifyCurrentEvidence({ root, nonce: x.nonce, expectedRecordHash: x.recordFileHash, trustedContext: context }); },
    cleanup() { fs.rmSync(parent, { recursive: true, force: false }); } };
}
test("raw signed envelope is durable before verification, with distinct byte/payload/envelope hashes", async () => {
  const f = fixture(); try {
    const x = await f.reader.observe(); const result = f.verify(x.savedEvidence);
    assert.equal(result.status, "VERIFIED_HISTORICAL_OPEN"); assert.equal(result.freezeAuthorized, false);
    assert.equal(fs.statSync(f.root).mode & 0o777, 0o700);
    const raw = fs.readFileSync(f.root + "/" + x.savedEvidence.nonce + ".raw-receipt.json");
    assert.equal(fs.statSync(f.root + "/" + x.savedEvidence.nonce + ".raw-receipt.json").mode & 0o777, 0o600);
    assert.equal(result.envelopeFileSHA256, hash(raw));
    assert.equal(result.envelopeSHA256, digest(JSON.parse(raw))); assert.notEqual(result.envelopeSHA256, result.envelopeFileSHA256);
  } finally { f.cleanup(); }
});
test("fresh nonce consecutive observations independently verify in a different process", async () => {
  const f = fixture(); try {
    const a = await f.reader.observe(), b = await f.reader.observe(); assert.notEqual(a.receipt.nonce, b.receipt.nonce);
    assert.equal(a.receipt.revision, b.receipt.revision); assert.equal(a.receipt.epoch, b.receipt.epoch);
    for (const x of [a, b]) {
      const child = spawnSync(process.execPath, ["scripts/studio-operations/verify-current-evidence.mjs"], {
        input: JSON.stringify({ root: f.root, nonce: x.savedEvidence.nonce, expectedRecordHash: x.savedEvidence.recordFileHash, trustedContext: f.context }), encoding: "utf8" });
      assert.equal(child.status, 0, child.stdout); assert.equal(JSON.parse(child.stdout).status, "VERIFIED_HISTORICAL_OPEN");
    }
    assert.equal(f.calls, 2);
  } finally { f.cleanup(); }
});
for (const [name, mutate, diagnostic] of [
  ["30001ms", (p) => ({ ...p, expires: p.issued + 30001 }), "TIME_OVERLONG"],
  ["zero duration", (p) => ({ ...p, expires: p.issued }), "TIME_NONPOSITIVE"],
  ["expired", (p) => ({ ...p, issued: p.issued - 31000, expires: p.issued - 1000 }), "TIME_EXPIRED"],
  ["future issued", (p) => ({ ...p, issued: p.issued + 100000, expires: p.issued + 100001 }), "TIME_FUTURE"],
  ["Source mismatch", (p) => ({ ...p, sourceDigest: "d".repeat(64) }), "TRUST_CONTEXT"],
  ["Owner mismatch", (p) => ({ ...p, ownerId: "other-owner" }), "TRUST_CONTEXT"],
  ["epoch mismatch", (p) => ({ ...p, epoch: 2 }), "TRUST_CONTEXT"],
  ["sequence mismatch", (p) => ({ ...p, sequence: 1 }), "TRUST_CONTEXT"],
  ["nonce replay", (p) => ({ ...p, nonce: "e".repeat(64) }), "NONCE"],
  ["CLOSED/open separation", (p) => ({ ...p, state: "SEALED", windowHash: "f".repeat(64) }), "STATE"],
]) test("rejected " + name + " retains its signed envelope and fixed diagnostic without retry", async () => {
  const f = fixture({ mutate }); try {
    await assert.rejects(() => f.reader.observe()); const rows = f.records(); assert.equal(rows.length, 1);
    assert.ok(fs.existsSync(f.root + "/" + rows[0].nonce + ".raw-receipt.json"));
    assert.equal(rows[0].record.diagnostic, diagnostic); assert.equal(f.verify(rows[0]).diagnostic, diagnostic); assert.equal(f.calls, 1);
  } finally { f.cleanup(); }
});
test("wrong signer retains the raw envelope but fails independent verification", async () => {
  const f = fixture(); f.wrong.used = true; try {
    await assert.rejects(() => f.reader.observe(), { code: "EVIDENCE_CURRENT_REJECTED" }); const x = f.records()[0];
    assert.equal(f.verify(x).diagnostic, "SIGNATURE"); assert.equal(f.calls, 1);
  } finally { f.cleanup(); }
});
test("ACK loss remains UNKNOWN with a durable attempt and no automatic resend", async () => {
  const f = fixture({ lost: true }); try {
    await assert.rejects(() => f.reader.observe()); const x = f.records()[0]; assert.equal(f.calls, 1);
    assert.equal(x.record.diagnostic, "TRANSPORT_UNKNOWN"); assert.equal(f.verify(x).status, "UNKNOWN");
    const bytes = fs.readdirSync(f.root).map((n) => fs.readFileSync(f.root + "/" + n, "utf8")).join("");
    assert.ok(!bytes.includes("private-text-must-not-be-persisted"));
    const reopened = currentEvidenceStore({ root: f.root, context: f.context, reopen: true });
    assert.throws(() => reopened.begin({ nonce: x.nonce, startedAt: Date.now() }));
  } finally { f.cleanup(); }
});
test("unknown body fields are rejected before raw persistence", async () => {
  const f = fixture({ mutate: (p) => ({ ...p, token: "must-never-be-written" }) }); try {
    await assert.rejects(() => f.reader.observe()); const x = f.records()[0]; assert.equal(x.record.diagnostic, "EVIDENCE_SCHEMA");
    assert.equal(x.record.receiptFileHash, null);
    assert.ok(!fs.readdirSync(f.root).map((n) => fs.readFileSync(f.root + "/" + n)).join().includes("must-never-be-written"));
  } finally { f.cleanup(); }
});
test("HTTP failure and invalid JSON are distinct fixed diagnostics", async () => {
  for (const [response, expected] of [[() => new Response("not persisted", { status: 503 }), "HTTP_UNKNOWN"],
    [() => new Response("invalid-json-not-persisted"), "JSON_INVALID"]]) {
    const f = fixture({ response }); try {
      await assert.rejects(() => f.reader.observe()); assert.equal(f.records()[0].record.diagnostic, expected); assert.equal(f.calls, 1);
    } finally { f.cleanup(); }
  }
});
test("external pins, byte tamper, symlink and permissions fail closed", async () => {
  const f = fixture(); try {
    const x = await f.reader.observe(), input = { root: f.root, nonce: x.savedEvidence.nonce,
      expectedRecordHash: x.savedEvidence.recordFileHash, trustedContext: f.context };
    assert.throws(() => verifyCurrentEvidence({ ...input, trustedContext: { ...f.context, ownerId: "forged" } }));
    const file = f.root + "/" + input.nonce + ".raw-receipt.json", original = fs.readFileSync(file);
    fs.appendFileSync(file, " "); assert.throws(() => verifyCurrentEvidence(input)); fs.writeFileSync(file, original);
    fs.chmodSync(file, 0o644); assert.throws(() => verifyCurrentEvidence(input)); fs.chmodSync(file, 0o600);
    fs.renameSync(file, f.parent + "/moved"); fs.symlinkSync(f.parent + "/moved", file); assert.throws(() => verifyCurrentEvidence(input));
  } finally { f.cleanup(); }
});
test("missing final record after crash is not accepted as success", async () => {
  const f = fixture(); try {
    const nonce = "a".repeat(64); f.store.begin({ nonce, startedAt: Date.now() });
    assert.throws(() => verifyCurrentEvidence({ root: f.root, nonce, expectedRecordHash: "0".repeat(64), trustedContext: f.context }));
    assert.throws(() => currentEvidenceStore({ root: f.root, context: { ...f.context, sessionId: randomUUID() }, reopen: true }));
  } finally { f.cleanup(); }
});
test("historical signature validity and current expiry remain separate", async () => {
  const f = fixture(); try {
    const x = await f.reader.observe(), current = f.verify(x.savedEvidence);
    const future = verifyCurrentEvidence({ root: f.root, nonce: x.savedEvidence.nonce,
      expectedRecordHash: x.savedEvidence.recordFileHash, trustedContext: f.context, now: Date.now() + 60000 });
    assert.equal(current.status, "VERIFIED_HISTORICAL_OPEN");
    assert.equal(future.historicalValidity, "PASS_AT_RECORDED_OBSERVATION");
    assert.equal(future.currentValidity, "EXPIRED_OR_FUTURE"); assert.equal(future.freezeAuthorized, false);
  } finally { f.cleanup(); }
});
test("separate-process CLI ignores injected now and reports an expired historical fixture", async () => {
  const f = fixture(); try {
    const x = await f.reader.observe(), nonce = x.savedEvidence.nonce, shift = 60000;
    const load = (suffix) => JSON.parse(fs.readFileSync(f.root + "/" + nonce + suffix));
    const write = (suffix, value) => { const bytes = JSON.stringify(value, null, 2) + "\n";
      fs.writeFileSync(f.root + "/" + nonce + suffix, bytes); return hash(bytes); };
    // This is explicitly synthetic historical evidence, not a production clock override.
    const request = load(".request.json"); request.startedAt -= shift;
    const req = load(".signed-request.json").payload; req.issued -= shift; req.expires -= shift;
    const receipt = load(".raw-receipt.json").payload; receipt.issued -= shift; receipt.expires -= shift;
    const record = load(".record.json");
    for (const k of ["startedAt", "signedAt", "receivedAt", "verifiedAt"]) record[k] -= shift;
    record.requestFileHash = write(".request.json", request);
    record.requestEnvelopeHash = write(".signed-request.json", f.envelope(req, f.operator));
    record.receiptFileHash = write(".raw-receipt.json", f.envelope(receipt, f.issuer));
    const recordFileHash = write(".record.json", record);
    const child = spawnSync(process.execPath, ["scripts/studio-operations/verify-current-evidence.mjs"], {
      input: JSON.stringify({ root: f.root, nonce, expectedRecordHash: recordFileHash, trustedContext: f.context, now: receipt.issued }), encoding: "utf8" });
    assert.equal(child.status, 0); const result = JSON.parse(child.stdout);
    assert.equal(result.historicalValidity, "PASS_AT_RECORDED_OBSERVATION");
    assert.equal(result.currentValidity, "EXPIRED_OR_FUTURE"); assert.equal(result.freezeAuthorized, false);
  } finally { f.cleanup(); }
});
test("probe accepts exactly two independently verified fresh observations", async () => {
  const f = fixture(); try {
    const result = await metadataOpenProbe({ ...f.readerOptions, context: f.context, outputRoot: f.parent + "/probe" });
    assert.equal(result.status, "METADATA_OPEN_CONSECUTIVE_PASS"); assert.equal(f.calls, 2);
    assert.equal(result.observations.length, 2); assert.equal(result.freezeAuthorized, false);
  } finally { f.cleanup(); }
});
test("probe preserves UNKNOWN and never repeats a lost-ACK request or reuses its root", async () => {
  const f = fixture({ lost: true }); try {
    const options = { ...f.readerOptions, context: f.context, outputRoot: f.parent + "/probe" };
    const result = await metadataOpenProbe(options); assert.equal(result.status, "HOLD");
    assert.ok(result.pendingEvidence); assert.equal(result.automaticRetry, false); assert.equal(f.calls, 1);
    await assert.rejects(() => metadataOpenProbe(options)); assert.equal(f.calls, 1);
  } finally { f.cleanup(); }
});
