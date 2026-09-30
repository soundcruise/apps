# NEWS 1.5.0 production operations

The live registry/evidence remains authoritative. Only Shimamura product news is enabled.
Shimamura SALE, Sound House and Ikebe SALE remain disabled and unauthorized.

## Interval and hourly scheduler

Migration 0008 adds `source_state.last_publisher_request_at`. Each request attempt reserves
its timestamp before network access. The last attempt (including HTTP errors/timeouts)
anchors the 24h minimum; `next_at` can only advance. The legal gate and atomic source lease
both check the interval. Other sources have independent state. Collection wakes hourly
(`0 * * * *`); retention runs at minute 17. Public routes never collect.

## Initial launch exception

The operator explicitly authorized one listing GET on 2026-09-30 only, for initial production
launch. This is an exception to our voluntary interval policy, not a change to that policy.
`scripts/initial-production.mjs initial_production_collection_2026_09_30` checks stopped
infrastructure, registry/evidence, retained robots hash, health, DB identity and secret presence.
It atomically consumes a fixed audit ID before fetching. The reason/date, empty DB and local
exclusive marker prevent reuse. It is not imported by HTTP/Cron runtime and creates no
public route or persistent bypass flag. Robots/article/image/feed/HEAD/other publisher fetches
are forbidden. HTML/original titles stay in process memory and are cleared after the pending
candidate sink; logs contain counts, independent facts and health only. A failed attempt also
starts the ordinary guard; never rerun the initial command.

## Stored publication and release

`node scripts/completion.mjs publish-stored` requires collection OFF and approves only stored
AUTO_PUBLISHABLE rows after evidence, health, authorization, date/expiry and keyed provenance
gates. REVIEW stays pending. It performs no publisher request.
`guard-check` tests normal manual and actual scheduled core against the production D1 adapter
with a rejecting fetch callback. It requires the current attempt timestamp and restores the
previous collection control. `deploy-running` requires initial + zero-fetch guard proofs,
healthy source, real approved candidates, ON controls and the exact hourly/retention Crons.
All operator commands authenticate via Wrangler; private `.local` secrets are ignored.

Collection/API/publication switches and source/item takedown are operated by
`scripts/operator.mjs control ACTION TARGET REASON` (API re-enable is explicit).
Stop immediately on policy/robots change or bad health; do not force publication.
Use `wrangler.infrastructure.jsonc` for a hard OFF/no-Cron rollback; existing
`wrangler.production.jsonc` is the accepted running profile after completion.
The original infrastructure report is historical, not the final running state.

Production Port uses API as source of truth. The static fixture remains only for explicit dev/test
use; network/disabled/invalid API responses show NEWS error/unavailable and cannot resurrect it.
