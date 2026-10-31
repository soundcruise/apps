import { freezeControlClient } from "./freeze-client.mjs";
import { verifyFreezeState } from "../../src/production-freeze-current.js";
import { digest } from "./contracts.mjs";
import { randomBytes } from "node:crypto";
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
}) {
  if (typeof binding?.fetch !== "function")
    throw Error("private-binding-required");
  const client = freezeControlClient({
    endpoint: "https://private-control.invalid/",
    signRequest,
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
        result = await client.current(nonce);
      const receipt = await verifyFreezeState({
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
      return {
        receipt,
        receiptHash: digest(result.receipt),
        freezeAuthorized: false,
      };
    },
  });
}
