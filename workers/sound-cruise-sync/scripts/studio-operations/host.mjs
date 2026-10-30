import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { contained, same, fail, digest } from "./contracts.mjs";
import { checkMountedImage } from "./volume.mjs";
const run = promisify(execFile);
export async function keychainHandle({ service, account }) {
  if (!service || !account) fail("key-reference");
  return async () => {
    try {
      const r = await run(
        "/usr/bin/security",
        ["find-generic-password", "-s", service, "-a", account, "-w"],
        { maxBuffer: 1024 },
      );
      const key = Buffer.from(r.stdout.trim(), "base64");
      if (key.length !== 32) fail("key-format");
      return key;
    } catch {
      fail("key-handle-unavailable");
    }
  };
}
export async function observeMacHost(root) {
  const code =
    'import Foundation;let u=URL(fileURLWithPath:CommandLine.arguments[1]);let v=try u.resourceValues(forKeys:[.volumeUUIDStringKey,.volumeURLKey]);let b=try URL(fileURLWithPath:"/").resourceValues(forKeys:[.volumeUUIDStringKey]);guard v.volume?.path=="/",v.volumeUUIDString==b.volumeUUIDString else {exit(2)};print(v.volumeUUIDString ?? "")';
  try {
    const [v, f] = await Promise.all([
      run("/usr/bin/swift", ["-e", code, root]),
      run("/usr/bin/fdesetup", ["status"]),
    ]);
    return {
      volumeUUID: v.stdout.trim(),
      encrypted: f.stdout.includes("FileVault is On"),
    };
  } catch {
    fail("encrypted-volume-unverified");
  }
}
export async function openHost({
  authority,
  envelope,
  scope,
  root,
  keyHandle,
  observeFixture,
}) {
  envelope = structuredClone(envelope);
  scope = structuredClone(scope);
  if (envelope?.payload?.storageKind === "boot-fd-v1")
    return (await import("./boot-host.mjs")).openBootHost({
      authority,
      envelope,
      scope,
      root,
      keyHandle,
      observeFixture,
    });
  const p = authority.check(envelope, "host", scope);
  if (
    p.root !== root ||
    !p.keyId ||
    !p.custodian ||
    !p.independentRecoveryPin ||
    typeof keyHandle !== "function" ||
    !Number.isSafeInteger(p.minFreeBytes) ||
    !Number.isSafeInteger(p.maxStagingBytes) ||
    p.maxStagingBytes < 0
  )
    fail("host-approval");
  // Metadata alone cannot bind later path-based core I/O to a mounted filesystem.
  // Until descriptor-relative I/O is implemented, never execute this candidate on a real image.
  if (p.volume && !authority.synthetic) fail("image-io-pinning-unavailable");
  await contained(root, root);
  const initial = await fs.lstat(root);
  if (
    !initial.isDirectory() ||
    initial.uid !== process.getuid() ||
    (initial.mode & 0o077) !== 0
  )
    fail("host-permissions");
  const volume = p.volume
    ? await checkMountedImage({
        root,
        spec: p.volume,
        synthetic: authority.synthetic,
        observeFixture,
      })
    : authority.synthetic
      ? await observeFixture()
      : await observeMacHost(root);
  same(volume, { volumeUUID: p.volumeUUID, encrypted: true }, "host-volume");
  const anchors = new Map();
  async function anchor(dir) {
    await contained(root, dir);
    const st = await fs.lstat(dir);
    if (!st.isDirectory() || (st.mode & 0o077) !== 0) fail("host-directory");
    const id = [st.dev, st.ino, st.mode];
    const key = dir === root ? "root" : path.basename(dir);
    same(id, p.anchors?.[key], "host-approved-anchor");
    if (anchors.has(dir)) same(id, anchors.get(dir), "host-anchor-changed");
    else anchors.set(dir, id);
  }
  await anchor(root);
  for (const d of ["claims", "journals"]) await anchor(path.join(root, d));
  const grantId = p.id;
  const getKey = async () => {
    authority.check(envelope, "host", scope);
    await check();
    const k = await keyHandle();
    if (!Buffer.isBuffer(k) || k.length !== 32) fail("key-format");
    return k;
  };
  async function check() {
    if (p.volume)
      await checkMountedImage({
        root,
        spec: p.volume,
        synthetic: authority.synthetic,
        observeFixture,
      });
    authority.check(envelope, "host", scope);
    await contained(root, root);
    const st = await fs.lstat(root);
    same(
      [st.dev, st.ino, st.mode],
      [initial.dev, initial.ino, initial.mode],
      "host-root-changed",
    );
    for (const d of anchors.keys()) await anchor(d);
    const s = await fs.statfs(root, { bigint: true });
    if (s.bavail * s.bsize < BigInt(p.minFreeBytes)) fail("host-capacity");
  }
  return Object.freeze({
    root,
    grantId,
    operationId: p.operationId,
    claims: path.join(root, "claims"),
    journals: path.join(root, "journals"),
    getKey,
    check,
    async path(name) {
      if (!/^[a-zA-Z0-9_-]+$/.test(name)) fail("host-name");
      const v = path.join(root, name);
      await check();
      await contained(root, v);
      return v;
    },
    guardTarget(target) {
      return new Proxy(target, {
        get(t, k) {
          // Local memory cleanup must run even after Host identity/approval failure.
          if (k === "dispose" && typeof t[k] === "function")
            return t[k].bind(t);
          if (k === "apply")
            return async (records) => {
              await check();
              for (const r of records)
                if (
                  r.kind === "r2-start" &&
                  (!Number.isSafeInteger(r.size) ||
                    r.size < 0 ||
                    r.size > p.maxStagingBytes)
                )
                  fail("staging-budget");
              return t.apply(records);
            };
          if (k === "pages")
            return async function* (...a) {
              await check();
              for await (const page of t.pages(...a)) {
                await check();
                yield page;
              }
            };
          const v = t[k];
          return typeof v === "function"
            ? async (...a) => {
                await check();
                return v.apply(t, a);
              }
            : v;
        },
      });
    },
  });
}
