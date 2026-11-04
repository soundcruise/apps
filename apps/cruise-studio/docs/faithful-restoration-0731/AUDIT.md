# Studio 0.73.1 — faithful restoration, not a new design

## Evidence and limits of provenance

Starting public main: `56c21cd404cd351e43e625deae6511244d65eb68` (0.73.0 / PR #177).

The earliest preserved **Midnight Session** implementation is `c3a9db0f512ac1ad683e1b0e69c5e618f65d4880`, preserved by PR #103 (head `4485d76214332dbdc311567f1426745e72259c0e`). The name appears in `studio-home.css`, and the score/page and arrangement/session artwork is HTML + CSS, not missing raster art. Its actual SVG icons are already in `assets/studio-icons.svg`.

PR #106 / `00a022ca65402888553e580d3f9d10fb754ae89e` preserves the same art and presentation CSS, adding the Cloud panel. PR #110 / `8c88867c089526f2267005ec9249f50c8c6c321d` explicitly moves the original navy palette from Dark into Midnight and adds Port black/gold Dark. Therefore restoration must not overwrite today's five-theme contract or force everyone's saved theme to Midnight.

The same large-card DOM survives the subsequent UI line through the last full authenticated development entry, PR #147 / `066780ffce9e09cb97762cd35e1b0bfff9fca9da` (0.70.0). That is the latest preserved complete feature/UI reference, rather than the original design-creation commit. `fdb4cf071` / PR #148 removes creation entrypoints for the Port-only release. PR #177 / `c6d0018b3` restores musical modules but substitutes two simple icon cards and relocates the form inspector into a disclosure below the score.

No historical original Home PNG or direct design-approval comment was found in the tracked Studio evidence or PR #103/#106 discussion (both have no comments). Thus these images are **fresh renders of fixed Git source**, not purported historical screenshots. The lineage and exact reusable implementation are confirmed; a separate last human approval date is not independently established. No alternative design was invented to fill that gap.

## Visual differences and repair

| Item | Preserved reference | Public 0.73.0 | Candidate |
|---|---|---|---|
| Cards | `.home-primary`, page/staff and session/timeline artwork | `.home-creation`, music/text glyphs | Original HTML artwork restored |
| 1440px card size | 588.5×390 | 591.5×150 | 588.5×390 |
| 1024px card size | 380.5×320 | 383.5×150 | 380.5×320 |
| 768px card size | 271.016×320 | 271.016×150 | 271.016×320 |
| 390px card size | 351×320, one column | 351×150 | 351×320, one column |
| 1440px card title | 25px / weight 500 | 20px / weight 700 | 25px / weight 500 |
| Creation navigation | Original music/sliders SVG, labels and hover hints immediately after Home | Port image icons, abbreviated hints | Original creation menu markup restored |
| Form inspection | Shell right Inspector | Disclosure below sheet | Original right Inspector restored |

The existing original card CSS remains the presentation owner. Removed only #177's replacement card rules. Border, gradient, shadow, title font/color and geometry compare equal at all four widths. Raw PNGs may differ in subpixel rasterization due to different vertical placements; full-page pixel equality is not claimed. Current Account/Sync information, calendar entry, new app/Port owners, native tool window, fixed navigation and current service routes remain intentionally present.

No old developer Tools/quick tuner/Dock or Project Cloud panel was resurrected. The existing Inspector accepts a missing legacy Dock, uses the existing pane state/close/focus/Escape handling and stops/closes the native tool window through its existing leave guard before opening. The historical Inspector grid uses today's resizable sidebar variable so opening it does not undo a user's sidebar-width choice.

## Functional comparison

`source-audit.json`: **30** musical model/repository/editor/form/rhythm/PreDTM source files match the 0.70 reference after normalizing only declared Studio version and Studio cache identities. Storage schema2, storage keys, Web Locks, raw-revision CAS, immutable material/provenance checks and write-admission guards are unchanged.

| Feature | Comparison / result |
|---|---|
| Project list / New | Same existing select and New controls; no separate old Project-library screen found |
| Chords / lyrics / melody / stroke | Same canonical model and editor adapters; same synthetic inputs yield same music |
| Sections / bars / beats | Added/renamed section; duplicated bars, range movement, Undo/Redo compared with old implementation |
| Transposition / forms | Same guarded transposition and CAGED logic. Native right form UI restored; adoption/removal/Undo compared |
| Save / reload / resume | Same exact saved snapshot after reload, same keys and repository; current formal authorization stays in force |
| JSON / PDF | Same export/import path, both reference and candidate produce A4 PDF; neither is claimed as physical-print acceptance |
| PreDTM | Same working StudioProject, settings/parts/events and output pipeline. The same edits/settings produce equal normalized arrangement JSON and **identical MIDI SHA256** |
| Workspace roundtrip | Same bar data after score→PreDTM→score; current E2E also checks retained DOM/draft/history with a native right tool |
| Old data | Existing schema1 read remains memory-only; explicit save only converts to schema2, verified by existing product case |

No missing musical algorithm was replaced or newly implemented here. The code changes restore presentation and routing of previously working components. The remaining startup difference is the current small bootstrap, rather than old app.js's retired developer checks and duplicate overview/tool initialization.

## Already unfinished in the reference

- Schema2's 4/4, 480 ticks/beat and 1920 ticks/bar restriction. Both old and current reject unsupported meter edits without truncation.
- PreDTM live playback, Transport and synthesis. Source has event generation/output, not an implemented playback transport.
- Project Cloud has separate technical candidate code and unresolved acceptance boundaries; it stays uninitialized and excluded. It is not claimed as completed by this restoration.
- The old PreDTM README still describes v0.6 and says guitar MIDI is absent. That text is stale: actual PR #126 / `83b8d3e91` code implements qualified guitar MIDI, and the matching old/new browser test verifies it. No regression is justified using that outdated README.

## Validation and boundaries

All browser tests use disposable profiles and synthetic data. The old-source comparison uses the existing loopback-only synthetic presentation fixture. The current product suite separately enters through real Studio index with the existing synthetic Account/Pro/Worker fixture. No real browser profile/Account/storage was opened or changed.

- Old/candidate behavior parity: same sections/notes/lyrics, CAGED adoption/removal, range move, Undo/Redo, save/reload, JSON, PDF, accompaniment settings, JSON/MIDI and roundtrip.
- Visual comparison: 0.70 reference / public 0.73.0 / restored candidate at 1440/1024/768/390; geometry/background/border/shadow/title typography/color equality asserted, no horizontal main overflow.
- Related Node: 930/930. Whole Studio Node: 1947/1967, same 20 pre-existing failures as public 0.73.0; no new failure titles and no skipped tests.
- Product suite, protected trees and real Jekyll output results are in RESULTS.json.

Public package stays **81 files**; Project Cloud, old development/app.js entry, docs/tests and prototypes remain excluded. Port, four apps, shared, Worker and Account/Sync contracts are unchanged. No main merge, Pages publish, Production call, migration or real-data operation was performed.

Before publication, operator should review the comparison images and restored Inspector placement, then separately authorize publication. Safari, real credentials, physical printing and actual two-device acceptance remain outside synthetic PASS.
