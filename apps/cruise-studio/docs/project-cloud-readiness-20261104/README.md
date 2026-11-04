# Project Cloud release readiness — Studio 0.76.0

Base PR #186: `c9b742912430b3fad4eec22fb19faa23b35330e9`, tree
`7a99bf15853deb920d5dab85ec0d9eab43723672`. Production main remains
`c862e590ead36f41e39574997bf34517120e51dd`. No publication, deployment,
remote DDL, real qualification or real Project operation was performed.

## Adopted source and present production contract

The Project Owner is the existing #147 candidate
`066780ffce9e09cb97762cd35e1b0bfff9fca9da`, traced through #129/#138 and
#124's separate Port attribution boundary. Missing Project modules and their
existing schema/SQL-guard dependencies are restored. Current `account-*`,
`pro-auth-app.js`, `sync-database.js`, `index.js` and configuration are retained.
The actual current helper differences from the old source are therefore exercised,
not overwritten with the historical Worker.

The production entry has no Project import. Its esbuild output is byte-identical
to the pinned current-main entry (SHA256 in acceptance.json). The new modules are
not a new Worker deployment, Account source or Port write route. The retained
maintenance modules supply the existing schema canonicalization/fingerprint and
SQL guard; their maintenance table DDL/services are not installed or activated.

The existing base Project DDL has 15 CREATE statements. The existing RC4 release
DDL has **83 CREATE statements: 23 tables and 2 views**, plus triggers/indexes.
This footprint is inherited, not a new small schema or a proposed replacement.
No list/restore metadata table was added. The release DDL bytes are unchanged from
#147. It is tested as an additive extension to the preserved schema0033 fixture:
shared objects, preexisting Account/Pro/Port/four-app rows and d1_migrations remain
identical, the independent Project marker is verified, initial control is OFF,
and partial installation/replay is refused without clearing data.

No 0034–0037 shared migration, second SQL Owner, new DB, DO, key service or Control
service is required. The existing Project control/retention/evidence definitions
remain part of the inherited optional release profile; this work does not invent
another authority or cleanup engine. The retained schema cannot be treated as a
verification of a remotely unobserved Production D1 schema.

## Read-only catalogue

The existing POST Project envelope gains `kind:'catalogue'`, payload
`{limit, cursor}` (default 20, maximum 25, cursor null or a Project UUID).
It returns `studio-project-catalogue-v1`, sorted `items` with only
`projectId/title/revision/deleted`, and `nextCursor`. Titles are display metadata
(maximum 256 UTF-16 code units); bodies and existing schema2 are unchanged.
Deleted titles are null. Uncommitted pending records are not listed.

Queries are scoped to the authenticated Account, use existing immutable head /
chunk / receipt verification and final credential SQL guards, and return no other
Account's metadata. Existing snapshot reconstruction is sequential, one Project
at a time; no unbounded collection of Project bodies is returned. No side metadata
index/store is introduced. Keyset pagination is not an atomic multi-page snapshot;
refresh discovers concurrent insertions before an earlier cursor.

Catalogue itself does not save, upload, bind local affinity, create Outbox, touch
Account activity or auto-adopt anything. It is distinct from the existing automatic
resume of already linked Projects. Selecting an item also performs no data write.
The explicit receive control uses existing `applyRemote` with exact raw CAS.
Unknown/different-Account local content, dirty drafts, apply intents and unresolved
operations are retained/refused by existing guards. The existing score Project
selector is refreshed via its existing renderer, not rebuilt as a second library.

After entrance qualification the catalogue loads automatically. A new device no
longer needs a Project ID. First sharing of an untracked local Project remains an
explicit Cloud save; a present Account alone is not evidence of its old data's owner.
Linked saves/reopen resume automatically and need no extra Sync-start operation.

## Final deletion/restoration contract

The original same-ID tombstone rule remains: stale/current writes cannot resurrect
that ID. The explicit control is **新しいProjectとして復元**. It requires an
Account-bound existing local copy, current qualification, an exact unchanged local
raw revision and the selected remote deletion revision. It reuses the old local
Project-copy approach, existing repository/Web Lock/final Account transaction and
existing enqueue/send/receipt flow under a fresh UUID with baseRevision 0.

The original raw Project, index entry, tombstone, chunks, conflicts and every old
Outbox operation remain. No outcome of an old UNKNOWN is inferred or erased.
Concurrent new-ID collision is rejected by normal local/remote CAS. A later change
to the original does not overwrite it: this is a copy, not a cross-document atomic
undelete. A quota/network/ACK failure retains any created local copy and its original
operation; the retained recovery panel selects it for explicit same-op reconcile.

