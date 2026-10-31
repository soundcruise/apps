import { verify, createPublicKey } from "node:crypto";
import { canonical, digest } from "./contracts.mjs";
const hex = /^[a-f0-9]{64}$/;
const fail = () => {
  throw Error("freeze-open-plan-hold");
};

// Pure preparation compiler. It never discovers credentials, writes resources, or grants deployment authority.
export function prepareFreezeOpen({
  baseProfile,
  accountId,
  r2Metadata,
  namespaceId,
  certificate,
  externalPublicJwk,
  operatorPublicJwk,
  receiptPublicJwk,
  workerArtifactHash,
  ownerId,
  limits,
  rpcTimeoutMs,
  controlWorker = "sound-cruise-sync-freeze-control",
  capacityApproval,
  observedSecrets,
  privateGateway,
  currentFloor,
  synthetic = false,
}) {
  const blockers = [];
  if (
    digest(baseProfile) !==
    "14343e284cb084e3b9062284deb0ad1d7598f79df4d2aa5442d21282dd512c9c"
  )
    fail();
  if (
    baseProfile?.name !== "sound-cruise-sync" ||
    baseProfile.vars?.STUDIO_RELEASE_ROUTE_ENABLED !== "false" ||
    baseProfile.durable_objects ||
    baseProfile.services
  )
    fail();
  if (
    !/^[a-f0-9]{32}$/.test(accountId || "") ||
    !/^[a-z0-9-]+$/.test(controlWorker) ||
    controlWorker === baseProfile.name ||
    typeof ownerId !== "string" ||
    !ownerId ||
    !hex.test(workerArtifactHash || "")
  )
    fail();
  if (
    !Number.isSafeInteger(rpcTimeoutMs) ||
    rpcTimeoutMs < 20 ||
    rpcTimeoutMs > 10000
  )
    fail();
  if (
    !limits ||
    ![
      "maxInvocations",
      "maxEffects",
      "effectsPerInvocation",
      "maxActive",
      "warnPercent",
    ].every((k) => Number.isSafeInteger(limits[k]) && limits[k] > 0) ||
    limits.maxInvocations > 10000000 ||
    limits.maxEffects > 100000000 ||
    limits.maxActive > 2048 ||
    limits.effectsPerInvocation > 10000 ||
    limits.maxEffects < limits.effectsPerInvocation ||
    limits.warnPercent >= 100
  )
    fail();
  const authorityKeys = [
    externalPublicJwk,
    operatorPublicJwk,
    receiptPublicJwk,
  ];
  if (authorityKeys.some((key) => !key))
    blockers.push("authority-public-roots");
  else {
    for (const key of [externalPublicJwk, operatorPublicJwk, receiptPublicJwk])
      if (
        key?.kty !== "OKP" ||
        key.crv !== "Ed25519" ||
        typeof key.x !== "string" ||
        !/^[A-Za-z0-9_-]{43}$/.test(key.x) ||
        Buffer.from(key.x, "base64url").length !== 32 ||
        Buffer.from(key.x, "base64url").toString("base64url") !== key.x ||
        key.d
      )
        fail();
    if (
      new Set(
        [externalPublicJwk, operatorPublicJwk, receiptPublicJwk].map((key) =>
          digest({ kty: key.kty, crv: key.crv, x: key.x }),
        ),
      ).size !== 3
    )
      fail();
  }
  const db = baseProfile.d1_databases,
    buckets = baseProfile.r2_buckets;
  if (
    db?.length !== 1 ||
    db[0].binding !== "SYNC_DB" ||
    !db[0].database_id ||
    buckets?.length !== 1 ||
    buckets[0].binding !== "SYNC_ASSETS"
  )
    fail();
  if (
    !r2Metadata ||
    r2Metadata.accountId !== accountId ||
    r2Metadata.name !== buckets[0].bucket_name ||
    !r2Metadata.creationDate ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(
      r2Metadata.creationDate,
    ) ||
    !Number.isFinite(Date.parse(r2Metadata.creationDate)) ||
    !["default", "eu", "us", "fedramp", "fedramp-high"].includes(
      r2Metadata.jurisdiction,
    )
  )
    blockers.push("source-r2-physical-metadata");
  if (!/^[a-f0-9]{32}$/.test(namespaceId || ""))
    blockers.push("physical-namespace-id");
  if (
    !capacityApproval?.evidenceHash ||
    !hex.test(capacityApproval.evidenceHash) ||
    capacityApproval.maxRetentionDays <= 0 ||
    !Number.isSafeInteger(capacityApproval.maxRetentionDays) ||
    !capacityApproval.custodian
  )
    blockers.push("approved-capacity-retention-monitoring");
  if (
    !Array.isArray(observedSecrets) ||
    !observedSecrets.length ||
    observedSecrets.some((x) => typeof x !== "string" || !x)
  )
    blockers.push("existing-secret-name-readback");
  if (
    !privateGateway?.accessEvidenceHash ||
    !hex.test(privateGateway.accessEvidenceHash) ||
    !privateGateway.callerScript ||
    !privateGateway.httpsOrigin ||
    new URL(privateGateway.httpsOrigin).origin !== privateGateway.httpsOrigin ||
    new URL(privateGateway.httpsOrigin).protocol !== "https:"
  )
    blockers.push("private-https-service-caller");
  if (
    !currentFloor ||
    currentFloor.ownerId !== ownerId ||
    !Number.isSafeInteger(currentFloor.minimumRevision) ||
    currentFloor.minimumRevision < 0 ||
    !hex.test(currentFloor.evidenceHash || "") ||
    !currentFloor.independentStore
  )
    blockers.push("independent-current-floor");
  const source = r2Metadata?.creationDate
    ? {
        d1: accountId + "/" + db[0].database_id,
        r2:
          accountId +
          "/" +
          r2Metadata.jurisdiction +
          "/" +
          r2Metadata.name +
          "/" +
          r2Metadata.creationDate,
      }
    : null;
  const p = certificate?.payload;
  if (
    !externalPublicJwk ||
    !p ||
    p.kind !== "freeze-deployment" ||
    !source ||
    p.sourceDigest !== digest(source) ||
    p.namespaceId !== namespaceId ||
    p.workerArtifactHash !== workerArtifactHash ||
    p.namespaceName !== "source-" + digest(source) ||
    p.bindingNames?.d1 !== "SYNC_DB" ||
    p.bindingNames?.r2 !== "SYNC_ASSETS" ||
    !Number.isSafeInteger(p.issued) ||
    !Number.isSafeInteger(p.expires) ||
    p.issued > Date.now() ||
    p.expires <= Date.now() ||
    p.expires <= p.issued
  )
    blockers.push("deployment-certificate");
  else if (
    !verify(
      null,
      Buffer.from(canonical(p)),
      createPublicKey({ key: externalPublicJwk, format: "jwk" }),
      Buffer.from(certificate.signature || "", "base64"),
    )
  )
    fail();
  if (blockers.length)
    return {
      candidateOnly: true,
      productionEligible: false,
      profilesReady: false,
      blockers,
      source,
    };
  const config = {
    source,
    scope: { owner: ownerId },
    environment: synthetic ? "isolated" : "production",
    ownerId,
    namespaceId,
    workerArtifactHash,
    operatorPublicJwk,
    externalPublicJwk,
    limits,
  };
  const vars = {
    FREEZE_CONFIG: JSON.stringify(config),
    FREEZE_DEPLOYMENT_CERTIFICATE: JSON.stringify(certificate),
    FREEZE_RPC_TIMEOUT_MS: String(rpcTimeoutMs),
  };
  const product = structuredClone(baseProfile);
  product.main = "src/production-freeze-entry.js";
  product.vars = {
    ...product.vars,
    ...vars,
    STUDIO_RELEASE_ROUTE_ENABLED: "false",
  };
  product.durable_objects = {
    bindings: [
      {
        name: "FREEZE_COORDINATOR",
        class_name: "ProductionFreezeCoordinator",
        script_name: controlWorker,
      },
    ],
  };
  const control = {
    name: controlWorker,
    main: "src/production-freeze-control-entry.js",
    compatibility_date: "2026-10-31",
    workers_dev: false,
    preview_urls: false,
    routes: [],
    vars,
    durable_objects: {
      bindings: [
        {
          name: "FREEZE_COORDINATOR",
          class_name: "ProductionFreezeCoordinator",
        },
      ],
    },
    migrations: [
      {
        tag: "freeze-control-sqlite-v1",
        new_sqlite_classes: ["ProductionFreezeCoordinator"],
      },
    ],
    observability: {
      enabled: true,
      logs: { enabled: true, invocation_logs: true },
      traces: { enabled: true },
    },
  };
  return {
    candidateOnly: true,
    productionEligible: false,
    profilesReady: true,
    blockers: [],
    product,
    control,
    source,
    configHash: digest(config),
    currentFloor: structuredClone(currentFloor),
    preservedSecrets: [...observedSecrets].sort(),
    requiredControlSecret: "FREEZE_RECEIPT_PRIVATE_JWK",
    issuerPin: digest(receiptPublicJwk),
    operatorServiceBinding: {
      service: controlWorker,
      entrypoint: "FreezeOperatorGateway",
      caller: privateGateway.callerScript,
    },
    authorization:
      "Separate fixed-hash deployment approval and genuine metadata attestation required; this compiler cannot issue either.",
  };
}
