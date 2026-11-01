# Studio 0.70.0 — native Pro entrance

Base PR #145 head `70cd871a09c36e3394f112f84c37df6555f0a136`, tree `f1530d80c9f0ae4fc59ea792991e382ecf497ccc` matched before work. New isolated branch only. No Production request, remote DB, deployment, real credential or existing PR/worktree update.

## Authority and reuse

Studio loads the unchanged shared Pro gate, Pro Device Session helper, Account DB and AccountClient. The gate's existing `/v2/pro-auth/verify` issues the existing device-bound qualification after its existing Turnstile flow. Studio never issues a qualification, copies an Account database, substitutes an edition flag, or derives authority from a pathname/query.

The entrance's volatile proof requires (1) the native gate/source, (2) online native device-session validation through the existing helper and API, (3) `/v2/accounts/summary` authenticated by the Account DB's current credential, and (4) unchanged Account generation, credential, Pro identity/revision and local entrance epoch before result adoption. Account DB presence alone is insufficient. A stale asynchronous response cannot re-admit another Account. Concurrent checks in the same epoch share one flight; an old flight cannot overwrite a newer one. A qualification-revision race has one fresh check per observed revision, not an unlimited network retry.

One extra consumer of the existing Pro Device Session helper shares its existing key/receipt DB; it adds no credential format, key, DB, service, endpoint, or independent session owner. The force-validation option is the helper's existing option. This avoids changing the shared gate's public API. The native gate remains responsible for terminal revocation/reset; Studio delegates recognized denials to its existing credential-matching rejection hook.

## Product entrance

The initial shell is inert before script execution. The native Pro dialog is the only Pro login UI. A valid remembered Session renews without another number prompt. If Account connection is needed, a small panel opens the existing Port Sync Center in the same origin. That connection frame is restricted to Sync Center by Studio-only presentation/navigation, so it cannot become an alternative tool entrance before Account acceptance. No Account signup/recovery form is duplicated. Explicit Pro reauthentication uses the existing reset function without reloading Studio.

Account notifications invalidate synchronously. Pro/source storage changes invalidate only when the actual qualification/revision changed; another native app updating informational `validatedAt` must not destroy a tool. Focus/online/visibility and a visible-page60-second check refresh remote qualification. Known failures lock immediately; new Project save/delete validates again inside the existing write lock and rechecks at final publication. Commands/navigation are also denied while locked.

This is intentionally online admission/refresh: failure to establish the existing online Account/Pro proof keeps the shell locked and retains data. It does not introduce a persistent offline Account grant. Remote revocation cannot be known instantly while disconnected. Native Port mutations/remote commits continue to rely on their existing writer/SQL fences; this UI entrance is not a new commit fence or blanket resolution of old-client/raw-storage writer issues.

## Internal tools/apps

- Five tools keep their canonical Port Pro documents/controllers, native gates, settings, image stores and Sync runtime. Their native gates validate the same origin's existing qualification/Device Session and require no additional number entry. They keep their own writer admission.
- Four apps keep their existing Studio component DOM/CSS/controllers and local data formats. The existing component boundary now consults the formal entrance instead of the obsolete permanently closed boundary. Components delegate the Pro operation source to the native owner only while their admitted Account is current. They mint no credential or policy. No Standard policy is mistaken for the native Port Pro policy on the Studio pathname.
- Project schema2/local storage/CAS/Outbox stay unchanged. The existing Project repository gains entrance callbacks around writes, without replacing its lock, revision comparison, validation or rollback. Project Cloud activation/transport is unchanged. Home distinguishes authenticated Studio access from a still-disconnected Project Sync Session; it no longer falsely asks an admitted user to log in again.
- Native app files, Port files, shared files, Worker code/configuration and migrations are byte-identical to the base. All changes are under `apps/cruise-studio/`.

## Retention and lifecycle

Locking stops native media/timers, four-app audio and existing Studio auxiliary audio without removing forms, crops, score DOM, draft/history or iframe owners. The native microphone wrapper refuses an old permission result after an entrance revision change. Retained document leases remain associated with that single owner until normal close/dispose; locking must not call the destructive global cleanup that removes Port frames. User Global Stop retains its existing behavior.

The existing native modal manager can suspend/resume a dialog with the same DOM. It leaves the top layer during authentication, so the Pro dialog remains operable; only the same Account may resume it. Save-button state refresh does not redraw the score or input fields.

After Account A→B, an A-owned iframe remains inert, with its input retained. It cannot silently become B's editable form. Closing that retained frame requires explicit discard confirmation; cancel preserves it. A suspended Studio modal belonging to another Account is retained and is not resumed under B; return to its original Account to resume that modal. This conservative interaction remains a usability limitation, not permission to discard old input. Pending native Account/Sync operations remain owned by the existing stores/runtimes.

## Synthetic acceptance

The actual Studio product page/native Port suite uses disposable Chrome profiles and local workerd/D1/R2. Production-looking API requests are intercepted into that local backend, all other requests are aborted, and Miniflare outbound access is forbidden. The correct and incorrect numbers in tests are fixture values only. No real Account/Pro is used.

The expanded product suite covers: unauthenticated entry/query-flag refusal; wrong/correct native Pro verification; Account-required gate and Sync-Center-only connection frame; all five Port tools without another verify call; all four real app controllers/five display themes without another verify call; Account Device revocation/new Project save refusal with actual Gear form/Project draft retention; Account replacement/old iframe refusal; terminal Pro revocation/reauthentication; native modal retention; explicit discard/cancel; expired native Session/reauthentication; and the existing16 native Port/Studio Sync cases. Results are in `entrance-0700/validation.json`.

Separate regression scopes: the existing19-case remaining Port recovery suite; Project protocol32-case suite; ordinary UI Browser10-case suite; Worker/shared Pro Node; full Studio Node. The dedicated Project protocol suite already uses synthetic Pro/quarantine fixtures and now explicitly substitutes the entrance module in that fixture only. Its PASS is **not** formal entrance acceptance. The standard loopback UI fixture likewise substitutes gate/entrance only in the server, never through a product flag. `--native-entry` disables those substitutions and serves the real locked entrance with external connections blocked by CSP.

Screenshots are produced outside the repository: locked entrance, authenticated Home, resumed native modal and responsive UI. Do not enter real credentials into either loopback preview.

## Remaining acceptance

- Physical Asset cleanup on0033 and exact Production v138 equivalence remain HOLD. No related Worker code was changed.
- Real Account/Pro, actual two-device acceptance, Safari/mobile, real microphone, and existing writer/old-client boundary acceptance remain separate. A synthetic PASS is not Production acceptance.
- Account Device re-entry in the synthetic test uses a fresh valid native Account session. The existing native recovery UI itself was not newly accepted end-to-end here; no replacement recovery logic was introduced.
- Existing four-app native Sync adoption/Account behavior is not newly certified by the local component authority handoff; local settings reuse and the native Port/Project paths have separate scopes.
- No independent reviewer was used. Review the narrow entrance/write/lifecycle delta before real-credential acceptance. No main merge, Pages or deployment is authorized.

Shortest next step: review this isolated delta, verify the native connection/recovery flow on supported browsers in a separately authorized credential trial, then carry out real-device Account/Pro/Sync acceptance. Settle cleanup/v138 release holds independently before deployment.
