import { openHost } from "../scripts/studio-operations/host.mjs";
import { separatedKeyHandles } from "../scripts/studio-operations/key-handles.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { randomBytes, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { openPinnedFilesystem } from "../scripts/studio-operations/pinned-filesystem.mjs";
import { withFilesystem } from "../scripts/studio-operations/filesystem.mjs";
import { backup, verify } from "../scripts/studio-operations/core/adapter.mjs";
import { observeBootVolume } from "../scripts/studio-operations/boot-host.mjs";
const out = process.env.STUDIO_BOOT_TEST_OUTPUT,
  addonPath = process.env.STUDIO_PINNED_FS_ADDON;
if (!out || !addonPath)
  throw Error("explicit-isolated-output-and-native-addon-required");
fs.mkdirSync(out, { mode: 0o700 });
const addon = createRequire(import.meta.url)(addonPath),
  H = (b) => createHash("sha256").update(b).digest("hex"),
  addonSHA256 = H(fs.readFileSync(addonPath));
function config() {
  const root = fs.mkdtempSync(path.join(out, "host-"));
  fs.chmodSync(root, 0o700);
  for (const n of ["claims", "journals"])
    fs.mkdirSync(root + "/" + n, { mode: 0o700 });
  const anchors = {};
  for (const n of ["root", "claims", "journals"]) {
    const s = fs.statSync(n === "root" ? root : root + "/" + n);
    anchors[n] = [s.dev, s.ino, s.mode];
  }
  const fd = fs.openSync(root, "r"),
    x = addon.info(fd);
  fs.closeSync(fd);
  return {
    root,
    anchors,
    addonPath,
    addonSHA256,
    filesystem: { fsid: x.fsid, mount: x.mount, type: x.type },
    minFreeBytes: 1,
  };
}
async function each(fn) {
  const c = config(),
    io = openPinnedFilesystem(c);
  try {
    await fn(io, c);
  } finally {
    io.close();
  }
}
const scope = {
  d1: "synthetic-source-d1",
  r2: "synthetic-source-r2",
  cutline: "synthetic-frozen",
};
const source = {
  async assertCutline() {},
  async inventory() {
    return { count: 3 };
  },
  async validate() {},
  async *pages() {
    for (let i = 0; i < 3; i++)
      yield [{ kind: "synthetic", i, data: "PRIVATE_SYNTHETIC_" + i }];
  },
};
await test("native anchored create/read/atomic rename/fsync/permissions", () =>
  each(async (io, c) => {
    await io.mkdir(c.root + "/a");
    const f = await io.open(c.root + "/a/test", "wx");
    await f.writeFile("safe");
    await f.sync();
    await f.close();
    await io.rename(c.root + "/a/test", c.root + "/a/final");
    assert.equal((await io.readFile(c.root + "/a/final")).toString(), "safe");
    assert.equal((await io.lstat(c.root + "/a/final")).mode & 0o777, 0o600);
  }));
await test("absolute traversal and outside path rejected", () =>
  each(async (io, c) => {
    await assert.rejects(io.open(c.root + "/../outside", "wx"));
    await assert.rejects(io.readFile("/etc/passwd"));
  }));
await test("symlink leaf rejected on create and read", () =>
  each(async (io, c) => {
    fs.symlinkSync("/dev/null", c.root + "/link");
    await assert.rejects(io.open(c.root + "/link", "wx"));
    await assert.rejects(io.readFile(c.root + "/link"));
  }));
await test("symlink directory rejected", () =>
  each(async (io, c) => {
    fs.symlinkSync(out, c.root + "/link");
    await assert.rejects(io.open(c.root + "/link/new", "wx"));
  }));
await test("hardlinked private regular file rejected", () =>
  each(async (io, c) => {
    fs.writeFileSync(c.root + "/one", "x", { mode: 0o600 });
    fs.linkSync(c.root + "/one", c.root + "/two");
    await assert.rejects(io.readFile(c.root + "/two"));
  }));
await test("world-readable file refused", () =>
  each(async (io, c) => {
    fs.writeFileSync(c.root + "/file", "x", { mode: 0o644 });
    await assert.rejects(io.readFile(c.root + "/file"));
  }));
