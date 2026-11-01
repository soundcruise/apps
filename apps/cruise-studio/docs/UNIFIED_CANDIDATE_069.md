# Studio 0.69.0 — isolated UI / Sync development candidate

This is a development integration, not a release approval. Project Sync and Port common-data Sync have separate acceptance results. No Production, remote D1/R2, deployment, freeze, backup/restore or main operation was performed.

## Fixed inputs and reproducibility

See `integration-069/fixed-inputs.json` for full heads, bases and trees. All six advertised heads matched at start. The UI base is #137 `c1ee3b207d896409b11a076c99d1e1fb5784ef1a` (0.68.0). Merge #124 `27303ede522ec4be8d04e0d0699e7ae40b9c3f92` first; its ancestry includes #107 → #114 → #119. Then merge #129 `ed9dfc00fca8b59a4c99b2e62699fd03974ba7da`, whose older UI base is #127. #124 is not an ancestor of #129. Both merge parents are retained, followed by integration corrections.

The two merge commits are recorded in the manifest; checking out this candidate reproduces the exact resolution. `writer-conflicts.json` (21 paths) and `sync-conflicts.json` (102 paths) record per-hunk hashes and choices. Most conflicts were coordinated asset-version queries: retain current Studio markup/0.69.0, select #129 Port 1.27.0 and native Account/Sync code, then unify remaining 1.26.0 Port module imports to avoid duplicate singleton graphs. These are hunk choices, not whole-file replacement. Both local Account documents and both sets of image/crop tests were retained.

Remote main was inspected, not integrated: `a993ba3eb41297dacadf56ac6714199548333949`. #93 (`9eedf90056cd2f29c4c222ecf8bdd9c71d416a74`) remains a separate CURRENT-clock/operations dependency requiring its own owner review. Production/backup/freeze candidates #58/#61/#63/#66/#67/#79 are outside this development integration. No newer applicable Sync PR than #129 was found in the open-PR inventory.

Use a new directory, never an existing working tree:

```sh
git fetch origin codex/studio-unified-20261101
git worktree add -b codex/studio-unified-followup /path/to/new-checkout origin/codex/studio-unified-20261101
```

## Kept UI and integration repairs

- Keep 0.68 Home, five themes, score/form/bar editing, explicit save/JSON/A4 PDF, existing Pre-DTM JSON/MIDI, four internal Pro apps, sidebar resize, independent central/right navigation, centered Chord board, NEWS placement and narrow action wrapping.
- Adopt #129 native Port Pro entry for the five surfaces. Port continues owning DOM/controllers/auth/stores and Account/Sync initialization. The former common-component document remains available for isolated contract tests; it is not the regular entry.
- Native gate completion precedes route selection. Studio-only presentation hides precise Port-home controls; My Apps contains only its own home section. It does not hide auth/Sync dialogs or write display settings.
- Studio removal pauses the native practice timer through its original control before native pagehide. Audio/frame ownership, Global Stop and unsaved/crop guards remain in existing shell owners.
- Restore access to the existing chord-form panel from the score toolbar. The UI cleanup had hidden its only normal entry inside the developer Inspector; no form logic or schema is duplicated.
- Cloud Identity/Session source and schema2/CAS/Outbox remain the fixed candidates. Ordinary boot stays disconnected. Synthetic fixture gate replacement exists only in test servers/routes, not distributed product authority.

## Deliberately deferred #129 hunk — P2 / HOLD

`port-writer-context.mjs` retains #124's strict rejection of any Studio Project identity. The #129 relaxation would admit a Project-bound Port writer solely because the shared Account DB API exists. DB presence proves neither Port Owner admission nor dataset adoption. A new test proves rejection even with that DB API present. The exact Account-row IDB publication fence is retained.

Consequently native Port's attribution/Sync product E2E cannot complete the Studio-B opt-in. The full test remains failing with diagnostic evidence; downstream Gear/asset/attachment shared-Sync operations are not reported PASS. Synthetic anonymous local UI saves and isolated Owner repository tests are different evidence, not a substitute.

Required contract before unlocking: trusted Owner admission bound to Account, Device generation, dataset identity/epoch, Pro operation source and exact repository revision; revocable publication fence; explicit attribution/adoption UI; reject stale Account/Device, pending UNKNOWN and noncooperating writers. Do not reinterpret a Project token or Pro entitlement as this admission. Keep existing bytes and drafts on refusal.

