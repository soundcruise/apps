import fs from "node:fs";
import { verifyCurrentEvidence } from "./current-evidence.mjs";
// stdin contains public trust pins and an independently pinned evidence hash, never private keys.
let text = "";
try {
  for await (const b of process.stdin) {
    text += b;
    if (Buffer.byteLength(text) > 65536) throw Error("input-budget");
  }
  const x = JSON.parse(text);
  // Historical check at the saved observation; freshness always uses this process's current clock.
  delete x.now;
  const result = verifyCurrentEvidence(x);
  process.stdout.write(JSON.stringify(result) + "\n");
  process.exitCode = result.status === "VERIFIED_HISTORICAL_OPEN" ? 0 : 2;
} catch {
  process.stdout.write(JSON.stringify({ status: "HOLD", code: "INDEPENDENT_VERIFIER_HOLD", freezeAuthorized: false }) + "\n");
  process.exitCode = 2;
}
