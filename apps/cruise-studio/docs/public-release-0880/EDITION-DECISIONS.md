# Edition readiness: HOLD for Standard authorization

Current product has one generated Pro entry at `pro_969e958c31433f99c30b/`. `studio-entry.mjs` validates the existing Pro device session; Port tools load Port's Pro URL through the current boundary and four apps resolve to their Pro entries. Account/device credentials and Pro credentials remain independent. Account connection does not grant Pro. Actual Sync owners and server authorization are unchanged.

No current Standard Studio runtime, Standard Port host selection or Standard four-app embedding path is implemented. Removing Pro scripts or changing only `data-studio-edition` would leave Pro surfaces and break the entry proof. This candidate deliberately does neither. No Standard HTML is emitted. The reserved Standard manifest under `edition-candidates/standard/` is source-only and Jekyll-excluded. It proposes the already-reserved `/apps/cruise-studio/` ID/start/scope, distinct from Pro. Both point to the same official icon assets; source originals are identical. No installation was performed and OS icon/update caches have not been accepted.

Decision required before Standard implementation/publication:

1. Recommended: Standard shell uses existing Port Standard tools and each app's Standard entry; Pro-only tools and Cloud Sync show the existing upgrade/authentication flow. Do not give Standard Studio a blanket Pro entitlement. Inspect each owning product's existing restrictions when implementing its Standard host, rather than introducing new prices or memberships.
2. Alternative: make Studio entirely Pro and publish only a public landing/upgrade page at Standard URL. This preserves the current runtime with less work but is not a functional Standard Studio.

The exact Standard tool allowance, Account-only versus Pro-required Sync operations, and upgrade destinations need product approval. No new rights are inferred here. Pro keeps existing Account/Pro validation, stable PWA ID/start/scope/name and same icons. Public creation workspaces are Coming soon in both source template and generated Pro product; development capability is excluded from public packaging. Standard must reuse this disabled policy when its host is implemented.

This is a 0.88.0 candidate because it changes visible capability. No main merge, Pages publication, Worker/D1/R2 operation or installed PWA change is included.

Validation: 12 focused feature/edition/cache tests pass. Existing schema2/compatibility tests were run separately (see local execution record). The legacy Shell structural suite has five failures on both current main and this candidate; it expects older DOM/layout contracts and is not counted as PASS. The real local product entry boots without uncaught errors behind its unchanged Pro gate and rejects the creation hash/navigation. Three-theme/three-width checks use an isolated DOM fixture, not authenticated product acceptance. Mac/Windows PWA install/update and actual development editing are not newly accepted in this task. This PR must not be treated as Standard release-ready.
