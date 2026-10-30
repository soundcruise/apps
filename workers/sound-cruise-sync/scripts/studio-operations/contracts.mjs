import { createHash, verify } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
export const canonical = (x) =>
  x !== null && typeof x === "object"
    ? Array.isArray(x)
      ? "[" + x.map(canonical).join(",") + "]"
      : "{" +
        Object.keys(x)
          .sort()
          .map((k) => JSON.stringify(k) + ":" + canonical(x[k]))
          .join(",") +
        "}"
    : JSON.stringify(x);
export const digest = (x) =>
  createHash("sha256")
    .update(typeof x === "string" ? x : canonical(x))
    .digest("hex");
export const fail = (code) => {
  throw Object.assign(Error(code), { code });
};
export function authority({
  publicKey,
  rootHash,
  clock = Date.now,
  synthetic = false,
}) {
  if (!synthetic && clock !== Date.now) fail("production-clock-injection");
  if (digest(publicKey) !== rootHash) fail("external-root-pin");
  return Object.freeze({
    synthetic,
    check(envelope, kind, scope) {
      try {
        const p = envelope.payload;
        if (
          !verify(
            null,
            Buffer.from(canonical(p)),
            publicKey,
            Buffer.from(envelope.signature, "base64"),
          )
        )
          fail("evidence-signature");
        if (
          p.kind !== kind ||
          p.scope !== digest(scope) ||
          p.synthetic !== synthetic ||
          !p.id ||
          !p.operationId ||
          !Number.isSafeInteger(p.issued) ||
          !Number.isSafeInteger(p.expires) ||
          p.issued > clock() ||
          p.expires <= clock()
        )
          fail("evidence-scope-or-expiry");
        return structuredClone(p);
      } catch (e) {
        if (e.code) throw e;
        fail("evidence-invalid");
      }
    },
  });
}
export async function contained(root, value) {
  if (
    !path.isAbsolute(root) ||
    path.resolve(root) !== root ||
    !path.isAbsolute(value) ||
    path.resolve(value) !== value ||
    !(value === root || value.startsWith(root + path.sep))
  )
    fail("host-path");
  let here = path.parse(value).root;
  for (const part of value.slice(here.length).split(path.sep).filter(Boolean)) {
    here = path.join(here, part);
    try {
      const st = await fs.lstat(here);
      if (st.isSymbolicLink()) fail("host-symlink");
      if (here !== value && !st.isDirectory()) fail("host-parent-type");
    } catch (e) {
      if (e.code === "ENOENT") break;
      throw e;
    }
  }
}
export async function durable(file, value) {
  await contained(path.dirname(file), file);
  const f = await fs.open(file, "wx", 0o600);
  try {
    await f.writeFile(canonical(value));
    await f.sync();
  } finally {
    await f.close();
  }
  const d = await fs.open(path.dirname(file), "r");
  try {
    await d.sync();
  } finally {
    await d.close();
  }
}
export async function readJournal(file) {
  await contained(path.dirname(file), file);
  const st = await fs.lstat(file);
  if (!st.isFile() || st.size > 1024 * 1024) fail("journal-type-or-size");
  return JSON.parse(await fs.readFile(file, "utf8"));
}
export function same(a, b, code = "binding-mismatch") {
  if (canonical(a) !== canonical(b)) fail(code);
}
