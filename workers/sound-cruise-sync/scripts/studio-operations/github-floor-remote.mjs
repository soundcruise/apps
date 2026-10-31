import { createHash } from "node:crypto";
import { canonical, digest, fail, same } from "./contracts.mjs";
export const floorQueries = Object.freeze({
  head: "query($owner:String!,$name:String!,$ref:String!){repository(owner:$owner,name:$name){nameWithOwner isPrivate ref(qualifiedName:$ref){target{oid}}}}",
  node: "query($owner:String!,$name:String!,$oid:GitObjectID!){repository(owner:$owner,name:$name){nameWithOwner isPrivate object(oid:$oid){... on Commit{oid parents(first:2){nodes{oid} pageInfo{hasNextPage}} tree{entries{name type oid}}}}}}",
  blob: "query($owner:String!,$name:String!,$oid:GitObjectID!){repository(owner:$owner,name:$name){nameWithOwner isPrivate object(oid:$oid){... on Blob{oid byteSize text isTruncated}}}}",
  append: "mutation($input:CreateCommitOnBranchInput!){createCommitOnBranch(input:$input){commit{oid} clientMutationId}}",
});
const oid = (x) => /^[a-f0-9]{40}$/.test(x || ""), hex = (x) => /^[a-f0-9]{64}$/.test(x || "");
const fields = ["sequence", "previousRecordHash", "phase", "sourceDigest", "ownerId", "epoch",
  "operationId", "windowHash", "historyIds", "transitionId", "manifestHash"];
