import fs from "node:fs";
import path from "node:path";
import { createHash, createPublicKey, verify } from "node:crypto";
import { canonical, digest } from "./contracts.mjs";
const hex = (x) => /^[a-f0-9]{64}$/.test(x || ""),
  uuid = (x) => /^[a-f0-9-]{36}$/.test(x || ""),
  integer = (x) => Number.isSafeInteger(x) && x >= 0;
const hold = (code) => { throw Object.assign(Error(code), { code }); };
const bytesHash = (x) => createHash("sha256").update(x).digest("hex");
const exact = (x, keys) => x && typeof x === "object" && !Array.isArray(x) &&
  Object.keys(x).sort().join("|") === [...keys].sort().join("|");
const bodyFields = ["kind", "synthetic", "operationId", "scope", "sourceDigest",
  "inventoryDigest", "windowId", "cutlineId", "sequence", "id", "issued", "expires",
  "nonce", "revision", "state", "windowHash", "capacity", "ownerId", "epoch"];
const limitFields = ["effectsPerInvocation", "maxActive", "maxEffects", "maxInvocations", "warnPercent"];
function publicKey(jwk, pin) {
  if (!exact(jwk, ["kty", "crv", "x"]) || jwk.kty !== "OKP" || jwk.crv !== "Ed25519" ||
    !/^[A-Za-z0-9_-]{43}$/.test(jwk.x) || Buffer.from(jwk.x, "base64url").toString("base64url") !== jwk.x ||
    digest(jwk) !== pin) hold("EVIDENCE_TRUST_PIN");
  return createPublicKey({ key: jwk, format: "jwk" });
}
export function validateEvidenceContext(c) {
  if (!exact(c, ["sessionId", "source", "ownerId", "minimumRevision", "expectedEpoch", "synthetic",
    "control", "operatorPublicJwk", "operatorIssuerPin", "receiptPublicJwk", "receiptIssuerPin"]) ||
    !uuid(c.sessionId) || !exact(c.source, ["d1", "r2"]) ||
    Object.values(c.source).some((x) => typeof x !== "string" || !x || x.length > 512) ||
    typeof c.ownerId !== "string" || !/^[A-Za-z0-9_.:-]{1,160}$/.test(c.ownerId) ||
    !integer(c.minimumRevision) || !integer(c.expectedEpoch) || c.expectedEpoch < 1 ||
    typeof c.synthetic !== "boolean" ||
    !exact(c.control, ["account", "worker", "namespaceId", "versionId", "deploymentId", "artifactSHA256"]) ||
    !/^[a-f0-9]{32}$/.test(c.control.account) || !/^[a-z0-9-]{1,63}$/.test(c.control.worker) ||
    !/^[a-f0-9]{32}$/.test(c.control.namespaceId) || !uuid(c.control.versionId) ||
    !uuid(c.control.deploymentId) || !hex(c.control.artifactSHA256)) hold("EVIDENCE_CONTEXT");
  publicKey(c.operatorPublicJwk, c.operatorIssuerPin);
  publicKey(c.receiptPublicJwk, c.receiptIssuerPin);
  if (c.operatorIssuerPin === c.receiptIssuerPin) hold("EVIDENCE_AUTHORITY_REUSE");
  return structuredClone(c);
}
function envelopeShape(e, type) {
  if (!exact(e, ["payload", "signature"]) || typeof e.signature !== "string" ||
    Buffer.from(e.signature, "base64").length !== 64 ||
    Buffer.from(e.signature, "base64").toString("base64") !== e.signature) hold("EVIDENCE_SCHEMA");
  const p = e.payload;
  if (type === "request") {
    if (!(exact(p, ["kind", "sourceDigest", "nonce", "issued", "expires"]) ||
      exact(p, ["kind", "sourceDigest", "nonce", "issued", "expires", "id"])) ||
      p.kind !== "freeze-current-read" || (p.id !== undefined && !uuid(p.id))) hold("EVIDENCE_SCHEMA");
  } else {
    if (!exact(p, bodyFields) || p.kind !== "freeze-current" || typeof p.synthetic !== "boolean" ||
      p.scope !== null || p.inventoryDigest !== null || !uuid(p.id) ||
      !["OPEN", "CLOSING", "SEALED", "EXPIRED"].includes(p.state) ||
      typeof p.ownerId !== "string" || !/^[A-Za-z0-9_.:-]{1,160}$/.test(p.ownerId) ||
      !integer(p.sequence) || !integer(p.revision) || !integer(p.epoch) || p.epoch < 1 ||
      !exact(p.capacity, ["invocations", "effects", "reservedEffects", "limits", "warning", "admissionCapacity"]) ||
      ![p.capacity.invocations, p.capacity.effects, p.capacity.reservedEffects].every(integer) ||
      !exact(p.capacity.limits, limitFields) || !Object.values(p.capacity.limits).every(integer) ||
      typeof p.capacity.warning !== "boolean" || typeof p.capacity.admissionCapacity !== "boolean") hold("EVIDENCE_SCHEMA");
    for (const name of ["operationId", "windowId", "cutlineId", "windowHash"])
      if (p[name] !== null && !(name === "operationId" ? uuid(p[name]) : hex(p[name]))) hold("EVIDENCE_SCHEMA");
  }
  if (!hex(p.sourceDigest) || !hex(p.nonce) || !integer(p.issued) || !integer(p.expires)) hold("EVIDENCE_SCHEMA");
  return structuredClone(e);
}
function signed(e, jwk, pin) {
  return verify(null, Buffer.from(canonical(e.payload)), publicKey(jwk, pin), Buffer.from(e.signature, "base64"));
}
const diagnosticCodes = new Set(["NONE", "TRANSPORT_UNKNOWN", "HTTP_UNKNOWN", "JSON_INVALID", "BODY_BUDGET",
  "EVIDENCE_SCHEMA", "SIGNATURE", "TRUST_CONTEXT", "NONCE", "STATE", "TIME_FUTURE", "TIME_EXPIRED",
  "TIME_NONPOSITIVE", "TIME_OVERLONG", "PERSISTENCE", "VERIFICATION_REJECTED"]);
