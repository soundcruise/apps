# Account purge → Studio Project payload erasure (candidate)

The existing Scheduled adapter now appends Studio erasure immediately after the regular `DELETE FROM sync_accounts` in the same D1 batch. The native Account lifecycle remains the authority: `state=deleting`, `purge_after` reached, memberships finished, and existing unresolved-recovery protection. A cancellation/recovery that wins first makes the native DELETE affect zero rows; it cannot authorize Project erasure.

The immediately following SQL uses `changes()=1` plus Account absence to write `studio_document_erased_accounts`. The Account UUID is the deterministic operation ID in this Account-scoped terminal receipt (`authority=native-account-purge-v1`). The same transaction removes all Account chunks (including pending operations), removes Project heads, clears history payloads, and revokes enrollments through the existing retention payload helper. Evidence/receipt metadata is retained. Every payload statement also requires Account absence and its erasure marker. Other Accounts and the Port/four-app tables are outside these statements.

There is no new Worker, DB, table, DDL, deletion scheduler or credential. The existing caller still receives exactly one native result per original statement. Account purge, erasure and receipt roll back together on any SQL failure; the next Scheduled run retries through the original Account row. Lost ACKs can be inspected using the durable receipt; repeated purge calls do not create a second receipt.

## Seven days versus ten minutes

The short Studio erase intent remains short lived. It is neither extended nor revived. It is not the authority for the regular Account purge: the native Account deletion request already establishes its own durable lifecycle deadline (seven days for user-requested deletion; the existing separate inactivity policy is preserved). The old exact-scope `completeStudioAccountErase` path keeps its policy, expiry and scope checks and shares only the payload-erasure SQL. Studio-intent cancellation alone is not cancellation of native Account deletion.

Only the successful native deletion can create this marker. Account absence alone cannot authorize cleanup of an already-orphaned Project. Any bodies orphaned before deployment require separate provenance/authorized handling; this change does not guess their deletion history or access Production to look for them.

## Validation / parallel integration

Run `node --test workers/sound-cruise-sync/test/studio-account-erasure.test.mjs` after installing the existing Worker dev dependencies. It uses local Miniflare/workerd D1 with the captured production-schema0033 fixture plus the existing RC4 DDL, synthetic data and outbound network rejection. No real Account or Production resource is used.

Cases cover grace, mature purge, other Accounts/shared app data, expired Studio intent, restored Account and commit-boundary cancellation, rollback/retry, lost ACK/idempotency, mixed result offsets, unresolved recovery, schema drift, unproven old orphan retention, no-Studio legacy path and the original exact-scope intent helper. Existing Owner native regression exercises normal save/read/CAS/pending and restart, in addition to relevant Worker Node tests.

This branch starts at fixed PR190 head `2cfce456722c5f7c6a873ca10d67ec089b240821`. It uses a new worktree inside its own clone, sharing neither files nor Git metadata with the active canary worktree. Product changes are confined to `studio-retention-owner.js` and `studio-scheduled-rc2.js`; no frontend, activation, Owner session, codec, Port/shared/NEWS changes. Worker package metadata is patch-bumped to 0.1.1; this is not a Production version/deployment.

The canary line must include the Scheduled adapter in its final Worker composition. No change is made to that line here. Production v139/installed RC4 is the stated deployment premise, not a new live observation. No deployment, DDL, activation, real deletion, R2 operation, merge or Pages publish was performed.

References: [SQLite changes()](https://www.sqlite.org/lang_corefunc.html#changes), [D1 batch transactions](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch).

Accepted locally: native D1 15/15, relevant Worker Node 67/67, existing native Project Owner regression 33/33, no skipped cases in these executions. The canary line is Draft PR192 (`fe8fae374e819048ec224f866da150fb0d920809`); it changes `discard` earlier in `studio-retention-owner.js`, while this patch adds the native-purge helper below it. Those changes are kept on separate branches. This is implementation self-review plus isolated tests, not a claimed independent AI review or Production acceptance.
