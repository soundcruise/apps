# Studio 0.59.0 canonical bar editing

Base PR #123 bc7c16d54c5b0988bc32a7b81474eb88705c6a85. Schema2 serialized fields, repository CAS/Outbox and Port/shared code are unchanged.

## Product operations

Score toolbar provides selected-bar add-after, duplicate-after, previous/next-position move and delete. Native buttons accept mouse, Enter and Space; aria labels/title provide names, and the existing IME eligibility gate prevents operations during composition. The resulting bar is explicitly selected and its destination number is announced in status. Undo/Redo uses existing session history; structural Undo follows the existing policy of clearing ambiguous selection.

Add creates an empty canonical bar in the source section. Duplicate uses the existing schema2 duplicateBar API, which regenerates bar and event/binding IDs and marks copied form confirmation unconfirmed. Legacy editable strum materials additionally receive independent IDs/slot IDs and aliases; immutable owner rhythm/form material snapshots keep their existing references. Movement preserves all event IDs and associated performance/notation references, and changes section membership to that of the adjacent destination. The title explicitly describes this boundary behavior. Delete removes the bar, its rhythm/form bindings and line-break reference; orphan immutable materials are retained instead of silently deleted. The last global bar cannot be deleted. Canonical validation and requireUndo gate every operation atomically.

## Pitch and meter decisions

Flat/sharp buttons transpose sounding chord symbols (including bass roots through the existing parser), canonical melody pitches, solfege tonic and originalKey by one semitone. Capo, tuning, tick positions and timing provenance remain unchanged. This is actual content transposition, not a visual transposition mode. Pitch spelling is chromatic sharp spelling. Historical provenance remains historical. Fixed form bindings or unresolved chords cause rejection with no content/history changes; fixed fret positions cannot be silently transposed. Range or validation failures also reject the operation. Display play-key and capo controls remain readonly.

Current schema2 validation explicitly requires 4/4, 480 ticks per beat and 1920 ticks per bar, including stored rhythm lengths. Supporting 3/4, 6/8 etc would require coordinated schema validation/renderer/rhythm/editing changes outside this unchanged saved contract. Product choices remain 4/4 only. An unsupported request is rejected and explained, without truncating or scaling data. Other-meter editing is NOT complete.

## Acceptance

New product E2E: input chord/lyrics/melody/strum; duplicate with fresh IDs/content equality; independent chord edit; keyboard move; delete/add; single-operation Undo/Redo; sounding transpose with unchanged capo; rejection of unsupported meter and unresolved chord; explicit save/reload; one-bar delete and move boundary; responsive toolbar. Retained song-production E2E covers JSON roundtrip, A4 PDF and Pre-DTM JSON/MIDI. Existing structure/history, tools, themes and NEWS regressions are executed separately.

Full fixed-form transposition, spelling preference, arbitrary drag reorder, independent multi-bar selection and non-4/4 meter remain incomplete. Real Account/Pro, two-device Sync, Safari/phone and physical IME are not accepted. Writer P2 remains HOLD.

Next: implement a model-owned fixed-form transposition strategy (reselect versus preserve sounding notes), then a coordinated variable-meter model/render/rhythm design. Pre-DTM Transport/audio and guitar voicing/MIDI remain separate features; do not enable them merely because bar editing works.
