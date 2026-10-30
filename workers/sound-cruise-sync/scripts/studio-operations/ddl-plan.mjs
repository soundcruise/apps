import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { fail, canonical } from "./contracts.mjs";
export const SQL_HASH =
  "8503af5b2475063e76b1c5f73f2816d95e6f35085a001f61a4ad127c08190ebc";
export function fixedBatch() {
  const text = fs.readFileSync(
    fileURLToPath(
      new URL("../../schema-candidates/studio_0001_rc5.sql", import.meta.url),
    ),
    "utf8",
  );
  if (createHash("sha256").update(text).digest("hex") !== SQL_HASH)
    fail("ddl-file-hash");
  const ss = text
    .split(/;\n(?=(?:CREATE|INSERT|SELECT)\b)/)
    .map((x) =>
      x
        .replace(/^--[^\n]*\n/, "")
        .replace(/;\s*$/, "")
        .trim(),
    )
    .filter(Boolean);
  if (ss.length !== 88) fail("ddl-shape");
  return ss.map((sql) => ({ sql, params: [] }));
}
export function assertFixed(batch) {
  if (canonical(batch) !== canonical(fixedBatch())) fail("ddl-payload-changed");
}
