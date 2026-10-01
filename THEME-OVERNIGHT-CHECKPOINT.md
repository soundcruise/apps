# Theme Overnight Rollout — Checkpoint

Working record for the multi-phase color-theme rollout (Dark / Charcoal / Gray / Light).
Not a runtime file. Excluded from GitHub Pages via `_config.yml`.

Resume rule: check `main == origin/main`, read this file, never redo a completed phase,
continue from the first phase that is not marked DONE.

## Theme contract (all apps)

- Values: `dark` | `charcoal` | `gray` | `light`. Missing / invalid / broken → `dark`.
- Stored only on explicit choice; never written back on read. No OS theme, no globalTheme.
- `html[data-theme]` set by a head bootstrap before stylesheets; Gray/Light/Charcoal add
  `meta[name=theme-color][data-*-theme-color]`; Dark adds nothing (production unchanged).
- Dark = current production literals 1:1. Physical objects, functional/musical colors,
  exports and the Pro gate stay fixed.
- Pitch / Fretboard / Rhythm: theme is local-only tonight (not in SYNC_SETTINGS).

## Baseline (Phase 0, 2026-10-01)

- main = origin/main = `137ebd4e`
- Port 1.12.3 · Chord 1.17.1 · Pitch 2.25.0 · Fretboard 2.20.0 · Rhythm 1.15.0
- Sync Worker: last source change `e455523c`

## Phases

| Phase | Scope | Status | Commit | Version |
|---|---|---|---|---|
| 0 | Baseline check | DONE | (this file) | — |
| 1 | Fretboard 4 themes (local-only) | DONE (deployed, prod smoke PASS) | 330e3b29 | 2.21.0 |
| 2 | Pitch 4 themes (LOCAL_ONLY_SETTINGS) | DONE (deployed, prod smoke PASS) | d18930e1 | 2.26.0 |
| 3 | Rhythm 4 themes (local-only) | DONE (deployed, prod smoke PASS) | 356c7bba | 1.16.0 |
| 3b | Pro gate fully Dark while shown (layer off via :has(body.pro-gate-active)) | DONE (deployed, gate pixel parity 0) | 69af8ef3 | F 2.21.1 / P 2.26.1 / R 1.16.1 |
| 4 | Reader-first Sync (Worker + 3 clients accept theme, no send) | DONE (Worker 7245c2e6 from 6c19d296; clients deployed, prod smoke PASS) | 6c19d296 / 2e71d1ea | F 2.21.2 / P 2.26.2 / R 1.16.2 |
| 5 | Port + Charcoal | DONE (deployed, prod smoke PASS, gate parity 0) | c4fd125a | Port 1.13.0 |
| 6 | Chord + Charcoal (app + info pages) | DONE (deployed, prod smoke PASS, gate parity 0) | 01f6df1c | Chord 1.18.0 |
| 7 | Cross-app QA | DONE (prod cross-app 132/132, audio hashes identical) | (this file) | — |
| 8 | Final full regression + report | DONE (all suites PASS; report CRUISE-APP-OVERNIGHT-THEME-ROLLOUT-REPORT.md) | (this commit) | — |

## Known issues / notes

- Theme layers are generated: `python3 tools/theme-layer/generate.py <app>` writes `apps/<app>/theme-colors.css`
  (per-app config in `tools/theme-layer/apps.py`). Hand-tuned rules live after the OVERRIDES marker.