When no trustworthy local copy exists, the UI cannot reconstruct deleted content
from a tombstone. Use a retained local/JSON copy with explicit ownership confirmation.
No archive-history endpoint or unconditional resurrection was added. This completes
the chosen copy-restoration specification; same-ID undelete is not claimed.

## Authentication and presentation integration

Current native Account, device-bound Pro source and Project Owner remain the authorities.
Project's shared Session adapter now reuses the native Pro Operation Source instead
of a separate forced device-session renewal. A recent cached native verification is
only a precheck: enrollment/session still requires live Owner HTTP, bound-key matching,
and current Account/Device/Pro SQL authorization. Offline grace alone creates no
Project session. Existing isolated standalone auth behavior is unchanged.

This removes redundant concurrent renewal without changing Port/shared authentication.
Local publication still uses the retained exact-Account readonly fence; all Cloud
writes independently reauthorize in final SQL. The root/retained recovery panel now
projects the same actual result after automatic resume rather than retaining a
misleading 'Cloud Sync未接続' message. Project and Port statuses remain separate.

## Acceptance on the combined candidate

- Related Studio Node **336/336**, no skip; current Worker related Node **46/46**.
- Owner native boundary **33/33**, including CAS, immutable operation/digest,
  Account scope, Pro/device/generation/epoch/schema changes immediately before
  commit, pending preservation, metadata-only paging and zero catalogue writes.
- Existing RC4 additive DDL test **1/1**, including nonempty shared rows, OFF,
  independent marker/journal, replay/partial installation rejection.
- Existing Owner/client/Session recovery protocol **48/48** with current helpers.
  This suite explicitly substitutes its entrance; it is not the product entrance test.
- Current product entrance + RC4 Project release profile **14/14**. Catalogue discovery,
  selected first receive, auto-update/reopen, offline, CAS, ACK/reconcile, original-ID
  preservation, copied-restore ACK loss, separate encrypted backup/restore and
  Port bidirectional Sync in the **same Project-enabled synthetic DB** are covered.
- Current Port/four-app/calendar/local production-tool regression **51/51**.
- Existing image/attachment/ACK/CAS/recovery **12/12**.
- Five themes, 1440/1024/768/390; synthetic screenshots included.
- Actual Jekyll safe build: **81 Studio files/hash match**, 813 native output files
  byte-identical; Project Cloud/developer files/Worker are still excluded.

The native recovery fixture now waits for either its auto-open conflict dialog or
its rendered manual control, then invokes that native control once in a browser
task. This avoids an auto-open/manual-click race and premature hidden-button reads;
no timeout extension, removed assertion or changed product conflict choice is used.

## Remaining production introduction steps (not performed)

1. With explicit permission, compare real schema/journal against the existing
   `studioReleasePlan` preflight and capture the current Worker/frontend version
   and ordinary backup. A mismatch/partial migration stops; do not overwrite schema
   or erase user data. Full historical v138 artifact acquisition is not itself a gate.
2. Approve the inherited DDL footprint, capacity/retention operating values (fixture
   values are not production defaults), and the minimal Project route integration
   in the existing Worker. Apply existing additive DDL initially OFF. Keep current
   Port routes and Scheduled cleanup unchanged; reuse current bindings/services.
   No HTTP request is allowed to install schema. Enable only after accepted routing,
   credential checks and rollback-to-OFF are reviewable.
3. Separately approve the client rollout: its six Cloud modules plus stylesheet
   remain outside the default 81-file Jekyll allowlist, and production origin/transport
   are still deliberately refused. Change these explicit boundaries only with backend
   readiness/approval, not with a UI flag. Then operator Account/Pro on real devices
   accepts catalogue, update/CAS/offline/restore, native generation recovery and Safari.

Normal rollback disables the Project route/client, retaining Project tables,
local Projects and transfer journals. It does not rewind Port/shared Cloud data,
delete Outbox, revoke Accounts or run a bulk DB/R2 rollback. No release announcement.

### Reproduce without Production

Use the existing local runtime and schema seed from #186. For this candidate use
`STUDIO_WORKER_ROOT=$PWD`, not the historical external source, because the Owner
and additive catalogue implementation are now retained in this checkout.
`STUDIO_PROJECT_RELEASE_PROFILE=1` exercises the unchanged RC4 release DDL/policy
in the existing `project-cloud.browser.mjs` fixture. The standard 81-file package
serves the current actual entrance; excluded development Cloud files are delivered
locally by the existing isolated route. Every backend-shaped URL is intercepted;
Miniflare outbound traffic is refused. Use no real qualifications.
