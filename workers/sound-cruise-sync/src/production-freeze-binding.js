import {
  maintenanceCanonical,
  maintenanceDigest,
} from "./maintenance-bridge-v2.js";
export async function freezeStub(env) {
  const cfg = JSON.parse(env.FREEZE_CONFIG),
    cert = JSON.parse(env.FREEZE_DEPLOYMENT_CERTIFICATE),
    p = cert.payload,
    sourceDigest = await maintenanceDigest(cfg.source),
    name = "source-" + sourceDigest;
  if (
    env.FREEZE_COORDINATOR_NAME !== undefined ||
    !env.FREEZE_COORDINATOR ||
    p?.kind !== "freeze-deployment" ||
    p.sourceDigest !== sourceDigest ||
    p.namespaceName !== name ||
    p.namespaceId !== cfg.namespaceId ||
    p.workerArtifactHash !== cfg.workerArtifactHash ||
    !cfg.namespaceId ||
    !cfg.workerArtifactHash ||
    p.bindingNames?.d1 !== "SYNC_DB" ||
    p.bindingNames?.r2 !== "SYNC_ASSETS" ||
    p.issued > Date.now() ||
    p.expires <= Date.now()
  )
    throw Error("freeze-deployment-binding");
  const key = await crypto.subtle.importKey(
    "jwk",
    cfg.externalPublicJwk,
    { name: "Ed25519" },
    false,
    ["verify"],
  );
  if (
    !(await crypto.subtle.verify(
      "Ed25519",
      key,
      Uint8Array.from(atob(cert.signature), (c) => c.charCodeAt(0)),
      new TextEncoder().encode(maintenanceCanonical(p)),
    ))
  )
    throw Error("freeze-deployment-signature");
  // Runtime bindings do not expose physical IDs: external deployment attestation MUST verify them.
  return env.FREEZE_COORDINATOR.getByName(name);
}