- Charcoal palette used: bg #424346 / surface #4c4e52 / raised #58595e / text #f2f1ed / muted #c4c5c7
  (slightly darker than the #47484b starting point so dimmed text keeps AA).
- Fretboard info / terms / privacy / pro-access pages stay Dark (not themed tonight).
- Phase 3b regenerated all layers with the current generator (Fretboard now includes the url()/opaque-black fixes).
- Fretboard contrast exceptions (same as Dark or object): `・` divider (opacity), markers measured on page bg,
  basic-rule items under the intro overlay.
- Pitch: beta page has its own layer (`theme-colors-beta.css`, no pro-theme.css). Pro gate backdrop shows the
  themed page through its blur (max channel delta 8/255); the gate card itself stays Dark.
- Pitch contrast exceptions: piano key labels (object colors identical, checker misreads bg), gradient titles.
- Rhythm: canvases / VexFlow draw light ink for a dark ground, so only the panels around them stay Dark
  (lanes, calibration lanes, review, result graphs, score editor; opaque grounds #090d13 / #10141a measured from
  Dark). Surrounding UI is themed. Theming the canvas drawing itself is a follow-up (154 JS color sites).
- Reader-first: clients keep a received cloud theme in settings.themeCloudMirror and echo only that value as
  `theme` in their sync snapshot (apply/manifest stays exact, other devices' theme is never deleted, the device's
  own theme is never sent). Old production clients (before 2.26.2 / 2.21.2 / 1.16.2) reject a theme payload →
  writers must wait until those tabs are gone.
- Port Charcoal: one token block + the Port-scoped Sync block + four text-step rules (translucent gold / dim ink
  drawn opaque). Gray/Light rules untouched; tuner follows Charcoal through the shared tokens (no Dark-fixed panel);
  My Apps icons need no Dark plate (Charcoal is a dark scheme). Charcoal contrast BELOW = 0 (Dark has 1: `↗`).
- Port mixed-version window: a 1.12.x Port that receives `theme: 'charcoal'` shows Dark (safe fallback); if it then
  saves another setting it writes settings without theme, so the other device falls back to Dark. No corruption.
- Chord Charcoal: one token block (bg #424346 / surface #4c4e52 / raised #545559, opaque muted/faint ink) plus the
  token-driven Gray/Light rules widened to Charcoal (fixed objects, Sync components, modal scrims, info-page wells).
  Light-page-only rules (inked title, deep gold, white insets, mute edge) stay Gray/Light. Theme row: four buttons with
  a responsive font so チャコール fits on one line down to 320px. Worker does not validate Chord settings fields.
- Phase 7 (2026-10-02): production cross-app run, 3 widths x 4 rotations x 5 apps x Standard/Pro = 132/132 PASS
  (theme per app, other apps' keys untouched, no write on load, theme set before CSS arrives). Dark computed-style
  diff vs baseline 0 in all 5 apps (only the new theme rows shift layout). Port audio files (11) and the audio lines of
  Pitch / Fretboard / Rhythm script.js hash-identical to 137ebd4e; Port AudioSession / tuner / metronome tests 159/159.
  Worker 7245c2e6 at 100%; no Worker change since 6c19d296; no D1 migration, schema version or record type change;
  apps/shared untouched. Port / Chord Pro gates are opaque overlays over the themed page (pixel parity 0);
  Pitch / Fretboard / Rhythm switch the layer off while the gate is shown.
- Phase 8 (2026-10-02): Port 952 / Shared 226 / Pitch 36 / Fretboard 31 / Rhythm 17+3 files / Chord 96 files /
  Sync Worker 397 / NEWS Worker 327 / Requests Worker 65 / runtime simulation 132 - all PASS. Production home screens
  of 5 apps x 4 themes reviewed. Writer activation for Pitch / Fretboard / Rhythm waits for the user's go-ahead.

## Theme Finalization + Cloud Theme Writer Activation (started 2026-10-01T21:11Z)

Resume rule: same as above; never enable a writer before `eligible_after`.

### Reader-first safety window (Phase 0, measured)

- Worker reader-first `7245c2e6` (100%), deployment created **2026-10-01T16:18:57Z** (`wrangler deployments list`).
- Reader clients `2e71d1ea` (F 2.21.2 / P 2.26.2 / R 1.16.2), Pages run 36891368281 completed **2026-10-01T16:22:11Z**.
- reader_deployed_at = **2026-10-01T16:22:11Z** (later of the two)
- eligible_after = **2026-10-02T16:22:11Z** (JST 2026-10-03 01:22:11)
- Production at preflight: Port 1.13.0 / Chord 1.18.0 / Pitch 2.26.2 / Fretboard 2.21.2 / Rhythm 1.16.2; Worker 7245c2e6.

### Information page inventory (Phase 1)

A = normal information page → follows the app theme. B = Pro acquisition / access-control flow → stays Dark.

| App | A (theme) | B (Dark) | Out of scope |
|---|---|---|---|
| Pitch | info, terms, privacy, recommended-videos | pro-access, iphone-safari-guide, pro_x9v7q2m8/troubleshoot | — |
| Fretboard | info, terms, privacy, apps | pro-access, iphone-safari-guide, pro_a9f4k7q2m8z/troubleshoot | — |
| Rhythm | info, terms, privacy, usage, click-input-help, mic-correction-help, mic-restart-help | pro-access, iphone-safari-guide | index.html (redirect only), _poc/vexflow-lane.html (unlinked dev PoC) |

- B reasons: pro-access = membership purchase path; iphone-safari-guide = membership registration step linked only from
  pro-access; troubleshoot = opened from the Pro password gate. All use the Dark pro-gate.css design (same decision as
  Chord pro-access).
- Implementation: per page-style group, a generated layer (`theme-colors-<group>.css`) built only from the stylesheets
  that page loads plus its own `<style>`, pruned to selectors whose classes/ids appear in the page; plus the app's
  head bootstrap. Page content (text, href, mailto) is not edited.

| Phase | Scope | Status | Commit | Version |
|---|---|---|---|---|
| F0 | Preflight + safety window | DONE | (this file) | — |
| F1 | Information page inventory | DONE | (this file) | — |
| F2 | Pitch information pages theme | DONE (deployed, prod info smoke 120/120) | e7f500ae | Pitch 2.26.3 |
| F3 | Fretboard information pages theme | DONE (deployed, prod info smoke 120/120) | e97dd879 | Fretboard 2.21.3 |
| F4 | Rhythm information pages theme | DONE (deployed, prod info smoke 144/144) | 60830d3a | Rhythm 1.16.3 |
| F5 | Information pages full QA | DONE (Dark 0/0/0, content hash, contrast) | (this file) | — |
| F6 | Five-app theme QA | DONE (prod cross-app 285/285, audio hashes identical) | (this file) | — |
| F7 | Writer eligibility gate | NOT MET at 2026-10-01T22:16Z (18h05m left) — STOP | (this file) | — |
| F8 | Fretboard writer | WAITING (not before eligible_after) | | |
| F9 | Rhythm writer | WAITING | | |
| F10 | Pitch writer | WAITING | | |
| F11 | Writer production verification | WAITING | | |
| F12 | Final full regression | DONE for the theme-complete state (all suites PASS) | (this file) | — |
| F13 | Production smoke | DONE for the theme-complete state | (this file) | — |
| F14 | Final cleanup / report | DONE (report CRUISE-APP-THEME-FINALIZATION-REPORT.md) | (this file) | — |

### Results (theme-complete state, 2026-10-01)

- Info pages: Dark / unset / invalid / broken vs production = style 0, layout 0, pixel 0 (3 apps x 3 widths).
  Charcoal / Gray / Light: layout 0, text + links identical, Pro acquisition pages pixel 0. Contrast: no real
  regression (flags only for background-clip:text titles, real stops >= 5.49; and SVG labels measured via
  `color` while drawn with the unchanged `fill`). Rhythm microphone diagrams pinned Dark on #1d1b1a.
- Production: info smoke Pitch 120/120, Fretboard 120/120, Rhythm 144/144; cross-app 285/285 (5 rounds incl.
  Port Light / Chord Charcoal / Pitch Dark / Fretboard Gray / Rhythm Charcoal; apps + info pages; FOUC none).
- Dark app screens vs 137ebd4e: style 0 for Pitch / Rhythm; Fretboard only the new theme row divider and the
  random quiz target (known). Port / Chord unchanged since c01933d5.
- Audio: Port audio files 11/11 identical; P/F/R audio lines 113/128/308 hash-identical; Port AudioSession /
  tuner / metronome tests 159/159.
- Tests: Port 952, Shared 226, Pitch 37, Fretboard 32, Rhythm 17 + 3 files, Chord 96 files, Sync Worker 397,
  NEWS 327, Requests 65, runtime simulation 132 - all PASS.

### Writer activation plan (F8-F11, only after eligible_after = 2026-10-02T16:22:11Z)

Resume: re-run preflight (main, Pages versions, Worker 7245c2e6 still 100%, time >= eligible_after), then F8.

Order: Fretboard (F8, 2.22.0) -> Rhythm (F9, 1.17.0) -> Pitch (F10, 2.27.0); one commit + deploy + smoke each.
Worker, D1, schema version and record types stay unchanged (Worker already accepts the 4 values).

Adapter rules (all three apps):
1. Snapshot `theme` = explicit local theme if valid; else `themeCloudMirror` if valid; else omitted
   (unset never becomes an explicit "dark", so it cannot overwrite a cloud choice).
2. Materialize / remote apply: a valid received theme becomes the local explicit theme (the app re-applies it)
   and `themeCloudMirror` is dropped; when the merged values carry no theme, the local theme is left as is
   (never deleted). Fretboard / Rhythm currently rebuild SYNC_SETTINGS as `values[key] ?? DEFAULT` and Pitch
   resets to DEFAULT_SETTINGS - theme must be handled outside that loop, as above.
3. Pitch: remove `theme` from LOCAL_ONLY_SETTINGS and send it through the same rule 1 (not via DEFAULT).
4. App load: if `theme` is unset and `themeCloudMirror` is valid, adopt the mirror once (explicit save) so the
   device shows the account theme even before the next sync.
5. Old payloads without theme, theme + other settings changed at once, simultaneous edits on two devices:
   per-field merge (shared settings-field-merge) keeps unrelated settings; no duplicate conflict.
Tests per app: A Light -> B Light; B Charcoal -> A Charcoal; A Gray -> B Gray; reset Dark -> B Dark; local unset
+ cloud Light; old payload without theme; theme + other setting together; simultaneous edits; no other app touched.
Rollback: revert the writer commit (reader-first stays compatible with any theme already in the cloud).

## Theme Cloud Sync completion (writer + backward compatibility, started 2026-10-01T22:36Z)

### Old client audit (W1, real code, not assumed)

Pre-reader adapters (2e71d1ea^: Pitch 2.26.1 / Fretboard 2.21.1 / Rhythm 1.16.1) on the unchanged shared runtime,
against a cloud settings record that carries `theme`:
- steady device pulls it: whole sync throws `<app>_record_invalid` (class C); local and cloud untouched;
- device changes another setting: push conflicts, a conflict dialog appears (choosing "this device" would push
  settings without theme and erase the cloud theme -> loss risk);
- a new old device joins: join throws `<app>_record_invalid`.
=> writer cannot be enabled without a gate.

### Backward compatibility gate (W2, existing capability mechanism)

- `settings_theme_v1` in `sync-capabilities.js` (same mechanism as Port `practice_menu_sets_v1`).
- Clients without it (pre-reader and reader releases) get settings without `theme` in snapshot / changes /
  push results (hash and manifest recomputed for exactly what they receive; a theme-only record is shown as
  removed), and their settings writes keep the stored theme of the exact base revision (a reset keeps a
  theme-only record). No D1 migration, no schema / record type change, Port / Chord unchanged.
- E2E proof: real Worker (SQLite D1) + real shared runtime + real adapters
  (`test/theme-writer-compat.test.js`): old and reader clients behave identically with and without a cloud theme
  and never erase it. Pitch-only note: a fresh device joining a cloud whose settings lack `accidentalDisplay`
  ends in `manifest_mismatch` with or without theme (pre-existing, independent of this work).

| Phase | Scope | Status | Commit | Version |
|---|---|---|---|---|
| W0 | Preflight | DONE | (this file) | — |
| W1 | Old client audit | DONE: class C + theme erase risk | (this file) | — |
| W2 | Worker theme field gate | DONE (deployed cb6c315a 100%, health OK) | cd1a0052 | Worker cb6c315a |
| W3 | Decision gate | CASE A (small gate, existing mechanism) | (this file) | — |
| W4 | Fretboard writer | DONE (deployed, prod smoke PASS, gate parity 0-1px) | 465fdb3f | 2.22.0 |
| W5 | Rhythm writer | DONE (deployed, prod smoke PASS, gate parity 0) | d49a6997 | 1.17.0 |
| W6 | Pitch writer | DONE pending deploy check (this commit) | see git log | 2.27.0 |
| W7 | Old client regression with writers | TODO | | |
| W8-W12 | Two-device QA, matrix, regression, smoke, final | TODO | | |
