import { freezeControlClient } from "./freeze-client.mjs";
import { verifyFreezeState } from "../../src/production-freeze-current.js";
import { digest } from "./contracts.mjs";
import { randomBytes } from "node:crypto";
import { classifyCurrentFailure } from "./current-evidence.mjs";
// Service-binding-only read API. No HTTP listener, public route, control action, or fallback.
export function privateCurrentReader({
  binding,
  signRequest,
  publicJwk,
  issuerPin,
  source,
  ownerId,
  minimumRevision,
  synthetic = false,
  evidence,
}) {
  if (typeof binding?.fetch !== "function")
    throw Error("private-binding-required");
  if (evidence && (typeof evidence.begin !== "function" || typeof evidence.diagnose !== "function"))
    throw Error("current-evidence-required");
  const clientFor = (signer) => freezeControlClient({
    endpoint: "https://private-control.invalid/",
    signRequest: signer,
    fetchImpl: (url, init) => {
      const u = new URL(url);
      if (
        u.origin !== "https://private-control.invalid" ||
        u.pathname !== "/current" ||
        init.method !== "POST"
      )
        throw Error("private-read-scope");
      return binding.fetch(new Request(url, init));
    },
  });
  return Object.freeze({
    async observe(expectedState = "OPEN") {
      if (expectedState !== "OPEN") throw Error("metadata-OPEN-only");
      const nonce = randomBytes(32).toString("hex"),
        attempt = evidence?.begin({ nonce, startedAt: Date.now() });
      let result, receipt, failure, diagnostic = "NONE";
      try {
        const signer = async (...args) => {
          const envelope = await signRequest(...args);
          attempt?.signedRequest(envelope);
          return envelope;
        };
        result = await clientFor(signer).current(nonce);
        attempt?.capture({ result, observedAt: Date.now() });
        if (evidence && evidence.diagnose(result.receipt, nonce, Date.now()) !== "NONE")
          throw Object.assign(Error("EVIDENCE_CURRENT_REJECTED"), { code: "EVIDENCE_CURRENT_REJECTED" });
        receipt = await verifyFreezeState({
        result,
        publicJwk,
        issuerPin,
        source,
        nonce,
        minimumRevision,
        expectedState,
        ownerId,
        synthetic,
        });
      } catch (error) {
        failure = error;
        diagnostic = classifyCurrentFailure(error);
        if (diagnostic === "VERIFICATION_REJECTED" && result?.receipt && evidence) {
          const specific = evidence.diagnose(result.receipt, nonce, Date.now());
          if (specific !== "NONE") diagnostic = specific;
        }
      }
      const savedEvidence = attempt?.finish({ outcome: failure ? "HOLD" : "VERIFIED_OPEN",
        diagnostic, verifiedAt: Date.now(), httpStatus: failure?.status ?? null });
      if (failure) {
        if (savedEvidence && failure instanceof Error) failure.savedEvidence = savedEvidence;
        throw failure;
      }
      return {
        receipt,
        receiptHash: digest(result.receipt),
        freezeAuthorized: false,
        ...(savedEvidence ? { savedEvidence } : {}),
      };
    },
  });
}
