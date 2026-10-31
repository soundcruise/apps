# Studio 0.64.0 internal applications

Base: PR #131, 43d228989570f90f41b48a6358adf32f4bc4106c.

## Application boundary

The official Pro URL/icon catalog remains the source. Studio entry links now navigate to four real product workspaces. The workspaces fetch the original Pro document after the existing Studio Pro boundary authorizes mounting, retain application-local scripts/styles and the saved-theme initializer, and mount them in an iframe. Account, Sync, Pro gate and service-worker registration are not booted a second time. No application implementation or local data schema is copied. The original edition DOM determines the existing application's feature branches only after mounting is authorized. Production authorization remains fail closed. The existing test-only loopback server substitutes the boundary for synthetic acceptance; it is not a production launch option.

The same document and controller can transfer from the center to the right pane using the existing moveBefore single-owner mechanism. The chooser refuses duplicate center/pane owners. The original application color palette stays inside the document while Studio chrome has five themes. Standalone application files are unchanged.

## Local data and lifecycle

Native stores stay native: pitchTrainerSettings, fretboard_cruise_state, rhythmCruiseSettings, chordCruise.settings, and each application's existing subsidiary keys/binary stores. There is no new Studio application-data copy. Theme settings were exercised using the original UI, including Fretboard's explicit Apply operation. This is not exhaustive acceptance of every application's preset/history/export feature.

Changes to inputs and settings/dialog actions conservatively mark the embedded document as potentially unsaved. A canceled close/navigation preserves it; acceptance explicitly permits disposal. Native save operations are retained, but there is no generic native dirty-state acknowledgment yet, so Studio may still ask after an app has saved. Refresh is blocked while an embedded document is potentially dirty. Browser unload requests confirmation. No autosave is invented.

Embedded AudioContexts must obtain the existing Studio audio-output lease. A conflicting tool prevents audio acquisition. Global Stop and hidden tabs close tracked contexts and prevent new contexts from stale callbacks, keeping the app DOM and draft. To restart audio after this safety stop, explicitly reopen the app with its Studio reopen button; unsaved confirmation still applies. This is a conservative initial lifecycle and requires further native playback/pause integration before complete audio acceptance. Timers/UI may remain visually active after audio has stopped; no transport completion is claimed.

## Sidebar

Pointer and keyboard (arrows, Home, End) set 128–300px. The requested width alone is saved to cruiseStudio.sidebarWidth. The effective width is clamped to 22% of the viewport, with a 128px floor, to protect central space. At 600px and below horizontal navigation replaces the resizer. Resize clamps without overwriting the requested preference.

## Acceptance and remaining work

Studio Node: 1,931 pass, 2 existing isolated Cloud-client runtime skips. Product-page Chrome acceptance covers native app settings/reopen, center/pane transfer with identical Window identity, input protection and refresh refusal, synthetic AudioContext lease/stop, production-boundary refusal, sidebar persistence/pointer/keyboard, five Studio themes/four widths, and existing Port/score/NEWS regression. The audio test exercises the resource contract, not every native playback flow.

Next: connect each native app's dirty/save/crop signals and playback pause/resume callbacks to avoid conservative prompts and reopen-only audio recovery. Exercise native training, custom stages, chord-library operations, preset import/export and microphone flows comprehensively. The four apps are internally usable in the synthetic environment but are not fully release-accepted. Real Pro/Account, Safari/phone, two-device Sync and writer-admission P2 remain HOLD. No Cloud, authentication, CAS/Outbox or public app source changes are part of this patch.
