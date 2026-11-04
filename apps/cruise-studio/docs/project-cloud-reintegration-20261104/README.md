# Project Cloud reintegration candidate — Studio 0.75.0

Base: main `c862e590ead36f41e39574997bf34517120e51dd`. No merge, Pages,
Production request, real Account/Project operation or backend change is part of this work.

## Retained sources and decisions

- #138 `7cbb4d807682122fa03e40ba48b0567cfb2e3794`: historical combined candidate, not a replacement UI.
- #129 `ed9dfc00fca8b59a4c99b2e62699fd03974ba7da`: shared Account session and final local publication fence.
- #124 `27303ede522ec4be8d04e0d0699e7ae40b9c3f92`: Port attribution boundary. Its separate/experimental Port writers are not imported.
- #147 `066780ffce9e09cb97762cd35e1b0bfff9fca9da`: most recent retained Project client/session/codec/panel and Owner/recovery tests used here.
- The native current entrance, Account DB, Pro source, Port runtime, all four native app hosts,
  calendar, score/PreDTM and schema2 repository remain current main implementations.

`document-codec.mjs` and `studio-transport.mjs` are byte-identical to the retained source.
Client differences: remove the obsolete `registerStudioPortContext` dependency and add a read-only
`tracking()` accessor over the existing sealed Account-scoped link. No wire operation or persistent
record shape changed. The old context must not grant Project sessions Port writer authority.

The current shared Account module does not export the old `commitIfAccountCurrent`. The retained
readonly Account-transaction publication fence is scoped inside Studio session adapter instead;
it opens the existing DB, aborts upgrade, verifies exact Account credentials and generation, and
publishes synchronously. No Account write or shared-module patch is involved.

## Current product entry

Normal production boot stays Cloud-disconnected. The real `index.html` and 81-file release keep
Project Cloud excluded. `js/port-pc.js` accepts the existing trusted development injection only on
localhost HTTP or HTTPS `.invalid` fixture origins; production origins ignore it. The retained
transport independently refuses every production Project request, regardless of client flags.

The synthetic product runner injects `__SOUND_CRUISE_STUDIO_CLOUD__.endpoint` and delivers the
excluded development modules locally. This is the current product entrance, with native Account
and device-bound Pro verification, not a substituted entrance or second Identity screen.
A collapsible Project section is added to the existing score workspace in that environment only.
The previous standalone Identity host / registration / recovery credential-entry UI is not restored.

- Valid Account/Pro automatically obtains the existing Project Owner session/enrollment.
- Previously untracked local Projects require an explicit first Cloud save. No current Account
  is inferred as the owner of arbitrary old local data.
- Linked, unchanged local Projects can receive a newer known remote revision with raw CAS.
- Linked local saves send through existing immutable enqueue/upload/commit/readback.
- Both changed: keep both; show confirmation and use the retained panel. No automatic winner.
- UNKNOWN/COMMITTING, local apply intents, missing local data and changed owner hold rather than
  discarding evidence or inventing a new operation. Queued/uploading uses the same immutable op.
- Dirty editors are not imported over. Tombstones retain local Projects.
- Account change disposes/invalidate old clients; the existing Account-keyed journal is retained.
- Ordinary redraws do not renew/invalidate a still-valid Project proof during manual import.
  Saves arriving during an in-flight check are coalesced for a subsequent check, not lost.
- The panel selects the existing active unresolved operation after an automatic send fails;
  it no longer leaves a historical successful operation selected for UNKNOWN reconcile.
- A Cloud delete receipt is displayed as remote-deleted/local-preserved, not a misleading synced badge.

The panel's explicit Cloud save/receive/delete/reconcile are real data operations. They are not
labelled as readonly Account checking. Account management stays with Port Sync Center.

## Synthetic acceptance on the integrated candidate

See `acceptance.json` for sanitized individual cases.

- Related Node: **328/328**, no skips.
- Current native entrance + Project UI product E2E: **11/11**. A/B receive/update/reload,
  offline edit, same-operation ACK reconcile, conflict preservation, remote delete/local retention,
  foreign Account rejection, five themes/four widths, encrypted backup into separate local D1.
