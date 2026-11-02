# Port 1.24.27 — proven-connection automatic resume

## Basis and history

Base: main `eeb8a1c1740bd87a6f133ce25cb6907500c669b7` (Port 1.24.26; PR #158 merged).
New isolated branch: `codex/port-sync-auto-resume-20261102`. Studio remains 0.71.1.

Port 1.21.3 called `ensure()` at product boot and orchestrator `resume()` when opening the Sync Center. `7ebba228646210fbfbc4459d76c4ddd386e78d61` (1.22.0, 2026-10-11) introduced the shared owner host, Account-scoped stores and async/commit fences, and removed unconditional activation. Its rationale was to prevent Account presence or a read-only view from provisioning a Port Device, adopting appId-only legacy state or bootstrapping a dataset. That rationale remains valid. 1.24.25 restored read-only Account checks; 1.24.26 fixed stopped-state presentation and conflict re-entry. This patch restores only the proven existing-connection subset of automatic data Sync.

## Exact automatic conditions

The native product opts into `bindAutoResume({assets: portAssetSync})` after normal Pro-gated product initialization. A reader cannot enable it. Startup, visible return, `pageshow`, `online` and focus use the same host and coalesced activation promise; an already active runtime retains its existing lifecycle/poll policy.

All these conditions must hold:

1. Existing live Pro capability allows Sync; the document is visible and online. This is a scheduling check, **not** a replacement for server Pro authorization.
2. The native Account generation has not changed since the hook was bound, or since a later successful **explicit** activation. A→B→A within a document does not re-arm automatic activation by returning to the old ID.
3. No pending native Account start/consume/bridge/recovery/detach/delete operation exists.
4. The **current Account-scoped Port DB** has a valid AppDevice credential, active membership, `migrationState=complete`, `datasetState=ready`, positive finite `lastSyncAt`, `legacyInspected=true`, no pending provision and no recorded credential-invalid state.
5. Native `PortAssetSync.status()` reports known, error-free binary/reference state with no pending work. This reuses existing photo/icon/attachment readiness rather than duplicating binary ownership logic.
6. Current serialized Port records match that Account's existing shadow, pending Outbox payloads or saved conflict-local records. Missing records must match an existing deletion candidate. Global delete intents must match an Account-scoped pending tombstone's existing intent generation. Historical completion alone does not attribute new origin-wide local edits after a switch/reload.
7. The existing authenticated `AccountClient.devices()` accepts the current Account Device and reports the stored Port AppDevice under a non-revoked Account device. Native runtime snapshot/push paths continue to validate the Port Device and Pro proof.
8. Existing native activation/execution locks and generation checks hold throughout. The automatic branch cannot provision, inspect/adopt the appId-only legacy DB or call `initializeDataset()`; it can only run the existing `runtime.sync('auto-resume')` on a complete dataset.

No new persistent consent flag, Account/Owner record, DB, table, key, Worker, controller, wire field or Sync path is introduced. The only additional state is the existing host's in-memory lifecycle bookkeeping and a display-only fallback reason.

## Conservative fallback

Existing state cannot prove ownership of every unsent edit in origin-wide localStorage. A new photo, attachment or deletion queue may likewise predate the current Account. Those cases do **not** automatically bootstrap, transfer or send data. The native Port row retains the explicit start/resume action and explains that local Account attribution cannot be confirmed automatically.

A legacy appId-only DB is also not sufficient: one explicit activation must perform the existing authenticated legacy check and complete the Account-scoped setup. Once established and consistent, later clean launches resume without that button. Account confirmation alone, Account DB existence alone, Pro alone and a cached `ready` value are never sufficient.

This is intentionally narrower than unconditional 1.21.3 `ensure()`. Fully established clean connections and attributable structured Outbox retries resume automatically; uncertain local/binary work remains explicit. No new ownership scheme is invented to fill that gap.

## Lifecycle and images

Account changes still stop/abort the old owner and invalidate old callbacks. `pagehide` stops the native runtime; a persisted-page return rechecks the existing connection. Last-owner release removes both active and cold-return listeners. Explicit start while the automatic eligibility check is in flight is sequenced into a real explicit activation rather than being swallowed by a negative automatic result.

A startup/reconnect race was reproduced in the image conflict suite: read-only local status could publish a persisted `ready` marker while a new runtime was not yet verified. Asset work could then run ahead of structured verification. `PortAssetSync.schedule()` now waits for the native host's **live usable** state before scheduling binary/reference work. Existing backend authorization and owner guards remain authoritative. No image format, upload protocol, conflict-resolution algorithm or shared file changed.

A verified synced row hides the unnecessary start/resume button; stopped/error states retain it.

Saved conflicts still use `installConflictResolutionUi`. Automatic resume can surface attention but never chooses local/remote or dismisses an unresolved conflict. The user selects the existing adjacent conflict action. UNKNOWN/ACK-loss, tombstones, payloads and operation IDs remain the existing runtime's responsibility.

## Synthetic acceptance

See `sync-auto-resume-127/validation.json` for the final counts and screenshot hashes.

- Native product Sync E2E: **34 cases**, including four new product cases: standalone cold boot at phone width, Studio cold iframe boot, PWA-style pagehide/pageshow plus offline→online, and completed B evidence with foreign A local edits after switch/reload. Cold positive cases never click start or call ensure; they assert synced state, unchanged AppDevice credential, and no provision/bootstrap request.
- Existing product cases cover Standard/Pro first connection, invitation join, initial receive, Account A/B Outbox isolation, old form/image retention, live Device/Pro refusal and native reauthentication.
- Recovery E2E: **12 cases**: exact-operation retry/own echo after ACK loss, 503/network, image source/final re-edit/removal, icon conflict, attachment deletion/replacement, two-device CAS and existing conflict resolution after cold standalone/Studio boot.
- Node covers completion prerequisites, legacy-only/partial setup, local mismatch, own pending/conflict candidates, A→B→A, offline/online, Pro/Device refusal, native Account pending operations, pending/unknown asset status, concurrent explicit start and asset startup ordering.
- Studio Browser regression: **17 cases**, plus native read-only status Browser **9 cases**. The fixture now waits for native `componentState=ready` in embedded pages before navigation. Page/Frame screenshot handling was corrected. Sync helpers open the current owner’s native center so a parent navigation fallback during remote-apply reload cannot invalidate their frame handle; parent navigation is covered separately. Timeouts were not extended.
- Studio product files remain unchanged (34 byte-identical release files). Four apps, shared and Worker trees remain unchanged. Jekyll safe-build release/development isolation is rechecked.
- Four existing theme Node CSS assertions reproduce on unchanged main; they are not skipped or weakened by this patch.

All data, Accounts, devices, qualification proofs, DBs and asset buckets are disposable synthetic fixtures. Production network is blocked in those fixtures. A preserved local legacy Worker is used, not a certification of exact Production v138 contents. Real Account/Pro, iPhone/Safari/PWA lifecycle, real microphone and Production two-device acceptance remain unperformed.

## Reproduce and next device check

Run the existing Port Node suite and product/recovery scripts with a disposable local fixture, packaged Studio release artifact, `STUDIO_NATIVE_ROOT`, `STUDIO_RELEASE1=1` and `STUDIO_EXPECTED_PORT_VERSION=1.24.27`. Never use a real browser profile or qualification in the synthetic preview.

After separately approved publication, establish the intended Account once using the existing explicit operation if needed. Close/reopen Port without local pending edits, then verify automatic synced status. Repeat a background/foreground and offline/online return. Compare the Account before testing a small operator-owned two-device change. If local attribution, binary work or a conflict needs confirmation, use the displayed native action; do not clear site data or switch Accounts as a shortcut. No real-device synchronization was started by this task.

During work, remote main advanced to `7bf1f9fd9e96354505fc9e9f9561ecdfa3cd95f4` through PR #159. Its diff is confined to `workers/sound-cruise-news/`; there is no Port/Studio/shared/Sync overlap. The task base remains fixed; no merge or rebase of that separate NEWS work was performed.
