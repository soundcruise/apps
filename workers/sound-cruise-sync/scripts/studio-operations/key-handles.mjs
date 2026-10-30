import { createHash } from "node:crypto";
// Existing entries only. No generation, mutation, unlock, sharing or automatic rotation.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fail, digest, same } from "./contracts.mjs";
const run = promisify(execFile);
async function read(ref) {
  try {
    return (
      await run(
        "/usr/bin/security",
        ["find-generic-password", "-s", ref.service, "-a", ref.account, "-w"],
        { maxBuffer: 16384 },
      )
    ).stdout.trim();
  } catch {
    fail("keychain-handle-unavailable");
  }
}
export function separatedKeyHandles({
  authority,
  envelope,
  scope,
  readFixture,
}) {
  envelope = structuredClone(envelope);
  scope = structuredClone(scope);
  const p = authority.check(envelope, "key-handles", scope),
    names =
      p.hostKind === "boot-fd-v1"
        ? ["archive", "management", "s3"]
        : ["archive", "volume", "management", "s3"];
  if (readFixture && !authority.synthetic) fail("production-key-injection");
  const ids = names.map((n) => {
    const x = p.handles?.[n];
    if (!x?.service || !x.account || !x.keyId || x.purpose !== n)
      fail("key-handle-scope");
    return digest([x.service, x.account]);
  });
  if (
    new Set(ids).size !== names.length ||
    !p.custodian ||
    !p.recoveryEvidenceHash
  )
    fail("key-separation");
  const fetch = async (n) => {
    authority.check(envelope, "key-handles", scope);
    try {
      return await (authority.synthetic ? readFixture : read)(p.handles[n]);
    } catch {
      fail("keychain-handle-unavailable");
    }
  };
  return Object.freeze({
    id: p.id,
    operationId: p.operationId,
    archive: async () => {
      const x = await fetch("archive");
      const b = Buffer.from(x, "base64");
      if (b.length !== 32 || b.toString("base64") !== x)
        fail("archive-key-format");
      if (
        p.hostKind === "boot-fd-v1" &&
        createHash("sha256").update(b).digest("hex") !==
          p.handles.archive.materialSHA256
      ) {
        b.fill(0);
        fail("archive-key-material-drift");
      }
      return b;
    },
    management: () => fetch("management"),
    s3: async () => {
      try {
        const x = JSON.parse(await fetch("s3"));
        if (
          typeof x.accessKeyId !== "string" ||
          !x.accessKeyId ||
          typeof x.secretAccessKey !== "string" ||
          !x.secretAccessKey
        )
          fail("s3-key-format");
        return {
          accessKeyId: x.accessKeyId,
          secretAccessKey: x.secretAccessKey,
          ...(x.sessionToken ? { sessionToken: x.sessionToken } : {}),
        };
      } catch {
        fail("s3-key-format");
      }
    },
    volumeHandleId: p.handles.volume?.keyId ?? null,
  });
}
