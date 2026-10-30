# Studio pre-DDL backup, restore and rc5 operations

This is an isolated operational candidate. It does not deploy a Worker, create resources,
stop writers, read Production credentials, or enable Studio routes. There is no unattended
Production entry point. `restore-child.mjs` accepts synthetic fixture input only.

## Components and trust boundary

- `prestudio-validator.mjs` accepts the exact Production102 shared0033 profile, exact
  managed KV definition and ordered 33-entry journal, with zero `studio_document_` objects.
  It checks Account/Pro generations, existing five-app record structure and R2 metadata.
  The existing rc5 post-install validator remains separate. Unknown/partial schema is rejected.
- `transport.mjs` uses Cloudflare D1 REST `{batch:[{sql,params}]}` and AWS SDK v3 S3.
  Source D1 is read-only; target D1 mutations are available only to the approved restore
  capability. DDL is restricted to the byte-fixed rc5 88-statement plan, independently
  signed restore evidence, and the approved physical identity. No environment credential
  fallback is configured. Management ID, bucket creation identity and jurisdiction are
  read back; Production source/DDL grants also require deployment/version/100%/Studio-OFF
  readback. Credentials are explicit in-memory handles, never recorded by this library.
- `host.mjs` requires an external signed host/root/key/custodian/recovery-pin grant and
  pre-created private directories with exact device/inode/mode anchors. Production host
  observation is currently limited to the FileVault-enabled boot volume. External encrypted
  volumes need their own reviewed provider. `keychainHandle` reads a named, existing 32-byte
  base64 key into memory; it never searches for, creates or rotates credentials. The caller
  must return a fresh key Buffer because the core zeroes its copy. JS strings/runtime copies
  and hostile same-UID processes cannot be reliably erased or physically excluded.
- `cutline.mjs` verifies an externally signed complete writer inventory, actual admission
  stop receipts, zero inflight, independently resolved legacy operations, scope, expiry,
  operation ID, sequence and cutline. It pins the first witness and rejects drift. The
  external signer must establish these facts; signatures alone do not prove completeness
  or freeze effectiveness. Fixed waits, an empty registry and 100% deployment do not suffice.
- `scheduledObserver` wraps D1 and R2 delete failures and emits payload-free typed results.
  A swallowed R2 rejection remains UNKNOWN; confirmed R2 deletion followed by D1 failure
  remains PARTIAL_UNKNOWN. This wrapper is fixture-connected, not deployed to v138. It
  cannot retrospectively prove earlier invocations or unwrapped/background side effects.
- `operations.mjs` binds operation IDs, durable exclusive intents, host anchors, physical
  identities, archive evidence and cutlines to the reused bounded encrypted core. Each
  backup page checks host/cutline. Resume requires the same signed scope/grants and OPEN
  checkpoint. Unknown claims/operations are kept; restore targets are never automatically
  reused. Reconciliation is read-only.

The public signing root must be independently pinned. Production grants must have
`synthetic:false`, exact scope/operation and bounded validity. Synthetic grants cannot
be used as Production approvals. Library consumers/providers and the signing authority
are trusted code, not a sandbox against a caller who replaces the implementation.

## Reused core and coverage

The following reviewed files were copied byte-for-byte from the preceding operational
candidate; their algorithms were not replaced:

| File | SHA256 |
| --- | --- |
| `core/adapter.mjs` | `05e516f15322c8130f791cfb67472eafae48213363a72f58e732f110c508d280` |
| `core/binding-provider.mjs` | `3c0d9e3ac024ad1b64b6e690ec6f4ced677ae0682ad3960d41ab4c42d9e336f0` |

AES-256-GCM pages are bounded to 256 KiB, 100,000 pages and a 32 MiB manifest. D1 rows
are read in pages of 32, R2 listings in pages of 32, bodies in 64 KiB ranges and multipart
restore in 5 MiB parts. A single oversized D1 row, unsupported schema dependency/order,
cycle or budget excess stops acceptance; this is not unlimited-capacity backup support.
Table/sequence/schema/journal and all listed R2 bodies, custom metadata and supported HTTP
metadata are restored and compared page-for-page. Provider-managed KV/CF metadata is not
business backup data: its exact supported platform profile is checked separately.
Object identities such as ETag/upload time and bucket policy/lifecycle/access configuration
are not restored as application content. Unknown transport/schema behavior needs explicit
review. S3 pagination must progress with strictly ordered keys and no cursor replay.

