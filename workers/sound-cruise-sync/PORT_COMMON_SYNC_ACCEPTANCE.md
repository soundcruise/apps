# Port common-data Sync integration acceptance

This is an additional release acceptance contract. Studio Project Sync acceptance
does not establish Port common-data Sync acceptance. No production activation,
credential issuance, shared writer activation, or UI workline change is authorized
by this document.

## Existing persistence contract

The reference is `apps/cruise-port/port-sync-adapter.js`: appId `port`, schemaVersion
1, payload `{id, value}`, stable record type/id and canonical payload hashes. The
singleton mappings are settings/global, metronome_settings/default,
tuner_settings/default, and practice_cycle/current.

The complete declared types are settings, metronome_settings, tuner_settings,
practice_cycle, metronome_preset, calendar_event, practice_menu,
practice_menu_order, practice_menu_set, practice_attachment,
practice_attachment_set, practice_history_event, gear_category,
gear_category_order, gear_item, gear_order, my_app, and my_app_order.
`practice_menu_sets_v1` is capability-gated. Unsupported records must not be
interpreted as deleted by an older client. Asset bytes are separate from record
metadata and must retain the existing publication/reference/cleanup contract.

`apps/shared/sync-account/multi-app-sync-runtime.js` uses bootstrap, snapshot,
push, migration/complete, and removal-safety under `/v1/sync/`. Writer authority
uses `/v1/sync/writer-authority?appId=port`. Account membership, application
credential, device/generation/revocation, and server-side Pro checks are separate
requirements. A Studio Project credential or a displayed Pro label does not
authorize the Port dataset. Do not manufacture a missing identity or generation.

## Required acceptance evidence

1. Inventory the PC Port features against the exact record types, stable ids,
   schema version, full-dataset manifest and capability filtering above. Bind
   the Studio PC caller to the approved Port Account/device/application authority
   without copying credentials into public assets or creating a second source
   of truth. The authorization integration is not completed by this document.
2. With synthetic fixtures, demonstrate Port -> Studio and Studio -> Port for
   settings, presets, and each supported saved-data type; compare canonical
   payload/manifest hashes, revisions and explicit receipts, including ordering,
   tombstones, attachments and an older capability-limited client.
3. Demonstrate offline durable pending operations, CAS conflict resolution,
   response loss with explicit reconcile, restart and a second device. An
   ambiguous commit stays pending; do not silently replay a new operation or
   replace an unknown remote dataset with a local full snapshot.
4. Revoke Account, device generation and Pro separately; delay old Account A
   requests/responses while normal Account B saves. Reject stale authority in
   the final transaction without reverting B or restoring old credentials.
5. Preserve invalid/unknown JSON, missing asset references, partial migration and
   unknown generation for explicit owner recovery. No automatic repair,
   generation backfill, cleanup, or dual writable canonical copies.
6. Demonstrate ordinary Studio boot makes no writes. Keep Shared Write OFF,
   canWrite=false, and production Cloud activation OFF throughout isolated
   acceptance. Production write E2E requires its own approved release window.

## Current limit and handoff to UI development

At PR #90, `apps/cruise-studio/js/cloud/studio-transport.mjs` is a Studio document
transport with selected Account recovery/Pro endpoints. That transport is not
proof that the PC Port UI uses the Port data contract. The UI workline must
provide its exact caller/adapter mapping and the evidence above before combined
release acceptance. This change does not modify that workline or broaden the
Project transport whitelist.

Maintenance OPEN observation only establishes the observed Control metadata.
It does not demonstrate complete writer coverage, freeze/cutline, Backup,
restore correctness, Port common-data interoperability, or release readiness.
