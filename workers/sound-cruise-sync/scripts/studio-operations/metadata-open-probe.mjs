import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { privateCurrentReader } from "./private-current.mjs";
import { currentEvidenceStore, validateEvidenceContext } from "./current-evidence.mjs";
// No credential lookup, deployment, session creation or control actions. The caller must supply
// the explicitly approved private binding, signer, and externally pinned deployment/trust context.
export async function metadataOpenProbe({ binding, signRequest, context, outputRoot }) {
  const c = validateEvidenceContext(context), evidence = currentEvidenceStore({ root: outputRoot, context: c });
  const anchor = fs.lstatSync(outputRoot);
  const checkRoot = () => {
    const s = fs.lstatSync(outputRoot);
    if (!s.isDirectory() || s.isSymbolicLink() || s.ino !== anchor.ino || s.dev !== anchor.dev ||
      s.uid !== process.getuid() || (s.mode & 0o777) !== 0o700 || fs.realpathSync(outputRoot) !== outputRoot)
      throw Error("probe-evidence-path");
  };
  const reader = privateCurrentReader({ binding, signRequest, evidence, publicJwk: c.receiptPublicJwk,
    issuerPin: c.receiptIssuerPin, source: c.source, ownerId: c.ownerId,
    minimumRevision: c.minimumRevision, synthetic: c.synthetic });
  const observations = [];
  let stage = "OBSERVE", result;
  try {
    for (let i = 0; i < 2; i++) {
      stage = "OBSERVE";
      const x = await reader.observe("OPEN");
      observations.push({ nonce: x.savedEvidence.nonce, recordFileHash: x.savedEvidence.recordFileHash,
        epoch: x.receipt.epoch, revision: x.receipt.revision });
      stage = "INDEPENDENT_VERIFY";
      const child = spawnSync(process.execPath, [fileURLToPath(new URL("./verify-current-evidence.mjs", import.meta.url))], {
        input: JSON.stringify({ root: outputRoot, nonce: x.savedEvidence.nonce,
          expectedRecordHash: x.savedEvidence.recordFileHash, trustedContext: c }),
        encoding: "utf8", maxBuffer: 65536, timeout: 10000 });
      const verified = child.status === 0 ? JSON.parse(child.stdout) : null;
      if (verified?.status !== "VERIFIED_HISTORICAL_OPEN" || verified.currentValidity !== "WITHIN_SIGNED_TIME" ||
        verified.recordFileHash !== x.savedEvidence.recordFileHash || verified.nonce !== x.receipt.nonce ||
        verified.epoch !== x.receipt.epoch || verified.revision !== x.receipt.revision || verified.freezeAuthorized !== false)
        throw Error("independent-verifier-hold");
      observations.at(-1).independentVerification = "PASS_AT_OBSERVATION";
    }
    stage = "CONSECUTIVE_BINDING";
    const [a, b] = observations;
    if (a.nonce === b.nonce || a.epoch !== b.epoch || a.revision !== b.revision) throw Error("consecutive-context");
    result = { status: "METADATA_OPEN_CONSECUTIVE_PASS", sessionId: c.sessionId, observations,
      freezeAuthorized: false, productDeploymentAuthorized: false, actualServiceRestartVerified: false };
  } catch (error) {
    const saved = error?.savedEvidence;
    const pendingEvidence = /^[a-f0-9]{64}$/.test(saved?.nonce || "") && /^[a-f0-9]{64}$/.test(saved?.recordFileHash || "")
      ? { nonce: saved.nonce, recordFileHash: saved.recordFileHash } : null;
    result = { status: "HOLD", stage, sessionId: c.sessionId, observations,
      pendingEvidence, automaticRetry: false, freezeAuthorized: false };
  }
  // A final marker is never written until both records have passed independent verification.
  // An existing root or marker prevents accidental replay; incomplete roots require read-only reconcile.
  checkRoot();
  const fd = fs.openSync(outputRoot + "/PROBE-RESULT.json", fs.constants.O_WRONLY | fs.constants.O_CREAT |
    fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(result, null, 2) + "\n"); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  const directory = fs.openSync(outputRoot, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
  checkRoot();
  return result;
}
