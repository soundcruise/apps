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
| 1 | Fretboard 4 themes (local-only) | TODO | | |
| 2 | Pitch 4 themes (LOCAL_ONLY_SETTINGS) | TODO | | |
| 3 | Rhythm 4 themes (local-only) | TODO | | |
| 4 | Reader-first Sync (Worker + 3 clients accept theme, no send) | TODO | | |
| 5 | Port + Charcoal | TODO | | |
| 6 | Chord + Charcoal (app + info pages) | TODO | | |
| 7 | Cross-app QA | TODO | | |
| 8 | Final full regression + report | TODO | | |

## Known issues / notes

- (none yet)
