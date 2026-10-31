# Studio 0.57.0: remaining three Port Pro tools

Base PR #118: 249dfcc3613e19b0ace7a62ca33c829d9b9c3f14. Prior LOCAL_PRO_COMPONENTS.md describes the previous stage; this document supersedes its remaining-three-tools status.

## Product integration

Practice/calendar, Gear and My Apps official Studio routes now load the Studio-owned tool document. The document imports inert original Port Pro body markup and original styles, then runs the original practice-menu-app.js controller and dependencies. None of the Port HTML gate, Account, Sync, Worker or deployment boot scripts execute. Existing Port schemas, localStorage keys and image IndexedDB stores remain canonical. NEWS keeps its existing public Port document.

A static, document-scoped import map routes Port edition/capability consumers to a Studio context module. It receives only the result of the existing authority boundary. With no installed result, every Pro action is denied and creation limits are zero. Public static serving still cannot enter these tools because the original production boundary remains closed. The test-only loopback server supplies synthetic policy and metronome source; it contains no real credential. This is application-function acceptance, not writer admission, production authorization, or Sync acceptance.

The full Port controller owns menu sets, reorder, timer/history/calendar, categories/status, My Apps presets/URL launching, crop/re-edit and binary/reference persistence. Studio controls document lifetime and navigation. This preserves actual Port algorithms rather than copying their implementations. The original Port public files are untouched.

Practice and Gear leave guards reuse Port save/discard/continue dialogs. My Apps adds a Studio navigation confirmation invoking the original Port submit/cancel handlers. Crop navigation waits for Port's existing crop UI to finish. Preset editing must be saved/cancelled before leaving. Hidden-tab/Global Stop keeps open editors alive and pauses practice timing; ordinary tool teardown pauses timing through the original control, runs pagehide cleanup and revokes the component policy. Cleanup is idempotent. A no-capability snapshot is returned for late callbacks during teardown instead of throwing.

PC frame height is bounded to the visible workspace, fixing unreachable fixed crop dialog buttons. Port control markup and styles are reused; five themes project visually and never save the Port theme preference.

## Reproduction

`python3 apps/cruise-studio/tests/fixtures/serve-local-pro.py --port 18783`

Open localhost port 18783 /apps/cruise-studio/index.html in a disposable profile. Only synthetic data; never enter real Account/Pro credentials. The test server binds loopback and sets connect-src self CSP. Browser tests abort outside requests or fulfill explicit synthetic external app URLs.

## Acceptance evidence

Product-page Chrome suites exercise menu CRUD/reorder and six saved menus; menu preset create/edit/delete; timer/history/calendar; pause on Global Stop; save/discard/continue; Gear CRUD/status/category/order; My Apps CRUD/order/size/URL popup, sixth item and presets. New image suite uploads a generated PNG through original file controls, crops/saves/reloads/recrops/removes both photo and icon, checks original source/final records and that no residual image records remain. New My Apps leave suite covers save/discard/continue and hidden-tab draft retention. Five-theme suite checks all tools, score/Pre-DTM and Port theme immutability.

Studio Node and related Port Node, static fail-closed controls, prior tuner/metronome product E2E, NEWS/Pro links and standalone Port Standard/Pro are tested separately. Cloud E2E skips and actual Account/Pro/two-device/Safari/phone remain outside acceptance. #107 writer P2 remains HOLD.

Not an exhaustive release certificate: every calendar/attachment format, every platform URL scheme, every accessibility path and real microphone/mobile behavior still need comprehensive acceptance. No claim is made that production security or synchronization is complete. Further refactoring to a Port-owned explicit controller lifecycle API can replace the document-scoped policy adapter; it is not needed to continue isolated functional development.
