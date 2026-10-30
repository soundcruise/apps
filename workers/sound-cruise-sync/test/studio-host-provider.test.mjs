import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { generateKeyPairSync, sign } from "node:crypto";
import {
  authority,
  canonical,
  digest,
} from "../scripts/studio-operations/contracts.mjs";
import { checkMountedImage } from "../scripts/studio-operations/volume.mjs";
import { openHost } from "../scripts/studio-operations/host.mjs";
import { separatedKeyHandles } from "../scripts/studio-operations/key-handles.mjs";
import { runApprovedOperation } from "../scripts/studio-operations/runner.mjs";
if (!process.env.STUDIO_HOST_OUTPUT)
  test(
    "explicit synthetic host acceptance",
    { skip: "STUDIO_HOST_OUTPUT required" },
    () => {},
  );
else {
  const out = path.resolve(process.env.STUDIO_HOST_OUTPUT);
  await fs.mkdir(out, { mode: 0o700 });
  const mount = out + "/mount",
    root = mount + "/backup",
    image = out + "/image";
  await fs.mkdir(mount, { mode: 0o700 });
  await fs.mkdir(root, { mode: 0o700 });
  await fs.writeFile(image, "synthetic-image", { mode: 0o600 });
  for (const n of ["claims", "journals"])
    await fs.mkdir(root + "/" + n, { mode: 0o700 });
  const anchor = async (p) => {
      const s = await fs.lstat(p);
      return [s.dev, s.ino, s.mode];
    },
    spec = {
      kind: "apfs-encrypted-image",
      mountPoint: mount,
      imagePath: image,
      volumeUUID: "image-volume",
      sourceVolumeUUID: "boot-volume",
      deviceIdentifier: "disk-fixture",
      mountAnchor: await anchor(mount),
      imageAnchor: await anchor(image),
    };
  const obs = () => ({
    volumeUUID: "image-volume",
    mountPoint: mount,
    deviceIdentifier: "disk-fixture",
    filesystem: "apfs",
    encrypted: true,
    locked: false,
    imageAttached: true,
  });
  const good = {
    root,
    spec,
    synthetic: true,
    observeFixture: async () => obs(),
  };
  const kp = generateKeyPairSync("ed25519"),
    pub = kp.publicKey.export({ type: "spki", format: "pem" }),
    a = authority({ publicKey: pub, rootHash: digest(pub), synthetic: true }),
    scope = { owner: "fixture", operationId: "fixture-op" };
  let serial = 0;
  function grant(kind, extra = {}) {
    const p = {
      kind,
      synthetic: true,
      id: "g" + ++serial,
      operationId: "fixture-op",
      scope: digest(scope),
      issued: Date.now() - 1000,
      expires: Date.now() + 60000,
      ...extra,
    };
    return {
      payload: p,
      signature: sign(null, Buffer.from(canonical(p)), kp.privateKey).toString(
        "base64",
      ),
    };
  }
  await test("approved encrypted image observation", async () =>
    assert.deepEqual(await checkMountedImage(good), {
      volumeUUID: "image-volume",
      encrypted: true,
    }));
  for (const [field, value] of Object.entries({
    volumeUUID: "other",
    encrypted: false,
    locked: true,
    imageAttached: false,
    mountPoint: out,
    filesystem: "hfs",
    deviceIdentifier: "other",
  }))
    await test("refuse observation " + field, async () =>
      assert.rejects(() =>
        checkMountedImage({
          ...good,
          observeFixture: async () => ({ ...obs(), [field]: value }),
        }),
      ),
    );
  await test("refuse source volume reuse", async () =>
    assert.rejects(() =>
      checkMountedImage({
        ...good,
        spec: { ...spec, sourceVolumeUUID: spec.volumeUUID },
      }),
    ));
  await test("path traversal refuses", async () =>
    assert.rejects(() =>
      checkMountedImage({ ...good, root: root + "/../backup" }),
    ));
  await test("symlink image refuses", async () => {
    await fs.rename(image, image + ".old");
    await fs.symlink(image + ".old", image);
    await assert.rejects(() => checkMountedImage(good));
    await fs.unlink(image);
    await fs.rename(image + ".old", image);
  });
  await test("image inode replacement refuses", async () => {
    await fs.rename(image, image + ".old");
    await fs.writeFile(image, "replacement", { mode: 0o600 });
    await assert.rejects(() => checkMountedImage(good));
    await fs.unlink(image);
    await fs.rename(image + ".old", image);
  });
  await test("observation race refuses", async () => {
    await assert.rejects(() =>
      checkMountedImage({
        ...good,
        observeFixture: async () => {
          await fs.rename(root, root + ".old");
          await fs.mkdir(root, { mode: 0o700 });
          return obs();
        },
      }),
    );
    await fs.rmdir(root);
    await fs.rename(root + ".old", root);
  });
  const hostGrant = grant("host", {
    root,
    volume: spec,
    volumeUUID: spec.volumeUUID,
    keyId: "archive-key",
    custodian: "fixture",
    independentRecoveryPin: digest("independent"),
    minFreeBytes: 0,
    maxStagingBytes: 1024,
    anchors: {
      root: await anchor(root),
      claims: await anchor(root + "/claims"),
      journals: await anchor(root + "/journals"),
    },
  });
  const host = await openHost({
    authority: a,
    envelope: hostGrant,
    scope,
    root,
    keyHandle: async () => Buffer.alloc(32, 1),
    observeFixture: async () => obs(),
  });
  await test("host rechecks mount before each operation", async () => {
    await host.check();
    await fs.rename(mount, mount + ".old");
    await fs.mkdir(mount, { mode: 0o700 });
    await assert.rejects(() => host.check());
    await fs.rmdir(mount);
    await fs.rename(mount + ".old", mount);
  });
  await test("claim root replacement refuses", async () => {
    const p = root + "/claims";
    await fs.rename(p, p + ".old");
    await fs.mkdir(p, { mode: 0o700 });
    await assert.rejects(() => host.check());
    await fs.rmdir(p);
    await fs.rename(p + ".old", p);
  });
  const handles = Object.fromEntries(
    ["archive", "volume", "management", "s3"].map((n) => [
      n,
      {
        service: "fixture-" + n,
        account: "fixture",
        keyId: n === "archive" ? "archive-key" : n,
        purpose: n,
      },
    ]),
  );
  let reads = [];
  const ke = grant("key-handles", {
    handles,
    custodian: "fixture",
    recoveryEvidenceHash: digest("offhost-recovery"),
  });
  const keyapi = () =>
    separatedKeyHandles({
      authority: a,
      envelope: ke,
      scope,
      readFixture: async (r) => {
        reads.push(r.service);
        if (r.service === "fixture-archive")
          return Buffer.alloc(32, 1).toString("base64");
        if (r.service === "fixture-s3")
          return JSON.stringify({
            accessKeyId: "fixture",
            secretAccessKey: "fixture",
          });
        return "fixture";
      },
    });
  await test("fresh archive buffers and no volume key retrieval", async () => {
    const k = keyapi(),
      x = await k.archive();
    x.fill(0);
    assert.equal((await k.archive())[0], 1);
    assert.ok(!reads.includes("fixture-volume"));
    assert.equal((await k.s3()).accessKeyId, "fixture");
  });
  await test("same Keychain reference rejected", () => {
    const e = grant("key-handles", {
      handles: {
        ...handles,
        volume: { ...handles.volume, service: handles.archive.service },
      },
      custodian: "fixture",
      recoveryEvidenceHash: "pin",
    });
    assert.throws(() =>
      separatedKeyHandles({
        authority: a,
        envelope: e,
        scope,
        readFixture: async () => "",
      }),
    );
  });
  await test("wrong purpose rejected", () => {
    const e = grant("key-handles", {
      handles: {
        ...handles,
        volume: { ...handles.volume, purpose: "archive" },
      },
      custodian: "fixture",
      recoveryEvidenceHash: "pin",
    });
    assert.throws(() =>
      separatedKeyHandles({
        authority: a,
        envelope: e,
        scope,
        readFixture: async () => "",
      }),
    );
  });
  await test("key error sanitized", async () => {
    const k = separatedKeyHandles({
      authority: a,
      envelope: ke,
      scope,
      readFixture: async () => {
        throw Error("sensitive-test-marker");
      },
    });
    await assert.rejects(
      () => k.archive(),
      (e) => e.message === "keychain-handle-unavailable",
    );
  });
  await test("invalid archive format rejected", async () =>
    assert.rejects(() =>
      separatedKeyHandles({
        authority: a,
        envelope: ke,
        scope,
        readFixture: async () => "invalid",
      }).archive(),
    ));
  await test("execution action and binding reject before network", async () => {
    await assert.rejects(() =>
      runApprovedOperation({
        authority: a,
        scope,
        envelope: grant("execution", { action: "deploy" }),
      }),
    );
    await assert.rejects(() =>
      runApprovedOperation({
        authority: a,
        scope,
        envelope: grant("execution", { action: "restore", bindings: {} }),
      }),
    );
  });
  await test("expired grant rejects", async () =>
    assert.rejects(() =>
      openHost({
        authority: a,
        envelope: grant("host", {
          ...hostGrant.payload,
          expires: Date.now() - 1,
        }),
        scope,
        root,
        keyHandle: async () => Buffer.alloc(32),
        observeFixture: async () => obs(),
      }),
    ));
  await test("caller envelope mutation cannot replace approved execution input", async () => {
    const res = grant("resources", {
        role: "source",
        resources: { account: "invalid" },
      }),
      e = grant("execution", {
        action: "backup",
        journalHash: "a".repeat(64),
        bindings: {
          host: digest(hostGrant),
          resources: digest(res),
          keys: digest(ke),
          archive: digest(null),
          inventory: digest(null),
        },
      });
    await assert.rejects(
      () =>
        runApprovedOperation({
          authority: a,
          envelope: e,
          scope,
          hostEnvelope: hostGrant,
          resourceEnvelope: res,
          keyEnvelope: ke,
          observeFixture: async () => {
            res.payload.role = "altered-after-approval";
            return obs();
          },
          readKeyFixture: async () => "fixture",
        }),
      (x) => x.code === "resource-approval",
    );
  });
  await test("real image operations refused until filesystem-pinned IO exists", async () => {
    const prod = authority({
      publicKey: pub,
      rootHash: digest(pub),
      synthetic: false,
    });
    const original = hostGrant.payload,
      body = { ...original, synthetic: false };
    const e = {
      payload: body,
      signature: sign(
        null,
        Buffer.from(canonical(body)),
        kp.privateKey,
      ).toString("base64"),
    };
    await assert.rejects(
      () =>
        openHost({
          authority: prod,
          envelope: e,
          scope,
          root,
          keyHandle: async () => Buffer.alloc(32),
        }),
      (x) => x.code === "image-io-pinning-unavailable",
    );
  });
  await test("temporary recovery copy decrypts and rotated key cannot impersonate old archive", async () => {
    const { randomBytes, createCipheriv, createDecipheriv } = await import(
      "node:crypto"
    );
    const k = randomBytes(32),
      recovery = Buffer.from(k),
      iv = randomBytes(12),
      c = createCipheriv("aes-256-gcm", k, iv);
    const body = Buffer.concat([c.update("synthetic-recovery"), c.final()]),
      tag = c.getAuthTag();
    k.fill(0);
    const decode = (key) => {
      const d = createDecipheriv("aes-256-gcm", key, iv);
      d.setAuthTag(tag);
      return Buffer.concat([d.update(body), d.final()]).toString();
    };
    assert.equal(decode(recovery), "synthetic-recovery");
    assert.throws(() => decode(randomBytes(32)));
    recovery.fill(0);
  });
}
