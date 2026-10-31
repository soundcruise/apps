import fs from "./filesystem.mjs";
import path from "node:path";
import { backup, restore, verify } from "./core/adapter.mjs";
import {
  createBindingSource,
  createBindingTarget,
} from "./core/binding-provider.mjs";
import {
  durable,
  readJournal,
  digest,
  canonical,
  same,
  fail,
} from "./contracts.mjs";
import { inspectPreStudio } from "./prestudio-validator.mjs";
import { inspectStudioRelease } from "../../src/studio-release-schema.js";
import { fixedBatch } from "./ddl-plan.mjs";
const scopeFor = (identity, cutline) => ({ ...identity, cutline });
function bind(host, resources, operationId) {
  if (host.operationId !== operationId || resources.operationId !== operationId)
    fail("operation-owner-mismatch");
}
async function runBackupBody({
  host,
  resources,
  cutline,
  validator,
  operationId,
  resume = false,
}) {
  bind(host, resources, operationId);
  if (resources.role !== "source") fail("backup-role");
  await host.check();
  same(await resources.verifyIdentity(), resources.identity, "resource-drift");
  const pin = await cutline.assertCutline(),
    scope = scopeFor(resources.identity, pin.cutlineId),
    directory = await host.path("backup-" + operationId),
    intentFile = path.join(host.journals, "backup-" + operationId + ".json"),
    intent = {
      operationId,
      scope,
      grantId: resources.grantId,
      hostGrant: host.grantId,
    };
  if (resume) same(await readJournal(intentFile), intent, "resume-grant");
  else await durable(intentFile, intent);
  const source = createBindingSource({
    db: resources.db,
    bucket: resources.bucket,
    scope,
    assertCutline: async () => {
      const p = await cutline.assertCutline();
      if (p.cutlineId !== scope.cutline) fail("cutline-changed");
      await host.check();
      same(await resources.verifyIdentity(), resources.identity);
    },
    semanticValidator: validator,
  });
  const pages = source.pages.bind(source);
  source.pages = async function* () {
    for await (const p of pages()) {
      await cutline.assertCutline();
      await host.check();
      yield p;
      await cutline.assertCutline();
      await host.check();
    }
  };
  const receipt = await backup({
    directory,
    scope,
    keyHandle: host.getKey,
    source,
    resume,
  });
  const acceptance = cutline.finalizeBackup ? await cutline.finalizeBackup(receipt) : null;
  const value = {
    kind: "sealed-backup",
    ...(acceptance ? { maintenanceAcceptance: acceptance } : {}),
    operationId,
    directory,
    scope,
    ...receipt,
  };
  await durable(
    path.join(host.journals, "sealed-" + operationId + ".json"),
    value,
  );
  return value;
}
function archive(authority, envelope, scope, resources) {
  const p = authority.check(envelope, "archive", scope);
  if (
    p.operationId !== resources.operationId ||
    !p.receipt?.manifestHash ||
    !p.receipt?.scope
  )
    fail("archive-binding");
  if (!resources.source) fail("restore-source-missing");
  const d1 = resources.source.account + "/" + resources.source.d1,
    r2 =
      resources.source.account +
      "/" +
      (resources.source.r2.jurisdiction || "") +
      "/" +
      resources.source.r2.name +
      "/" +
      resources.source.r2.created;
  same(
    p.receipt.scope,
    { d1, r2, cutline: p.receipt.scope.cutline },
    "archive-source",
  );
  return p.receipt;
}
const denied = (xs) =>
  (xs || []).map((x) => ({
    d1: x.account + "/" + x.d1,
    r2:
      x.account +
      "/" +
      (x.r2?.jurisdiction || "") +
      "/" +
      (typeof x.r2 === "string" ? x.r2 : x.r2?.name) +
      "/" +
      (x.r2?.created || ""),
  }));
