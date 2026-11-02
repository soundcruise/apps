# Account join, device label and first Sync candidate

Base: main 4a0dc37910f8e520fcb7d4d0af780f1752e16460. Public static version reads confirmed Port 1.24.30 / Studio 0.71.2. PR #163 is merged. This isolated branch proposes Port 1.25.0 (new join form input); Studio product files stay unchanged.

## Existing contracts and confirmed gaps

`port-account-join.js` already sends deviceLabel and durably retains the exact pending consume credential/operation for ACK-loss reconciliation. Its existing UI supplied no editable name; the orchestrator hardcoded a generic added-environment label. Existing Account create/recovery labels were Cruise Port. Server naming stores registeredLabel separately from optional userLabel; existing rename uses NFC/40-codepoint normalization and permits duplicate names with short Device IDs. Names never authorize or match identities.

Join persists a distinct Account Device. The existing ensure path separately provisions the Port AppDevice, authenticates ownership and initializes/receives a dataset. `connectExistingAccount` already called settlePortSync, but that helper could return locked or pending and the dialog discarded that result and claimed simple success. The generic post-join refresh could also invoke another activating refresh. These are confirmed code paths, not proof of the precise failure experienced by the operator; that device's failure/qualification trace was not inspected.

Current-environment normalization already rejects stale saved IDs, ambiguous mappings, revoked devices and duplicated Port AppDevice mappings. The missing input was the local Port AppDevice credential: it was read only from a running runtime. This candidate reads the current Account-scoped persisted credential, guarded by the existing Account load generation checks, even while runtime is stopped. Authenticated Worker/credential identity remains authoritative; a stale saved Account Device ID is deliberately not preferred.

## Implementation

- Native join dialog prefills Cruise Port; a same-origin Studio parent supplies Cruise Studio as display-only default. Names remain editable and are normalized by the existing normalizeUserLabel before generating/persisting a consume candidate. No new API field or key is introduced. Existing retry keeps its original submitted name/material.
- Same native naming callback is passed to Port AppDevice provisioning and Account create/recovery; this does not rename existing targets.
- Actual join invokes existing ensure only for a clean local dataset: existing adapter reports no meaningful records, no deletion intents, native asset readiness is known/clean/not running, and legacy/current-target stores have no Outbox/conflicts. It rechecks local emptiness and the exact joined Account before continuing. This is a conservative minimum, not a new Owner mechanism.
- Nonempty or unreadable state returns local_data_unconfirmed without undoing committed Account participation. No old records, intents or binaries are removed. Other Account Outboxes retain the existing separate DB/runtime ownership and are never adopted into the joined Account. This check does not enumerate or erase other Accounts' DBs.
- Join completion distinguishes Account success from Sync confirmation-needed. Post-join repaint is read-only; it does not DOM-click a start button or silently retry unsafe adoption.
- Existing native runtime handles bootstrap, pull, conflict selection, image hydration and future automatic resume. No Worker, shared, four-app, schema, new DB or Sync engine changes.

## Acceptance and remaining HOLD

The actual native Pro dialog in disposable profiles is used to join an issued invitation, edit the default name, receive existing Cloud Gear without a manual Sync start, assert the registered name and current-device badge, then edit/push data. The second case enters the actual Studio product after joining and verifies the same persisted Account/Device and reception. A separate actual Studio localhost Browser case opens its native join dialog and verifies the Cruise Studio default and editing.

Important limit: this does **not** certify a formal Studio entrance that is locked after Account deletion can complete join and asynchronously restore Pro authority entirely inside that locked entrance. Nor is a delayed qualification retry implemented. Existing canSync refusal remains fail-closed and surfaces confirmation-needed; no synthetic authority is added to product code. For initial operator acceptance, join the phone Account in an empty browser profile using canonical Port Pro, then open Studio in that same profile. Connecting an existing nonempty/proven historical profile automatically is conservatively HOLD; use existing explicit review/conflict actions. Real production failure cause, real Account/Pro, iPhone/Safari and two-device acceptance remain unverified.

No Account data, Outbox, images or attachment are deleted/moved to make these cases pass. Account switching and rejection/recovery remain in the full product suite. Normal-case completion and attribution/qualification HOLD are intentionally separate.

See validation.json for final tests. Product failure during the first fixture run was an unclosed successful join dialog blocking subsequent clicks, not a receive failure. The fixture now uses the existing close acknowledgement; timeout budgets and authorization are unchanged.
