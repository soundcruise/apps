# Studio development ownership

Both lines branch from fetched origin/main in separate worktrees. Use short-lived `codex/<task>` branches and one PR per deliverable; merge normally, never copy an old Studio tree over main. No permanent release/development fork is needed. Existing Pages branch is distribution-only.

A (Studio/public operation) owns `index.html`, generated Pro entry, `scripts/edition-layout.mjs`, release allowlist, `shell.*`, `port-pc.js`, entry/auth composition, Port/series surfaces, report UI, themes and version/cache integration. Port/four-app/NEWS backends remain their own products.

B (score creation) owns `js/modules/sheet-cruise/`, `js/modules/pre-dtm-cruise/`, `score-workspace.js`, `js/core/{schema2,common-music-model,song-model,project-repository}.js`, editing/session/document owners, melody/form/rhythm adapters and creation CSS. B is the owner of music model and persistence changes. A must not implement a second model or migration.

Shared boundary: B requests HTML IDs, script dependencies and shell/Inspector contracts in its PR; A reviews/integrates the small shared edits and release cache updates. Rebase/merge latest main before final acceptance; resolve conflicts by preserving current shell/auth/Port behavior and B's model contracts. Generated Pro HTML is always regenerated from the template, never hand-merged. B must not change the public feature policy to ship its in-progress editor.

Development entry (local only; same Pro gate, separate localhost storage):

```
node apps/cruise-studio/scripts/generate-development-entry.mjs /private/tmp/studio-creation-development.html
python3 apps/cruise-studio/scripts/serve-development.py /private/tmp/studio-creation-development.html
```

Open http://127.0.0.1:18873/ . Supply legitimate test Pro credentials via the existing gate; never copy Production credentials/storage. The developer capability module lives under excluded `scripts/`, is absent from the release allowlist and is not selected by URL query/localStorage. Public template and Pro entry use the fixed release capability. Feature release control is not Account authorization or DRM; arbitrary user-modified JS is not a supported navigation path and server authorization remains mandatory.
