import { maintenanceCutline } from "./maintenance-window.mjs";
import { verifiedCutlineProvider } from "./verified-cutline.mjs";
// Explicit signed operation API. No automatic discovery, resource creation or default execution.
import { digest, fail, same, durable, readJournal } from "./contracts.mjs";
import { openHost } from "./host.mjs";
import { separatedKeyHandles } from "./key-handles.mjs";
import { connectResources } from "./transport.mjs";
import { preStudioValidator } from "./prestudio-validator.mjs";
import { cutlineProvider } from "./cutline.mjs";
import { runBackup, runRestore, reconcileRestore } from "./operations.mjs";
import path from "node:path";
export async function runApprovedOperation({
  authority,
  envelope,
  scope,
  hostEnvelope,
  resourceEnvelope,
  keyEnvelope,
  archiveEnvelope,
  inventory,
  readWitness,
  readWindow,
  readReceipt,
  fixture,
  readKeyFixture,
  observeFixture,
  maintenanceEnvelope,
  readFloor,
  casFloor,
  readDeployment,
}) {
  // Freeze caller-owned grants before the first await, including optional scopes.
  ({
    envelope,
    scope,
    hostEnvelope,
    resourceEnvelope,
    keyEnvelope,
    archiveEnvelope,
    inventory,
    maintenanceEnvelope,
  } = structuredClone({
    envelope,
    scope,
    hostEnvelope,
    resourceEnvelope,
    keyEnvelope,
    archiveEnvelope,
    inventory,
    maintenanceEnvelope,
  }));
  const p = authority.check(envelope, "execution", scope);
  if (
    !/^[A-Za-z0-9_-]{1,100}$/.test(p.operationId) ||
    !/^[A-Za-z0-9_-]{1,100}$/.test(p.id)
  )
    fail("execution-name");
  if (
    !["backup", "resume-backup", "restore", "reconcile-restore"].includes(
      p.action,
    )
  )
    fail("execution-action");
  if (
    !authority.synthetic &&
    ["backup", "resume-backup"].includes(p.action) &&
    (!/^[a-f0-9]{64}$/.test(p.cutlineWindowHash || "") ||
      [readWindow, readReceipt, readWitness].some(
        (f) => typeof f !== "function",
      ))
  )
    fail("production-cutline-provider-required");
  if (!authority.synthetic && ["backup", "resume-backup"].includes(p.action)) {
    if (
      !maintenanceEnvelope ||
      [readFloor, casFloor, readDeployment].some((f) => typeof f !== "function")
    )
      fail("production-maintenance-floor-required");
    same(
      p.bindings?.maintenance,
      digest(maintenanceEnvelope),
      "execution-maintenance-binding",
    );
    const m = authority.check(maintenanceEnvelope, "maintenance-window", scope);
    if (m.operationId !== p.operationId || m.windowHash !== p.cutlineWindowHash)
      fail("execution-maintenance-window");
  }
  for (const [name, x] of Object.entries({
    host: hostEnvelope,
    resources: resourceEnvelope,
    keys: keyEnvelope,
    archive: archiveEnvelope ?? null,
    inventory: inventory ?? null,
  }))
    same(p.bindings?.[name], digest(x), "execution-binding");
  if (!/^[0-9a-f]{64}$/.test(p.journalHash || "")) fail("execution-journal");
  if (!authority.synthetic && (fixture || readKeyFixture || observeFixture))
    fail("production-provider-injection");
  if (
    !authority.synthetic &&
    !hostEnvelope.payload.volume &&
    hostEnvelope.payload.storageKind !== "boot-fd-v1"
  )
    fail("execution-dedicated-volume-required");
  const keys = separatedKeyHandles({
    authority,
    envelope: keyEnvelope,
    scope,
    readFixture: readKeyFixture,
  });
  if (
    keys.operationId !== p.operationId ||
    hostEnvelope.payload.keyId !== keyEnvelope.payload.handles.archive.keyId
  )
    fail("execution-key-binding");
  if (
    hostEnvelope.payload.storageKind === "boot-fd-v1" &&
    (keyEnvelope.payload.hostKind !== "boot-fd-v1" ||
      hostEnvelope.payload.keyMaterialSHA256 !==
        keyEnvelope.payload.handles.archive.materialSHA256)
  )
    fail("execution-boot-key-binding");
  const host = await openHost({
    authority,
    envelope: hostEnvelope,
    scope,
    root: hostEnvelope.payload.root,
    keyHandle: keys.archive,
    observeFixture,
  });
  try {
    return await (host.withIO || ((fn) => fn()))(async () => {
      const backupAction = ["backup", "resume-backup"].includes(p.action);
      if (p.action === "resume-backup") {
        if (
          !/^[A-Za-z0-9_-]{1,100}$/.test(p.priorGrantId || "") ||
          !["backup", "resume-backup"].includes(p.priorAction)
        )
          fail("resume-prior");
        const prior = await readJournal(
          path.join(
            host.journals,
            `execution-${p.operationId}-${p.priorAction}-${p.priorGrantId}.json`,
          ),
        );
        same(digest(prior), p.priorIntentHash, "resume-prior-hash");
        same(prior.bindings, p.bindings, "resume-bindings");
      }
      // Claim before remote I/O; any later failure is explicit and never an automatic resend.
      await durable(
        path.join(
          host.journals,
          "execution-" + p.operationId + "-" + p.action + "-" + p.id + ".json",
        ),
        {
          grant: p.id,
          action: p.action,
          operationId: p.operationId,
          packetHash: digest(envelope),
          bindings: p.bindings,
          state: "ATTEMPTED",
        },
      );
      const resources = await connectResources({
        authority,
        envelope: resourceEnvelope,
        scope,
        role: backupAction ? "source" : "restore",
        tokenHandle: keys.management,
        s3Credentials: keys.s3,
        fixture,
      });
      try {
        if (!authority.synthetic && backupAction) {
          const m = authority.check(
            maintenanceEnvelope,
            "maintenance-window",
            scope,
          );
          same(
            m.sourceDigest,
            digest(resources.identity),
            "maintenance-source-identity",
          );
        }
        const validator = preStudioValidator({
          bucket: resources.bucket,
          expectedJournalHash: p.journalHash,
          hash: digest,
        });
        if (backupAction)
          return await runBackup({
            host,
            resources,
            validator,
            resume: p.action === "resume-backup",
            operationId: p.operationId,
            cutline: authority.synthetic
              ? cutlineProvider({
                  authority,
                  scope,
                  inventory,
                  operationId: p.operationId,
                  readWitness,
                })
              : maintenanceCutline({
                  authority,
                  envelope: maintenanceEnvelope,
                  scope,
                  readFloor,
                  casFloor,
                  readDeployment,
                  claimFinalization: (intent) =>
                    durable(
                      path.join(
                        host.journals,
                        "maintenance-finalize-" + p.operationId + ".json",
                      ),
                      {
                        kind: "maintenance-finalization-attempt",
                        operationId: p.operationId,
                        bindingHash: digest(maintenanceEnvelope),
                        intent,
                      },
                    ),
                  cutline: verifiedCutlineProvider({
                    authority,
                    scope,
                    inventory,
                    operationId: p.operationId,
                    source: resources.identity,
                    expectedWindowHash: p.cutlineWindowHash,
                    readWindow,
                    readReceipt,
                    readWitness,
                  }),
                }),
          });
        return await (p.action === "restore" ? runRestore : reconcileRestore)({
          authority,
          archiveEnvelope,
          scope,
          host,
          resources,
          validator,
          operationId: p.operationId,
        });
      } finally {
        resources.close();
      }
    });
  } finally {
    host.close?.();
  }
}