Additional HOLDs:

- Native four-app `midnight` theme is a valid local display value but the legacy Sync theme enum still accepts four values. Schema-owner approval/migration is a separate change; do not silently rewrite the theme.
- Formal Studio entrance authorization and a trusted entitlement handoff to all internal apps are not a release-accepted contract. Normal fail-closed behavior is retained.
- Real Account/Pro, physical two-device Sync, Safari/phone, real microphone and Production were not tested.
- Noncooperating legacy writers and origin-wide unowned stores are not made safe by isolated repository passes.

## Integrated validation

All tests below use the integrated checkout, not results copied from source branches. Browser profiles and native Miniflare state are newly created under temporary directories. SQL fixture initialization touches only those disposable local DBs; network routes serve checkout files and dispatch synthetic requests to local workerd. Other origins are aborted; workerd outbound access throws. No real credentials/data are used.

- Port + shared Account/runtime Node: **2,819 pass, 0 fail, 0 skip**.
- Studio product Chrome regression: **45 pass, 0 fail, 0 skip**, including local Pro controls/presets, image source/final crop/recrop/delete, practice calendar/timer, dirty/crop leave guards, four-app frame transfer, 5 themes × 1440/1024/768/390, score/Undo/JSON/PDF/MIDI, NEWS and Global Stop.
- Project client E2E: **32 pass**, including two-device synthetic CAS, ACK loss, UNKNOWN/reconcile, crash/reopen, offline, tombstones, delayed replies, generation/revoke refusal, no credential in Outbox, and Project-only Port write quarantine with draft retained.
- Session/recovery E2E: **48 pass** including Account/Device/Pro boundaries, adoption recovery, receipt binding, concurrent commit/adoption and batch ACK checks.
- Explicit standalone Identity-host UI contract (`accountStorage:null`, not the default shared host): **25 pass** against real local Account/Pro handlers, including P256, wrong passcode, recovery/renewal, CAS UI, expiry/dispose and secret-free Outbox. It does not prove native shared-host acceptance.
- Native Owner boundary: **28 direct-boundary checks pass**. Product acceptance remains false.
- Worker-related Node batch: **106 pass, 0 fail, 1 skip** (dedicated Owner test in that batch). The dedicated Owner test was then explicitly executed as the 28-check run above.
- Native Port/Studio product Sync E2E: three initial checks pass, then fails at attribution/opt-in. This is retained as HOLD, not skipped or relaxed.

The four preexisting Port theme-test failures came from stale NEWS flex/grid expectations, a no-op negative mutation and a Dark stylesheet hash pinned to 1.12.0 despite later released changes. The exact pre-integration #137 Port stylesheet blob `39aed12572b30cf776003f039a18bdd61bf223f0` is unchanged; tests now pin that actual baseline and still reject changed layout/spacing. All structural/negative checks pass; no product theme CSS changed.

Old Browser tests clicking developer-only Inspector were updated to the visible score form button or current right-window/resize controls. My Apps tests wait for real native readiness before clicking the inert boot shell. No authentication expectation was weakened.

This was a single-implementer audit, not an independent reviewer. No P0/P1 was found in the executed scope; that is not a complete security finding. P2 Owner/credential integration remains a merge/release HOLD.

## Follow-up order

1. Review this candidate and adopt its exact commit as the sole development baseline; keep source PRs immutable. Do not merge to main while the P2 contract remains open.
2. Sync owner resolves the missing Owner-admission handoff. Re-run the unchanged native product test through attribution, metadata and source/final asset roundtrip, account replacement, pending Outbox and Pro revoke; add a two-tab late-publication race.
3. Approve the theme enum change separately and verify old/new clients without data loss; wire the final trusted entrance entitlement source without per-tool bypasses.
4. Re-run Studio/Port/Cloud contracts and product E2Es on one exact commit, then independent storage/auth review. Exercise Mac Chrome real microphone, permissions, IME, pagehide and print; subsequently Safari/phone and two physical devices with dedicated test identities.
5. Production readiness, operations dependencies and deployment approval remain a separate process. This draft authorizes none of them.
