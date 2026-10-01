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
| 6 | Chord + Charcoal (app + info pages) | DONE pending deploy check (this commit) | see git log | Chord 1.18.0 |
| 7 | Cross-app QA | TODO | | |
| 8 | Final full regression + report | TODO | | |

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
