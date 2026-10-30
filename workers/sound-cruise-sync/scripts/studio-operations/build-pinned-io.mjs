import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
const output = process.argv[2],
  include = process.env.NODE_INCLUDE_DIR;
if (
  process.platform !== "darwin" ||
  !output ||
  !path.isAbsolute(output) ||
  !include ||
  !path.isAbsolute(include) ||
  !fs.existsSync(path.join(include, "node_api.h"))
)
  throw Error("explicit-mac-output-and-node-headers-required");
if (fs.existsSync(output)) throw Error("build-output-exists");
const p = spawnSync(
  "/usr/bin/clang",
  [
    "-shared",
    "-fPIC",
    "-undefined",
    "dynamic_lookup",
    "-I" + include,
    fileURLToPath(new URL("./pinned-io.c", import.meta.url)),
    "-o",
    output,
    "-Wall",
    "-Wextra",
    "-Werror",
  ],
  { stdio: "inherit" },
);
if (p.status !== 0) process.exit(p.status || 1);