function metadata(r, sourceDigest) {
  if (!r || Object.keys(r).sort().join() !== [...fields].sort().join() || r.sourceDigest !== sourceDigest ||
    !Number.isSafeInteger(r.sequence) || r.sequence < 1 || !Number.isSafeInteger(r.epoch) || r.epoch < 1 ||
    !["CLOSED", "ARCHIVED", "RETIRED"].includes(r.phase) || !hex(r.previousRecordHash) ||
    !hex(r.windowHash) || !hex(r.transitionId) || (r.manifestHash !== null && !hex(r.manifestHash)) ||
    !/^[A-Za-z0-9_.:-]{1,160}$/.test(r.ownerId || "") || !/^[A-Za-z0-9_.:-]{1,160}$/.test(r.operationId || "") ||
    !Array.isArray(r.historyIds) || r.historyIds.length > 1000 ||
    r.historyIds.some((x) => !/^[A-Za-z0-9_.:-]{1,160}$/.test(x)) ||
    new Set(r.historyIds).size !== r.historyIds.length) fail("github-floor-record");
}
// Concrete GitHub transport for the existing connectCurrentFloor interface.
// request is an explicit authenticated transport; this module never discovers credentials,
// creates refs/rulesets, bootstraps a CLOSED record, or falls back to REST ref updates.
export function githubFloorRemote({ sourceDigest, request, authority, writeEnvelope, scope, claimAttempt }) {
  if (!hex(sourceDigest) || typeof request !== "function") fail("github-floor-config");
  const repository = "soundcruise/protected-workspace-pins", branch = "codex/freeze-floor/" + sourceDigest;
  const file = "current-floor.json";
  let attempted = false;
  function writeGrant() {
    if (!authority || !writeEnvelope || typeof claimAttempt !== "function") fail("github-floor-readonly");
    const p = authority.check(writeEnvelope, "github-floor-write", scope);
    if (p.repository !== repository || p.branch !== branch || p.sourceDigest !== sourceDigest ||
      p.path !== file || p.appId !== 5518573 || !hex(p.qualificationHash) ||
      p.expectedHeadCAS !== true || p.durableClaimQualified !== true) fail("github-floor-grant");
    return p;
  }
  let qualified = false;
  if (writeEnvelope) { writeGrant(); qualified = authority.synthetic === false; }
  const vars = { owner: "soundcruise", name: "protected-workspace-pins" };
  async function query(kind, variables) {
    const x = await request({ query: floorQueries[kind], variables });
    if (x?.errors?.length || !x?.data) fail("github-floor-api-unavailable");
    return x.data;
  }
  function repo(x) {
    if (x?.nameWithOwner !== repository || x.isPrivate !== true) fail("github-floor-repository");
    return x;
  }
  async function head(repoName, ref) {
    if (repoName !== repository || ref !== branch) fail("github-floor-target");
    const x = repo((await query("head", { ...vars, ref: "refs/heads/" + branch })).repository);
    if (!oid(x.ref?.target?.oid)) fail("github-floor-ref-unavailable");
    return x.ref.target.oid;
  }
  async function node(commit) {
    if (!oid(commit)) fail("github-floor-oid");
    const c = repo((await query("node", { ...vars, oid: commit })).repository).object;
    if (c?.oid !== commit || !Array.isArray(c.parents?.nodes) || c.parents.nodes.length > 1 ||
      c.parents.pageInfo?.hasNextPage !== false || c.parents.nodes.some((x) => !oid(x.oid)) ||
      c.tree?.entries?.length !== 1) fail("github-floor-commit");
    const entry = c.tree.entries[0];
    if (entry.name !== file || entry.type !== "blob" || !oid(entry.oid)) fail("github-floor-tree");
    const blob = repo((await query("blob", { ...vars, oid: entry.oid })).repository).object;
    if (blob?.oid !== entry.oid || blob.isTruncated !== false || typeof blob.text !== "string" ||
      blob.byteSize !== Buffer.byteLength(blob.text) || blob.byteSize > 65536) fail("github-floor-blob");
    const bytes = Buffer.from(blob.text);
    const blobId = createHash("sha1").update("blob " + bytes.length + "\0").update(bytes).digest("hex");
    if (blobId !== entry.oid) fail("github-floor-blob-identity");
    let record;
    try { record = JSON.parse(blob.text); } catch { fail("github-floor-record"); }
    metadata(record, sourceDigest);
    if (blob.text !== canonical(record) + "\n") fail("github-floor-noncanonical");
    return { oid: commit, parents: c.parents.nodes.map((x) => x.oid), record };
  }
  return Object.freeze({
    testOnly: !qualified,
    head, node,
    async appendCAS(repoName, ref, expected, record) {
      if (attempted) fail("github-floor-attempted-reconcile-only");
      const grant = writeGrant();
      if (repoName !== repository || ref !== branch || !oid(expected)) fail("github-floor-target");
      metadata(record, sourceDigest);
      const old = await node(expected);
      if (record.sequence !== old.record.sequence + 1 || record.previousRecordHash !== digest(old.record) ||
        record.ownerId !== grant.ownerId || record.operationId !== grant.operationId || record.epoch !== grant.epoch ||
        record.windowHash !== grant.windowHash || old.record.historyIds.includes(record.transitionId) ||
        !record.historyIds.includes(record.transitionId) || old.record.historyIds.some((x) => !record.historyIds.includes(x)))
        fail("github-floor-CAS-context");
      writeGrant();
      attempted = true; // also latch claim/transport/ACK failures
      try {
        await claimAttempt({ repository, branch, expectedHeadOid: expected, transitionId: record.transitionId,
          recordHash: digest(record), qualificationHash: grant.qualificationHash });
        const x = await request({ query: floorQueries.append, variables: { input: {
          branch: { repositoryNameWithOwner: repository, branchName: branch }, expectedHeadOid: expected,
          message: { headline: "Maintenance floor sequence " + record.sequence }, clientMutationId: record.transitionId,
          fileChanges: { additions: [{ path: file, contents: Buffer.from(canonical(record) + "\n").toString("base64") }] },
        } } });
        if (x?.errors?.length || !oid(x?.data?.createCommitOnBranch?.commit?.oid) ||
          x.data.createCommitOnBranch.clientMutationId !== record.transitionId) fail("github-floor-CAS-UNKNOWN");
        const next = x.data.createCommitOnBranch.commit.oid;
        if (await head(repository, branch) !== next) fail("github-floor-CAS-UNKNOWN");
        const readback = await node(next);
        same(readback.parents, [expected], "github-floor-CAS-parent");
        same(readback.record, record, "github-floor-CAS-content");
        return next;
      } catch { fail("github-floor-CAS-UNKNOWN-no-resend"); }
    },
  });
}
