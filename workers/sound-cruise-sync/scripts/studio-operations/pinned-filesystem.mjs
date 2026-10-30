import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { fail, same } from "./contracts.mjs";
const require = createRequire(import.meta.url),
  C = fs.constants,
  MAX_FILE = 40 * 1024 * 1024;
const id = (s) => {
  if (!Number.isSafeInteger(s.dev) || !Number.isSafeInteger(s.ino))
    fail("unsafe-filesystem-identity");
  return [s.dev, s.ino, s.mode];
};
export function openPinnedFilesystem({
  root,
  anchors,
  filesystem,
  addonPath,
  addonSHA256,
  minFreeBytes = 0,
}) {
  anchors = structuredClone(anchors);
  filesystem = structuredClone(filesystem);
  if (process.platform !== "darwin" || !path.isAbsolute(addonPath))
    fail("native-helper-pin");
  let trusted = "/";
  for (const part of addonPath.slice(1).split("/")) {
    trusted = path.join(trusted, part);
    const st = fs.lstatSync(trusted);
    if (
      st.isSymbolicLink() ||
      ![0, process.getuid()].includes(st.uid) ||
      st.mode & 0o022 ||
      (trusted === addonPath ? !st.isFile() : !st.isDirectory())
    )
      fail("native-helper-trust");
  }
  if (
    createHash("sha256").update(fs.readFileSync(addonPath)).digest("hex") !==
    addonSHA256
  )
    fail("native-helper-pin");
  const native = require(addonPath),
    dirs = new Map(),
    ancestors = [],
    files = new Set();
  let closed = false,
    rootFD,
    mutated = false;
  const closeFD = (f) => {
    try {
      fs.closeSync(f);
    } catch {}
  };
  function open(fd, name, flags) {
    return native.openat(fd, name, flags);
  }
  function directory(fd, expectedDev, privateDir = true) {
    const s = fs.fstatSync(fd);
    if (
      !s.isDirectory() ||
      (expectedDev !== undefined && s.dev !== expectedDev) ||
      (privateDir && (s.uid !== process.getuid() || s.mode & 0o077))
    )
      fail("directory-identity");
    return s;
  }
  try {
    if (!path.isAbsolute(root) || path.resolve(root) !== root || root === "/")
      fail("root-path");
    let f = native.root();
    ancestors.push({ fd: f });
    for (const name of root.slice(1).split("/")) {
      const child = open(f, name, C.O_RDONLY | C.O_DIRECTORY);
      ancestors.push({ fd: child, parent: f, name });
      directory(child, undefined, false);
      f = child;
    }
    rootFD = f;
    const st = directory(f);
    same(id(st), anchors.root, "root-anchor");
    const found = native.info(f);
    same(
      { fsid: found.fsid, mount: found.mount, type: found.type },
      filesystem,
      "filesystem-identity",
    );
    if (
      found.type !== "apfs" ||
      !["/", "/System/Volumes/Data"].includes(found.mount)
    )
      fail("not-boot-filesystem");
    const boot = fs.statSync(found.mount);
    if (st.dev !== boot.dev) fail("boot-device");
    native.lock(f);
    dirs.set("", { fd: f, stat: st });
    for (const n of ["claims", "journals"]) {
      const fd = open(f, n, C.O_RDONLY | C.O_DIRECTORY);
      try {
        const s = directory(fd, st.dev);
        same(id(s), anchors[n], "subdirectory-anchor");
        dirs.set(n, { fd, stat: s });
      } catch (e) {
        closeFD(fd);
        throw e;
      }
    }
  } catch (e) {
    for (const x of dirs.values()) if (x.fd !== rootFD) closeFD(x.fd);
    for (const x of ancestors) closeFD(x.fd);
    throw e;
  }
  const rootDev = fs.fstatSync(rootFD).dev;
  function rel(p) {
    if (
      typeof p !== "string" ||
      !path.isAbsolute(p) ||
      path.resolve(p) !== p ||
      !(p === root || p.startsWith(root + "/"))
    )
      fail("pinned-path");
    return path.relative(root, p);
  }
  function validFile(fd) {
    const s = fs.fstatSync(fd);
    if (
      !s.isFile() ||
      s.dev !== rootDev ||
      s.uid !== process.getuid() ||
      s.mode & 0o077 ||
      s.nlink !== 1 ||
      s.size > MAX_FILE
    )
      fail("file-identity-or-budget");
    return s;
  }
  function bind(entry) {
    const t = open(entry.parent, entry.name, C.O_RDONLY | C.O_DIRECTORY);
    try {
      same(
        id(fs.fstatSync(t)),
        id(fs.fstatSync(entry.fd)),
        "directory-name-drift",
      );
    } finally {
      closeFD(t);
    }
  }
  function check() {
    if (closed) fail("host-closed");
    for (const a of ancestors) if (a.parent !== undefined) bind(a);
    for (const [key, d] of dirs) {
      directory(d.fd, rootDev);
      same(id(fs.fstatSync(d.fd)), id(d.stat), "directory-metadata-drift");
      if (key) {
        const parent = dirs.get(
          path.dirname(key) === "." ? "" : path.dirname(key),
        );
        bind({ parent: parent.fd, name: path.basename(key), fd: d.fd });
      }
    }
    const s = native.info(rootFD);
    same(
      { fsid: s.fsid, mount: s.mount, type: s.type },
      filesystem,
      "filesystem-drift",
    );
    if (BigInt(s.bavail) * BigInt(s.bsize) < BigInt(minFreeBytes))
      fail("host-capacity");
  }
  function dir(relative) {
    if (dirs.has(relative)) return dirs.get(relative).fd;
    let part = "";
    for (const name of relative.split("/").filter(Boolean)) {
      const parent = dirs.get(part);
      part = part ? part + "/" + name : name;
      if (!dirs.has(part)) {
        const fd = open(parent.fd, name, C.O_RDONLY | C.O_DIRECTORY);
        try {
          dirs.set(part, { fd, stat: directory(fd, rootDev) });
        } catch (e) {
          closeFD(fd);
          throw e;
        }
      }
    }
    return dirs.get(relative).fd;
  }
  function parent(p) {
    const s = rel(p);
    if (!s) fail("root-file-operation");
    const d = path.dirname(s);
    return [dir(d === "." ? "" : d), path.basename(s)];
  }
  function openFile(p, mode) {
    check();
    let fd;
    try {
      if (rel(p) === "" || dirs.has(rel(p))) {
        if (mode !== "r") fail("directory-write");
        const d = rel(p);
        fail("expected-regular-file");
      } // directories handled by public open below
      else {
        const [d, n] = parent(p);
        if (mode === "wx") mutated = true;
        fd = open(
          d,
          n,
          mode === "wx" ? C.O_WRONLY | C.O_CREAT | C.O_EXCL : C.O_RDONLY,
        );
        validFile(fd);
      }
      check();
      files.add(fd);
      return fd;
    } catch (e) {
      if (fd !== undefined) closeFD(fd);
      throw e;
    }
  }
  function handle(fd, isDir = false) {
    let done = false;
    function guard() {
      if (done) fail("file-closed");
      check();
      if (!isDir) validFile(fd);
    }
    return {
      async writeFile(value) {
        guard();
        if (isDir) fail("directory-write");
        const b = Buffer.isBuffer(value) ? value : Buffer.from(value);
        if (b.length > MAX_FILE) fail("file-budget");
        let offset = 0;
        while (offset < b.length) {
          mutated = true;
          const n = fs.writeSync(fd, b, offset, b.length - offset, offset);
          if (!n) fail("short-write");
          offset += n;
        }
        guard();
      },
      async sync() {
        guard();
        native.sync(fd);
        guard();
      },
      async close() {
        if (!done) {
          done = true;
          files.delete(fd);
          closeFD(fd);
        }
      },
      async stat() {
        guard();
        return fs.fstatSync(fd);
      },
    };
  }
  const io = {
    root,
    check,
    hasMutation: () => mutated,
    async contained(base, value) {
      rel(base);
      rel(value);
      if (!(base === value || value.startsWith(base + "/")))
        fail("pinned-containment");
      check();
    },
    async lstat(p) {
      check();
      const relative = rel(p);
      if (dirs.has(relative)) return fs.fstatSync(dir(relative));
      const [d, n] = parent(p);
      let f = open(d, n, C.O_RDONLY);
      try {
        const s = fs.fstatSync(f);
        if (s.isDirectory()) directory(f, rootDev);
        else validFile(f);
        check();
        return s;
      } finally {
        closeFD(f);
      }
    },
    async open(p, mode) {
      if (!["r", "wx"].includes(mode)) fail("file-mode");
      check();
      const relative = rel(p);
      if (mode === "r") {
        let d;
        try {
          d = dir(relative);
        } catch (e) {
          if (e.code === "ENOENT") throw e;
          if (!["PINNED_IO", "ENOTDIR"].includes(e.code)) throw e;
        }
        if (d !== undefined)
          return {
            async sync() {
              check();
              native.sync(d);
              check();
            },
            async close() {},
            async stat() {
              check();
              return fs.fstatSync(d);
            },
          };
      }
      return handle(openFile(p, mode));
    },
    async readFile(p, encoding) {
      const f = openFile(p, "r");
      try {
        const s = validFile(f),
          b = Buffer.alloc(s.size);
        let at = 0;
        while (at < b.length) {
          const n = fs.readSync(f, b, at, b.length - at, at);
          if (!n) fail("short-read");
          at += n;
        }
        same(id(validFile(f)), id(s), "read-identity");
        check();
        return encoding ? b.toString(encoding) : b;
      } finally {
        files.delete(f);
        closeFD(f);
      }
    },
    async mkdir(p, options = {}) {
      check();
      const relative = rel(p);
      if (!relative) {
        if (options.recursive) return;
        fail("root-exists");
      }
      const parts = relative.split("/");
      let current = "";
      for (let i = 0; i < parts.length; i++) {
        const next = current ? current + "/" + parts[i] : parts[i];
        if (!dirs.has(next)) {
          const d = dir(current);
          try {
            mutated = true;
            native.mkdirat(d, parts[i]);
            native.sync(d);
          } catch (e) {
            if (
              e.code !== "EEXIST" ||
              (!options.recursive && i === parts.length - 1)
            )
              throw e;
          }
          const f = open(d, parts[i], C.O_RDONLY | C.O_DIRECTORY);
          try {
            dirs.set(next, { fd: f, stat: directory(f, rootDev) });
          } catch (e) {
            closeFD(f);
            throw e;
          }
        } else if (!options.recursive && i === parts.length - 1)
          throw Object.assign(Error("exists"), { code: "EEXIST" });
        current = next;
      }
      check();
    },
    async rename(a, b) {
      check();
      const [d, n] = parent(a),
        [e, m] = parent(b);
      if (d !== e) fail("cross-directory-rename");
      let fd = open(d, n, C.O_RDONLY);
      try {
        validFile(fd);
        try {
          const target = open(e, m, C.O_RDONLY);
          try {
            validFile(target);
          } finally {
            closeFD(target);
          }
        } catch (x) {
          if (x.code !== "ENOENT") throw x;
        }
        mutated = true;
        native.renameat(d, n, m);
        const dest = open(e, m, C.O_RDONLY);
        try {
          same(id(validFile(dest)), id(validFile(fd)), "rename-drift");
        } finally {
          closeFD(dest);
        }
        native.sync(d);
        check();
      } finally {
        closeFD(fd);
      }
    },
    async unlink(p) {
      check();
      const [d, n] = parent(p),
        f = open(d, n, C.O_RDONLY);
      try {
        validFile(f);
        mutated = true;
        native.unlinkat(d, n);
        native.sync(d);
        check();
      } finally {
        closeFD(f);
      }
    },
    async statfs(p) {
      rel(p);
      check();
      const s = native.info(rootFD);
      return { bavail: BigInt(s.bavail), bsize: BigInt(s.bsize) };
    },
    close() {
      if (closed) return;
      closed = true;
      for (const f of files) closeFD(f);
      for (const d of dirs.values()) if (d.fd !== rootFD) closeFD(d.fd);
      for (const a of ancestors) closeFD(a.fd);
    },
  };
  try {
    check();
    return Object.freeze(io);
  } catch (e) {
    io.close();
    throw e;
  }
}
