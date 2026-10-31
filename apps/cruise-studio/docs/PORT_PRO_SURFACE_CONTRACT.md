# Port Pro surface: authenticated boot and lifecycle contract proposal

Base: Studio Pro entry PR #112 head `d1120cb7d26f38e840d2c801a317b29d4d5c01d0`. This candidate adds only display theme projection for the official Pro document; it does not switch the five Standard surfaces. No Pro/auth/storage/Cloud implementation is changed. The PR #107 writer admission P2 remains a HOLD.

## Existing owner behavior

`pro_9a3943176561/index.html` runs the shared Pro gate and `pro-app-boot.js`. The latter calls `isProAccessReady()` and imports `practice-menu-app.js` only when the gate is open. That app invokes `normalizeInitialHome()` before installing its route handlers. Neither module publishes a supported route-ready event. Studio's current wrappers select hashes on iframe `load`, so replacing the URL with the Pro URL can select a route before the gate unlocks and have it cleared before Port installs handlers. In particular, a ready flag derived solely from pathname, iframe load, or the presence/absence of a gate DOM element is not an authorization decision.

Port owns capture, audio, timer, image workflows, Pro authorization and local storage. Studio owns its frame, lease and lifecycle. A re-lock while a tuner is running must stop capture and previews; a metronome must stop its scheduler; a practice timer must follow its existing Port semantics. Destroying the whole frame also discards an unsaved form or crop. Port does not currently publish a supported stop-and-preserve-draft contract that lets Studio prove both guarantees. UI code must not synthesize a `pagehide`, click hidden controls, forge credentials, or enable a capability.

## Proposed owner-reviewed contract

1. Port supplies a versioned boot/route readiness notification **after** its own gate has authorized access and controller/route installation has actually completed, and supplies a read-only current state for listeners attached after the event. Signals convey readiness, not credentials or authorization. Failed boot must never report ready.
2. Bind any parent request to the exact iframe Window and document, same origin and exact Pro path, a fresh unpredictable session ID, an allowlisted requested workspace/route and an activation generation. Reject duplicate/stale messages, navigation or frame replacement; detach listeners on dispose. If `postMessage` is used, verify `origin`, `source`, schema, session and sequence in both directions. No passcode, token, Account identifier or stored data crosses the bridge.
3. Gate denial, credential expiry, generation change or relock invalidates readiness before any new action. Port supplies a stop acknowledgement covering microphone, preview sound, metronome scheduler and practice timer with explicit semantics for unsaved forms, file/photo/icon crop and in-flight saves. Studio releases audio leases only after acknowledgement or frame destruction; preserve or explicitly resolve unsaved data before destruction.
4. Separately, the Sync/Port owner specifies Account/device/Pro generation-bound writer admission and final commit fencing, Account switch, unknown Outbox, multi-tab, asset source/final/reference/tombstone behavior. A valid Pro gate is not Account write authority. Do not mark Port common-data Sync complete from Studio Project Sync tests.
5. Route and theme acceptance needs five authentic Pro surfaces and five Studio themes, startup and reopened frames, locked/denied/relocked gate, local Pro settings/presets/images, no automatic writes to `cruisePort.settings`, standalone Port and four apps unchanged. Synthetic credentials belong only to isolated fixtures. Actual Pro, Account, Safari and two-device Sync are separate acceptance gates.

## What is implemented

`port-frame-theme.js` now allows the exact same-origin Port Standard and official Port Pro document paths; the projection changes only in-frame DOM/style and does not write Port settings. A disposable browser test creates a Pro iframe, leaves the actual gate locked, switches all five Studio themes, removes and reopens the frame, and confirms Port's saved theme and standalone Pro theme remain unchanged. This does not enable Pro or prove authenticated Pro features. The five Studio tool entrances still load the existing Standard Port document. NEWS remains unchanged.

## Verification and unresolved reauthentication fixture

The isolated full Port `standard-readiness-browser.cjs` fixture was run twice against a loopback-only server. Both runs reached synthetic `valid` Pro mode, the Pro tuner capo control and creation of a sixth practice menu. Both then timed out at the post-reset reauthentication step (line 128): the existing Pro gate remained active and the expected Port version element was not visible. This is an unaccepted fixture result, not evidence of a production failure; its cause remains to be investigated with the Port gate owner. No timeout was weakened and neither run is counted as PASS. The test uses synthetic Pro responses and an isolated profile, not a real Pro credential.

The locked Pro theme test and standalone Port Pro gate do not exercise post-auth route selection, re-lock shutdown or image/preset writes. The four app Pro links and the existing Standard 5-tool/score/Cloud regressions remain separate from Pro parity acceptance.