async function runRestoreBody({
  authority,
  archiveEnvelope,
  scope,
  host,
  resources,
  validator,
  operationId,
}) {
  bind(host, resources, operationId);
  if (resources.role !== "restore") fail("restore-role");
  await host.check();
  same(await resources.verifyIdentity(), resources.identity);
  const a = archive(authority, archiveEnvelope, scope, resources);
  await host.path(path.basename(a.directory)); // also check full path below
  const { contained } = await import("./contracts.mjs");
  await contained(host.root, a.directory);
  const target = host.guardTarget(
    createBindingTarget({
      db: resources.db,
      bucket: resources.bucket,
      identity: resources.identity,
      claimRoot: host.claims,
      stagingDirectory: await host.path("staging-" + operationId),
      semanticValidator: validator,
    }),
  );
  return restore({
    directory: a.directory,
    scope: a.scope,
    keyHandle: host.getKey,
    manifestHash: a.manifestHash,
    target,
    journalDirectory: path.join(host.journals, "restore-" + operationId),
    approvedTarget: resources.identity,
    forbiddenTargets: denied(resources.productionDenylist),
  });
}
async function reconcileRestoreBody({
  authority,
  archiveEnvelope,
  scope,
  host,
  resources,
  validator,
  operationId,
}) {
  bind(host, resources, operationId);
  if (resources.role !== "restore") fail("restore-role");
  await host.check();
  const a = archive(authority, archiveEnvelope, scope, resources);
  await (await import("./contracts.mjs")).contained(host.root, a.directory);
  const m = await verify({
    directory: a.directory,
    scope: a.scope,
    keyHandle: host.getKey,
    manifestHash: a.manifestHash,
  });
  const log = await readJournal(
    path.join(host.journals, "restore-" + operationId, "RESTORE.json"),
  );
  same(log.identity, resources.identity);
  if (log.manifestHash !== a.manifestHash) fail("restore-journal");
  same(await resources.verifyIdentity(), resources.identity);
  const read = createBindingSource({
    db: resources.db,
    bucket: resources.bucket,
    scope: resources.identity,
    assertCutline: async () => {},
    semanticValidator: validator,
  });
  await read.validate();
  same(await read.inventory(), m.inventory, "restore-inventory");
  let i = 0;
  for await (const page of read.pages()) {
    if (
      i >= m.pages.length ||
      digest(JSON.stringify(page)) !== m.pages[i++].plainHash
    )
      fail("restore-page");
  }
  if (i !== m.pages.length) fail("restore-missing-page");
  return {
    status: "RESTORED_READONLY_RECONCILED",
    manifestHash: a.manifestHash,
    identity: resources.identity,
  };
}
export async function reconcileDDL({ resources }) {
  same(await resources.verifyIdentity(), resources.identity);
  try {
    const s = await inspectStudioRelease(resources.db);
    if (s.baseProfile !== "production102") fail("ddl-profile");
    return { status: "APPLIED", ...s };
  } catch {}
  try {
    await inspectPreStudio(resources.db);
    return {
      status: "UNKNOWN",
      observed: "BASE_UNCHANGED",
      resendAllowed: false,
    };
  } catch {
    return {
      status: "UNKNOWN",
      observed: "PARTIAL_OR_UNKNOWN_SCHEMA",
      resendAllowed: false,
    };
  }
}
async function executeDDLBody({
  host,
  resources,
  operationId,
  restoreEvidence,
}) {
  bind(host, resources, operationId);
  if (resources.role !== "ddl") fail("ddl-role");
  await host.check();
  same(await resources.verifyIdentity(), resources.identity);
  const intent = path.join(host.journals, "ddl-" + operationId + ".json");
  // Existing intent always requires explicit read-only reconcile, never a second POST.
  try {
    await fs.lstat(intent);
    fail("ddl-already-attempted");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  try {
    await inspectPreStudio(resources.db);
  } catch {
    return {
      status: "NOT_APPLIED",
      reason: "precondition-rejected",
      sent: false,
    };
  }
  await durable(intent, {
    operationId,
    identity: resources.identity,
    restoreEvidenceHash: digest(restoreEvidence),
    state: "ATTEMPTED",
  });
  try {
    await resources.ddlBatch(fixedBatch(), restoreEvidence);
  } catch {
    return reconcileDDL({ resources });
  }
  return reconcileDDL({ resources });
}

export function runBackup(options) {
  return options.host.withIO
    ? options.host.withIO(() => runBackupBody(options))
    : runBackupBody(options);
}

export function runRestore(options) {
  return options.host.withIO
    ? options.host.withIO(() => runRestoreBody(options))
    : runRestoreBody(options);
}

export function reconcileRestore(options) {
  return options.host.withIO
    ? options.host.withIO(() => reconcileRestoreBody(options))
    : reconcileRestoreBody(options);
}

export function executeDDL(options) {
  return options.host.withIO
    ? options.host.withIO(() => executeDDLBody(options))
    : executeDDLBody(options);
}