Claims/journals/manifests contain resource IDs, counts and hashes; data pages contain
sensitive rows encrypted. R2 restore staging is plaintext on the approved encrypted host.
Partial staging and multipart state are retained for explicit investigation, not cleaned
up or retried automatically. The host, keys and target must never serve these data publicly.

## DDL state machine

`studio_0001_rc5` canonical hash:
`4a6312a07ecea3433f00102b8e8651c62438ee060e05e4e755a4786c5a16e550`

Fixed SQL SHA256:
`8503af5b2475063e76b1c5f73f2816d95e6f35085a001f61a4ad127c08190ebc`

The exact 88 statements are sent once as one batch: initial exact assertion, 83 Studio
objects, three metadata inserts, final assertion. Shared schema/journal are not migrated
or backfilled. The expected logical count is 185, with the existing managed KV profile.

- Precondition refusal before POST: NOT_APPLIED with `sent:false`.
- Exact rc5 schema, marker, journal/control and base profile on readback: APPLIED.
- POST error/ACK loss with unchanged base: UNKNOWN / BASE_UNCHANGED / no resend. A delayed
  request is not excluded by an empty schema observation.
- Partial, unknown or changed schema: UNKNOWN / no resend.
- An existing durable intent prohibits another POST, including after process restart.

There is no distributed atomic transaction between D1, R2, host journals and HTTP ACKs.
A restore is a fresh-target drill, never an in-place Production rollback. D1 success plus
R2 failure is PARTIAL_UNKNOWN. A full Production restore could destroy Account B's later
updates and is not authorized by a successful drill. Studio DDL itself serializes schema
writers and uses D1 transaction assertions; it does not automatically require a long freeze
of ordinary legacy DML. The consistent streaming source backup does require a complete
writer/cleanup freeze and cutline. Keep these approval boundaries separate.

## Reproduce the isolated acceptance

Use an independent clone and a new, nonexistent absolute output directory:

```sh
STUDIO_OPS_OUTPUT=/absolute/new-output \
STUDIO_TEST_RUNTIME_102=/absolute/reviewed-logical102-runtime/package.json \
npm run test:studio-operations
```

Without explicit isolated paths the test is skipped, never redirected to Production.
The logical102 fixture uses the preceding private Miniflare D1 transport adjustment
(bookmark header generation omitted, empty managed-KV bootstrap). Native SQLite/D1 batch
and R2 semantics are exercised, but stock-runtime bookmark/session behavior and Cloudflare
remote transport parity are not certified. HTTP management metadata is synthetic. The
actual S3 SDK sends SigV4; the local gateway checks its presence, not independent signature
cryptography. Native five-app HTTP routes run in workerd. The delayed Scheduled handler
runs under Node against native D1/R2 bindings. No real credential or user data is used.

Acceptance covers actual local HTTP interruption/resume, full encrypted backup, a separate
restore process, read-only reopen, one-shot target, real multipart ACK loss after commit,
freeze rejection, Scheduled swallowed errors, fixed-batch rollback/ACK loss, Account B,
five-app save continuation and Studio OFF/423. Previously saved tests are not counted again.

## Production execution prerequisites (not approvals)

1. Fix actual source, a genuinely fresh isolated target, Production/source denylist,
   public signing root, operation ID and readback-matched resource/deployment grants.
2. Approve host/volume/root anchors, named existing key handle, custodian, independent
   recovery copy, staging/capacity, retention, budget and resource-scoped permissions.
3. Receive independently verified admission-stop/inflight/partial-state evidence covering
   every HTTP/version/service/cron/external/manual writer. Missing proof means HOLD.
4. Under separate approval, perform one consistent encrypted backup and a full fresh-target
   restore/readback. Preserve UNKNOWN/PARTIAL; do not retry or repair automatically.
5. Obtain an independently signed restore-accepted receipt. Under a separate DDL approval,
   recheck deployment/OFF/schema and schema-writer serialization; send the fixed batch once.
6. Keep v138, Studio OFF, existing bindings/secrets/cron, Shared Write OFF and canWrite=false.
   After DDL there is no automatic rollback to v137. Owner canary, new limiter, Activation,
   registration, Cloud saves and general release require their remaining gates and approvals.

Natural Scheduled acceptance is a separate Production observation. A platform success event
alone cannot prove absence of HOLD or swallowed D1/R2 partial failure. This candidate does
not add Production telemetry or certify the next natural invocation.
