import {
  STUDIO_BASE_PROFILES,
  identifyStudioBase,
  STUDIO_BASE_SCHEMA_SQL,
  STUDIO_PLATFORM_SQL,
} from "../../src/studio-base-profiles.js";
import {
  STUDIO_SCHEMA_SQL,
  STUDIO_JOURNAL_SQL,
} from "../../src/studio-release-schema.js";
import { createStudioSemanticValidator } from "../studio-backup-semantic.mjs";
import { canonical, fail } from "./contracts.mjs";
export async function inspectPreStudio(db) {
  const raw = JSON.parse((await db.prepare(STUDIO_SCHEMA_SQL).first()).encoded);
  if (raw.some((x) => x[1].startsWith("studio_document_")))
    fail("prestudio-partial-or-installed");
  const history = JSON.parse(
      (await db.prepare(STUDIO_JOURNAL_SQL).first()).encoded,
    ),
    platform = JSON.parse(
      (await db.prepare(STUDIO_PLATFORM_SQL).first()).encoded,
    );
  const profile = identifyStudioBase(raw, history, platform);
  if (profile?.id !== "production102") fail("prestudio-base-unknown");
  return {
    profile: profile.id,
    fingerprint: profile.fingerprint,
    journal: history,
  };
}
export function preStudioValidator({ bucket, expectedJournalHash, hash }) {
  return async (db) => {
    const inspected = await inspectPreStudio(db);
    if (hash(canonical(inspected.journal)) !== expectedJournalHash)
      fail("prestudio-journal");
    for (const t of ["sync_accounts", "pro_credentials"])
      if (
        (
          await db
            .prepare(
              "SELECT count(*) n FROM " +
                t +
                " WHERE generation IS NULL OR generation<1",
            )
            .first()
        ).n
      )
        fail("generation-unknown");
    // Preserve malformed/unknown source content; fail acceptance instead of repairing it.
    if (
      (
        await db
          .prepare(
            "SELECT count(*) n FROM sync_records WHERE payload_json IS NOT NULL AND NOT json_valid(payload_json)",
          )
          .first()
      ).n
    )
      fail("legacy-json-unknown");
    for (const app of ["port", "chord", "pitch", "fretboard", "rhythm"]) {
      const rows = await db
        .prepare(
          "SELECT count(*) n FROM sync_records WHERE app_id=? AND (revision<1 OR payload_hash IS NULL)",
        )
        .bind(app)
        .first();
      if (rows.n) fail("legacy-record-structure");
    }
    let cursor;
    do {
      const page = await bucket.list({ limit: 32, cursor });
      for (const o of page.objects) {
        const h = await bucket.head(o.key);
        if (!h || h.size !== o.size) fail("r2-metadata-mismatch");
      }
      cursor = page.truncated ? page.cursor : undefined;
      if (page.truncated && !cursor) fail("r2-pagination");
    } while (cursor);
    return inspected;
  };
}
export { createStudioSemanticValidator as postStudioValidator };
