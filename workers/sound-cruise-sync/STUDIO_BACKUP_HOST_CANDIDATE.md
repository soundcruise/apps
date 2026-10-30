# Dedicated backup host and signed runner candidate

Status: partial implementation; Production execution HOLD. This PR depends on fixed PR66.
No mounted image, long-lived key, Cloudflare resource, Production operation or credential
was created, unlocked or changed. This is not a completion certificate for a Backup host.

## Implemented

- Read-only `volume-observer.swift` uses `diskutil info -plist` and `hdiutil info -plist`
  to associate an approved mount/device/UUID with one attached image path. It requires
  encrypted, unlocked APFS; outer image encryption alone is not accepted as APFS encryption.
- `volume.mjs` checks normalized paths, symlinks, ownership, mode, mount/image inode anchors,
  distinct source/backup UUID, root-device consistency and before/after observation drift.
- `host.mjs` rechecks the approved image observation and claim anchors on operations.
- `key-handles.mjs` separates existing archive/volume/management/S3 references and purpose,
  binds them to an external signed scope/operation/custodian/recovery-evidence hash, and
  sanitizes errors. Archive reads return fresh 32-byte buffers. No key generation, unlock,
  ACL mutation, copying, rotation, sharing, fallback credential discovery or secret logging.
- `runner.mjs` assembles existing backup, explicitly approved resume, fresh restore and
  read-only reconciliation. All grant inputs are cloned before any await. Execution binds
  host/resource/key/archive/inventory hashes. Durable exclusive grant intents reject replay;
  resume additionally binds the exact prior intent and unchanged inputs. DDL/deploy/stop
  and resource creation are not runner actions. Resources are closed after completion.
- Synthetic child-process acceptance now exercises this runner for backup/resume and fresh
  restore/reopen with real local REST/S3 clients backed by native D1/R2.

## Blocking finding: filesystem-pinned I/O

Per-operation path checks do not eliminate the interval between check and write. The reused
binding core can recursively create claim directories. Unmount after check can expose the
underlying host mountpoint. Directory-FD child I/O through `/dev/fd/<fd>/child` did not work
in a safe probe on this Mac (ENOENT). We do not substitute more checks or fixed waits for
filesystem-pinned writes.

Therefore **real image execution is refused before I/O** with
`image-io-pinning-unavailable`. The new non-synthetic runner also requires a dedicated volume,
so omitting the image grant cannot silently select boot storage. Only synthetic image
observations are executable in this candidate. Existing boot-host library behavior remains
for prior scope; it does not satisfy the new independent-volume requirement.

Next required implementation is native descriptor-relative I/O (or an independently verified
OS mechanism with equivalent non-fallback behavior) throughout backup/journal/claim/staging
writes, with fault injection between successful check and each write. No privileged helper
was installed. The image path/name correlation also does not independently prove the inode
of the object originally attached before a possible rename. Actual preparation must bind
attach receipt/backing identity; present metadata is not historical provenance.

## Keys and recovery

Reference/purpose separation does not prove different key material or successful volume
unlock. Volume key material is deliberately not retrieved by this runner. Creation must
use separate volume and archive keys, a dedicated private Keychain entry per version, reviewed
access control, named custodian and independent recovery of both keys. Retain old archive keys
for retained backups; never overwrite/auto-rotate an entry. A replacement key requires a new
approved keyId/host/grant. Key loss without an independent copy is unrecoverable, not an excuse
to bypass AEAD. JS strings/runtime copies and malicious same-UID processes are not securely
erased/excluded by this library. Do not pass secrets in argv, chat, logs, Git or packets.

Temporary plaintext, sidecars, claims and crash debris must all remain on approved encrypted
storage. Preserve UNKNOWN/PARTIAL debris; no automatic unlink, cleanup or forced retry. SSD
unlink is not secure erasure. Retention, key destruction and resource deletion need approval.

## Real Cloudflare acceptance and approval boundary

No real resource or write credential has been approved or created. The prior read-only result
remains: D1 REST schema batch supported; R2 bucket management GET denied403. We did not retry
that failure or switch OAuth. S3 bearer management credentials are not S3 access/secret pairs.
Source needs D1 Read, Worker metadata Read, R2 bucket identity Read and source-bucket-only S3
Object Read. Target needs metadata Read, D1 Write and target-bucket-only S3 Object Read/Write.
D1 per-database server-side IAM is unproven: account-wide Write plus a local allowlist is not
target-only authority. Check actual policy first; if unavailable, an approved separate restore
Account is the alternative. Do not probe write denial on Production data.

Proposed resources (not created, no UUID invented):
- synthetic transport smoke: `sound-cruise-studio-transport-smoke-20261031` D1 and R2
- actual fresh restore: `sound-cruise-studio-restore-drill-20261031` D1 and R2

No product bindings, public bucket/domain or HTTP service. Source Production IDs are denied.
Do not reuse the smoke target as a user-data restore target. Partial/claimed targets stay
isolated with no automatic repair/deletion. Obtain explicit Account, names, scopes, budget,
retention/deletion custodian and post-creation ID/readback approval conditions before creation.
Costs are storage/read/write/request based; capacity and a hard budget cannot be inferred
from the Mac's free space or synthetic test. No additional plan or spending is authorized.

## Freeze and cutline

v138 normal configuration does not prove freeze. A complete inventory must cover HTTP,
workers.dev/version/override/service, Scheduled/cleanup, external SQL/R2 and manual writers.
Close admissions, independently observe old inflight completion and R2/D1 partial states,
then issue a signed cutline only when UNKNOWN/PARTIAL is absent. Cron removal does not drain
already-running work. External signed evidence is checked, not generated from registry emptiness.
Current v138 has no newly deployed full-writer stop/drain observer from this PR.

After SEALED backup/cutline readback, resume Source only by verified inverse operations;
fresh isolated restore may continue without extending Source downtime. Never restore Production
and erase normal B's later updates. Freeze, DDL schema serialization and Canary legacy-writer
exclusion are separate gates. Unknown or budget expiry is not automatic rollback/resume approval.

## Acceptance scope

New host/key/runner fault tests are separate from the prior 32-block native regression.
No stock-Miniflare102/session-bookmark/Cloudflare remote parity is claimed: use the same reviewed
private logical102 runtime as PR66. No real encrypted image/Keychain/S3 credentials were tested.
The existing encrypted core and SQL were not weakened. Package-only patch0.1.3; Worker runtime,
Wrangler configuration, frontend/cache and Production v138 remain unchanged.
