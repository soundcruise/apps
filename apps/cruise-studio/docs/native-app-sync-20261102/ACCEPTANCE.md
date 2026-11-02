# Studio 0.72.0 — native four-app Cloud Sync

## Scope and connection contract

Base: PR #172 `ce2af39dddd8ad36b8fab0fd54f4e9f1d63e71ef` (calendar retained).
Main observed before/after work: `17f29d54f9c8f74657f2b0d74a8492f80caede10`.
Worktree: `studio-native-app-sync-20261102/Cruise_apps`; branch `codex/studio-native-app-sync-20261102`.
No main merge, Pages publication, real credentials, real Account operations or remote backend changes.

The original Studio importer stripped every shared Account/Sync script. It now retains native Sync scripts, adapters, styles and settings cards. Only duplicate Pro gates, standalone service-worker registration and the standalone Turnstile provider are omitted from the embedded page. Pro operation proof still comes from the formally authenticated Studio entrance and native backend entitlement code; an iframe URL or display flag does not grant backend authorization.

- Pitch, Fretboard and Rhythm: existing `multi-app-sync-bootstrap` → AccountClient invitation/handoff → native per-app IndexedDB/AppDevice → MultiAppSyncRuntime → existing native adapter.
- Chord: existing `sync-bootstrap` + `sync-account-orchestration` → native new-app promotion/bridge → dedicated Chord client/merge/IndexedDB. It does not use the generic three-app runtime.
- Every first connection checks authoritative Account summary and membership. A saved AppDevice must be present, active and for the exact app in the current Account's authenticated device list. Same name or a local Account DB alone is insufficient.
- Pending membership uses the existing Join invitation; active membership uses the existing handoff. A Web Lock serializes the existing singleton pending-consume record across hosted app connections.
- Native grant consumption normally replaces the shared Account Device. In a same-origin Studio container, the existing AccountClient receives a storage facade which verifies the same Account and retains Port's canonical Account Device. The native AppDevice is still persisted by the native client in its existing store. No second Account record, storage key, DB, schema, server endpoint or Sync engine was added.
- The parent watches the existing Account generation event; a change aborts native transport/transactions and disposes the owner. Pro invalidation denies subsequent writes. Center/right transfer preserves the same iframe and owner; closing disposes it. Existing native online/visibility lifecycle resumes synchronization.
- Unbound pending/shadow/conflict data or an AppDevice belonging to another Account is held with local data intact. Untracked local edits under an otherwise valid AppDevice require the existing native explicit review. Native save/online callbacks cannot bypass that review. Exact native pending operations permit legitimate offline edits to resume under their original Account.
- The Studio heading receives the native settings presentation even when that app temporarily removes its Settings DOM; it does not compute a second Sync status. Success requires native synchronization completion, not just Pro admission or a grant.

## Narrow native changes

Shared bootstrap/runtime hooks are optional. Hostless smartphone/standalone apps retain their existing connection policy, storage, payload and terminal-detach behavior. New `retainTerminalIdentity` and `captureOfflineSaves` options are enabled only by Studio. Hosted offline edits enter the existing native Outbox instead of becoming unattributed local differences after closing the frame. Synchronous owner-guard failures in native event callbacks are caught.

Chord uses optional owner/lifetime hooks, single-flight hosted synchronization and its existing persisted retry deadline/backoff. A one-shot startup sync previously left a preserved offline operation pending when its retry deadline was still in the future; the hosted client now schedules the same native deadline. Native settings controls refresh after remote settings are applied. The same Chord merge-screen DOM is placed beside its summary card so a status redraw cannot destroy it. After a verified explicit conflict choice, an exact reviewed older offline operation is retired even if a pull discovered the conflict before that operation reached push; newer/unrelated operations remain. A dedicated native-client test proves both retirement and preservation, using existing backup/merge records. An incomplete existing Chord DB is reported without deletion, recreation or a version change.

