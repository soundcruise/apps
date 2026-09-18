# Binary Asset Sync Phase 1

Phase 1 synchronizes only Cruise Port Gear photos and custom My Apps icons. Practice Menu attachments and generic files remain out of scope.

## Authority and storage

- D1 is the lifecycle and ownership authority (`sync_assets`, `sync_asset_operations`).
- The private `SYNC_ASSETS` R2 binding stores bytes in `sound-cruise-sync-assets`.
- Cruise Port IndexedDB is the local editable source and cache.
- Structured Port records contain logical asset metadata; device-local IndexedDB IDs never leave the device.
- Object keys are derived by the Worker as `assets/{accountId}/{syncUserId}/{assetId}/{kind}` and are never accepted from or returned to clients.

Supported kinds are `gear_photo_final`, `gear_photo_source`, `my_app_icon_final`, and `my_app_icon_source`. Upload is an idempotent prepare / content / commit sequence keyed by operation ID, logical asset ID, and SHA-256. A structured reference is published only after commit.

## Validation and limits

The Worker accepts normalized WebP, PNG, and JPEG images. It verifies byte length, SHA-256, magic bytes, parsed image dimensions, kind, ownership, active Account/Port membership/device, ready dataset, and server-side quota.

| Kind | Dimension rule | Per-object limit |
| --- | --- | ---: |
| Gear final | 512 × 512 | 1 MiB |
| Gear source | max dimension 1024 | 8 MiB |
| My Apps final | 256 × 256 | 512 KiB |
| My Apps source | max dimension 1024 | 8 MiB |

Image Storage defaults to 1 GiB, 1,000 non-deleted asset variants, and 200
new variants per Account per UTC day. Source and final variants each count as
one asset. `sync_account_asset_quotas` supplies server-authoritative per-
Account overrides (for example 5 GiB, 10 GiB, or a custom allowance) without
requiring a bucket per Account. Categories are explicit: `image`,
`document_score`, `audio`, and `practice_attachment`; only `image` is enabled
in Phase 1. A future Account-wide ceiling can be added independently of each
category allowance.

Global protection permits 50,000 new image variants per UTC day. The Worker
reports notice / warning / strong-warning states at 100 / 250 / 500 GiB, and
stops only *new* binary uploads at 1 TiB. Structured sync and already stored
asset downloads remain independent of that stop.

## Lifecycle

- Replacement uploads and commits the new asset before switching the structured reference.
- Removed or superseded references become `unreferenced`; objects are retained for a 30-day grace period.
- Prepared/uploaded operations abandoned for 24 hours become cleanup candidates.
- Scheduled cleanup processes at most 100 candidates, rechecks current structured references, deletes the R2 object, then marks D1 metadata deleted.
- Port Environment detach and Account delete grace do not remove available assets.
- After final Account purge, surviving asset rows make the related R2 objects eventual-cleanup candidates.
- Recovery and a newly joined Port reuse the same logical references and download into new device-local IndexedDB IDs.
- Valid authenticated Account, Port, and Pro-app activity is recorded at a
  bounded interval. After 365 days without it, an Account becomes dormant but
  keeps its datasets and objects. A valid use reactivates it. Only after 455
  days without activity does the existing eventual Account purge path begin.
  This is wholly separate from the user-requested seven-day Account Delete
  grace period.

## Operational controls

- `SYNC_ASSET_WRITE_ENABLED=false` stops only new prepare/upload/commit work.
- `SYNC_ASSET_DOWNLOAD_ENABLED=false` independently stops private asset reads.
- `SYNC_ASSET_CLEANUP_ENABLED=false` pauses scheduled object cleanup.

All three default to `true` in production. They are emergency binary controls,
not replacements for the quota guard, and do not change structured Port sync,
four Pro-app sync, or Account lifecycle semantics. Do not add an R2 rule that
deletes active objects solely by object age; D1 lifecycle state remains the
authority.

## Deployment order

1. Apply D1 migrations `0022_add_binary_assets.sql` and
   `0023_add_asset_quota_and_account_activity.sql`.
2. Create the private `sound-cruise-sync-assets` bucket if it does not exist.
3. Deploy the Worker with the `SYNC_ASSETS` binding.
4. Deploy Cruise Port Pages version 0.42.0.

Do not deploy Pages before the Worker asset contract is available.
