# Project Cloud — operator canary preparation (no Production changes)

## Baseline and scope

- Remote main at preparation: `210c2ff08a80402d03811656697c1b7b6f51d1ff`.
- #190 `2cfce456722c5f7c6a873ca10d67ec089b240821` / tree `85f45f68434a252bc1adcaebc451906f45fc47bb` retained; current main merged into a new isolated branch. Public Port 1.26.2 image patch retained byte-for-byte.
- Studio candidate **0.76.1**, patch to the unpublished 0.76.0 integration. Production Studio remains 0.74.1.
- Existing RC4 83 objects, shared journal 33, schema2, codec binding and API envelopes unchanged. No additional DDL, binding, Worker, DB, Owner, HTTP control route or Sync engine.
- This work makes no Production calls/writes/deployments, main merge, Pages release or real Account/Project actions.

## Reused paths / authorization

`studio-canary-entry.js` uses current `index.js` as its sole non-Project implementation, the existing `createStudioActivatedWorker`, Owner, native Account/Device/Pro, immutable operations, final SQL guard, RC4 activation/log, and existing Scheduled wrapper.

The default `studio-release-entry.js` is unchanged and always OFF. The explicit canary entry accepts **only audited activation mode canary**. Missing/off activation or disabled control returns 423 `studio_off`; general mode cannot open this entry. Env flags, localhost injection, query parameters or frontend visibility cannot authorize it. `STUDIO_RELEASE_ROUTE_ENABLED=false` stays unchanged; it is not the activation control for the explicit entry.

Activation targets are exact tuples `{accountId, deviceId, datasetId}`. **datasetId means Project UUID in this existing Owner contract**, not a Port dataset/AppDevice ID. Use Account Device ID, not its display name or Port AppDevice ID. Both intended operator devices must be individually selected for the same Project to exchange it. Session, Account generation, credential version, native bound Pro lease/generation and RC4 epoch remain mandatory. Final SQL checks all existing qualifications plus audited activation revision/hash. Activation OFF/target changes after request admission reject the in-flight batch.

Catalogue SQL filters allowed Project IDs before reading any Project body. Owner Session adds the authorized dataset list outside the immutable binding; document codec/Outbox identity is unchanged. Native Account credentials cannot grant Port writer access through this Owner.

No real target IDs were supplied or inferred from browser/backup data. Operator selection is still required before enabling Production. Identifiers belong only in a private mode-0600 admin input/SQL file, never source, public manifests or CI logs. No credential/token is needed in the target file.

## Frontend distribution

Normal safe Jekyll remains **81 Studio files**, with Cloud modules, development entrance, Project backend and tests excluded. It never imports the canary loader. No general-user Project Cloud entry is added.

`node apps/cruise-studio/scripts/package-project-canary.mjs --out /absolute/new-external-directory`

generates **90 files** exclusively under `/apps/cruise-studio-canary/`: the same 81 release UI files, six retained Cloud modules, stylesheet, loader and `project-canary.html`. These are generated from one source, not a maintained second UI. The same origin retains the existing Account DB, Pro Session, Project storage and Port/app URLs.

Future URL, **not published now**: `https://soundcruise.jp/apps/cruise-studio-canary/project-canary.html`.

The loader uses the formal fixed-origin production transport and existing Session/host. It shows the existing Cloud panel only after the server admits the Account/Device and returns a canary grant. Unauthorized users never get an enabled Cloud panel. The URL is not an authorization boundary. Offline/error recovery remains available for previously admitted owners, while Account/Pro invalidation and OFF hide it; the server continues to reject writes regardless of UI.

For release, build the normal site from then-approved public main, overlay only this generated canary directory, verify both manifests, and use an explicitly approved Pages artifact deployment. Do not replace public `/apps/cruise-studio/`, native apps, shared files or the default Jekyll excludes. Current branch-based Pages publication does not automatically distribute this opt-in artifact; the final Pages artifact publication/configuration must be separately approved. No workflow or Pages configuration was changed here.

First Cloud save remains explicit; tracked saves/resume reuse the existing client. A new local Project must first be added to trusted targets. Unselected Projects remain usable locally. For deleted-Project copy restoration, preapprove unused **reserve Project UUIDs** for the same operator devices; the existing restore action uses an absent approved ID with local raw CAS and Cloud CAS. Without an unused approved target, stop with `canary-copy-target-required`, preserving the source. No automatic tombstone resurrection or new Owner allocation API.

## Operating limits / remaining holds

- Existing policy interfaces: 100 documents, 2,048 unresolved operations, 128 MiB stored chunks per Account; 600 authorized requests/minute; existing shared native limiter still applies.
- Recovery evidence budget: 4,096 rows / 16 MiB. Existing operation epoch/recovery proof rules retained.
- Retention policy interface: history minimum 30 days, rate records one day, intent lifetime ten minutes. Canary maintenance guard refuses physical Project collection and Account erasure. Explicit cleanup of a CAS-rejected, uncommitted operation reuses the existing Project-scoped discard protocol; local Outbox evidence and the exported draft remain. UNKNOWN cannot be discarded. No Scheduled Project-body deletion is enabled.
- **Account deletion leaving Project bodies is a general-release blocker.** Existing `canary-account-maintenance-hold` remains and is tested at Owner erase-request. Native Port Account deletion is not redesigned or globally intercepted: do not delete the operator Account during canary. Revoked/deleted Accounts are denied access.
- Asset physical cleanup HOLD retained; R2 removal is not enabled.
- Nov 5, 2026 **12:15 JST / 03:15 UTC** v139 Scheduled is a separate Production acceptance item. Preparation occurred Nov 4; it is not marked PASS, and no waiting job was created.

