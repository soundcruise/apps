import {
  maintenanceCanonical as canonical,
  maintenanceDigest as digest,
} from "./maintenance-bridge-v2.js";
// OPEN readiness is a separate verification from authorization of a CLOSED Backup window.
export async function verifyFreezeState({
  result,
  publicJwk,
  issuerPin,
  source,
  nonce,
  minimumRevision,
  expectedState,
  ownerId,
  synthetic = false,
}) {
  const p = result?.receipt?.payload;
  if (
    (await digest(publicJwk)) !== issuerPin ||
    !Number.isSafeInteger(minimumRevision) ||
    minimumRevision < 0 ||
    typeof ownerId !== "string" ||
    !ownerId ||
    !p ||
    p.ownerId !== ownerId ||
    p.synthetic !== synthetic ||
    !Number.isSafeInteger(p.epoch) ||
    p.epoch < 1 ||
    p.kind !== "freeze-current" ||
    p.nonce !== nonce ||
    p.sourceDigest !== (await digest(source)) ||
    !Number.isSafeInteger(p.issued) ||
    !Number.isSafeInteger(p.expires) ||
    !Number.isSafeInteger(p.revision) ||
    p.revision < minimumRevision ||
    p.issued > Date.now() ||
    p.expires <= Date.now() ||
    p.expires <= p.issued ||
    p.expires - p.issued > 30000 ||
    !["OPEN", "CLOSING", "SEALED", "EXPIRED"].includes(p.state) ||
    p.state !== expectedState
  )
    throw Error("freeze-state-untrusted");
  const key = await crypto.subtle.importKey(
    "jwk",
    publicJwk,
    { name: "Ed25519" },
    false,
    ["verify"],
  );
  if (
    !(await crypto.subtle.verify(
      "Ed25519",
      key,
      Uint8Array.from(atob(result.receipt.signature), (c) => c.charCodeAt(0)),
      new TextEncoder().encode(canonical(p)),
    ))
  )
    throw Error("freeze-state-signature");
  return structuredClone(p);
}
export async function verifyFreezeCurrent({
  result,
  publicJwk,
  issuerPin,
  source,
  nonce,
  minimumRevision,
}) {
  if (
    (await digest(publicJwk)) !== issuerPin ||
    !Number.isSafeInteger(minimumRevision) ||
    minimumRevision < 1
  )
    throw Error("current-trust-pin");
  const p = result?.receipt?.payload;
  if (
    !p ||
    p.kind !== "freeze-current" ||
    !Number.isSafeInteger(p.revision) ||
    !Number.isSafeInteger(p.issued) ||
    !Number.isSafeInteger(p.expires) ||
    !/^([a-f0-9]{64})$/.test(p.windowHash || "") ||
    p.nonce !== nonce ||
    p.sourceDigest !== (await digest(source)) ||
    p.revision < minimumRevision ||
    p.state !== "SEALED" ||
    p.issued > Date.now() ||
    p.expires <= Date.now() ||
    p.expires - p.issued > 30000
  )
    throw Error("current-untrusted-or-stale");
  const key = await crypto.subtle.importKey(
    "jwk",
    publicJwk,
    { name: "Ed25519" },
    false,
    ["verify"],
  );
  if (
    !(await crypto.subtle.verify(
      "Ed25519",
      key,
      Uint8Array.from(atob(result.receipt.signature), (c) => c.charCodeAt(0)),
      new TextEncoder().encode(canonical(p)),
    ))
  )
    throw Error("current-signature");
  const b = result.bundle;
  if (
    !b ||
    b.windowHash !== p.windowHash ||
    (await digest(b.window)) !== p.windowHash ||
    b.window.payload.sequence !== p.revision ||
    b.window.payload.expires <= Date.now()
  )
    throw Error("current-window-binding");
  return structuredClone(b);
}
export function freezeReaders({
  coordinator,
  publicJwk,
  issuerPin,
  source,
  minimumRevision,
}) {
  let bundle;
  return {
    async readWindow() {
      const nonce = await digest(crypto.randomUUID());
      bundle = await verifyFreezeCurrent({
        result: await coordinator.current(nonce),
        publicJwk,
        issuerPin,
        source,
        nonce,
        minimumRevision,
      });
      return structuredClone(bundle.window);
    },
    async readWitness() {
      if (!bundle) throw Error("current-not-observed");
      return structuredClone(bundle.freeze);
    },
    async readReceipt(hash) {
      if (!bundle?.receipts[hash]) throw Error("current-receipt-missing");
      return structuredClone(bundle.receipts[hash]);
    },
  };
}
