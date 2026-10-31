# Studio 0.66.0 selective center layout restoration

Base: PR #134 / 53635754cb6a34ef00f10eb5dfe89f58e61932f6. Reference: PR #133 / f6a23ca4b4b914d5cfbffad969958a6b661e34ed.

The 0.65.0 center-only media rules for app container width, Pitch modal/stage grid, Chord Home/controls, Rhythm width, and center iframe height are removed. The center again uses the 0.64.0 original app geometry. The 0.65.0 pane, five-theme display projection, native theme storage protection, spacing, text refresh, fixed toggle, resizer, and single-frame transfers remain. Shared color and accessibility changes remain intentional, so restoration concerns layout, not a pixel-identical 0.64.0 screen.

At 1440×1000, Chrome measured the following widths in CSS pixels (synthetic native internal screens):

| App | Center 0.64 | Center 0.65 | Center candidate | Pane 0.65 and candidate |
| --- | ---: | ---: | ---: | ---: |
| Pitch stage modal | 480 | 960 | 480 | 326.6875 |
| Fretboard app container | 1201 | 1100 | 1201 | 363 |
| Rhythm app container | 1200 | 960 | 1200 | 363 |
| Chord app container | 600 | 1100 | 600 | 363 |

The same selected pane elements also had identical measured heights between 0.65 and this candidate. Screenshots for all three versions are saved outside the repository. Production app/Port/shared trees were compared to the base. The original Fretboard viewport-driven persistence caveat and writer P2 hold remain unchanged.

Verification uses disposable Chromium contexts and synthetic data; real Account, Pro, hardware microphone, two-device Sync, Safari and smartphone are not accepted. The native training/preset features are retained but not exhaustively retested in this change.
