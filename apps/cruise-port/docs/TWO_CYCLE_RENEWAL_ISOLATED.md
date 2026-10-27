# Two-cycle renewal — bounded isolated contract

Studio 0.47.20 / Port 1.24.23 candidate. Project schema 2 unchanged.
Parent PR #27: dedb2719e0c5544417c783bc4978c522dd4e44cc.
The original [one-cycle contract](RENEWAL_SUCCESSOR_LIFECYCLE_ISOLATED.md)
remains the q2/proof2 path. This extension is finite: a second successor, not an
unbounded lifecycle or another authentication/storage/Sync authority.

## Typed lineage and bounds

q3 / proof3 requires `successor.cycle === 2`. Its source is the exact q2/proof2
reauthorization publication, including the previous request, typed history,
readonly completion and consumer. Credential version increments by one, lease
revision by two (begin plus finish), pointer/consumer epochs by one. Account,
member, device and runtime generations stay bound. Mixing q2/q3/proof/cycle or
using a q3 source for another successor is rejected. Existing q2 credential checks
remain intact. Roster <=64 operations and immutable inventory <=128 entries.
Unknown or excessive history fails closed without deletion or normalization.

q3 retains older roster items EXACT from the previous proof. Only current-source
items may be added, with directly previous credential counters and exact current
consumer/pointer. Old uncommitted/fenced operations cannot become committed.
Latest SQL payload/receipt must match the local source. Old prepared operations
are never moved into the successor.

## Owner archive and current authorization

`enableSuccessorTwoCycle=false` is the default. Enabling it requires the existing
successor/renewal recovery modes and an explicitly installed disposable fixture
schema. No production schema, migration, router or deployment is installed.

Before begin2, the owner validates the current q2 readonly SQL registry/completion,
exact credential and safe registry/stop counters. In the SAME SQL batch as begin2
CAS/counter/ledger update, it INSERTs a single immutable Account/device archive.
The archive stores the trusted prior recovery binding, its original begin UUID,
new begin UUID, source recovery digest and exact q2 transition/registry/pointer/
consumer/completion. It contains no sealed credential or plaintext token. No
INSERT OR REPLACE, pruning, overwrite or automatic repair exists.

finish2 requires exact archive bytes/digest, the new begin UUID, current CAS,
identity/generation and q2 scope. Abort rolls back archive and begin together.
ACK loss does not permit a second archive or blind begin/finish replay.

History always authenticates CURRENT HMAC credential, expiry/revocation and
history/Pro/writer permissions. Previous verifier use is owner-internal and only
for historical exact operation/receipt matching. Both renewal links and their
begin/finish ledger digests, Account/member/device/runtime/counter/verifier chain
must match. Final history/stop/confirm SQL assertions pin archive and retained q2
scope. Ordinary save/current never consults history as a permission grant.

Third begin is rejected by this ENABLED isolated owner route. This is not a claim
that default-OFF legacy routes, another owner implementation or raw SQL are
universally blocked. Local q3 source rejection also prevents a third successor.

## Linearization points and HOLD

| Step | Linearization point / proof |
| --- | --- |
| Owner begin2 + archive | One owner SQL batch, final assertions |
| Owner finish2 | Credential CAS + exact archive in one SQL batch |
| Account Adoption | Existing Account CAS + mutation receipt transaction |
| Authority stop intent | Existing Authority transaction; separate from Account |
| Owner successor stop | Registry/fence CAS in owner SQL batch |
| New pointer + local Consumer | Same existing Authority IDB publication transaction |
| Owner readonly completion | Separate owner SQL confirmation transaction |
| Backend BPM save + receipt | Existing final authorization/CAS/receipt SQL batch |
| Local BPM application | Existing typed limited Authority IDB transaction |

No atomicity across owner SQL, Account IDB, Authority IDB or backup DB is claimed.
Readonly/suspended/fenceRevoked and Shared Write OFF / canWrite=false remain.
A missing owner completion pin blocks new V3 Admission. Unknown results and
backend/local partial success stay separate; reconcile observes only and explicit
recovery never blindly resends SQL save/stop. Original HOLD intervals remain:
initial pin without a proven SQL stop, and Account CAS without confirmed intent.
New scopes do not resume ordinary writers or consume/delete old pending backups.

## Acceptance and remaining work

Targeted Node, disposable D1/workerd, native Chrome IDB/Web Locks, Studio Browser,
metadata/cache and exact cross-owner Git gate cover two actual owner renewals,
ACK loss, archive atomic abort/tamper, current/history rights, CAS/ABA, delayed A
and valid B, pending preservation, partial save, reopen and unknown fields.
Native uses fake accounts and loopback only; no actual microphone/Pro/Cloud data.

After this second-cycle acceptance, do not add arbitrary more isolated cycles.
Use [Production connection gates](../../cruise-studio/docs/PRODUCTION_CONNECTION_GATES.md)
for the next production-saving unit and release dependencies. Production physical
commit expiry, clock/key operations, raw-writer containment, normal consumer/writer
cutover, binary/Cloud/multi-device and OS acceptance remain separate gates.
