# Studio 0.58.0 song-production increment

Base #122 / 13736487f72dccb8914bfce9e725759bf858e2ce. Disposable localhost Chrome, synthetic original song only. No Port/shared authentication, schema2, repository CAS, Outbox or backend modifications.

## Implementation inventory

Existing: new Project, title/artist/tempo, section-based bar-count changes and section deletion, chord/lyrics/strum text, schema2 melody editing and score preview, domain Undo/Redo, explicit local save, JSON export/import, print CSS, working-draft Pre-DTM event generation and accompaniment JSON/MIDI export. Existing chord inspector/form features are retained but not comprehensively accepted by the new song test.

Incomplete: schema2 meter, capo and key controls are explicitly readonly; individual bar duplicate/reorder UI was not found. Full musical/layout editing and all notation combinations are not certified. Pre-DTM has no Transport or sound playback. Guitar MIDI is unimplemented; current MIDI covers bass/drums. Non-4/4 generation and adopted-rhythm compatibility have existing restrictions. Export-only accompaniment production can proceed without adding audio playback, so Transport is not required in this increment.

## Changes

A single icon action in the score toolbar navigates to Pre-DTM using the existing document host and current working draft. No automatic save. IME-pending input prevents this action until composition completes. The reverse action is labeled 譜面へ戻る.

An identical JSON reimport left the session clean but always displayed 未保存. Import now reports saved-content equality when the selected session is clean, has a saved base, and has neither pending input nor a save in flight. Nonidentical imports keep the existing unsaved behavior and repository contract.

## Synthetic song acceptance

`tests/song-production.browser.cjs` creates 夜明けの航路 through actual product controls: title/tempo, C–Am–F–G, melody pitch text, Japanese lyric text and strum, Undo/Redo, explicit save, reload, JSON export/reimport and equality, IME navigation guard, direct Pre-DTM transition, accompaniment JSON and MIDI downloads, return to score, title re-edit/save/reload and A4 PDF. This is an automated workflow, not human IME or musical-quality acceptance. PDF `/tmp/studio-original-song.pdf` is one A4 page (verified by pdfinfo).

Studio Node: 1931 pass, 2 dedicated Cloud skips. Existing focused Browser: 121 pass (text/IME simulation, history/save failure, melody, prior Pro tools, NEWS/links and five themes). Final song/text rerun: 41 pass. Further focused regressions are logged separately; these are overlapping test runs, not additive unique counts.

## Next shortest application work

1. Implement explicit schema2 bar duplicate/reorder operations with stable IDs, section membership, melody/lyric/rhythm references and whole-operation Undo; do not clone JSON by hand into repository data.
2. Implement schema2 meter/transposition controls using musical-model operations, with note/tick preservation and rejection tests.
3. Expand chord-form selection, melody/strum and print layout acceptance for a complete song at all viewport widths; human Japanese IME and actual printing remain manual.
4. Complete Pre-DTM guitar voicing/MIDI and decide a separate Transport/audio scope after export compatibility is complete.

Real microphones, Safari/phone, real Pro/Account and two-device Sync are not accepted. #107 writer P2 stays HOLD. This candidate does not claim all Studio app features are release complete.
