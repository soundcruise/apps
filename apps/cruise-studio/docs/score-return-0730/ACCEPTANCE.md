# Studio 0.73.0 — local score / PreDTM restoration candidate

## History and selected source

Base: public `3d50547e7f062088aba7d5debb1cb7b6782c9a03` (0.72.1, PR #175 merged).
`fdb4cf071` (PR #148) deliberately replaced the full entry with the Port PC release and excluded score, Project and PreDTM files from Jekyll. Main's retained editor files were earlier 0.47.17 code, not the complete late development implementation.

The last full authenticated development entry is `066780ffce9e09cb97762cd35e1b0bfff9fca9da` (0.70.0 / PR #147). Selectively restored from that commit: score/PreDTM DOM, bar operations and range/drag moves, transposition guards, CAGED candidate UI, qualified guitar voicing/MIDI, print rules and repository's existing admission checks. The underlying bar/form features originated in PR #125 / `ff9f54249` and PR #126 / `83b8d3e91`.

Current Port/series owners, native refresh, entry authentication, Account status and tool window are retained. No old Port iframe implementation, quick metronome, developer Home, old app.js, Identity Host or Project Cloud panel was restored. A small startup module connects the existing musical model, repository and editor to the current shell. Form inspection uses a disclosure inside the score workspace so it does not compete with the native right tool owner.

## Available now

- Home / sidebar entries for 譜面クルーズ and PreDTMクルーズ.
- Existing schema2 score editor: title/tempo, chords, beat lyrics, melody, strokes, form qualification; bar add/duplicate/move/delete/range/drag; guarded transposition; Undo/Redo; explicit local save; JSON import/export; A4 print/PDF.
- The same active working draft feeds PreDTM. Existing accompaniment settings/event table, JSON, bass/drum MIDI and qualified guitar MIDI are restored. No playback/Transport is claimed.
- Schema, keys, Web Locks lock name, exact raw revision CAS and material/provenance validation are preserved. Local Projects remain browser-local, separate from Account-scoped Port Sync. Home says so and recommends JSON backup.
- Repository save/delete uses the previous entry authorization hook and checks it again immediately before publishing a write. Failed admission retains drafts. Switching workspace retains draft/selection/history; refresh and beforeunload continue to protect unfinished work.

## Acceptance

Only disposable Chrome profiles and synthetic Account/Device/Pro credentials, isolated SQLite/Miniflare/R2 fixtures were used. All outbound fixture traffic is blocked. The existing synthetic backend is the preserved original v137 snapshot (SHA256 `9d880d845b22d7905a5fe5be5b453f074ee28956ce2044ac769c9ee726bbe0b5`), not a claim of exact Production v138 identity. Missing previous /tmp dependencies and seed were reconstructed locally from the existing fixture JSON and Git artifact, without changing any Worker or schema.

The existing product suite is extended with the actual public-index creation flow. Its previous assertion that score files must be 404 is intentionally replaced with local-creation presence and continued Project Cloud absence. No runtime or Sync assertion is skipped or relaxed.

Creation acceptance includes chord/lyrics/melody/strokes, one-step Undo/Redo around bar duplication, CAGED adoption and undo/redo, correct guitar notes and Guitar MIDI track, explicit save/reload with form bindings, JSON roundtrip, PDF bytes, native metronome right window while the same score DOM/draft/history remains, all five themes and 1440/1024/768/390 widths without horizontal main overflow. Genuine schema1 data stays byte-identical on read and converts only after explicit save.

Screenshots here show synthetic data only. Full machine results and Node baseline comparison are in RESULTS.json. Some historical whole-suite tests still describe removed Dock/Inspector UI, old feature/version metadata and old theme/layout assumptions; they already fail on the unchanged base. Related model/repository/editor/auth/native host tests pass. No new whole-suite failure remains after the commit-cleanliness guard is evaluated on the committed candidate.

## Distribution and protection

The previous 34-file Port-only package intentionally expands to **81** explicitly enumerated Studio files. Real Jekyll safe output must equal the allowlist and all file hashes, including VexFlow/font license notices. Developer entries, app.js, docs/tests, prototypes, Project Cloud clients and API entry files remain excluded. No Project backend is initialized; product tests assert zero `/v2/studio/` requests and the local fixture has no Project tables.

Port, four apps, shared and every Worker tree are unchanged from the fixed starting base. Concurrent main advancement `145e64d9` is an unrelated NEWS PR #176; it is not reverted or included in this PR's three-dot diff. No main update, Pages publication, Production operation or real Account data access was performed.

## Unfinished / operator decision

- Schema2 still supports **4/4, 480 ticks/beat and 1920 ticks/bar**. Other meters are refused; no truncation or schema change was introduced.
- PreDTM has no live playback, Transport or sound engine. Guitar MIDI requires a valid qualified fixed form; unresolved/unqualified notes are omitted with existing warnings.
- Project Cloud Sync remains deferred and uninitialized. Local Project files are not Account Sync data, and availability on another browser/device requires explicit JSON transfer.
- Real Account, Safari, actual microphone, physical printing and operator UI acceptance are not synthetic PASS claims.
- Publish only after separate approval of the restored scope and expanded distribution. This candidate remains a 0.x development release; no formal release declaration.