Chord patch version: 1.21.1. Its established all-assets version convention is retained. Pitch/Fretboard/Rhythm app implementations and version constants are unchanged; their Pro HTML only advances the changed shared-script cache references. Port HTML has the same cache-reference update; Port remains 1.25.3. Studio stays the requested 0.72.0 candidate.

## Evidence and acceptance limits

See `RESULTS.json` for final test counts, artifact hashes and invariant paths. Screenshots contain synthetic data only. All product browser requests use a completely local synthetic Worker/D1/R2 and disposable Chrome profiles. No external production requests are forwarded. Native frontend code is current; backend fixture uses the previously preserved Worker artifact, not a claim of exact Production v138 equivalence.

The four-app product scenarios compare the actual saved native value, Cloud record and native control, not merely a Sync badge. They exercise UI-triggered automatic writes, first Cloud receive, two-way edits, reload/automatic resume, same-iframe center/right movement, ACK loss, explicit native settings-conflict resolution, offline Outbox, foreign-Account rejection with exact data retention and return to the original Account. Device-revocation tests use synthetic local SQL only. Separate untracked-data tests verify native explicit review cannot be bypassed by edit/online callbacks.

The existing Port product scenarios and 12-case image/attachment/recovery suite remain separate from the four-app claims. The native runtime/Chord unit suites also exercise hostless behavior. Browser UI tests cover #172 calendar edit/save/delete/reload, unsaved protection, Global Stop, five themes and four widths.

## Operator acceptance after a separately approved publication

1. Keep the current production Account and browser profile. Do not clear storage, rejoin or upload old test data as a shortcut.
2. Confirm Studio's Account and the phone's Account match through their own normal UI; do not copy IDs or secrets into reports.
3. Open each app normally. On a safe empty/same-Account binding it should receive Cloud data automatically. Compare one known setting or saved item with the phone. A Sync Center row alone is not proof of data equality.
4. If a native review appears, inspect the existing local content and Account. Only approve intentional synchronization. A foreign/revoked binding or ambiguous pending state must remain held; do not detach or delete it without a separate decision.
5. After known data agrees, the operator can make one reversible synthetic setting change, observe the phone, change it back and observe Studio. Real writes are operator actions, not performed in this task.
6. Open the calendar centrally and in the right pane; compare one existing note and check that an unsaved note survives navigation cancellation.

Real Account/Pro, iPhone PWA/Safari, actual two-device data equality, real audio/microphone and Production behavior are **not accepted by these synthetic tests**. PR #172's read-only observation found a Chord v2 DB with no stores on the real Mac. This task does not modify that DB. If that state persists, the new explicit schema error safely blocks Sync; read-only diagnosis and an operator-approved preservation/repair decision remain necessary. Do not promise that the real Mac's Chord data is repaired.

Worker/Account/Asset cleanup and Production artifact HOLDs are unchanged. This candidate must not be published automatically or announced as a formal release.

## Synthetic screenshots and rerun notes

The eight `*-cloud-central/right.png` images show the actual four app frames after native Cloud synchronization. `fretboard-native-conflict.png` and `chord-native-conflict.png` show the two existing native conflict interfaces; no Studio copy was introduced. Calendar five-theme/four-width screenshots are produced by the unchanged `internal-apps.browser.cjs` acceptance case.

The existing browser fixtures had several observation races: Fretboard changes screens on Apply, native card actions can be collapsed, an attention placeholder can precede the actual 429/503 result, NEWS headings exist before their article finishes loading, and a focus event dispatched before the previous native refresh settled can be discarded. Tests now wait for the relevant native UI completion/paint and use the actual per-field conflict controls. Expected values, API-count assertions, failure classification and original deadlines are retained. No tests were skipped. Native app owners leave through Home before fixture teardown, and the existing esbuild service is stopped after local Worker disposal.

UI-only synthetic preview: `http://127.0.0.1:52243/apps/cruise-studio/index.html` (localhost fixture, not a real Cloud environment). Never enter real credentials there. Actual native Cloud data equivalence is exercised in the separately isolated product E2E above.
