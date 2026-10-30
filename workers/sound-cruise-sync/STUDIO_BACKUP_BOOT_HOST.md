# Backup Host B: pinned boot-directory candidate

## Decision and comparison

Select **B** for the first release: a private directory on the existing FileVault-protected
boot/Data APFS filesystem, containing PR66 AES-256-GCM backup pages. Use a native macOS
openat-based filesystem adapter for every archive, checkpoint, claim and journal access.
No image attach/detach or fallback mountpoint is involved. PR67 image mode A remains
`image-io-pinning-unavailable`; its historical document and guard are preserved.

| Requirement | A: dedicated image | B: pinned boot directory (selected) | C: separate host/storage |
|---|---|---|---|
| Confidentiality at rest | image key + archive key; actual image unproven | FileVault + archive AEAD; data bodies never staged as plaintext files | depends on that host, encryption and operator controls |
| Destination identity | backing object/mount/unmount binding unresolved | retained directory FDs, approved dev/inode/fsid; no image lifecycle | still needs pinned/transactional storage API |
| Crash | image/attach/key recovery plus checkpoint | durable checkpoint, one-shot claims, explicit resume/reconcile | must establish its own crash/runtime contracts |
| Independent recovery | needs both image and archive keys | archive key only plus independently stored encrypted archive | can add hardware/failure-domain independence |
| Added rollout work | image creation, capacity, key, attach/backing proof, detach acceptance | native helper build/pin; dedicated directory and three existing-purpose key references | host provisioning, permissions, transport, same crypto/restore acceptance |
| Initial release | currently HOLD | fewer prerequisites; isolated technical candidate accepted only after fixed tests/review | retain as fallback or independent-copy destination, not newly implemented |

B is not an independent backup simply because FileVault is enabled. Same disk/Mac failure
can destroy both operational artifacts and local Keychain. An independently retained
**encrypted archive plus its externally pinned manifest**, and an independently recoverable
archive key, are required before Production backup approval. No off-host copy or real key
recovery has been performed by this change.

## Exact guarantees and threat boundary

`storageKind: boot-fd-v1` must be explicit in the signed Host grant. It binds absolute root,
root/claims/journals dev+inode+mode, filesystem fsid/mount/type, volume UUID, native helper
path/hash, capacity threshold, key-material SHA256 and recovery/custodian reference.
The native adapter requires APFS mounted at `/` or `/System/Volumes/Data` and the boot
mount's device. FileVault status and observed volume UUID/device are checked at Host open.
No volume is created, mounted, unmounted, resized or reconfigured.

* Directory walks use openat with one component, O_DIRECTORY and O_NOFOLLOW. Files use
  O_NOFOLLOW/O_CLOEXEC, wx uses O_CREAT/O_EXCL, and opened regular files are checked for
  same device, current uid, private permissions, one link and bounded size. NUL and unsafe
  paths, non-safe numeric identities, special files, symlinks and hardlinks are rejected.
* Every used directory remains open; path/name bindings and approved initial anchors are
  checked around I/O. Reads/writes/fsync target those FDs. Rename and unlink use directory
  FDs, never an independently re-resolved absolute data path.
* Root or ancestor rename between check and write can let an already-issued syscall finish
  on the **original approved object**, not on the substituted directory. The outcome is
  rejected/UNKNOWN with no automatic retry. This is not instantaneous cancellation.
* AsyncLocalStorage routes the whole signed runner (including execution intent) and each
  exported Host operation through the exact adapter. Unsupported active-scope methods fail;
  they never fall back to ordinary path I/O. Legacy test/image paths are separate.
* A nonblocking flock on the root serializes participating Host processes. Durable exclusive
  target claims survive process exit. A lock is cooperative; deleting claims is prohibited.
* Helper executable and ancestors must be canonical, nonsymlink, owned by root/current uid,
  and not writable by group/others. Its SHA256 is approved before loading. Trusted executable
  code, macOS kernel, root and the operator uid are part of the trusted computing base.
  This is not a sandbox against malicious same-uid/root code, debugging/key theft, privileged
  volume/permission changes, or a compromised executable. Root can defeat FileVault after unlock.

Each file sync uses fsync plus F_FULLFSYNC; directories are fsynced after creation/rename.
The regression proves abrupt **process** death and recovery, not hardware power-loss behavior.
Any failed completion or unreadable journal requires conservative reconcile/new approved scope.
An IN_PROGRESS journal is not evidence that nothing was written.

