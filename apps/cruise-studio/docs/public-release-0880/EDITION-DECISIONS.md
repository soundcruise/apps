# Adopted Standard specification — 0.88.0 candidate

The operator adopted option A: a usable Standard Studio hosting existing Standard products. That product decision is resolved. No new membership or pricing contract exists.

| Feature | Standard | Pro |
|---|---|---|
| Home / reporting / themes | No Pro gate | Existing Pro gate/session validation |
| Tuner | Native Standard; capo restricted | Existing Port Pro host |
| Metronome | Native Standard; advanced/preset writing restricted | Existing Port Pro host |
| Practice menu | Native Standard; creation limit 5, attachments restricted | Existing native Pro rights |
| My Apps | Native Standard; creation limit 5/custom icon writing restricted | Existing native Pro rights |
| Gear / calendar | Native Standard; photo writing restricted, calendar memo allowed | Existing native Pro rights |
| NEWS | Existing native NEWS UI/API | Existing native NEWS UI/API |
| Four Cruise apps | Their unchanged `/standard/` documents and restrictions | Existing Pro documents/Sync hosts |
| Account / Cloud Sync | Port Standard Account UI; Cloud operations Pro-locked by native capabilities | Existing Account AND Pro/server checks |
| Score / PreDTM | Coming soon, routes rejected | Coming soon, routes rejected |
| Project Cloud | Not mounted | Not mounted in public product; server canary not changed |

Port policy source is `apps/cruise-port/cruise-port-capabilities.js`; Studio does not copy these numeric limits into a second entitlement implementation. Native apps enforce their own Standard restrictions and upgrade links. No backend, native app or shared code is modified.

Standard shell admission only unlocks ordinary navigation. It does not issue/validate a Pro proof and loads neither Pro gate helpers nor Pro operation/native Sync hosts. The Pro host boundary explicitly refuses Standard edition even if invoked manually. Native iframe code, Account DB, AppDevice and Sync credentials remain owned by each native product; none is injected/copied by Standard Studio. Input-bearing Port frames stay mounted on navigation; native application frames use the existing saved-input confirmation before closing. Main refresh and beforeunload retain/warn about unsaved Standard input. Audio cleanup uses the existing native presentation/stop hook; timer pause uses the native pause control.

Generated root `index.html` and `manifest.webmanifest` are Standard. `pro_969e958c31433f99c30b/` remains Pro, with stable ID/start/scope and unchanged authentication implementation. The common source is excluded `studio-template.html`. Both manifests share the same official five icon files and app name. Their IDs are distinct (`/apps/cruise-studio/` versus the existing Pro path). Installed Pro apps are not touched. Actual Mac/Windows installation/cache updates remain OS acceptance items.

`package-port-pc.mjs` emits 204 files: 114 current files plus 90 frozen compatibility files. Developer sources, template, docs and credentials are excluded. Assemble against the current Pages branch, copying only manifest-listed Studio files and the Standard index allowlist adjustment; never merge all main into Pages. Existing frozen operator compatibility distribution is unchanged. This task does not change its backend admission.

The prior HOLD for undefined Standard product rights is resolved. The candidate has not been merged or published. The next approval is for integration/publication of this fixed candidate, not for opening Project Cloud or changing native/backend permissions.

## Final acceptance boundaries

15 feature/edition/cache tests and 116 existing Pro-entry/schema2/compatibility tests pass. The five legacy Shell failures reproduce unchanged on main. Real local Standard product documents boot with no uncaught errors; seven native Port routes (including restricted Sync), calendar and all four native Standard apps render. Native Port capability check confirms Cloud operations false. Standard cannot use the Studio Pro host boundary. Coming soon, report modal and five themes/three widths are checked in a disposable browser; no report is submitted. Candidate Pro rejects unauthenticated entry. An authenticated Pro browser session and authenticated developer editing were not freshly exercised; the existing Pro validation unit tests pass and its authentication source is unchanged. OS PWA installation/update remains untested.

The latest inspected Pages baseline is `a76f1dc967fc96773ef08efb2391adbbc9558840`, containing the parallel Port 1.30.0 release. The candidate preserves it rather than rolling back to the older 1.29.0 mentioned in the task. A separate Jekyll distribution assembled on that exact baseline passes all 204 package hashes and the Standard browser route/capability checks. Final publication must recheck the then-current Pages head and preserve any later independent updates. No Pages settings, branch contents or Production service were changed by this task.
