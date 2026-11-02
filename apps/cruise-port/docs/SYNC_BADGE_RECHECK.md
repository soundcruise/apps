# Port 1.24.30 — quiet normal Sync UI

Base main: 56f982759d6d6f0a48fc20e4f0eb0aec87005ed1 (Port 1.24.29 / Studio 0.71.2).

The previous Account **再確認** invoked `renderSyncCenterView()` without activation. That path uses `SyncCenterController.load({readOnly:true})` (Account summary and Device GETs), native local structured/asset status reads and the common renderer. It does not invoke ensure, bootstrap, pull, push, Outbox transmission, Account adoption or credential issuance.

A confirmed healthy Account now hides that separate button. The native **✓ 同期済み** chip is keyboard/tap actionable and invokes the exact same onRecheck callback. Its title and accessible name explicitly say this checks Account/Device connection and does not start data Sync. Enter and Space are supported; it gains a visible focus outline. Unknown/error/offline/refused Account presentations retain the native recheck button. Unconnected Accounts retain their normal create/join actions.

The chip synchronously removes its handlers on invocation; the existing checking render then changes its role back to a noninteractive status and displays **確認中…**. No new state, key or controller is added. Success uses native completion evidence; failure exposes existing cause/actions. Conflict entry and choices remain native. **同期を開始・再開** is still the separate explicit data-exchange operation. Existing automatic runtime work can independently run on its original lifecycle schedule; tapping the badge itself does not schedule it.

Studio uses this same Port document in center and right pane; Studio product bytes and version remain 0.71.2. Only tests reference the new Port version. Four apps, shared, Worker, Port controller/status/runtime, repository, schema and API payloads are unchanged. Normal Account recheck in read-only Browser fixtures is now exercised by their existing focus/return lifecycle when the normal button is hidden; error recovery still clicks the visible button.

Synthetic local acceptance: focused Node 57/57, native Account Browser 9/9 (five themes, 1440/1024/768/390, center/right same iframe, offline/error/Account replacement and return), actual Port + packaged Studio E2E 36/36, recovery E2E 12/12. The cold resumed Port and Studio cases use the badge with Enter and assert all resulting requests are Account GETs, with no data Sync request. Unit renderer tests cover Space and duplicate action suppression. Existing native conflict, image, attachment, Account/Pro/Device and CAS tests remain required. Full Port Node and real Jekyll output results are in validation.json.

Screenshots are synthetic: [normal phone](sync-badge-130/normal-phone.png), [Studio right pane](sync-badge-130/studio-right.png). No real Account, real device, Production operation, merge or publication was performed. After separate publication approval, manually confirm iPhone PWA tap/focus, VoiceOver and real Account return/error recovery; synthetic PASS is not real-device acceptance.