## No plaintext data-body staging

PR66 backup encryption, transport, full readback and semantic validation are reused.
The R2 restore provider now streams decoded chunks into at most one 5 MiB payload buffer,
awaits each multipart upload before reusing it, and uses a single put for <=5 MiB objects.
It creates no `.body` file. There are additional bounded decrypted-page/base64/SDK buffers,
manifest memory (up to the existing 32 MiB limit), and multipart receipt metadata. Thus 5 MiB
is not a total process memory bound. Objects needing >10,000 such parts fail closed.
Pending payload memory is zeroed when the target is disposed; JS strings/SDK internals cannot
be guaranteed fully zeroized. Swap, sleep images and process inspection rely on host protection.

The empty legacy-named staging directory can remain as an exclusive operation marker; it
contains no data body. Journals/checkpoints/manifests contain resource identifiers, counts,
hashes and schema-table metadata, not source row bodies. Keep them private as operational
metadata. Unlink is not claimed as SSD secure erase. Incomplete remote multipart uploads or
PARTIAL/UNKNOWN targets are quarantined for separately approved inspection/cleanup; no automatic
retry, abort, target reuse or Production rollback is added.

## Keys and recovery

The explicit boot key grant uses **archive / management / s3**, with distinct service/account
references and purpose/keyId checks. It does not require an unused image-volume key.
Archive bytes must match the signed material fingerprint in both key and Host grants.
Keychain is accessed only through the existing read-only handle, never key generation, ACL
mutation or automatic rotation. Synthetic tests inject temporary keys only; no real Keychain
secret is fetched in acceptance. Reference separation alone is not real IAM isolation.

Losing the archive key remains fatal unless the approved independent key recovery succeeds.
Synthetic acceptance verifies a separately copied encrypted archive in a new process using
an independent in-memory recovery copy after clearing the primary key. This is not real
custodian/off-host recovery proof. Production needs an actual recovery ceremony before data use.

## Build and test

Compile the reviewed helper into a NEW repo-external absolute path:

    NODE_INCLUDE_DIR=/absolute/node/include node scripts/studio-operations/build-pinned-io.mjs /new/approved/pinned-io.node

The builder refuses an existing output. Pin source, binary, compiler/architecture and header
version. No binary is checked into Git. The signed Host grant supplies addonPath/addonSHA256.

    STUDIO_PINNED_FS_ADDON=/approved/pinned-io.node STUDIO_BOOT_TEST_OUTPUT=/new/output node --test test/studio-boot-filesystem.test.mjs
    STUDIO_PINNED_FS_ADDON=/approved/pinned-io.node STUDIO_BOOT_HOST_TEST=1 STUDIO_OPS_OUTPUT=/new/output STUDIO_TEST_RUNTIME_102=/approved/runtime/package.json node test/studio-operations-adapters.test.mjs
    STUDIO_HOST_OUTPUT=/new/output node --test test/studio-host-provider.test.mjs

The native102 cohort still uses the prior private Miniflare transport adjustment for the
logical production102 schema. It is not remote Cloudflare D1/S3 acceptance. It uses synthetic
credentials, disposable native resources and local HTTP. Child result/exit records are unique
per attempt, so a later expected reuse denial cannot overwrite the successful restore receipt.

## Production prerequisites and prohibited actions

Isolated Host acceptance does not authorize Production Backup/Export/Restore, Cloudflare
resource creation, long-lived keys, writer freeze, cron, DDL, deploy, Activation, main/Pages.
Before any real backup: approve directory/native binary and capacity; create distinct long-lived
Keychain entries and verified independent recovery; approve off-host encrypted-copy destination;
create separate smoke and unused fresh restore resources with real identity/readback and scoped
permissions; pass synthetic remote transport acceptance; establish actual exhaustive writer
admission closure and in-flight cutline; approve exact source/destination/hash/window/operator.
Studio v138 OFF is not writer freeze. Preserve normal Account B and all five legacy apps.

Sources: Apple Platform Security, Volume encryption with FileVault:
https://support.apple.com/en-ca/guide/security/sec4c6dc1b6e/web
Darwin openat/O_NOFOLLOW/O_DIRECTORY/F_FULLFSYNC contract: local macOS SDK sys/fcntl.h,
Apple XNU https://github.com/apple-oss-distributions/xnu/blob/main/bsd/sys/fcntl.h