- Retained Owner/client/session recovery suite: **48/48** on current schema2 model. Includes
  generation/Pro/device refusal, Account recovery/adoption, late responses, CAS, tombstones,
  corrupt receipts/chunks and large Unicode transfers. Its entrance substitution is explicitly
  protocol-only; it does not stand in for the native product E2E above.
- Current Port/Apps/calendar/local-creation product regression: **51/51**.
- Images/attachments/ACK loss/two-device CAS/recovery: **12/12**.
- Actual local Jekyll safe build: **81 Studio hashes match**, 813 native output files unchanged.
  Project Cloud, development entry, tests/docs/Worker remain excluded.

Fixture corrections are not product fixes: the installed browser runtime was independently observed
resolving an async `false` wait predicate. The new Project checks use bounded observation/evaluation
with the existing 20-second deadline, no operation retry or extended timeout. Existing native recovery
fixture waited for an automatic conflict dialog before its own explicit-open fallback; the fallback
is now exercised first when the same issue has already been notified, matching #183's repeat suppression.

## Owner / release HOLD (not Production PASS)

The existing Owner candidate is materialized from the exact Git commit into an external disposable
directory by `tests/fixtures/retained-project-source.mjs`. No Worker candidate is made the deployed
entry; no Wrangler/configuration/migration/Worker file is changed. Existing test DDL is used only in
local Miniflare; neither a new schema design nor a second Port route is introduced.

The synthetic Owner uses the retained Account/device/Pro generation checks and final SQL guard,
Project-only enrollment, per-document baseRevision CAS, immutable operation digest/chunks/receipt,
and explicit UNKNOWN/recovery. These are locally accepted, not proof that Production has this route,
its required additive tables or deployment/operating acceptance.

Remaining constraints are concrete:

1. Production Project route/activation and reviewed additive DDL are still absent/unaccepted;
   transport stays blocked. Do not enable production by merely changing an endpoint/flag.
2. Old API has **no Project catalogue/list**. B's first receive needs a known Project ID. Normal
   linked-project restart works; automatic discovery of every A Project is not implemented.
3. Tombstones cannot be resurrected with the same ID under the old contract. Local JSON and drafts
   remain available; same-ID cloud undelete is not claimed.
4. An old untracked local Project cannot be assigned to a current Account automatically. Initial
   explicit Cloud save remains. New-project ownership-at-creation automation is not claimed.
5. Real Account, independent Mac/iPhone/Safari, production operations/backup acceptance remain unrun.
   The encrypted restore here covers the existing synthetic backend snapshot, not a Production backup.

Do not restore the old UI, old Port Owner quarantines, legacy Worker bundle as production entry,
or a second Account screen to address these gates. The next smallest step is to accept the retained
Owner API/DDL and catalogue/undelete contract scope in an isolated backend review, then separately
approve production rollout and real-account acceptance. Current Port and four-app Sync need no change.

## Reproduction

Use existing local Miniflare/esbuild/Playwright/fake-indexeddb runtime and disposable directories.
Materialize source with:

```
node apps/cruise-studio/tests/fixtures/retained-project-source.mjs /private/tmp/new-retained-project-source
```

Set `STUDIO_WORKER_ROOT` to that output and `STUDIO_TEST_RUNTIME` to the local runtime package.json.
`studio-session-recovery.test.mjs` uses `STUDIO_CLIENT_OUTPUT` in a new `/private/tmp/` directory.
The product driver `project-cloud.browser.mjs` additionally reuses the existing native product fixture
seed (`STUDIO_SCHEMA_SEED`), `STUDIO_RELEASE1=1`, an explicit package-port-pc artifact,
`STUDIO_NATIVE_ROOT`, `STUDIO_EXPECTED_PORT_VERSION=1.26.1`, and the existing pinned legacy fixture
(`STUDIO_PINNED_WORKER`, SHA256 checked by the existing fixture). All browser/API traffic is routed
into disposable local resources; external backend requests are refused. Never enter real credentials.
