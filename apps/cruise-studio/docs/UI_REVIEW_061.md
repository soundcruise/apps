# Studio 0.61.0 UI review increment

Base PR #126, 83b8d3e9166516efb9d7b70e737427fa71aa544b. No Port/shared product code or storage/auth/sync contracts changed.

- Home refresh button: refuses when any Project session is dirty, saving, IME-pending or in an unresolved external conflict. It also refuses when an active Service Worker controls the page. It fetches the current document with no-store and only reloads on HTTP success, after checking the guards again. This is a normal browser reload against the configured origin, not a deployment, cache purge or promise that an undeployed version exists. If the origin still serves the same version it reloads the same version. Network failure is displayed. Studio does not register its own service worker; unknown controllers are not unregistered.
- Removed the five Studio-to-Port Pro external links. Existing separate-tab links remain until the right-side tool owner is implemented; NEWS and the four apps retain their own links.
- In the Studio My Apps component document only, hide Port Home's other direct sections. Existing My Apps DOM, controller, image stores, settings and launch code remain. No Port file is changed.
- Move workspace navigation into the screen as a sticky sibling of the header. It remains below Studio modal layers and follows the existing navigation/unsaved guards.

Right-side independent tool panel is NOT implemented. Existing surface instances couple active workspace transitions, audio leases, frame destruction, Port forms and host layout. A safe implementation must move/reuse exactly one existing owner into the right pane, maintain the sheet workspace active, route close/switch through requestLeave and Global Stop, and ensure only one audio lease and timer owner. Do not add a second iframe that silently bypasses those lifetimes. The existing separate-tab buttons are deliberately retained pending this work.

Isolated Chrome tests check dirty refresh refusal, network failure/reload, My Apps isolation, absence of Pro external links and sticky navigation at 1440/1024/768/390. The focused existing suites exercise themes, gear/My Apps, score/JSON/PDF, bar actions and Pro app links. Real hardware, manual Safari/phone, real Account/Pro and two-device Sync remain unaccepted. Writer P2 remains HOLD.
