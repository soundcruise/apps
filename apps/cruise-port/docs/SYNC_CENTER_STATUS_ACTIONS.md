# Port 1.24.26 — Sync status and recovery entry

## Fixed basis and scope

- Main at start: `1e8e7eadca7a7eb541c727b47d4216e33a682886` (PR #157 merged).
- Public static `app-version.js` reported Port **1.24.25**. Candidate: **1.24.26**.
- Studio remains **0.71.1**. Its 34 release files are byte-identical to the base.
- New isolated branch: `codex/port-sync-status-actions-20261102`.
- No main merge, Pages publication, Production Worker operation, real Account use or real device Sync was performed.

## Confirmed causes

1. `port-sync-controller.js::readLocalStatus()` deliberately reports a retained AppDevice credential as `stale` before explicit activation. This is not a detected data conflict. In 1.24.25, `createPortSyncStatus()` identified an unstarted page only when **no** credential existed. A retained credential with a stopped owner therefore fell through to `attention`. The same synthetic scenario reproduces this in the published main source and displays stopped in the candidate. The destination count describes Account memberships, not Port Sync progress or conflict count.
2. The status label is a live-status **SPAN**, not an action. The real start control was at the end of the view. `onPortConflictOpen` only optionally called the resolution UI's `refresh()`. That UI is installed when the explicit runtime exists; opening the page with saved conflicts after a fresh load left no controller to call. The button could silently do nothing.
3. A failed explicit start disposes the owner. An overlapping local paint could then reject while reading that disposed store's Outbox. This left app rows checking. A later local paint could also erase the explicit start error. Both were reproduced with synthetic rejected API responses and fixed in the existing view code.

The user's **specific iPhone record state remains uninspected**: USB discovery did not recognize an iPhone during this task. A screenshot with five destinations alone cannot prove whether real conflicts or pending errors exist. No phone data was accessed or changed.

## Minimal changes

- Distinguish unstarted/stopped from actual conflicts, terminal failures, revoked qualifications, offline and unknown states. A retained credential is never displayed as live verified merely because it exists.
- Move the existing `#port-sync-activate` action beside the Port status; label it **同期を開始・再開**. Reuse its existing `ensure()` path. Extend the existing capture-phase Pro lock to this relocated control.
- Add short state-specific guidance using existing Port typography. The status SPAN remains a status, with an adjacent real button.
- With saved conflicts and no owner, label the existing conflict action **同期を再開して競合を確認する**. Its explicit click activates the same authenticated owner and opens `installConflictResolutionUi`, never a new controller or dialog implementation. With a live owner it simply reopens the existing dialog.
- Prevent duplicate conflict clicks. Surface activation/refusal errors and retain them across local paints until the next explicit check/start. A canceled read-only Outbox enumeration cannot reject the status paint; no operation is discarded or acknowledged.
- A Studio read-only projection cannot overwrite the native activation wording or downgrade a real conflict to stopped/synced. No Studio product file changes are required.
- Change only Port display/entry wiring, version/cache edges, tests and evidence. Account storage, repository, runtime, Pro source, schemas, wire payloads and asset processing are unchanged. Four apps, shared and Worker trees are unchanged; see `sync-center-126/validation.json`.

## Start and recovery semantics

| State | Display / next action |
| --- | --- |
| Account confirmed, no Port credential yet | 同期は未開始 / 同期を開始・再開 |
| Retained credential, this page's owner inactive, no recorded failure | 同期は停止中 / 同期を開始・再開 |
| Recorded unresolved conflict | 確認が必要 with count / existing conflict-resolution entry |
| Offline / revoked / failed pending operation / asset error | Specific guidance plus explicit retry or connection check; never a synced claim |
| Successful convergence | Existing ✓ 同期済み |

Opening the center still performs **read-only Account confirmation**, not bootstrap, push, pull, adoption or automatic conflict resolution. Existing local conflicts can be counted before activation. New server conflicts can only become known through the existing user-started authenticated Sync path. Starting/resuming can transmit/receive existing data: the wording explicitly says so. Unconnected or another Account is never silently adopted. Choosing local/remote/later remains the existing dialog's responsibility.

The earlier transition is still intentional: `7ebba228646210fbfbc4459d76c4ddd386e78d61` (Port 1.22.0) introduced explicit owner activation, but retained the optional-only conflict handler. PR #157 / `e0d4e11c252fcb50431d9df6a552c281857af861` restored read-only Account auto-check in 1.24.25; this patch repairs the remaining display and recovery-entry gap without reinstating automatic data Sync.

## Synthetic acceptance

- Product native Account / stopped status Browser: **9/9**. Includes exact 1.24.25 reproduction; Standard Pro denial; Pro explicit start failure; no unhandled generation error; non-busy app rows; 390/1280 widths; offline, 429/503, Device refusal, A→B→A and no automatic push/adoption.
- Native product Sync E2E: **30/30**. Includes Port standalone and Studio, real form saves, images/attachments, Account A/B isolation, Pro/Device refusal and normal reconnection.
- Recovery E2E: **12/12**, including a cold standalone tab and cold original product page/frame with saved CAS conflicts. Both open the existing dialog; explicit remote resolution is followed by a normal save and convergence. Includes exact pending-operation recovery after ACK loss, 503, image source/final re-edit/removal, icon/attachment conflicts and deletion.
- Focused Port Node: **71/71**. Studio related Node: **60/60**.
- Full Port Node: **1194 PASS / 4 FAIL (1198 tests)**. The same four theme CSS assertions fail on the unchanged main archive (**22 PASS / 4 FAIL**); not skipped, weakened or changed here.
- Studio product Browser: **17/17**: Account/entry, five tools, four original Pro applications, NEWS, five themes, four widths, central/right single-owner frames, audio/Global Stop, unsaved protections and release isolation.
- Jekyll safe build and `verify-pages-output.mjs`: 34 Studio release files match source bytes; development Project/score/Pre-DTM URLs excluded. No publication.
- All requests in synthetic Browser tests are intercepted/blocked. The integration fixture uses a preserved local legacy Worker, **not proof of the exact Production v138 artifact**. Real Account, Safari/PWA/device lifecycle, real microphone and Production two-device Sync are not accepted by these results.

## Reproduce

Use disposable loopback servers only. Serve this candidate with the existing `serve-local-pro.py`, plus archives of main 1.24.25, `7a6663c` (1.24.24) and `7ebba2286^` (old behavior). Set `PORT_FIXED_URL`, `PORT_PREVIOUS_URL`, `PORT_BASELINE_URL`, `PORT_OLD_URL` and run:

```sh
node --test apps/cruise-port/tests/sync-center-observation.browser.cjs
node --test apps/cruise-port/*.test.mjs
node --test apps/cruise-studio/tests/account*.test.mjs apps/cruise-studio/tests/studio-entry.test.mjs apps/cruise-studio/tests/port-data-host.test.mjs
```

Use the existing product/recovery scripts with `STUDIO_NATIVE_ROOT`, the packaged 34-file artifact, `STUDIO_RELEASE1=1`, disposable fixture DB seed and `STUDIO_EXPECTED_PORT_VERSION=1.24.26`. Never point the fixture at a real profile or real endpoint. Screenshots and hashes are under `sync-center-126/`.

## Next real-device action (after separately approved publication)

1. Reopen Port and verify **1.24.26**. Verify the Account matches the intended phone/PC connection; destination count is not a Sync result.
2. If unstarted/stopped, explicitly press **同期を開始・再開**. This starts real data synchronization. No such action was performed by this task.
3. If a conflict is reported, press the adjacent conflict button. Choose which existing data to keep in the existing dialog, or **あとで決める** to retain the unresolved conflict.
4. For offline/refusal/failure, follow the displayed connection/qualification guidance; do not clear site data, reset Outboxes, create another Account or switch Accounts as a recovery shortcut.
5. Stop if Account identifiers differ unexpectedly or the proposed content is not recognizable. Do not bulk-select either side just to make the badge disappear.