export function classifyCurrentFailure(error) {
  const m = error?.code || error?.message;
  return ({ "freeze-control-result-unknown": "HTTP_UNKNOWN", "current-json-invalid": "JSON_INVALID",
    "current-response-budget": "BODY_BUDGET", "freeze-state-signature": "SIGNATURE",
    "freeze-state-untrusted": "VERIFICATION_REJECTED", "EVIDENCE_CURRENT_REJECTED": "VERIFICATION_REJECTED",
    "EVIDENCE_SCHEMA": "EVIDENCE_SCHEMA" })[m] ||
    (typeof m === "string" && (m.startsWith("EVIDENCE_") || error?.syscall) ? "PERSISTENCE" : "TRANSPORT_UNKNOWN");
}
export function diagnoseCurrentReceipt({ envelope, context, nonce, at }) {
  const c = validateEvidenceContext(context), p = envelopeShape(envelope, "receipt").payload;
  if (!signed(envelope, c.receiptPublicJwk, c.receiptIssuerPin)) return "SIGNATURE";
  if (p.sourceDigest !== digest(c.source) || p.ownerId !== c.ownerId || p.synthetic !== c.synthetic ||
    p.epoch !== c.expectedEpoch || p.revision < c.minimumRevision || p.sequence !== p.revision) return "TRUST_CONTEXT";
  if (p.nonce !== nonce) return "NONCE";
  if (p.state !== "OPEN" || p.operationId !== null || p.windowId !== null || p.cutlineId !== null || p.windowHash !== null) return "STATE";
  if (p.issued > at) return "TIME_FUTURE";
  if (p.expires <= p.issued) return "TIME_NONPOSITIVE";
  if (p.expires - p.issued > 30000) return "TIME_OVERLONG";
  if (p.expires <= at) return "TIME_EXPIRED";
  return "NONE";
}
// All writes are fresh evidence files under a dedicated root; no credentials or arbitrary response bodies.
export function currentEvidenceStore({ root, context, reopen = false }) {
  const c = validateEvidenceContext(context), contextHash = digest(c);
  if (!path.isAbsolute(root) || path.resolve(root) !== root || fs.realpathSync(path.dirname(root)) !== path.dirname(root))
    hold("EVIDENCE_PATH");
  if (!reopen) fs.mkdirSync(root, { mode: 0o700 });
  const initial = fs.lstatSync(root);
  function checkRoot() {
    const s = fs.lstatSync(root);
    if (!s.isDirectory() || s.isSymbolicLink() || s.dev !== initial.dev || s.ino !== initial.ino ||
      s.uid !== process.getuid() || (s.mode & 0o777) !== 0o700 || fs.realpathSync(root) !== root) hold("EVIDENCE_PATH");
  }
  function write(name, value) {
    checkRoot();
    const bytes = JSON.stringify(value, null, 2) + "\n";
    if (Buffer.byteLength(bytes) > 65536) hold("EVIDENCE_SCHEMA");
    const fd = fs.openSync(path.join(root, name), fs.constants.O_WRONLY | fs.constants.O_CREAT |
      fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    const d = fs.openSync(root, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try { fs.fsyncSync(d); } finally { fs.closeSync(d); }
    checkRoot();
    return bytesHash(bytes);
  }
  checkRoot();
  if (!reopen) write("context.json", c);
  else if (canonical(readProtected(root, "context.json")) !== canonical(c)) hold("EVIDENCE_TRUST_PIN");
  return Object.freeze({
    diagnose(envelope, nonce, at) { return diagnoseCurrentReceipt({ envelope, context: c, nonce, at }); },
    begin({ nonce, startedAt }) {
      if (!hex(nonce) || !integer(startedAt)) hold("EVIDENCE_CONTEXT");
      const request = { schema: "current-evidence-request-v1", contextHash, sessionId: c.sessionId, nonce, startedAt };
      const requestFileHash = write(nonce + ".request.json", request);
      let requestEnvelopeHash = null, receiptFileHash = null, receivedAt = null, signedAt = null, done = false;
      return Object.freeze({
        signedRequest(envelope) {
          if (done || requestEnvelopeHash) hold("EVIDENCE_REPLAY");
          const x = envelopeShape(envelope, "request");
          if (x.payload.nonce !== nonce || x.payload.sourceDigest !== digest(c.source) ||
            !signed(x, c.operatorPublicJwk, c.operatorIssuerPin)) hold("EVIDENCE_REQUEST");
          signedAt = Date.now();
          requestEnvelopeHash = write(nonce + ".signed-request.json", x);
        },
        capture({ result, observedAt }) {
          if (done || !requestEnvelopeHash || receiptFileHash || !integer(observedAt)) hold("EVIDENCE_REPLAY");
          // A CLOSED bundle contains other evidence; retain only the strictly classified metadata receipt.
          const raw = envelopeShape(result?.receipt, "receipt");
          receivedAt = observedAt;
          receiptFileHash = write(nonce + ".raw-receipt.json", raw);
        },
        finish({ outcome, diagnostic = "NONE", verifiedAt, httpStatus = null }) {
          if (done || !["VERIFIED_OPEN", "HOLD"].includes(outcome) || !diagnosticCodes.has(diagnostic) ||
            !integer(verifiedAt) || (httpStatus !== null && (!integer(httpStatus) || httpStatus < 100 || httpStatus > 599)) ||
            (outcome === "VERIFIED_OPEN" && (!receiptFileHash || !requestEnvelopeHash || diagnostic !== "NONE"))) hold("EVIDENCE_OUTCOME");
          const record = { schema: "current-evidence-record-v1", contextHash, sessionId: c.sessionId, nonce,
            startedAt, signedAt, receivedAt, verifiedAt, requestFileHash, requestEnvelopeHash, receiptFileHash,
            outcome, diagnostic, httpStatus };
          const recordFileHash = write(nonce + ".record.json", record);
          done = true;
          return { nonce, recordFileHash };
        },
      });
    },
  });
}
function readProtected(root, name, bytes = false) {
  if (!/^(context\.json|[a-f0-9]{64}\.(request|signed-request|raw-receipt|record)\.json)$/.test(name)) hold("EVIDENCE_PATH");
  const fd = fs.openSync(path.join(root, name), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const s = fs.fstatSync(fd);
    if (!s.isFile() || s.nlink !== 1 || s.uid !== process.getuid() || (s.mode & 0o777) !== 0o600 || s.size > 65536) hold("EVIDENCE_PATH");
    const raw = fs.readFileSync(fd);
    return bytes ? raw : JSON.parse(raw.toString("utf8"));
  } finally { fs.closeSync(fd); }
}
// Offline verification requires pins and the record hash supplied independently of the evidence directory.
// Historical validity is not authorization to use an expired CURRENT in a live Backup window.
export function verifyCurrentEvidence({ root, nonce, expectedRecordHash, trustedContext, now = Date.now() }) {
  const c = validateEvidenceContext(trustedContext);
  if (!hex(nonce) || !hex(expectedRecordHash) || !integer(now) || fs.realpathSync(root) !== root) hold("EVIDENCE_TRUST_PIN");
  const s = fs.lstatSync(root);
  if (!s.isDirectory() || s.isSymbolicLink() || s.uid !== process.getuid() || (s.mode & 0o777) !== 0o700) hold("EVIDENCE_PATH");
  const load = (name, expected) => {
    const bytes = readProtected(root, name, true);
    if (bytesHash(bytes) !== expected) hold("EVIDENCE_TAMPER");
    return JSON.parse(bytes.toString("utf8"));
  };
  const record = load(nonce + ".record.json", expectedRecordHash);
  if (record.contextHash !== digest(c) ||
    record.sessionId !== c.sessionId || record.nonce !== nonce) hold("EVIDENCE_TRUST_PIN");
  const request = load(nonce + ".request.json", record.requestFileHash);
  if (request.contextHash !== digest(c) ||
    request.sessionId !== c.sessionId || request.nonce !== nonce || request.startedAt !== record.startedAt) hold("EVIDENCE_TAMPER");
  if (!record.receiptFileHash || !record.requestEnvelopeHash)
    return { status: "UNKNOWN", historicalValidity: "UNPROVEN", currentValidity: "UNPROVEN", freezeAuthorized: false };
  const req = envelopeShape(load(nonce + ".signed-request.json", record.requestEnvelopeHash), "request"),
    raw = envelopeShape(load(nonce + ".raw-receipt.json", record.receiptFileHash), "receipt");
  const p = raw.payload, q = req.payload;
  let diagnostic = diagnoseCurrentReceipt({ envelope: raw, context: c, nonce, at: record.verifiedAt });
  if (!signed(req, c.operatorPublicJwk, c.operatorIssuerPin) || !signed(raw, c.receiptPublicJwk, c.receiptIssuerPin)) diagnostic = "SIGNATURE";
  else if (p.sourceDigest !== digest(c.source) || q.sourceDigest !== digest(c.source) ||
    p.ownerId !== c.ownerId || p.synthetic !== c.synthetic || p.epoch !== c.expectedEpoch || p.revision < c.minimumRevision ||
    p.sequence !== p.revision) diagnostic = "TRUST_CONTEXT";
  else if (p.nonce !== nonce || q.nonce !== nonce) diagnostic = "NONCE";
  else if (p.state !== "OPEN" || p.windowHash !== null || p.operationId !== null || p.windowId !== null || p.cutlineId !== null) diagnostic = "STATE";
  else if (![record.startedAt, record.signedAt, record.receivedAt, record.verifiedAt].every(integer) ||
    record.startedAt > q.issued || q.issued > record.signedAt || record.signedAt > record.receivedAt ||
    record.receivedAt > record.verifiedAt || p.issued > record.receivedAt) diagnostic = "TIME_FUTURE";
  else if (p.expires <= p.issued || q.expires <= q.issued) diagnostic = "TIME_NONPOSITIVE";
  else if (p.expires - p.issued > 30000 || q.expires - q.issued > 600000) diagnostic = "TIME_OVERLONG";
  else if (p.expires <= record.verifiedAt || q.expires <= record.receivedAt) diagnostic = "TIME_EXPIRED";
  const currentValidity = p.issued <= now && p.expires > now ? "WITHIN_SIGNED_TIME" : "EXPIRED_OR_FUTURE";
  const after = fs.lstatSync(root);
  if (after.dev !== s.dev || after.ino !== s.ino) hold("EVIDENCE_PATH");
  return { status: diagnostic === "NONE" && record.outcome === "VERIFIED_OPEN" ? "VERIFIED_HISTORICAL_OPEN" : "HOLD",
    diagnostic, historicalValidity: diagnostic === "NONE" ? "PASS_AT_RECORDED_OBSERVATION" : "HOLD",
    currentValidity, sessionId: c.sessionId, nonce, revision: p.revision, epoch: p.epoch,
    signerIdentity: c.receiptIssuerPin, sourceDigest: p.sourceDigest, ownerId: p.ownerId,
    payloadSHA256: digest(p), envelopeSHA256: digest(raw), envelopeFileSHA256: record.receiptFileHash,
    recordFileHash: expectedRecordHash, freezeAuthorized: false };
}
