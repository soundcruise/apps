// Boot volume mode: no attach/detach, no fallback to path-based archive writes.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import path from "node:path";
import { fail, same } from "./contracts.mjs";
import { openPinnedFilesystem } from "./pinned-filesystem.mjs";
import { withFilesystem } from "./filesystem.mjs";
import { ARCHIVE_METADATA_RESERVE } from "./archive-budget.mjs";
const run = promisify(execFile);
export async function observeBootVolume(root) {
  const code =
    'import Foundation;import Darwin;let u=URL(fileURLWithPath:CommandLine.arguments[1]);let v=try u.resourceValues(forKeys:[.volumeUUIDStringKey]);var s=stat();guard lstat(u.path,&s)==0 else{exit(2)};let j:[String:Any] = ["volumeUUID":v.volumeUUIDString ?? "","dev":Int(s.st_dev)];print(String(data:try JSONSerialization.data(withJSONObject:j),encoding:.utf8)!)';
  try {
    const [v, f] = await Promise.all([
      run("/usr/bin/swift", ["-e", code, root], {
        timeout: 30000,
        maxBuffer: 4096,
      }),
      run("/usr/bin/fdesetup", ["status"], { timeout: 10000, maxBuffer: 4096 }),
    ]);
    return {
      ...JSON.parse(v.stdout),
      encrypted: f.stdout.trim() === "FileVault is On.",
    };
  } catch {
    fail("boot-encryption-unverified");
  }
}
export async function openBootHost({
  authority,
  envelope,
  scope,
  root,
  keyHandle,
  observeFixture,
}) {
  envelope = structuredClone(envelope);
  scope = structuredClone(scope);
  const p = authority.check(envelope, "host", scope);
  if (
    p.storageKind !== "boot-fd-v1" ||
    p.volume ||
    p.root !== root ||
    !p.keyId ||
    !p.custodian ||
    !p.independentRecoveryPin ||
    !p.volumeUUID ||
    typeof keyHandle !== "function" ||
    !Number.isSafeInteger(p.minFreeBytes) ||
    p.minFreeBytes < 0 ||
    !Number.isSafeInteger(p.maxStagingBytes) ||
    p.maxStagingBytes < 0 ||
    !/^[a-f0-9]{64}$/.test(p.keyMaterialSHA256 || "") ||
    (p.maxArchiveBytes !== undefined && (!Number.isSafeInteger(p.maxArchiveBytes) || p.maxArchiveBytes <= ARCHIVE_METADATA_RESERVE))
  )
    fail("boot-host-approval");
  if (observeFixture && !authority.synthetic)
    fail("production-observer-injection");
  const io = openPinnedFilesystem({
    root,
    anchors: p.anchors,
    filesystem: p.filesystem,
    addonPath: p.addonPath,
    addonSHA256: p.addonSHA256,
    minFreeBytes: p.minFreeBytes,
  });
  try {
    const v = authority.synthetic
      ? await observeFixture()
      : await observeBootVolume(root);
    same(
      v,
      { volumeUUID: p.volumeUUID, encrypted: true, dev: p.anchors.root[0] },
      "boot-encryption-identity",
    );
    io.check();
  } catch (e) {
    io.close();
    throw e;
  }
  const check = async () => {
    authority.check(envelope, "host", scope);
    io.check();
  };
  return Object.freeze({
    root,
    claims: path.join(root, "claims"),
    journals: path.join(root, "journals"),
    operationId: p.operationId,
    grantId: p.id,
    storageKind: p.storageKind,
    maxArchiveBytes: p.maxArchiveBytes,
    withIO: (fn) =>
      withFilesystem(io, async () => {
        try {
          return await fn();
        } catch (e) {
          if (io.hasMutation()) {
            e.outcome = "UNKNOWN";
            e.retryAllowed = false;
          }
          throw e;
        }
      }),
    close: () => io.close(),
    check,
    async getKey() {
      await check();
      const b = await keyHandle();
      try {
        if (
          !Buffer.isBuffer(b) ||
          b.length !== 32 ||
          createHash("sha256").update(b).digest("hex") !== p.keyMaterialSHA256
        )
          fail("key-material-drift");
        await check();
        return b;
      } catch (e) {
        if (Buffer.isBuffer(b)) b.fill(0);
        throw e;
      }
    },
    async path(name) {
      if (!/^[A-Za-z0-9_-]+$/.test(name)) fail("host-name");
      await check();
      return path.join(root, name);
    },
    guardTarget(target) {
      return new Proxy(target, {
        get(t, k) {
          // Local memory cleanup must run even after Host identity/approval failure.
          if (k === "dispose" && typeof t[k] === "function")
            return t[k].bind(t);
          const v = t[k];
          if (k === "pages")
            return async function* (...args) {
              await check();
              for await (const page of v.apply(t, args)) {
                await check();
                yield page;
              }
            };
          if (typeof v !== "function") return v;
          return async (...args) => {
            await check();
            if (k === "apply")
              for (const r of args[0])
                if (
                  r.kind === "r2-start" &&
                  (!Number.isSafeInteger(r.size) ||
                    r.size < 0 ||
                    r.size > p.maxStagingBytes)
                )
                  fail("object-budget");
            const x = await v.apply(t, args);
            await check();
            return x;
          };
        },
      });
    },
  });
}
