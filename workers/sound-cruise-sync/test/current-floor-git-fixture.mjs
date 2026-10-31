// Synthetic local service only. Never accepts an arbitrary existing repository root.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
export class FixtureRemote {
  constructor(parent, record, branch) {
    this.root = fs.mkdtempSync(path.join(parent, "remote-"));
    this.branch = branch;
    this.testOnly = true;
    this.calls = 0;
    this.git(["init", "--bare", "-q"]);
    const oid = this.make(record, []);
    this.git(["update-ref", "refs/heads/" + branch, oid]);
    this.genesis = oid;
  }
  git(args, input) {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")),
    );
    Object.assign(env, {
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_AUTHOR_NAME: "Synthetic",
      GIT_AUTHOR_EMAIL: "fixture@example.invalid",
      GIT_COMMITTER_NAME: "Synthetic",
      GIT_COMMITTER_EMAIL: "fixture@example.invalid",
    });
    return execFileSync("git", ["--git-dir=" + this.root, ...args], {
      input,
      env,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  }
  make(record, parents) {
    const blob = this.git(
        ["hash-object", "-w", "--stdin"],
        JSON.stringify(record),
      ),
      tree = this.git(["mktree"], `100644 blob ${blob}\tpin.json\n`);
    return this.git(
      ["commit-tree", tree, ...parents.flatMap((p) => ["-p", p])],
      JSON.stringify(record),
    );
  }
  head(repo, branch) {
    if (
      repo !== "soundcruise/protected-workspace-pins" ||
      branch !== this.branch
    )
      throw Error("transport-scope");
    return this.git(["rev-parse", "refs/heads/" + branch]);
  }
  node(oid) {
    const raw = this.git(["cat-file", "commit", oid]);
    const parents = raw
      .split("\n\n")[0]
      .split("\n")
      .filter((x) => x.startsWith("parent "))
      .map((x) => x.slice(7));
    return {
      oid,
      parents,
      record: JSON.parse(this.git(["show", oid + ":pin.json"])),
    };
  }
  appendCAS(repo, branch, expected, record) {
    if (
      repo !== "soundcruise/protected-workspace-pins" ||
      branch !== this.branch
    )
      throw Error("transport-scope");
    this.calls++;
    const oid = this.make(record, [expected]);
    try {
      this.git(["update-ref", "refs/heads/" + branch, oid, expected]);
    } catch (e) {
      const current = this.head(repo, branch);
      if (current !== expected && current !== oid) e.code = "CAS_CONFLICT";
      throw e;
    }
    if (this.dropAck) throw Error("ack-lost");
    return oid;
  }
}
