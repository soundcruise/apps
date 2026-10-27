# Explicit recovered credential adoption — isolated contract v1

Direct parent PR #19 `a24244d3c069c2a30869a72096f438eeb3cc5117`, tree `6bd5d52b6e551c5591f6ce26e8604dce49c68539`. main → #16 → #17 → #18 → #19 → this topic. Internal maintenance candidates Studio **0.47.14**, Port **1.24.17**, StudioProject schema **2** unchanged. Published main remains Studio0.47.9 / Port1.24.12. There is no new routed backend, schema/migration, authentication system or ordinary consumer installation.

## Owner and explicit operation

`createIsolatedCredentialAdoption` requires the existing isolated Authority capability, exact IndexedDB environment, existing protocol3 Account mutation owner, native/cooperative Web Locks, canonical Account storage, existing encrypted renewal vault, and explicit loopback/owner-fixture transport. Import does no I/O. Factories are absent from product boot graphs. User code must call `inspect({renewalOperationId,generation})`, then explicitly `adopt({candidate,operationId,explicit:true})`. Public failures use a fixed allowlist of nonsecret reason codes, including failures returned through the coordinator after stopping; transport/storage exception codes are never reflected. A candidate is a private WeakMap handle. It contains no credential/secret and a caller-supplied DTO is not accepted. Inspect, decryption and validation alone never publish an Account mutation, stop Authority, write an adoption receipt or create an adoption backup. The existing owner renewal reconcile may record **restrictive SQL clock/expiry authorization facts**; this is not a claim that all databases are readonly.

The candidate pins canonical opaque capture, the official full-source cutover manifest, physical3/revision/fence/ledger, current Account/device/member, server Account and membership generations, Authority active generation/Control identity/epoch/pointer, exact renewal operation/digest and credential version/lease. Runtime generation and credential authenticity/current version/expiry/revocation are validated by the existing authenticated owner renewal recovery endpoint from its private SQL recovery binding, not inferred from UI state, local time or the provider's five-second observation cache. Unknown values fail closed.

The adoption is an existing **same-Account/device `switch`**. Only `accountCredential` changes; every other canonical Account field is retained exactly. No plaintext is copied to general metadata, backup or receipt. The new credential is stored only in the pre-existing canonical Account credential field. The encrypted recovery vault and its nonextractable CryptoKey are retained. There is no automatic renew, issuance, adoption or second Account store.

## Ordering and linearization

1. Recheck original source, Authority generation and current owner recovery result. Require explicit operation UUID.
2. Pin/read back an immutable `adopt-UUID` packet in the existing Shared backup owner. It contains only nonsecret binding, source digest, before/target Account digest, credential digest, renewal ID/digest and Authority facts. A pre-existing operation pin requires readonly reconciliation, never a second mutation.
3. Obtain the existing Account coordinator context and recheck the source before submitting.
4. Existing Authority `beginAccountTransition` commits the typed stop intent and restrictive Control together. Other pending intents/stale pointers/ABA cannot be bypassed.
5. Under that stop, recheck source, own exact intent and current backend qualification. The existing protocol3 Shared **Account CAS transaction atomically publishes the canonical credential, mutation ledger/receipt, marker and fence revision**. This is the Account publication linearization point. Existing CAS and safety assertions are unchanged.
6. Reconcile exact mutation receipt/current target Account and confirm the existing local intent. Confirmation is evidence of local Account publication, **not backend authorization or permission to resume**. The Control remains invalidated.
7. Recheck the owner again and the local receipt/target/Authority. Successful local publication is `adopted-stopped`, historical, `operationAuthorized=false`, `canWrite=false`, `productionReady=false`.

Backend SQL, Authority IndexedDB and Account IndexedDB are separate transactions. Qualification before CAS cannot guarantee remote validity at the instant of the local CAS. A revocation in that window may leave the newly published credential in the canonical Account. Postcheck failure returns `committed-owner-unconfirmed` (not adoption success), preserves the stop/backup and never rolls back to the old credential. Any future protected save must perform its own owner final admission; no historical receipt or adoption result is an authorization grant. No normal writer or provider is activated here.

## Crash, ACK loss and ambiguity

`reconcile({operationId})` reads the immutable adoption packet, existing mutation ledger and exact Authority intent. It requires the current Account/device and target full Account digest, exact binding/before/after digest, validated receipt checksum and currentObservation, and unchanged stopped Authority. It does not call renew, CAS, confirm, resume or delete. A successful response proves **historical local adoption only**, even if the backend credential is now expired/revoked. The response never returns the credential.

- Before CAS crash: no new credential/receipt. Persisted pin and any stop intent remain, outcome unproven. No retry/autoadopt.
- After CAS before confirmation: `committed-barrier-unconfirmed`, `accountMutationProven=true`, `ok=false`; a reopened instance cannot forge the branded stop receipt to confirm.
- After confirmed local publication / lost ACK: exact historical `adopted-stopped` can be proven without republishing. Owner authorization is still not implied.
- Missing/corrupt receipt, changed source/Account/generation, key loss, unknown manifest, mismatched renewal or missing candidate: fail closed; no silent repair/deletion. Normal B's current Authority, receipt and prepared operations are preserved.

## Limits and next boundary

Same-origin malicious raw IDB access, DB deletion/tampering and arbitrary code with full origin privileges are not cryptographically fenced by these client APIs. Hashes are integrity bindings, not authentication. The existing old-writer/migration/binary/final-admission gates remain. A caller's explicit flag is an API protocol requirement; this phase adds no production UI or browser user-activation enforcement.

Renewal recovery is short-lived. If its existing deadline/key/source has been lost, this service does not extend it or issue a replacement. A stopped/partial adoption is not auto-repaired. A later separately approved recovery/requalification workflow is required before any new writable Authority generation or consumer cutover. Physical power-loss durability, OS-native IME, Safari and real printer testing are not claimed.

## Acceptance

New Node scenarios cover all 24 requested boundaries, with overlapping cases for before/after CAS and confirmation, exact pin replay/conflict, Account/source ABA, owner version/generation/lease/expiry/revocation, missing CryptoKey/candidate/manifest/receipt, timeout/throw/malformed responses, normal B backend save and current B Authority/prepared operation preservation. Native Chrome exercises actual CryptoKey/IndexedDB/Web Locks, dropped notifications, two renderers and page reopen. Disposable workerd/D1 verifies the existing authenticated owner route with the adoption composition; Studio cache/metadata/account-readonly and existing owner/Account/Authority tests are selected regressions. No existing assertion/timeout is relaxed. Raw current-run logs and exact source hashes are kept outside the repository; historical PASS counts are not reused as new results.
