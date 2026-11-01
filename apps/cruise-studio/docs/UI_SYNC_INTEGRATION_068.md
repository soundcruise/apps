# UI 0.68.0 and Sync integration preparation

Read-only inspection on 2026-11-01; no Sync branch or contract was modified. Remote main advertised a993ba3eb41297dacadf56ac6714199548333949. UI base #136 is d18a9548ebe70ae90a70626b4887d3fc0394d8cb; the 0.68.0 commit is the commit containing this document.

## Fixed candidates

- #52 3dd300af4565a2f66e051ff64dfdb9dd6e93e5f7 → #55 185038926ae9112ed914a18e9d31f0142a4b6d79 → #56 a4d85ffa7b6fc23b2845fd21ed7e48af33f6162e; #56 and #106 00a022ca65402888553e580d3f9d10fb754ae89e are ancestors of #136, not changes to reapply.
- Port writer chain #107 f9cdc72b903087c8bf11bba074e0e3228e5cfcae → #114 d32179c874a0a1ef99ad850ef19ebefe5e21cd0c → #119 3770098d3544cc1bcb8b0fe1f0b406b2b89f100b → #124 27303ede522ec4be8d04e0d0699e7ae40b9c3f92. Ancestor relationships verified; adoption HOLD remains.
- #129 ed9dfc00fca8b59a4c99b2e62699fd03974ba7da is a separate Studio/Port Sync UI candidate based on #127 cb68742de16762f9cffc18f62fcce3ee785d6f32. #124 is not its ancestor; do not assume it incorporates the writer chain.
- #93 9eedf90056cd2f29c4c222ecf8bdd9c71d416a74 is a separate CURRENT-clock/Port acceptance candidate. Confirm its intended dependency with the Sync owner before choosing a final integration base.

## Overlap and compatibility

A read-only three-way filename comparison between #136 and #129, from common ancestor #127, finds 41 files modified on both sides. Main candidates: index.html, component-metadata.mjs, feature-registry.mjs, song-model.js, port-components/tool-document.mjs, port-data/{host,connection,panel,library-projection}.mjs, and app module/version-cache tests. Many also contain version-query changes. These are overlap candidates, not 41 proven merge conflicts. No merge/hunk-resolution trial was performed. #124/#119/#114 each overlap #136 in 21 files when compared from #106, including the same Port data surfaces and version references. #93 has no overlapping paths against #136 from common #56, but that does not prove behavioral compatibility.

The Studio repository validates schemaVersion 2 and blocks downgrade and protected material/legacy provenance replacement. Project CAS, durable outbox, UNKNOWN and reconcile belong to the Studio Project sync contract. Port data is separate: existing Studio account projection explicitly remains canWrite=false. Port iframe/native controllers may still write their existing local keys; UI availability is not Account/Device writer admission. Pro entitlement is separate from Account ownership/device generation and from Port writer admission. Existing #107 P2, pending/outbox adoption, cross-account and generation safety remain HOLD. Native four-app midnight remains separately on HOLD: legacy Sync theme enums accept four values.

## Next isolated integration

1. Recheck all remote heads, bases and origin/main; freeze tree IDs and preserve all local changes. Identify owner-approved target combination, particularly #129 versus the #107/#114/#119/#124 chain and #93; do not infer equivalence.
2. Create a new disposable worktree/branch at the final 0.68.0 UI commit. Record a manifest. Integrate one fixed candidate at a time into the disposable branch only; capture actual conflict paths and each hunk, preserving both UI event/lifecycle behavior and Sync guards. Do not alter existing PR heads.
3. Verify schema2 payloads and protected fields, account/owner/generation transitions, admission and failure-closed behavior before allowing any shared writer; maintain CAS/Outbox/UNKNOWN/reconcile contracts. No production data or remote DDL.
4. Run synthetic disposable Node/Browser suites for Identity/Session, Project CAS/revision conflicts, durable Outbox, ACK loss/UNKNOWN/reconcile, offline/tombstones/pending adoption, mixed accounts/generations/multi-tab writers and image reference/binary consistency. Independently review race paths and restart behavior.
5. Run Studio 5 themes/4 widths, score/save/JSON/PDF/Pre-DTM, five Port tools, four apps, NEWS, frame ownership/audio/Global Stop and existing Port standalone tests. Record all skips. Separate Project Sync acceptance from Port common-data Sync. Real Account/Pro, two-device Sync, Safari/phone and production are separate holds.
6. Preserve a draft only if changes and failures are honestly documented. Never interpret an isolated merge or UI test as releasing writer P2 or authorizing Production.

## UI regression acceptance

Pitch/Chord/Port implementation files are unchanged. The central Chord stage alone uses automatic horizontal margins; the original stage width, viewBox and pointer coordinate calculation are untouched, and an actual chord selection produced note markers and enabled the native save action. Full touch/physical device accuracy is still unaccepted. Narrow score/Pre-DTM action bars now wrap instead of placing required buttons in an easily missed horizontal scroller. The event table retains its necessary bounded, keyboard-focusable horizontal scroll. NEWS appears once as the final equal-sized Home tool.

Studio Node 1,931 pass / 2 pre-existing isolated Cloud runtime skips. Targeted synthetic Chrome regression 24 pass, and the refined board/action regression passes on rerun. Theme/width testing uses 1440/1024/768/390, five themes, panel open/closed and enlarged sidebar; audio/unsaved, app frame ownership, Port tools, NEWS, score/JSON/PDF/Pre-DTM and native theme storage were exercised. Real Account/Pro, real microphone, phone/Safari and two-device Sync remain unaccepted.
