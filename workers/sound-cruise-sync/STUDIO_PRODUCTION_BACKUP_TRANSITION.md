# Production backup transition candidate

This operations-only candidate reuses PR69's Host, AEAD archive, D1/R2 transport,
restore, one-shot target claim and readonly reconcile. No runtime entry, migration,
Cloudflare configuration, frontend, Shared Write or activation changes are included.

## Reused real Lab acceptance

The 2026-10-30 Lab evidence manifest is
`3f69a9b602084f0ffc331daae1978a7baaeefe134f0a3dc45c7a8383fc285584`.
149 encrypted pages, external copy, separate-process fresh restore, full readback,
other-device key recovery, readonly reconcile and consumed-target rejection passed.
These are historical results and are not counted again. The Lab's operational
quiescence contract is not a Production freeze witness.

R2 metadata `jurisdiction: default` must use the ordinary Account S3 endpoint,
while preserving the literal metadata jurisdiction in identity/approval checks.
Unknown endpoints fail closed. Official endpoint reference:
https://developers.cloudflare.com/r2/api/tokens/

## External receipt connection (verifier only)

`verified-cutline.mjs` wraps the unchanged `cutlineProvider`. It does not issue
receipts, sign assertions, stop traffic, discover writers, or install a Production
observer. The caller must supply the externally approved authority, exact inventory,
source identity and expected signed window hash from the execution packet.
`readWindow` must read the independently authoritative CURRENT window (including
on process reopen); returning a cached signed window is not a latestness proof.
An external latest-pin/CAS provider is still a deployment prerequisite.

Each writer requires signed admission, complete-from-admission invocation coverage,
independent legacy-inflight disposition, and D1/R2 effects receipts. All are bound
to owner, source, inventory, operation, window, sequence, cutline and expiry.
Started/completed IDs must match exactly with no duplicates. Unknown/partial effects,
owner mixing, stale source, missing cleanup path, changed window and expired evidence
are rejected. A closed boolean, empty current registry, fixed sleep, disabled cron,
or 100% v138 deployment cannot substitute for these facts.

Signatures attest to the trusted issuer's statements, not to their physical truth.
The issuer and current-window reader must be approved and connected to actual ingress,
completion/effects observations. No such Production provider is instantiated here.
Passing synthetic verifier tests is NOT Production drain acceptance.

## Production blocker and required execution order

The deployed v138 entry delegates legacy writes and cleanup without participating in
this receipt registry. Isolated Maintenance Bridge/handover contracts cannot be
relabelled Production. Retroactive legacy completion receipts cannot be reconstructed
from an empty registry. Therefore Production backup is BLOCKED until an effective
all-entry admission barrier AND independently resolved pre-barrier inflight/partial
results are available. Any bridge deployment/configuration/credential withdrawal
needed for that barrier requires a separate precise approval; this change does none.

Sequence: exact-source/target/Host preflight -> separately approved admission stop ->
independent drain/effects receipts -> externally pinned closed window -> pre-Studio
0033 validator -> encrypted backup -> seal/AEAD/cutline recheck -> external copy ->
read-only independent-key verification -> approved source reopen after seal/copy safety
conditions -> separate-account fresh restore/full readback. Restore may continue after
source reopen because it uses the sealed archive. Reopening is forbidden while backup
is OPEN, effects UNKNOWN or cutline unconfirmed. No auto-resend or auto-rollback.

Fresh restore targets must be newly approved, actual IDs recorded after creation,
private/unbound to product Workers, Production-denied, and never previously claimed.
Lab D1 IAM is account-scoped: code ID guards are extra protection, not per-DB IAM.
Production payload transfer into Lab is separately approved data processing. Account
membership, credentials, no-public-access, retention/custodian and deletion responsibility
must be fixed first. Existing synthetic restore targets cannot be reused.

Mac Host grants pin device/fsid as well as UUID/inode/mode. A device change does not
prove tampering, but the old grant must fail. Compare current UUID, canonical paths,
inodes, owner/mode/link, helper hash and filesystem before an explicitly approved NEW
execution grant. Do not overwrite an old grant/baseline or weaken Host checks.

Receipt chronology is explicit: window.openedAt <= admission.closedAt <= admission.issued
<= invocation.issued <= effects.issued <= CLOSED window.issued <= freeze.issued.
Invocation.observedThrough must include admission close and not exceed invocation issue.
Invocation binds the exact admission receipt hash; effects bind the invocation hash.
A stale pre-stop registry/effects receipt cannot be mixed into a newer close in the same
window/sequence. Providers must use a trusted clock and retain the causal receipt chain.

The existing production `runApprovedOperation` path now requires readWindow/readReceipt/
readWitness and the execution-envelope-signed cutlineWindowHash before Host/key/network
access for backup/resume. It connects verifiedCutlineProvider to the live resource
identity; the isolated synthetic path retains its existing provider and assertions.
No default receipt issuer or latest-window callback is installed by this change.

The previous Lab management tokens are account-scoped, so their D1 Read/Write capability
would also reach newly created databases containing restored Production data. Bucket-
scoped S3 credentials do not remove this D1 exposure. Before any real-data transfer,
verify Account membership/custodians, expire or explicitly revoke/narrow all unnecessary
Lab-wide credentials, establish Production-equivalent confidentiality/retention, then
approve the actual fresh IDs and target credential separately. This task neither revokes
existing credentials nor authorizes their access to real Production data.