## Minimal Production procedure — ALL steps below require separate approval

1. Specify operator Account + intended Account Devices + Project IDs (including optional copy reserve IDs), using existing private Account/device management metadata and selected local Project IDs. Keep current browser/data; no Account recreation or automatic adoption. Record fresh v139/off state, deployment/configuration/RC4 marker, backup availability and rollback version.
2. From the frozen candidate, dry-run then deploy **existing** Worker with `src/studio-canary-entry.js --keep-vars`. Keep D1 control/activation OFF while validating health and existing API/configuration. Do not use `versions upload` or create another service/binding. Do not replace with an old Worker bundle. Use the existing current config and preserve all Production vars/cron/bindings.
3. Generate a private activation plan from fresh read-only metadata using the existing audited function. Input contains `expectedRevision`, new UUID `operationId`, `mode:"canary"`, `targets`, non-sensitive `reason`. Initial absent activation means revision 0; verify rather than assume.

```sh
node workers/sound-cruise-sync/scripts/studio-canary-plan.mjs \
  --input /private/operator/canary-input.json \
  --out /private/operator/canary-plan \
  --wrangler /absolute/existing/node_modules/wrangler/bin/wrangler.js \
  --config /absolute/frozen/workers/sound-cruise-sync/wrangler.jsonc \
  --database sound-cruise-sync
```

The planner issues SELECT only. It verifies exact RC4/base/journal, native active production Account/Device pairs, current control, existing activation revision, then captures `changeStudioActivation` statements without applying them. Output `activation.sql` and `PLAN.json` are private mode 0600. Review DB ID from the frozen config and full SHA-256. It changes no journal/schema and sets enabled last. Apply the reviewed file **once**, only after approval:

```sh
node /absolute/existing/node_modules/wrangler/bin/wrangler.js d1 execute sound-cruise-sync \
  --remote --config /absolute/frozen/workers/sound-cruise-sync/wrangler.jsonc \
  --file /private/operator/canary-plan/activation.sql --json --yes
```

4. Read activation/log hashes, selected target counts, control=1 and unchanged shared metadata. Release the separately approved canary frontend artifact while preserving all public main files. Operator enters existing Pro once, opens only the approved Project, explicitly performs first Cloud save, then checks second-device catalogue/receive/update. No real Project was created or sent during preparation.
5. Check native Port/4 apps/calendar and existing actual-user flows without synthetic Production writes. Record real canary acceptance separately from synthetic PASS.

### OFF / rollback

Generate a fresh plan with current expected revision, new operation ID, `mode:"off"`, `targets:[]`; apply once using the same reviewed-file procedure. Existing activation CAS/log invalidates in-flight grants and control becomes 0. Verify both Project routes 423; keep local Projects/Outbox/Cloud chunks. Remove only the canary frontend directory from a future Pages artifact if needed.

If activation cannot be safely changed or Worker has a major regression, restore the separately authorized pre-canary **v139** version `b33b3776-5014-4fe8-8533-efe0134c3192` (deployment at baseline `94376026-664e-494f-8750-67faeebd091c`). The default OFF entry blocks Project independently of activation rows. Recheck rollback availability immediately before release; it was not newly deployed or exercised here. Never reverse DDL, rewind shared D1, clear Outbox or delete R2.

If SQL response is lost or any precondition fails, do not resend. Read control, activation/log and marker; leave/return Owner OFF through the authorized recovery path. Stop on schema/config drift, wrong target, new service regression, unresolved backup/rollback, or an inconsistent activation audit.

## Validation

- Synthetic actual-origin browser route interception: **23/23**, no outbound Production, disposable Chrome/native Miniflare D1/R2. Includes public ordinary entry without loader, formal canary entry, two Device grant, catalogue receive, tracked updates/reload, Offline, CAS, UNKNOWN same-operation reconcile, tombstone/new-ID copy+lost ACK, Port bidirectional Sync, native four-app startup/page refresh, score/PreDTM local sharing and JSON/MIDI export, explicit CAS resolution, encrypted fixture backup/restore, five themes/four widths, foreign Account/Project, Device/Account/Pro revoke, erase HOLD and OFF with data preservation.
- Targeted Node suites and final-SQL/0033 source regression: **402 distinct executed PASS**, four inherited main failures, four conditional suites not executed; see acceptance.json. Original index, unchanged OFF entry and explicit canary entry preserve native Port/all-four-app snapshots. No legacy bundle used as source evidence.
- Wrangler 4.131.1 dry-run of formal entry succeeded, no deployment; existing config/bindings/cron unchanged.
- Safe Jekyll 81-file package; opt-in separate-directory 90-file hashes; development/Cloud URLs absent from normal site.
- Known four color-theme Node failures inherited from main (old four-theme assertions vs five-theme implementation), not relaxed/fixed here. Five-theme browser acceptance PASS. Conditional legacy fixture suites not run without their dedicated runtime are not counted as executed PASS.
