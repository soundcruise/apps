# Studio 0.65.0 visual integration

Base: PR #133 / f6a23ca4b4b914d5cfbffad969958a6b661e34ed.

## Scope and protected products

Only Studio files change. The trees below are fixed at the base and checked again after commit, together with a working-tree diff against the base. No shared/app/Port HTML, CSS, JS, SW, manifest, store schema or auth source changes are included.

| Path | Git tree |
| --- | --- |
| apps/chord-cruise | 5f34da74fd318c5abc1ee8044660c82f6cf8ff6e |
| apps/cruise-port | 4ab5afbd1703b0a4d4b1f1c559387a76d14bd424 |
| apps/fretboard_cruise | 719cef1db70b0b946e6ea3b472ca4f04cfc5dbc6 |
| apps/pitch-cruise | 8f1d3d357a5554642c6dcd2a8bfd1c897c557910 |
| apps/rhythm-cruise | c422f78c232d9d374aaec5a47232d069465da8b9 |
| apps/shared | 2e8c5f1a08985e2bb01df7fdf587863d2ba5cffa |

## Presentation changes

The Studio spacing scale is 4/8/12/16/24/32/48px. The refresh button has a 12px version gap and 16px horizontal padding; its label is text-only. Pane selection has 16px horizontal padding and enough room for the fixed toggle. The pane close button is removed; the fixed toggle retains guarded closing. A separate center-transfer action moves an app back from the pane without destroying its Window or Controller. The audio recovery control is shown only after a safety audio stop, as a resume action rather than another refresh icon.

The per-frame presentation subscription copies semantic Studio color/spacing tokens, sets display-only data attributes, and installs a Studio stylesheet. Native settings and controller memory are never modified. Native theme initialization remains present so future native saves keep their actual chosen theme. The projected data-theme uses native theme rules; midnight uses the charcoal rule layer with Studio navy neutral tokens. Meaningful accent/note/judgment colors are retained. Native theme groups and refresh bars are hidden by scoped selectors; unrelated common settings remain available. Port keeps its separate existing display-only theme projection.

Central layout overrides are conditional on data-studio-layout=center and a 700px iframe viewport. Pitch's stage modal expands to 960px with a two-column list. Fretboard keeps horizontal board space in the shared center container. Rhythm is capped at 960px. Chord expands its app container and Home cards and arranges key/scale controls in a row; library/save content retains native controls and bounded widths. Pane presentation retains native mobile columns/max widths. Real iframe resizing triggers native recalculation without a fabricated resize event.

## Persistence and native resize

Theme projection writes no localStorage/IndexedDB. Tests compare the complete native settings value before/after theme changes at each stable viewport. Fretboard's existing 120ms orientation debounce can persist native viewMode/fretboardView/fullViewSnapshot when the physical viewport changes; the tests wait for that native work before measuring theme-only invariance. That behavior belongs to the existing controller and is not replaced or disabled. This change does not claim that native responsive controllers never save their own view state.

## Verification and limits

Studio Node: 1,931 pass, 2 existing Cloud client runtime skips. Product Chrome: 30 pass, followed by 2 final presentation-matrix passes after neutral-button contrast adjustments. Product Chrome tests cover native homes and primary internal screens in four apps, five themes, four widths and center/pane modes; identical Window identity on both transfers; complete native settings string invariance for theme-only changes; body text/background contrast >=4.5; existing input, image/crop, audio, timer, score/JSON/print/Pre-DTM, Port and NEWS regression. Screenshots include before/after comparisons, all theme/width combinations and native settings screens. The screenshots are external QA artifacts, not shipped assets.

Standalone app smoke uses isolated test-only gate/Sync script stubs and synthetic data to verify that original theme controls remain present, native theme saves/reload work, and Studio's stylesheet/attributes are absent. This is not real Pro authentication acceptance. Port's standalone return control uses a separate context with its original module dependencies.

Not exhaustive: every native training stage, waveform/recording review, preset/PNG export, keyboard/IME path and 4-app save modal is not accepted by these screenshots. Existing conservative dirty confirmation and reopen-only audio recovery remain from 0.64.0. Real microphone, Safari/phone, Account/Pro, two-device Sync and writer P2 remain HOLD. No merge/deployment approval is implied.
