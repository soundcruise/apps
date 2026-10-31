# Studio 0.54.0: five themes

Studio owns five presentation choices: dark (Port black/gold and default), midnight (Studio navy), charcoal, gray and light. The four Port-derived token projections are still verified against Port; midnight adds Studio-only overrides. Paper and print use their existing independent tokens. Home, shell, Cloud and legacy aliases consume semantic Studio colors.

The same-origin Port iframe uses the actual Port document. `port-frame-theme.js` projects only DOM attributes and an in-frame style; it does not invoke Port theme persistence. The existing Port settings screen still owns explicit Port setting changes. Standalone Port uses its own saved theme. The Studio midnight palette is display-only and maps the Port base to dark with navy token overrides.

Local disposable Chrome tests cover five theme controls, six Port surfaces, live changes, reopen, standalone Port theme persistence, Project/Pre-DTM screens and readable Pre-DTM labels. The normal Studio Node suite excludes two dedicated Cloud E2Es unless their separate fixture runtime is supplied. The existing four Port theme assertions remain a separate stale-test issue; no Port product or test change is included here. Actual Pro/Account, two-device Sync and the PR #107 writer admission P2 remain on HOLD.