await test("unapproved filesystem identity rejected", () => {
  const c = config();
  assert.throws(() =>
    openPinnedFilesystem({
      ...c,
      filesystem: { ...c.filesystem, fsid: "other" },
    }),
  );
});
await test("nonboot mount approval refused", () => {
  const c = config();
  assert.throws(() =>
    openPinnedFilesystem({
      ...c,
      filesystem: { ...c.filesystem, mount: "/Volumes/unapproved" },
    }),
  );
});
await test("root inode approval mismatch refused", () => {
  const c = config();
  assert.throws(() =>
    openPinnedFilesystem({ ...c, anchors: { ...c.anchors, root: [0, 1, 2] } }),
  );
});
await test("helper hash mismatch refused", () => {
  const c = config();
  assert.throws(() =>
    openPinnedFilesystem({ ...c, addonSHA256: "0".repeat(64) }),
  );
});
await test("claim-root flock conflict and release", () =>
  each(async (io, c) => {
    assert.throws(() => openPinnedFilesystem(c), /locked/);
    io.close();
    const next = openPinnedFilesystem(c);
    next.close();
  }));
await test("descriptor fstatfs free-space requirement rejects", () => {
  const c = config();
  assert.throws(
    () => openPinnedFilesystem({ ...c, minFreeBytes: Number.MAX_SAFE_INTEGER }),
    /capacity/,
  );
});
await test("root rename before I/O rejects substituted directory", () =>
  each(async (io, c) => {
    fs.renameSync(c.root, c.root + "-moved");
    fs.mkdirSync(c.root, { mode: 0o700 });
    await assert.rejects(io.open(c.root + "/new", "wx"));
    assert.deepEqual(fs.readdirSync(c.root), []);
  }));
await test("rename exactly between check and write stays on pinned old inode and rejects success", () =>
  each(async (io, c) => {
    const f = await io.open(c.root + "/opened", "wx"),
      write = fs.writeSync;
    let armed = true;
    fs.writeSync = function (...args) {
      if (armed) {
        armed = false;
        fs.renameSync(c.root, c.root + "-old");
        fs.mkdirSync(c.root, { mode: 0o700 });
      }
      return write.apply(fs, args);
    };
    try {
      await assert.rejects(f.writeFile("synthetic-old-object"));
      assert.equal(
        fs.readFileSync(c.root + "-old/opened", "utf8"),
        "synthetic-old-object",
      );
      assert.deepEqual(fs.readdirSync(c.root), []);
    } finally {
      fs.writeSync = write;
      await f.close();
    }
  }));
await test("claims directory replacement refused without writing replacement", () =>
  each(async (io, c) => {
    fs.renameSync(c.root + "/claims", c.root + "/oldclaims");
    fs.mkdirSync(c.root + "/claims", { mode: 0o700 });
    await assert.rejects(io.open(c.root + "/claims/new", "wx"));
    assert.deepEqual(fs.readdirSync(c.root + "/claims"), []);
  }));
await test("syscall ENOSPC is a failure and does not become ACK", () =>
  each(async (io, c) => {
    const f = await io.open(c.root + "/partial", "wx"),
      write = fs.writeSync;
    fs.writeSync = () => {
      throw Object.assign(Error("synthetic disk-full"), { code: "ENOSPC" });
    };
    try {
      await assert.rejects(f.writeFile("synthetic"), { code: "ENOSPC" });
    } finally {
      fs.writeSync = write;
      await f.close();
    }
  }));
await test("closed host does not fall back to path I/O", () =>
  each(async (io, c) => {
    io.close();
    await assert.rejects(io.open(c.root + "/late", "wx"), /closed/);
  }));
await test("encrypted backup verified with no plaintext body staging", () =>
  each(async (io, c) => {
    const key = randomBytes(32),
      directory = c.root + "/archive";
    await withFilesystem(io, async () => {
      const r = await backup({
        directory,
        scope,
        keyHandle: async () => Buffer.from(key),
        source,
      });
      const m = await verify({
        directory,
        scope,
        keyHandle: async () => Buffer.from(key),
        manifestHash: r.manifestHash,
      });
      assert.equal(m.pages.length, 3);
      for (const p of m.pages)
        assert.equal(
          fs
            .readFileSync(directory + "/" + p.name)
            .includes(Buffer.from("PRIVATE_SYNTHETIC")),
          false,
        );
    });
    key.fill(0);
  }));
