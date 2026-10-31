# Studio 0.56.0 local Pro components (development acceptance)

Base: PR #117, 98ac897ef3e7a4f333e30137000e1c06b36be428.

The official tuner and metronome workspace routes now open Studio's `port-tool.html`, not the Port Standard or Pro entry document. `tool-document.mjs` requests authority, fetches the original Port Pro HTML as inert markup, imports the original tool root and stylesheet links, and initializes the actual Port controller. No gate scripts, Sync scripts, or Port application bootstrap are copied/executed. No tool UI, algorithms, schema, store or presets are independently implemented. The iframe is a document/CSS lifetime boundary for the shared controllers; it does not host a per-tool Pro login.

The production authority module from #117 remains closed. In the test environment only, `tests/fixtures/serve-local-pro.py` supplies a synthetic boundary and the existing metronome operation-source shape. This is not a production entitlement or Account writer admission. Use a disposable profile and synthetic data. The server binds 127.0.0.1 only, does not proxy a backend, and has no deploy command. Browser tests abort all non-local requests. A static public server cannot activate these components yet. Release gate integration and writer P2 remain HOLD; these no longer block development component testing.

Run from this worktree: `python3 apps/cruise-studio/tests/fixtures/serve-local-pro.py --port 18781`, open `/apps/cruise-studio/index.html`. The public/static fail-closed control is on a separate ordinary HTTP server. Neither real credentials nor Account data are required or permitted in the test origin.

## Accepted in the synthetic product-page test

- Official Studio routes mount actual Port tuner/metronome DOM/controllers.
- Tuner capo, existing v3 setting persistence and reload; automatic fake microphone start and ended tracks after navigating away.
- Metronome Pro 3/4 setting persistence, preset create/reload/delete; playback and Global Stop teardown.
- Five tuner theme projections without changing Port theme storage (the wider theme regression checks saved Port theme invariance across all surfaces).
- Production/static route remains locked without development authority, with no Port tuner settings created.

Tests do not establish every Pro setting permutation or real hardware behavior. A finer feature acceptance matrix remains needed, including metronome live BPM timing, tuner string/reference playback, permission denial/retry, hidden-page microphone termination and actual audio graph closure. Existing Port controller behavior is reused, not inferred as independently accepted from reuse alone.

## Remaining three tools

Practice/calendar, Gear, and My Apps still use their existing Port Standard documents. Their product UI and local stores remain operational; Pro attachments, custom images and unlimited menu creation are not integrated. Extracting their controller initialization, hash router, unsaved-form guard, timer and image workflow from `practice-menu-app.js` is the next application-engineering task, independent of future Account/Sync work. Keep the same stores and IDB; do not invent Studio datasets. No Port product code has changed in this branch.

## Evidence

Studio Node: 1931 pass, 2 dedicated Cloud E2E skips. Port tuner/metronome Node: 190 pass. Local product test and static locked-route test are separate. Other Studio browser regression: 16 pass, including themes, practice/calendar, Gear/My Apps images, NEWS and Pro application links. Port standalone Standard/Pro synthetic regression is executed separately. Previous Standard tuner/metronome browser tests target the retired embedded Standard route and have not been migrated into exhaustive new Pro-route parity tests.

Real Pro, Account, two-device Sync, Safari/phone and production are not accepted. Studio Project Sync and Port common-data Sync remain independent completion conditions.
