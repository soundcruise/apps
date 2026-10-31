# Studio 0.67.0 review cleanup and native midnight HOLD

Base: PR #135 / 7dbfa5b51352ecca8c9497eefa9932d88c0b82d2.

## Completed UI

- Rhythm Home is centered and capped at 660px only in the wide central document. The pane keeps native mobile styling.
- Chord's Explore container has room for the board; other control cards and save UI are capped at 560px. Original SVG viewBox and coordinate/gesture handling are retained. SVG scaling uses the original responsive renderer; no new drawing engine or synthetic resize event is added.
- Pane select, center action and fixed toggle use 46px height with consistent borders/radius. At widths <=1100px, the open-pane toggle aligns with the pane's lowered header rather than remaining on a different row.
- Sidebar matches the Home sequence: Home, score, Pre-DTM, five tools, Apps, NEWS. Four Apps have direct existing workspace entries. Labels use クルーズApps.
- Global Stop retains its original ID and listeners as a small shared ■停止 control. Audio/timer behavior is not replaced.

## Retired ordinary UI

Home display/data diagnostics and the dev repository panel have no ordinary entry. Repository diagnostic event registration, list reading and self-check are skipped unless localhost explicitly requests studioDev=1. Inspector/Tools launch buttons, quick tuner and dock BPM launch buttons are development-only. Editor Inspector/dock controllers and DOM are retained because score form/BPM/history/focus paths refer to them. The duplicate quick-tuner presentation module is no longer loaded by the main HTML; Port tuner/controller resources are retained. Public Port and app implementations are unchanged.

## Native midnight is not accepted

The attempted native theme changes were preserved as an external WIP patch and removed from the working tree before release-candidate validation. They are not a shipping commit. Patch SHA256: 5601dcf2f73536f90a032a1de6175d44f7adf3a3a0c9fd3a3e4b67f30c6c48b8.

The existing pitch/fretboard/rhythm Sync adapters explicitly limit CLOUD_THEMES to dark/charcoal/gray/light. The Worker record-schema-registry SETTINGS_THEMES has the same four-value enum. A fifth native saved value cannot be declared safe for Sync without changing these contracts and considering older clients. Such changes are outside this task's permitted boundary. Merely adding a local choice would not satisfy the requirement to preserve Sync behavior.

Required Sync-line decision: define a five-theme settings capability or version negotiation; admit midnight consistently in record validators and client adapters; preserve unknown new themes for old clients instead of resetting/dropping them; test local/offline/ACK-loss and mixed old/new clients. Then apply and finish the isolated UI proposal, including Standard/Pro choice/save/reload tests and unchanged four-theme palette regression. The WIP patch is not approved to apply as-is.

Studio's existing display-only midnight projection remains available. Native standalone midnight choice/save/reload is HOLD, not PASS. Cloud/auth/writer P2 are untouched.

## Acceptance

Studio Node 1,931 pass / 2 existing dedicated Cloud-runtime skips. Product Chrome regression 32 pass; final targeted rerun 6 pass after the last stop-control presentation and Home sequence adjustment. Standalone existing-theme Node suite 16 pass. Synthetic tests cover five Studio themes/four widths, pane alignment, Rhythm width, Chord board/control separation, native settings preservation, fail-closed authority, Global Stop, timers, image/crop guards, score/JSON/print/Pre-DTM, NEWS and direct App routes. Native standalone midnight selection/save/reload is explicitly unaccepted. SVG touch-position accuracy, every native training stage and recording review still require targeted/manual acceptance; the original viewBox/coordinate code is unchanged.