await test("AEAD tamper and missing page refuse verify", () =>
  each(async (io, c) => {
    const key = randomBytes(32),
      directory = c.root + "/archive";
    await withFilesystem(io, async () => {
      const r = await backup({
        directory,
        scope,
        keyHandle: async () => Buffer.from(key),
        source,
      });
      const p = directory + "/page-00000000.aesgcm",
        saved = fs.readFileSync(p),
        bad = Buffer.from(saved);
      bad[20] ^= 1;
      fs.writeFileSync(p, bad);
      await assert.rejects(
        verify({
          directory,
          scope,
          keyHandle: async () => Buffer.from(key),
          manifestHash: r.manifestHash,
        }),
      );
      fs.writeFileSync(p, saved);
      fs.unlinkSync(directory + "/page-00000001.aesgcm");
      await assert.rejects(
        verify({
          directory,
          scope,
          keyHandle: async () => Buffer.from(key),
          manifestHash: r.manifestHash,
        }),
      );
    });
    key.fill(0);
  }));
await test("lost and wrong key never bypass AEAD", () =>
  each(async (io, c) => {
    const key = randomBytes(32),
      directory = c.root + "/archive";
    await withFilesystem(io, async () => {
      const r = await backup({
        directory,
        scope,
        keyHandle: async () => Buffer.from(key),
        source,
      });
      await assert.rejects(
        verify({
          directory,
          scope,
          keyHandle: async () => {
            throw Error("key lost");
          },
          manifestHash: r.manifestHash,
        }),
      );
      await assert.rejects(
        verify({
          directory,
          scope,
          keyHandle: async () => randomBytes(32),
          manifestHash: r.manifestHash,
        }),
      );
    });
    key.fill(0);
  }));
