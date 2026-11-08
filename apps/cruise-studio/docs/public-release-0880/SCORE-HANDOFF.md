# Score line handoff (current source)

Start from this candidate only after its integration is approved, otherwise branch from latest main and carry the small feature/developer-entry boundary explicitly. Do not overwrite the current shell with an old Studio branch.

`js/score-workspace.js` wires `sheetCruise`, the active-document owner, editing-session registry and Project repository. `js/modules/sheet-cruise/sheet-cruise.js` owns Project list/new/load, measure/section operations, chords/forms/lyrics/melody, rhythm/strum, undo/redo, transpose, explicit save and JSON/PDF UI. Renderer and text/melody/history adapters sit beside it. Creation CSS is `melody-*.css`, `chord-form.css`, `rhythm-panel.css`, `print.css`; shell owns Inspector placement.

`js/core/schema2.js` and `song-model.js` define schema2; `common-music-model.js` is the shared music projection/conversion model. `project-repository.js` uses exclusive Web Locks and exact raw JSON revision CAS; it validates schema/protected legacy/material provenance before writes and preserves drafts on refusal. `score-workspace.js` injects normal Pro authorization. Never silently upgrade/delete an old Project, index, draft or Outbox. Existing repository tests are the saving contract; source version strings are not schema versions.

`js/modules/pre-dtm-cruise/{pre-dtm.js,arrangement-engine.js,guitar-voicing.mjs,midi-export.js}` consume the same active document and generate/export accompaniment events/JSON/MIDI. Preserve shared document identity during round trips. Generated accompaniment is not a new authoritative Project database.

Project Cloud modules in `js/cloud/` use a separate Owner/Session/Outbox/CAS contract from Port datasets. Production is operator-restricted; do not enable it for general users. Public candidate skips creation prepare/attach and Cloud host injection. Developer entry retains the existing isolated Cloud injection contract; it does not grant any backend rights.

Run developer entry using DEVELOPMENT-LINES.md. First work should be a concrete score-editing acceptance gap chosen with the user (e.g. TAB/rhythm UX and unsupported meter behavior), with existing schema/undo/output tests before changes. Transport/playback, meter expansion and new model fields are future scope, not assumed completed. Keep PreDTM consuming common music projections; avoid parallel chord/beat implementations.

Current candidate proves the developer capability admits both workspace IDs, not a fresh complete editor product acceptance. Existing creation tests and authorized browser acceptance must be run for B's actual changes. No real user's Project is a test fixture.
