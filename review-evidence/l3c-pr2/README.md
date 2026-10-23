# Cruise L3c PR #2 review evidence

This directory shares the preserved review records for [PR #2](https://github.com/soundcruise/apps/pull/2) without changing the PR head. The ZIP is the unchanged archive supplied for review. Its SHA-256 is `bdf46bb3d92a950491a4eff46d919800950234d49a271094f2d11756cd68eebd` (494,884 bytes).

The ZIP contains 125 original files and six packaging records. `PACKAGE-MANIFEST.json` lists every original file's relative path, byte count and SHA-256. The archive and all 125 original members were independently checked against those hashes on 2026-10-24. `MISSING-FILES.json` records that separate stdout logs for the 11 Native suites do not exist; each suite's result JSON and execution record are included.

Review findings: the three integration rechecks passed 39/39, 48/48 and 8/8; the L2a initial run remained FAIL because one favicon request was pending, while the wrapper with two added wait lines passed 14/14 and had zero pending requests. Native11 driver results show exit 0 and passing verdicts. The referential suite's supplemental verifier retains `STOP` because it required an unreported field; its driver result has 63 detailed rounds, zero violations, four passing failure cases and seven passing common acceptance checks. This correction remains visible in the original records.

P3 retirement-only acceptance remains open in [Issue #3](https://github.com/soundcruise/apps/issues/3). This evidence does not authorize merging PR #2, Production changes, L3d or Shared Write.

The second ZIP, `L3c_PR2_local_candidate_node_aux_20261024.zip`, preserves the Mac archive of the candidate 37 files, selected Node and auxiliary-22 evidence, and a separate 95-test rerun on the PR head. Its SHA-256 is `30ecbf7c3ec2769bcfd160ef76bdb32f786d40cd256cdcc0610204f04216df4d` (453,571 bytes). The original Node manifest covers more files than this selected archive contains; the ZIP README identifies its exact scope. The rerun is distinct from the cloud original raw TAP in the first ZIP.
