import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { contained, same, fail } from "./contracts.mjs";
const run = promisify(execFile);
export async function observeMountedImage(spec) {
  try {
    const x = await run(
      "/usr/bin/swift",
      [
        fileURLToPath(new URL("./volume-observer.swift", import.meta.url)),
        spec.mountPoint,
        spec.imagePath,
      ],
      { maxBuffer: 8192, timeout: 30000 },
    );
    return JSON.parse(x.stdout);
  } catch {
    fail("volume-observation-unavailable");
  }
}
export async function checkMountedImage({
  root,
  spec,
  synthetic = false,
  observeFixture,
}) {
  spec = structuredClone(spec);
  if (
    !spec ||
    spec.kind !== "apfs-encrypted-image" ||
    !spec.volumeUUID ||
    !spec.deviceIdentifier ||
    !spec.sourceVolumeUUID ||
    spec.volumeUUID === spec.sourceVolumeUUID ||
    spec.mountPoint === "/" ||
    root === spec.mountPoint
  )
    fail("volume-approval");
  await contained(spec.mountPoint, root);
  await contained(path.dirname(spec.imagePath), spec.imagePath);
  const mount = await fs.lstat(spec.mountPoint),
    image = await fs.lstat(spec.imagePath),
    r = await fs.lstat(root);
  if (
    !mount.isDirectory() ||
    (!image.isFile() && !image.isDirectory()) ||
    image.isSymbolicLink() ||
    mount.uid !== process.getuid() ||
    r.uid !== process.getuid() ||
    image.uid !== process.getuid() ||
    image.mode & 0o077
  )
    fail("volume-permissions");
  same([mount.dev, mount.ino, mount.mode], spec.mountAnchor, "mount-anchor");
  same([image.dev, image.ino, image.mode], spec.imageAnchor, "image-anchor");
  if (r.dev !== mount.dev) fail("root-volume-boundary");
  const observed = synthetic
    ? await observeFixture()
    : await observeMountedImage(spec);
  same(
    observed,
    {
      volumeUUID: spec.volumeUUID,
      mountPoint: spec.mountPoint,
      deviceIdentifier: spec.deviceIdentifier,
      filesystem: "apfs",
      encrypted: true,
      locked: false,
      imageAttached: true,
    },
    "volume-identity",
  );
  const [m2, i2, r2] = await Promise.all([
    fs.lstat(spec.mountPoint),
    fs.lstat(spec.imagePath),
    fs.lstat(root),
  ]);
  for (const [a, b] of [
    [mount, m2],
    [image, i2],
    [r, r2],
  ])
    same(
      [a.dev, a.ino, a.mode],
      [b.dev, b.ino, b.mode],
      "volume-observation-race",
    );
  return { volumeUUID: spec.volumeUUID, encrypted: true };
}