await test("crashed child checkpoint resumes only with same approved identity and key", async () => {
  const c = config(),
    key = randomBytes(32),
    directory = c.root + "/archive";
  const childCode = `import{openPinnedFilesystem}from ${JSON.stringify(new URL("../scripts/studio-operations/pinned-filesystem.mjs", import.meta.url).href)};import{withFilesystem}from ${JSON.stringify(new URL("../scripts/studio-operations/filesystem.mjs", import.meta.url).href)};import{backup}from ${JSON.stringify(new URL("../scripts/studio-operations/core/adapter.mjs", import.meta.url).href)};let s='';for await(const b of process.stdin)s+=b;const x=JSON.parse(s),io=openPinnedFilesystem(x.config);await withFilesystem(io,()=>backup({directory:x.directory,scope:x.scope,keyHandle:async()=>Buffer.from(x.key,'base64'),source:{async assertCutline(){},async inventory(){return{count:3}},async validate(){},async*pages(){for(let i=0;i<3;i++)yield[{kind:'synthetic',i,data:'PRIVATE_SYNTHETIC_'+i}]}},afterCheckpoint:async i=>{if(i===0){process.stdout.write('checkpoint\\n');await new Promise(()=>setInterval(()=>{},1000));}}}));`;
  const p = spawn(process.execPath, ["--input-type=module", "-e", childCode], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stderr = "";
  p.stderr.on("data", (b) => (stderr += b));
  const exited = new Promise((res) =>
    p.once("exit", (code, signal) => res({ code, signal })),
  );
  const ready = new Promise((res, rej) => {
    p.stdout.once("data", () => res());
    p.once("exit", () => rej(Error(stderr || "child-before-checkpoint")));
  });
  p.stdin.end(
    JSON.stringify({
      config: c,
      key: key.toString("base64"),
      scope,
      directory,
    }),
  );
  await ready;
  p.kill("SIGKILL");
  const end = await exited;
  assert.equal(end.signal, "SIGKILL");
  const io = openPinnedFilesystem(c);
  try {
    await withFilesystem(io, async () => {
      const r = await backup({
        directory,
        scope,
        keyHandle: async () => Buffer.from(key),
        source,
        resume: true,
      });
      await verify({
        directory,
        scope,
        keyHandle: async () => Buffer.from(key),
        manifestHash: r.manifestHash,
      });
    });
  } finally {
    io.close();
    key.fill(0);
  }
});
await test("actual read-only FileVault/volume observation is recorded, not an image operation", async () => {
  const c = config();
  const observed = await observeBootVolume(c.root);
  assert.equal(observed.dev, c.anchors.root[0]);
  assert.ok(observed.volumeUUID);
  fs.writeFileSync(
    out + "/BOOT-OBSERVATION.json",
    JSON.stringify(observed, null, 2) + "\n",
    { mode: 0o600 },
  );
});

await test("NUL leaf rejected instead of aliased name", () =>
  each(async (io, c) => {
    await assert.rejects(io.open(c.root + "/name\0suffix", "wx"));
    assert.equal(fs.existsSync(c.root + "/name"), false);
  }));
await test("contained preserves the requested subdirectory boundary", () =>
  each(async (io, c) => {
    await assert.rejects(
      io.contained(c.root + "/claims", c.root + "/journals"),
    );
  }));
await test("helper symlink rejected even for matching binary bytes", () => {
  const c = config(),
    link = out + "/helper-link.node";
  fs.symlinkSync(addonPath, link);
  assert.throws(() => openPinnedFilesystem({ ...c, addonPath: link }), /trust/);
});

function bootGrant(c, key) {
  return {
    payload: {
      ...c,
      storageKind: "boot-fd-v1",
      keyId: "synthetic-key",
      keyMaterialSHA256: H(key),
      custodian: "synthetic",
      independentRecoveryPin: H("synthetic-recovery"),
      volumeUUID: "fixture",
      operationId: "op",
      id: "host",
      maxStagingBytes: 8 * 1024 * 1024,
    },
  };
}
const fakeAuthority = {
  synthetic: true,
  check: (e) => structuredClone(e.payload),
};
function hostArgs(c, key, envelope = bootGrant(c, key)) {
  return {
    authority: fakeAuthority,
    envelope,
    scope: {},
    root: c.root,
    keyHandle: async () => Buffer.from(key),
    observeFixture: async () => ({
      volumeUUID: "fixture",
      encrypted: true,
      dev: c.anchors.root[0],
    }),
  };
}
await test("boot open clones approval before first await", async () => {
  const c = config(),
    key = randomBytes(32),
    e = bootGrant(c, key),
    promise = openHost(hostArgs(c, key, e));
  e.payload.root = "/changed";
  const host = await promise;
  try {
    await host.check();
    assert.equal(host.root, c.root);
  } finally {
    host.close();
    key.fill(0);
  }
});
await test("boot key material change under same keyId is refused and zeroed", async () => {
  const c = config(),
    key = randomBytes(32),
    wrong = randomBytes(32),
    host = await openHost({
      ...hostArgs(c, key),
      keyHandle: async () => wrong,
    });
  try {
    await assert.rejects(host.getKey(), /key-material-drift/);
    assert(wrong.every((v) => v === 0));
  } finally {
    host.close();
    key.fill(0);
  }
});
await test("boot has three distinct handles with no image key requirement", async () => {
  const key = randomBytes(32),
    handles = Object.fromEntries(
      ["archive", "management", "s3"].map((n) => [
        n,
        {
          service: n,
          account: "synthetic",
          keyId: n,
          purpose: n,
          ...(n === "archive" ? { materialSHA256: H(key) } : {}),
        },
      ]),
    ),
    p = {
      hostKind: "boot-fd-v1",
      handles,
      custodian: "synthetic",
      recoveryEvidenceHash: H("recovery"),
    };
  const h = separatedKeyHandles({
    authority: fakeAuthority,
    envelope: { payload: p },
    scope: {},
    readFixture: async () => key.toString("base64"),
  });
  const result = await h.archive();
  assert.deepEqual(result, key);
  assert.equal(h.volumeHandleId, null);
  result.fill(0);
  key.fill(0);
});
await test("boot handle actual material substitution fails", async () => {
  const key = randomBytes(32),
    handles = Object.fromEntries(
      ["archive", "management", "s3"].map((n) => [
        n,
        {
          service: n,
          account: "synthetic",
          keyId: n,
          purpose: n,
          ...(n === "archive" ? { materialSHA256: H(key) } : {}),
        },
      ]),
    );
  const h = separatedKeyHandles({
    authority: fakeAuthority,
    envelope: {
      payload: {
        hostKind: "boot-fd-v1",
        handles,
        custodian: "synthetic",
        recoveryEvidenceHash: H("recovery"),
      },
    },
    scope: {},
    readFixture: async () => randomBytes(32).toString("base64"),
  });
  await assert.rejects(h.archive(), /material-drift/);
  key.fill(0);
});
await test("mutation error is UNKNOWN with retry forbidden", async () => {
  const c = config(),
    key = randomBytes(32),
    host = await openHost(hostArgs(c, key));
  try {
    await assert.rejects(
      host.withIO(async () => {
        const f = (await import("../scripts/studio-operations/filesystem.mjs"))
          .default;
        await f.mkdir(c.root + "/created");
        fs.renameSync(c.root, c.root + "-changed");
        fs.mkdirSync(c.root, { mode: 0o700 });
        await f.open(c.root + "/bad", "wx");
      }),
      (e) => e.outcome === "UNKNOWN" && e.retryAllowed === false,
    );
    assert.deepEqual(fs.readdirSync(c.root), []);
  } finally {
    host.close();
    key.fill(0);
  }
});
await test("recovery copy key verifies copied encrypted archive in separate process after primary key loss", async () => {
  const c = config(),
    key = randomBytes(32),
    recovery = Buffer.from(key),
    io = openPinnedFilesystem(c);
  let receipt;
  try {
    receipt = await withFilesystem(io, () =>
      backup({
        directory: c.root + "/archive",
        scope,
        keyHandle: async () => Buffer.from(key),
        source,
      }),
    );
  } finally {
    io.close();
  }
  const destination = config();
  fs.mkdirSync(destination.root + "/archive", { mode: 0o700 });
  for (const n of fs.readdirSync(c.root + "/archive")) {
    fs.copyFileSync(
      c.root + "/archive/" + n,
      destination.root + "/archive/" + n,
      fs.constants.COPYFILE_EXCL,
    );
    fs.chmodSync(destination.root + "/archive/" + n, 0o600);
  }
  key.fill(0);
  const code = `import{openPinnedFilesystem}from ${JSON.stringify(new URL("../scripts/studio-operations/pinned-filesystem.mjs", import.meta.url).href)};import{withFilesystem}from ${JSON.stringify(new URL("../scripts/studio-operations/filesystem.mjs", import.meta.url).href)};import{verify}from ${JSON.stringify(new URL("../scripts/studio-operations/core/adapter.mjs", import.meta.url).href)};let s='';for await(const b of process.stdin)s+=b;const x=JSON.parse(s),io=openPinnedFilesystem(x.config);try{await withFilesystem(io,()=>verify({directory:x.config.root+'/archive',scope:x.scope,keyHandle:async()=>Buffer.from(x.key,'base64'),manifestHash:x.hash}));process.stdout.write('VERIFIED');}finally{io.close();}`;
  const p = spawn(process.execPath, ["--input-type=module", "-e", code], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  let text = "",
    err = "";
  p.stdout.on("data", (b) => (text += b));
  p.stderr.on("data", (b) => (err += b));
  const done = new Promise((res) =>
    p.on("exit", (code, signal) => res({ code, signal })),
  );
  p.stdin.end(
    JSON.stringify({
      config: destination,
      scope,
      key: recovery.toString("base64"),
      hash: receipt.manifestHash,
    }),
  );
  const end = await done;
  recovery.fill(0);
  assert.deepEqual(end, { code: 0, signal: null }, err);
  assert.equal(text, "VERIFIED");
});

for (const kind of ["boot", "legacy"]) {
  await test(`${kind} local dispose zeroes retained payload after host identity failure`, async () => {
    const c = config(),
      key = randomBytes(32),
      args = hostArgs(c, key);
    if (kind === "legacy") {
      delete args.envelope.payload.storageKind;
      args.observeFixture = async () => ({
        volumeUUID: "fixture",
        encrypted: true,
      });
    }
    const host = await openHost(args);
    const { createBindingTarget } = await import(
      "../scripts/studio-operations/core/binding-provider.mjs"
    );
    let retained;
    const target = host.guardTarget(
      createBindingTarget({
        db: {},
        bucket: {
          async put(k, bytes) {
            retained = bytes;
            throw Error("lost-ack");
          },
        },
        identity: {},
        claimRoot: c.root + "/claims",
        stagingDirectory: c.root + "/empty",
        semanticValidator: async () => {},
      }),
    );
    try {
      await target.apply([
        { kind: "r2-start", key: "synthetic", size: 4 },
        {
          kind: "r2-part",
          key: "synthetic",
          offset: 0,
          data: Buffer.from("DATA").toString("base64"),
        },
      ]);
      await assert.rejects(
        target.apply([{ kind: "r2-end", key: "synthetic" }]),
        /lost-ack/,
      );
      assert.equal(retained.toString(), "DATA");
      fs.renameSync(c.root, c.root + "-drift");
      fs.mkdirSync(c.root, { mode: 0o700 });
      if (kind === "boot") host.close();
      await assert.rejects(host.check());
      await target.dispose();
      assert(retained.every((x) => x === 0));
    } finally {
      host.close?.();
      key.fill(0);
    }
  });
}
